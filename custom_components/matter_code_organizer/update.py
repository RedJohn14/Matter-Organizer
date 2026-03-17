"""Update entity for Matter Code Organizer."""

from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.components.update import UpdateEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from aiohttp import ClientTimeout

from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    DOMAIN,
    GITLAB_BASE_URL,
    GITLAB_MANIFEST_URL,
    UPDATE_CHECK_INTERVAL_HOURS,
)

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=UPDATE_CHECK_INTERVAL_HOURS)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the update entity."""
    async_add_entities([MatterCodeOrganizerUpdate(hass, entry)])


class MatterCodeOrganizerUpdate(UpdateEntity):
    """Update entity that checks GitLab for newer versions."""

    _attr_has_entity_name = True
    _attr_name = "Update"
    _attr_title = "Matter Code Organizer"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the update entity."""
        self._attr_unique_id = f"{entry.entry_id}_update"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="Matter Code Organizer",
            entry_type=DeviceEntryType.SERVICE,
        )
        self._entry = entry
        self._installed = hass.data[DOMAIN].get("installed_version", "0.0.0")
        self._latest: str | None = None

    @property
    def installed_version(self) -> str | None:
        """Return the installed version."""
        return self._installed

    @property
    def latest_version(self) -> str | None:
        """Return the latest version available."""
        return self._latest or self._installed

    @property
    def release_url(self) -> str | None:
        """Return the release URL."""
        return f"{GITLAB_BASE_URL}/hassio/matter-organizer"

    async def async_update(self) -> None:
        """Check GitLab for a newer version."""
        session = async_get_clientsession(self.hass)
        try:
            resp = await session.get(
                GITLAB_MANIFEST_URL,
                timeout=ClientTimeout(total=10),
            )
            if resp.status != 200:
                _LOGGER.warning(
                    "Update check failed: HTTP %s from GitLab", resp.status
                )
                return
            data = await resp.json(content_type=None)
            remote_version = data.get("version")
            if remote_version:
                self._latest = remote_version
                self.hass.data[DOMAIN]["latest_version"] = remote_version
        except Exception:
            _LOGGER.warning("Update check failed: could not reach GitLab")
