# Matter Code Organizer

A Home Assistant custom integration for storing and managing Matter device pairing codes. Keep all your QR codes and numeric setup codes in one place — no more searching device boxes and manuals.

## Features

- **Sidebar panel** for managing all your Matter codes
- **QR code display** generated from MT: strings
- **Camera scanning** to scan Matter QR codes directly from your phone
- **Search & filter** across all stored devices
- **Copy to clipboard** for numeric setup codes
- **English & German** interface

## Installation

### HACS (recommended)

1. Open HACS in Home Assistant
2. Click the three dots in the top right → **Custom repositories**
3. Add `https://github.com/RedJohn14/Matter-Organizer` as an **Integration**
4. Search for **Matter Code Organizer** and install it
5. Restart Home Assistant

### Manual

1. Download this repository
2. Copy the `custom_components/matter_code_organizer` folder into your Home Assistant `config/custom_components/` directory
3. Restart Home Assistant

## Setup

1. Go to **Settings → Devices & Services → Add Integration**
2. Search for **Matter Code Organizer**
3. Click through the setup — no configuration needed
4. A new **Matter Codes** entry appears in your sidebar

## Usage

- Click **+** to add a device with its name and pairing code (MT: string and/or numeric code)
- Click the **camera icon** to scan a Matter QR code with your device camera (requires HTTPS)
- Use the **⋮** menu on each device to edit or delete it
- Click the **clipboard button** next to a numeric code to copy it

## Requirements

- Home Assistant 2024.1 or newer
- HTTPS enabled (for camera scanning feature)
