"""Config flow for Matter Code Organizer."""

from __future__ import annotations

from homeassistant.config_entries import ConfigFlow

from .const import DOMAIN


class MatterCodeOrganizerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Matter Code Organizer."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Matter Code Organizer", data={}
            )

        return self.async_show_form(step_id="user")
