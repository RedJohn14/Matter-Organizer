"""Matter Code Organizer - Manage Matter device pairing codes."""

from __future__ import annotations

import os

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .store import MatterCodeStore

PANEL_URL = "/matter_code_organizer"
PANEL_ICON = "mdi:qrcode"
PANEL_TITLE = "Matter Codes"
PANEL_FRONTEND_PATH = "matter-codes"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Matter Code Organizer from a config entry."""
    store = MatterCodeStore(hass)
    await store.async_load()

    hass.data[DOMAIN] = {"store": store}

    # Register WebSocket commands
    websocket_api.async_register_command(hass, ws_get_devices)
    websocket_api.async_register_command(hass, ws_add_device)
    websocket_api.async_register_command(hass, ws_update_device)
    websocket_api.async_register_command(hass, ws_delete_device)

    # Register static paths for frontend files and brand icons
    integration_path = os.path.dirname(__file__)
    frontend_path = os.path.join(integration_path, "frontend")
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(f"{PANEL_URL}/frontend", frontend_path, False),
            StaticPathConfig(
                f"/brands/{DOMAIN}",
                integration_path,
                True,
            ),
        ]
    )

    # Register sidebar panel
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="matter-code-panel",
        frontend_url_path=PANEL_FRONTEND_PATH,
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        module_url=f"{PANEL_URL}/frontend/matter-code-panel.js",
        config={},
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Matter Code Organizer."""
    frontend.async_remove_panel(hass, PANEL_FRONTEND_PATH)
    hass.data.pop(DOMAIN, None)
    return True


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
    }
)
@websocket_api.async_response
async def ws_add_device(hass, connection, msg):
    """Add a new device."""
    store = hass.data[DOMAIN]["store"]
    device = await store.async_add_device(
        name=msg["name"],
        matter_qr_code=msg.get("matter_qr_code", ""),
        numeric_code=msg.get("numeric_code", ""),
        manufacturer=msg.get("manufacturer", ""),
        model=msg.get("model", ""),
    )
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
    )
    if device:
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
        connection.send_result(msg["id"], {})
    else:
        connection.send_error(msg["id"], "not_found", "Device not found")
