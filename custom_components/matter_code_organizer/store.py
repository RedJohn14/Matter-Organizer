"""Storage manager for Matter Code Organizer."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


class MatterCodeStore:
    """Manage persistent storage for Matter device codes."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._devices: list[dict[str, Any]] = []

    async def async_load(self) -> None:
        """Load devices from storage."""
        data = await self._store.async_load()
        if data and "devices" in data:
            self._devices = data["devices"]
        else:
            self._devices = []

    async def async_save(self) -> None:
        """Persist devices to storage."""
        await self._store.async_save({"devices": self._devices})

    async def async_get_devices(self) -> list[dict[str, Any]]:
        """Return all stored devices."""
        return self._devices

    async def async_add_device(
        self,
        name: str,
        matter_qr_code: str = "",
        numeric_code: str = "",
        manufacturer: str = "",
        model: str = "",
    ) -> dict[str, Any]:
        """Add a new device entry."""
        now = datetime.now(timezone.utc).isoformat()
        device = {
            "id": str(uuid.uuid4()),
            "name": name,
            "matter_qr_code": matter_qr_code,
            "numeric_code": numeric_code,
            "manufacturer": manufacturer,
            "model": model,
            "created_at": now,
            "updated_at": now,
        }
        self._devices.append(device)
        await self.async_save()
        return device

    async def async_update_device(
        self,
        device_id: str,
        name: str | None = None,
        matter_qr_code: str | None = None,
        numeric_code: str | None = None,
        manufacturer: str | None = None,
        model: str | None = None,
    ) -> dict[str, Any] | None:
        """Update an existing device entry."""
        for device in self._devices:
            if device["id"] == device_id:
                if name is not None:
                    device["name"] = name
                if matter_qr_code is not None:
                    device["matter_qr_code"] = matter_qr_code
                if numeric_code is not None:
                    device["numeric_code"] = numeric_code
                if manufacturer is not None:
                    device["manufacturer"] = manufacturer
                if model is not None:
                    device["model"] = model
                device["updated_at"] = datetime.now(timezone.utc).isoformat()
                await self.async_save()
                return device
        return None

    async def async_delete_device(self, device_id: str) -> bool:
        """Remove a device entry."""
        for i, device in enumerate(self._devices):
            if device["id"] == device_id:
                self._devices.pop(i)
                await self.async_save()
                return True
        return False
