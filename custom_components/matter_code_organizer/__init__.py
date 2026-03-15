"""Matter Code Organizer - Manage Matter device pairing codes."""

from __future__ import annotations

import json
import logging
import os

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr

from .const import DOMAIN
from .store import MatterCodeStore

_LOGGER = logging.getLogger(__name__)

PANEL_URL = "/matter_code_organizer"
PANEL_ICON = "mdi:qrcode"
PANEL_TITLE = "Matter Codes"
PANEL_FRONTEND_PATH = "matter-codes"


async def async_setup(hass: HomeAssistant, config) -> bool:
    """Set up the Matter Code Organizer integration."""
    integration_path = os.path.dirname(__file__)
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                f"/brands/{DOMAIN}",
                os.path.join(integration_path, "brand"),
                True,
            ),
        ]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Matter Code Organizer from a config entry."""
    store = MatterCodeStore(hass)
    await store.async_load()

    hass.data[DOMAIN] = {"store": store, "entry": entry}

    # Register WebSocket commands
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_add_device)
    websocket_api.async_register_command(hass, ws_update_device)
    websocket_api.async_register_command(hass, ws_delete_device)
    websocket_api.async_register_command(hass, ws_import_devices)

    # Register static paths for frontend files
    integration_path = os.path.dirname(__file__)
    frontend_path = os.path.join(integration_path, "frontend")
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(f"{PANEL_URL}/frontend", frontend_path, False),
        ]
    )

    # Read version for cache-busting
    manifest_path = os.path.join(integration_path, "manifest.json")
    with open(manifest_path) as f:
        manifest_version = json.load(f)["version"]

    # Register sidebar panel
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="matter-code-panel",
        frontend_url_path=PANEL_FRONTEND_PATH,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{PANEL_URL}/frontend/matter-code-panel.js?v={manifest_version}",
        config={},
    )

    # Sync device registry
    await _sync_device_registry(hass, entry, store)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Matter Code Organizer."""
    frontend.async_remove_panel(hass, PANEL_FRONTEND_PATH)
    hass.data.pop(DOMAIN, None)
    return True


async def _sync_device_registry(
    hass: HomeAssistant, config_entry: ConfigEntry, store: MatterCodeStore
) -> None:
    """Sync organizer entries with the HA device registry for cross-linking."""
    dev_reg = dr.async_get(hass)
    devices = await store.async_get_devices()

    # Track which organizer IDs we've seen so we can clean up stale entries
    active_identifiers: set[tuple[str, str]] = set()

    for device in devices:
        ha_device_id = device.get("ha_device_id", "")
        if not ha_device_id:
            continue

        identifier = (DOMAIN, device["id"])
        active_identifiers.add(identifier)

        # Look up the linked Matter device to set via_device
        matter_device = dev_reg.async_get(ha_device_id)
        via_device = None
        if matter_device:
            # Use the matter identifier from the linked device
            for ident in matter_device.identifiers:
                if ident[0] == "matter":
                    via_device = ident
                    break

        dev_reg.async_get_or_create(
            config_entry_id=config_entry.entry_id,
            identifiers={identifier},
            name=device.get("name", "Unknown"),
            manufacturer=device.get("manufacturer") or None,
            model=device.get("model") or None,
            via_device=via_device,
        )

    # Remove registry entries for organizer devices that no longer exist
    for reg_device in dr.async_entries_for_config_entry(dev_reg, config_entry.entry_id):
        dominated_identifiers = {
            ident for ident in reg_device.identifiers if ident[0] == DOMAIN
        }
        if dominated_identifiers and not dominated_identifiers & active_identifiers:
            dev_reg.async_remove_device(reg_device.id)


# --- WebSocket API ---


@websocket_api.websocket_command(
    {vol.Required("type"): "matter_code_organizer/devices"}
)
@websocket_api.async_response
async def ws_get_devices(hass, connection, msg):
    """Return all stored devices."""
    store = hass.data[DOMAIN]["store"]
    devices = await store.async_get_devices()
    connection.send_result(msg["id"], {"devices": devices})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "matter_code_organizer/add_device",
        vol.Required("name"): str,
        vol.Optional("matter_qr_code", default=""): str,
        vol.Optional("numeric_code", default=""): str,
        vol.Optional("manufacturer", default=""): str,
        vol.Optional("model", default=""): str,
        vol.Optional("ha_device_id", default=""): str,
    }
)
@websocket_api.async_response
async def ws_add_device(hass, connection, msg):
    """Add a new device."""
    store = hass.data[DOMAIN]["store"]
    try:
        device = await store.async_add_device(
            name=msg["name"],
            matter_qr_code=msg.get("matter_qr_code", ""),
            numeric_code=msg.get("numeric_code", ""),
            manufacturer=msg.get("manufacturer", ""),
            model=msg.get("model", ""),
            ha_device_id=msg.get("ha_device_id", ""),
        )
    except ValueError as exc:
        connection.send_error(msg["id"], "duplicate", str(exc))
        return
    entry = hass.data[DOMAIN]["entry"]
    await _sync_device_registry(hass, entry, store)
    connection.send_result(msg["id"], {"device": device})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "matter_code_organizer/update_device",
        vol.Required("device_id"): str,
        vol.Optional("name"): str,
        vol.Optional("matter_qr_code"): str,
        vol.Optional("numeric_code"): str,
        vol.Optional("manufacturer"): str,
        vol.Optional("model"): str,
        vol.Optional("ha_device_id"): str,
    }
)
@websocket_api.async_response
async def ws_update_device(hass, connection, msg):
    """Update an existing device."""
    store = hass.data[DOMAIN]["store"]
    device = await store.async_update_device(
        device_id=msg["device_id"],
        name=msg.get("name"),
        matter_qr_code=msg.get("matter_qr_code"),
        numeric_code=msg.get("numeric_code"),
        manufacturer=msg.get("manufacturer"),
        model=msg.get("model"),
        ha_device_id=msg.get("ha_device_id"),
    )
    if device:
        entry = hass.data[DOMAIN]["entry"]
        await _sync_device_registry(hass, entry, store)
        connection.send_result(msg["id"], {"device": device})
    else:
        connection.send_error(msg["id"], "not_found", "Device not found")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "matter_code_organizer/delete_device",
        vol.Required("device_id"): str,
    }
)
@websocket_api.async_response
async def ws_delete_device(hass, connection, msg):
    """Delete a device."""
    store = hass.data[DOMAIN]["store"]
    success = await store.async_delete_device(msg["device_id"])
    if success:
        entry = hass.data[DOMAIN]["entry"]
        await _sync_device_registry(hass, entry, store)
        connection.send_result(msg["id"], {})
    else:
        connection.send_error(msg["id"], "not_found", "Device not found")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "matter_code_organizer/import_devices",
        vol.Required("devices"): [
            {
                vol.Required("ha_device_id"): str,
                vol.Required("name"): str,
                vol.Optional("manufacturer", default=""): str,
                vol.Optional("model", default=""): str,
            }
        ],
    }
)
@websocket_api.async_response
async def ws_import_devices(hass, connection, msg):
    """Bulk-import HA Matter devices as organizer entries."""
    store = hass.data[DOMAIN]["store"]
    imported = []
    for dev in msg["devices"]:
        device = await store.async_add_device(
            name=dev["name"],
            manufacturer=dev.get("manufacturer", ""),
            model=dev.get("model", ""),
            ha_device_id=dev["ha_device_id"],
        )
        imported.append(device)
    entry = hass.data[DOMAIN]["entry"]
    await _sync_device_registry(hass, entry, store)
    connection.send_result(msg["id"], {"devices": imported})
