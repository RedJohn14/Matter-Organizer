/**
 * Matter Code Organizer - Sidebar Panel
 * LitElement-based web component for managing Matter device pairing codes.
 */

const BASE_PATH = "/matter_code_organizer/frontend";

const _loadScript = (src) =>
  new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

const _scriptsReady = Promise.all([
  _loadScript(`${BASE_PATH}/qrcode.min.js`),
  _loadScript(`${BASE_PATH}/jsQR.min.js`),
]);

const _jspdfReady = _loadScript(`${BASE_PATH}/jspdf.umd.min.js`);

// --- Matter QR Code Decoder ---

const BASE38_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";

function _decodeMatterQR(mtString) {
  let encoded = mtString.toUpperCase();
  if (encoded.startsWith("MT:")) encoded = encoded.substring(3);

  const bytes = [];
  let i = 0;
  while (i < encoded.length) {
    const chunkLen = Math.min(5, encoded.length - i);
    let val = 0;
    for (let j = 0; j < chunkLen; j++) {
      const idx = BASE38_CHARS.indexOf(encoded[i + j]);
      if (idx < 0) return null;
      val += idx * Math.pow(38, j);
    }
    if (chunkLen === 5) {
      bytes.push(val & 0xFF, (val >> 8) & 0xFF, (val >> 16) & 0xFF);
    } else if (chunkLen === 4) {
      bytes.push(val & 0xFF, (val >> 8) & 0xFF);
    } else if (chunkLen === 2) {
      bytes.push(val & 0xFF);
    }
    i += chunkLen;
  }

  let payload = 0n;
  for (let j = bytes.length - 1; j >= 0; j--) {
    payload = (payload << 8n) | BigInt(bytes[j]);
  }

  const version = Number(payload & 0x7n);
  const vendorId = Number((payload >> 3n) & 0xFFFFn);
  const productId = Number((payload >> 19n) & 0xFFFFn);
  const customFlow = Number((payload >> 35n) & 0x3n);
  const discoveryCaps = Number((payload >> 37n) & 0xFFn);
  const discriminator = Number((payload >> 45n) & 0xFFFn);
  const passcode = Number((payload >> 57n) & 0x7FFFFFFn);

  return { version, vendorId, productId, customFlow, discoveryCaps, discriminator, passcode };
}

// --- Connection type icons (16x16 inline SVGs) ---
const CONNECTION_ICONS = {
  thread: `<svg width="16" height="16" viewBox="0 0 512 512" fill="none"><circle cx="256" cy="256" r="245" fill="currentColor"/><path d="M256 468V132a24 24 0 0 1 24-24h56a72 72 0 1 1 0 144H176a60 60 0 1 0 0 120" stroke="var(--card-background-color, white)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  wifi: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>`,
  bluetooth: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.71 7.71L12 2h-1v7.59L6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 11 14.41V22h1l5.71-5.71-4.3-4.29 4.3-4.29zM13 5.83l1.88 1.88L13 9.59V5.83zm1.88 10.46L13 18.17v-3.76l1.88 1.88z"/></svg>`,
  ethernet: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7.77 6.76L6.23 5.48.82 12l5.41 6.52 1.54-1.28L3.42 12l4.35-5.24zM7 13h2v-2H7v2zm10-2h-2v2h2v-2zm-6 2h2v-2h-2v2zm6.77-7.52l-1.54 1.28L20.58 12l-4.35 5.24 1.54 1.28L23.18 12l-5.41-6.52z"/></svg>`,
};

// --- Verhoeff checksum ---

const _V_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0],
];
const _V_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];
const _V_INV = [0,4,3,2,1,5,6,7,8,9];

function _verhoeffChecksum(numStr) {
  const digits = numStr.split("").reverse().map(Number);
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    c = _V_D[c][_V_P[(i + 1) % 8][digits[i]]];
  }
  return _V_INV[c];
}

function _computeManualCode(discriminator, passcode) {
  const shortDisc = (discriminator >> 8) & 0xF;
  const digit1 = String((shortDisc >> 2) & 0x3);
  const digits2_6 = String(((shortDisc & 0x3) << 14) | (passcode & 0x3FFF)).padStart(5, "0");
  const digits7_10 = String((passcode >> 14) & 0x1FFF).padStart(4, "0");
  const first10 = digit1 + digits2_6 + digits7_10;
  return first10 + String(_verhoeffChecksum(first10));
}

function deriveNumericCode(mtString) {
  try {
    const info = _decodeMatterQR(mtString);
    if (!info || info.passcode == null) return null;
    return _computeManualCode(info.discriminator, info.passcode);
  } catch (e) {
    return null;
  }
}

function formatNumericCode(code) {
  if (!code || code.length !== 11) return code || "";
  return code.substring(0, 4) + "-" + code.substring(4, 7) + "-" + code.substring(7);
}

// --- Translations ---
let TRANSLATIONS = {};

async function _loadTranslations(lang) {
  const supported = ["en", "de"];
  const code = supported.includes(lang) ? lang : "en";
  if (TRANSLATIONS[code]) return;
  try {
    const resp = await fetch(`${BASE_PATH}/lang/${code}.json`);
    TRANSLATIONS[code] = await resp.json();
  } catch (e) {
    console.error("Failed to load translations:", e);
  }
  if (code !== "en" && !TRANSLATIONS.en) {
    try {
      const resp = await fetch(`${BASE_PATH}/lang/en.json`);
      TRANSLATIONS.en = await resp.json();
    } catch (e) {
      console.error("Failed to load English fallback translations:", e);
    }
  }
}

class MatterCodePanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._devices = [];
    this._searchQuery = "";
    this._editingDevice = null;
    this._scanning = false;
    this._stream = null;
    this._scanAnimFrame = null;
    this._copiedId = null;
    this._matterHADevices = [];
    this._showImportDialog = false;
    this._importSelection = new Set();
    this._sortAZ = true;
    this._filterConnection = "";
    this._showEditorDialog = false;
    this._editorData = "";
    this._showBackupMenu = false;
    this._zoomedQR = null;
    this._updateAvailable = false;
    this._updateDismissed = false;
    this._latestVersion = null;
    this._releaseUrl = null;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._lang = (hass.language || "en").substring(0, 2);
      if (!["en", "de"].includes(this._lang)) this._lang = "en";
      _loadTranslations(this._lang).then(() => {
        this._loadDevices();
        this._loadMatterHADevices();
        this._checkUpdate();
      });
    } else if (!this.shadowRoot.querySelector('.toolbar')) {
      this._loadDevices();
      this._loadMatterHADevices();
    }
  }

  connectedCallback() {
    if (this._initialized && this._hass) {
      this._loadDevices();
      this._loadMatterHADevices();
    }
  }

  set panel(panel) {
    this._panel = panel;
    this._version = panel?.config?.version || "";
  }

  _t(key) {
    return TRANSLATIONS[this._lang]?.[key] || TRANSLATIONS.en[key] || key;
  }

  async _loadDevices() {
    try {
      const result = await this._hass.callWS({
        type: "matter_code_organizer/devices",
      });
      this._devices = result.devices || [];
    } catch (e) {
      console.error("Failed to load devices:", e);
      this._devices = [];
    }
    this._render();
  }

  async _loadMatterHADevices() {
    try {
      const allDevices = await this._hass.callWS({
        type: "config/device_registry/list",
      });
      this._matterHADevices = (allDevices || []).filter(
        (d) => d && d.identifiers && d.identifiers.some(([domain]) => domain === "matter")
      );
    } catch (e) {
      console.error("Failed to load HA Matter devices:", e);
      this._matterHADevices = [];
    }
  }

  async _checkUpdate() {
    try {
      const result = await this._hass.callWS({
        type: "matter_code_organizer/check_update",
      });
      this._updateAvailable = result.update_available || false;
      this._latestVersion = result.latest_version || null;
      this._releaseUrl = result.release_url || null;
      if (this._updateAvailable) this._render();
    } catch (e) {
      console.warn("Update check failed:", e);
    }
  }

  async _addDevice(name, matterQrCode, numericCode, manufacturer, model, haDeviceId, connectionType) {
    await this._hass.callWS({
      type: "matter_code_organizer/add_device",
      name,
      matter_qr_code: matterQrCode,
      numeric_code: numericCode,
      manufacturer: manufacturer || "",
      model: model || "",
      ha_device_id: haDeviceId || "",
      connection_type: connectionType || "",
    });
  }

  async _updateDevice(id, name, matterQrCode, numericCode, manufacturer, model, haDeviceId, connectionType) {
    await this._hass.callWS({
      type: "matter_code_organizer/update_device",
      device_id: id,
      name,
      matter_qr_code: matterQrCode,
      numeric_code: numericCode,
      manufacturer: manufacturer || "",
      model: model || "",
      ha_device_id: haDeviceId || "",
      connection_type: connectionType || "",
    });
  }

  async _deleteDevice(id) {
    await this._hass.callWS({
      type: "matter_code_organizer/delete_device",
      device_id: id,
    });
    await this._loadDevices();
  }

  get _filteredDevices() {
    let result = this._devices;
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          (d.name && d.name.toLowerCase().includes(q)) ||
          (d.matter_qr_code && d.matter_qr_code.toLowerCase().includes(q)) ||
          (d.numeric_code && d.numeric_code.includes(q)) ||
          (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
          (d.model && d.model.toLowerCase().includes(q))
      );
    }
    if (this._filterConnection) {
      result = result.filter((d) => d.connection_type === this._filterConnection);
    }
    result = [...result].sort((a, b) => {
      const nameA = (a.name || "").toLowerCase();
      const nameB = (b.name || "").toLowerCase();
      return this._sortAZ ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });
    return result;
  }

  _generateQRCode(data, container) {
    if (!data || !window.qrcode) return;
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(data, 'Alphanumeric');
      qr.make();
      container.innerHTML = qr.createSvgTag(4, 0);
    } catch (e) {
      container.innerHTML = "";
      console.error("QR generation error:", e);
    }
  }

  _getDecodedInfo(mtCode) {
    if (!mtCode) return null;
    try {
      return _decodeMatterQR(mtCode);
    } catch (e) {
      return null;
    }
  }

  _copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  _render() {
    const devices = this._filteredDevices;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --primary-color: var(--ha-card-header-color, #03a9f4);
          --text-color: var(--primary-text-color, #212121);
          --secondary-text: var(--secondary-text-color, #727272);
          --card-bg: var(--ha-card-background, var(--card-background-color, #fff));
          --divider: var(--divider-color, #e0e0e0);
          font-family: var(--paper-font-body1_-_font-family, "Roboto", sans-serif);
          color: var(--text-color);
          background: var(--primary-background-color, #fafafa);
          min-height: 100vh;
        }
        .toolbar {
          background: var(--app-header-background-color, var(--primary-color));
          color: var(--app-header-text-color, #fff);
          padding: 16px 16px 16px 24px;
          display: flex; align-items: center; justify-content: space-between;
          font-size: 20px; font-weight: 400; box-sizing: border-box;
        }
        .toolbar-title { flex: 1; }
        .toolbar-logo {
          display: none; width: 28px; height: 28px; flex-shrink: 0;
        }
        .toolbar-title-text { }
        .hamburger-btn {
          display: none; background: none; border: none; color: inherit;
          cursor: pointer; padding: 8px; margin-right: 8px; border-radius: 50%;
        }
        .hamburger-btn:hover { background: rgba(255,255,255,0.2); }
        .toolbar-actions { display: flex; gap: 8px; }
        .toolbar-actions button {
          background: rgba(255,255,255,0.2); border: none; color: inherit;
          padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px;
          display: flex; align-items: center; gap: 6px;
        }
        .toolbar-actions button:hover { background: rgba(255,255,255,0.3); }
        .toolbar-actions button:disabled { opacity: 0.5; cursor: default; }
        .update-badge {
          background: rgba(255, 152, 0, 0.15); border: 1px solid rgba(255, 152, 0, 0.5);
          color: #ff9800; border-radius: 4px; padding: 6px 12px; cursor: pointer;
          font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;
          animation: update-pulse 2s ease-in-out infinite;
        }
        .update-badge:hover { background: rgba(255, 152, 0, 0.25); }
        @keyframes update-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .update-banner {
          display: flex; align-items: center; gap: 10px;
          background: linear-gradient(135deg, #fff3e0, #ffe0b2); border: 1px solid #ffb74d;
          border-radius: 10px; padding: 12px 16px; margin-bottom: 16px;
          color: #e65100; font-size: 14px; font-weight: 500;
          box-shadow: 0 2px 8px rgba(255, 152, 0, 0.15);
        }
        .update-banner-icon {
          flex-shrink: 0; width: 28px; height: 28px;
          background: #ff9800; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 16px;
        }
        .update-banner-text { flex: 1; }
        .update-banner-text strong { color: #bf360c; }
        .update-banner-versions { font-size: 13px; color: #e65100; opacity: 0.85; margin-top: 2px; }
        .update-banner-view {
          background: #ff9800; color: #fff; border: none; border-radius: 6px;
          padding: 6px 14px; cursor: pointer; font-size: 13px; font-weight: 600;
          white-space: nowrap;
        }
        .update-banner-view:hover { background: #f57c00; }
        .update-banner-dismiss {
          background: none; border: none; color: #e65100; cursor: pointer;
          font-size: 18px; padding: 4px 6px; opacity: 0.6; line-height: 1;
        }
        .update-banner-dismiss:hover { opacity: 1; }
        .toolbar-dropdown { position: relative; display: inline-block; }
        .toolbar-dropdown-menu {
          position: absolute; right: 0; top: calc(100% + 4px);
          background: var(--card-background-color, #fff); border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.18); z-index: 20;
          overflow: hidden; min-width: 200px;
        }
        .toolbar-dropdown-menu button {
          display: flex; width: 100%; padding: 12px 16px; border: none;
          background: none; text-align: left; cursor: pointer;
          font-size: 14px; color: var(--text-color, #333); align-items: center; gap: 8px;
        }
        .toolbar-dropdown-menu button:hover { background: rgba(0,0,0,0.06); }
        .editor-textarea {
          width: 100%; min-height: 400px; font-family: "Roboto Mono", monospace;
          font-size: 13px; border: 1px solid var(--divider); border-radius: 8px;
          padding: 12px; box-sizing: border-box; resize: vertical;
          background: var(--card-background-color, #fff); color: var(--text-color);
        }
        .editor-textarea:focus { border-color: var(--primary-color); outline: none; }
        .content { max-width: 900px; margin: 0 auto; padding: 16px; }
        .search-bar { margin-bottom: 16px; }
        .search-bar input {
          width: 100%; padding: 12px 16px; border: 1px solid var(--divider);
          border-radius: 8px; font-size: 16px; background: var(--card-bg);
          color: var(--text-color); box-sizing: border-box; outline: none;
        }
        .search-bar input:focus { border-color: var(--primary-color); }
        .controls-row {
          display: flex; gap: 8px; margin-bottom: 16px; align-items: center;
        }
        .sort-btn {
          background: var(--card-bg); border: 1px solid var(--divider);
          border-radius: 8px; padding: 8px 14px; font-size: 14px;
          color: var(--text-color); cursor: pointer; white-space: nowrap;
          font-family: inherit;
        }
        .sort-btn:hover { border-color: var(--primary-color); }
        .filter-select {
          flex: 1; padding: 8px 12px; border: 1px solid var(--divider);
          border-radius: 8px; font-size: 14px; background: var(--card-bg);
          color: var(--text-color); font-family: inherit; outline: none;
        }
        .filter-select:focus { border-color: var(--primary-color); }
        .device-card {
          background: var(--card-bg); border-radius: 12px; padding: 20px;
          margin-bottom: 16px;
          box-shadow: var(--ha-card-box-shadow, 0 2px 6px rgba(0,0,0,0.1));
          display: flex; gap: 20px; align-items: flex-start; position: relative;
        }
        .device-qr {
          flex-shrink: 0; width: 120px; height: 120px;
          display: flex; align-items: center; justify-content: center;
          background: #fff; border-radius: 8px; border: 1px solid var(--divider);
          cursor: pointer;
        }
        .device-qr svg { width: 112px; height: 112px; }
        .qr-zoom-dialog {
          background: #fff; border-radius: 12px; padding: 24px;
          width: 340px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          display: flex; flex-direction: column; align-items: center;
        }
        .qr-zoom-container { width: 300px; height: 300px; display: flex; align-items: center; justify-content: center; }
        .qr-zoom-container svg { width: 300px; height: 300px; }
        .qr-zoom-text {
          margin-top: 12px; font-family: "Roboto Mono", monospace; font-size: 13px;
          color: #333; word-break: break-all; text-align: center; user-select: all;
        }
        .device-info { flex: 1; min-width: 0; }
        .device-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
        .device-name { font-size: 18px; font-weight: 500; }
        .connection-icon {
          display: inline-flex; align-items: center; justify-content: center;
          width: 16px; height: 16px; color: var(--secondary-text); flex-shrink: 0;
        }
        .device-manufacturer {
          font-size: 13px; color: var(--secondary-text); margin-bottom: 8px;
        }
        .device-code {
          font-family: "Roboto Mono", monospace; font-size: 13px;
          color: var(--secondary-text); word-break: break-all; margin-bottom: 4px;
        }
        .device-actions { position: absolute; top: 12px; right: 12px; }
        .menu-btn {
          background: none; border: none; cursor: pointer;
          padding: 8px; border-radius: 50%; color: var(--secondary-text); font-size: 20px;
        }
        .menu-btn:hover { background: rgba(0,0,0,0.05); }
        .dropdown {
          position: absolute; right: 0; top: 36px; background: var(--card-bg);
          border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);
          z-index: 10; overflow: hidden; min-width: 140px;
        }
        .dropdown button {
          display: block; width: 100%; padding: 12px 16px; border: none;
          background: none; text-align: left; cursor: pointer;
          font-size: 14px; color: var(--text-color);
        }
        .dropdown button:hover { background: rgba(0,0,0,0.05); }
        .dropdown button.danger { color: #c62828; }
        .copy-btn {
          background: none; border: 1px solid var(--divider); border-radius: 4px;
          padding: 2px 8px; cursor: pointer; font-size: 12px;
          color: var(--secondary-text); margin-left: 8px; vertical-align: middle;
        }
        .copy-btn:hover { background: rgba(0,0,0,0.05); }
        .empty-state {
          text-align: center; padding: 60px 20px;
          color: var(--secondary-text); font-size: 16px;
        }
        .overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          z-index: 100; display: flex; align-items: center; justify-content: center;
        }
        .dialog {
          background: var(--card-bg); border-radius: 12px; padding: 24px;
          width: 90%; max-width: 500px; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          max-height: 90vh; overflow-y: auto;
        }
        .dialog h2 { margin: 0 0 20px 0; font-size: 20px; font-weight: 500; }
        .form-field { margin-bottom: 16px; }
        .form-field label {
          display: block; margin-bottom: 4px; font-size: 13px; color: var(--secondary-text);
        }
        .form-field input, .form-field select {
          width: 100%; padding: 10px 12px; border: 1px solid var(--divider);
          border-radius: 6px; font-size: 15px;
          background: var(--primary-background-color, #fafafa);
          color: var(--text-color); box-sizing: border-box; outline: none;
        }
        .form-field input:focus, .form-field select:focus { border-color: var(--primary-color); }
        .form-hint {
          font-size: 12px; color: var(--secondary-text); margin-top: 4px; font-style: italic;
        }
        .form-error { color: #c62828; font-size: 13px; margin-bottom: 12px; }
        .dialog-actions {
          display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
        }
        .dialog-actions button {
          padding: 10px 24px; border-radius: 6px; border: none; cursor: pointer; font-size: 14px;
        }
        .btn-cancel { background: transparent; color: var(--text-color); }
        .btn-cancel:hover { background: rgba(0,0,0,0.05); }
        .btn-save { background: var(--primary-color); color: #fff; }
        .btn-save:hover { opacity: 0.9; }
        .scanner-container { position: relative; }
        .scanner-container video { width: 100%; border-radius: 8px; background: #000; }
        .scanner-hint { text-align: center; margin: 12px 0; color: var(--secondary-text); font-size: 14px; }
        .no-qr-placeholder {
          width: 120px; height: 120px; display: flex; align-items: center;
          justify-content: center; color: var(--secondary-text); font-size: 13px; text-align: center;
        }
        .btn-scan-inline {
          background: var(--primary-background-color, #f5f5f5);
          border: 1px solid var(--divider); border-radius: 6px;
          padding: 6px 8px; cursor: pointer; line-height: 1;
          color: var(--secondary-text); flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          min-width: 36px; min-height: 36px;
        }
        .btn-scan-inline:hover { background: rgba(0,0,0,0.05); }
        .device-link-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12px; color: var(--primary-color); cursor: pointer;
          margin-top: 4px; text-decoration: none;
        }
        .device-link-badge:hover { text-decoration: underline; }
        .device-link-badge svg { flex-shrink: 0; }
        .import-list { max-height: 400px; overflow-y: auto; margin: 12px 0; }
        .import-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 8px;
          border-bottom: 1px solid var(--divider); cursor: pointer;
        }
        .import-item:hover { background: rgba(0,0,0,0.03); }
        .import-item input[type="checkbox"] { flex-shrink: 0; width: 18px; height: 18px; cursor: pointer; }
        .import-item-info { flex: 1; min-width: 0; }
        .import-item-name { font-size: 14px; font-weight: 500; }
        .import-item-detail { font-size: 12px; color: var(--secondary-text); }
        .import-toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .import-toolbar button {
          background: none; border: none; color: var(--primary-color);
          cursor: pointer; font-size: 13px; padding: 4px 8px;
        }
        .import-toolbar button:hover { text-decoration: underline; }
        .version-badge {
          font-size: 11px; opacity: 0.6;
          font-weight: 400;
        }
        @media (max-width: 600px) {
          .device-card { flex-direction: column; align-items: center; text-align: center; }
          .device-name-row { justify-content: center; }
          .device-info { width: 100%; }
          .hamburger-btn { display: flex; align-items: center; }
          .toolbar { padding: 12px; font-size: 18px; }
          .toolbar-actions button span.btn-text { display: none; }
          .toolbar-logo { display: inline-flex; }
          .toolbar-title-text { display: none; }
          .version-badge { display: block; font-size: 10px; line-height: 1; margin-top: 2px; }
        }
      </style>

      <div class="toolbar">
        <button class="hamburger-btn" id="btn-menu" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          </svg>
        </button>
        <div class="toolbar-title">
          <svg class="toolbar-logo" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="14" cy="6" r="3" fill="currentColor"/>
            <circle cx="6" cy="20" r="3" fill="currentColor"/>
            <circle cx="22" cy="20" r="3" fill="currentColor"/>
            <circle cx="14" cy="16" r="2.5" fill="currentColor" opacity="0.7"/>
            <line x1="14" y1="9" x2="14" y2="13.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="11.8" y1="17.2" x2="8" y2="18.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="16.2" y1="17.2" x2="20" y2="18.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="14" y1="6" x2="6" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
            <line x1="14" y1="6" x2="22" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
            <line x1="6" y1="20" x2="22" y2="20" stroke="currentColor" stroke-width="1" opacity="0.3"/>
          </svg>
          <span class="toolbar-title-text">${this._t("title")}</span>
          <span class="version-badge">v${this._escHtml(this._version)}</span>
        </div>
        <div class="toolbar-actions">
          ${this._updateAvailable ? `
            <button class="update-badge" id="btn-update-info" title="${this._t("updateAvailable")}">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11 7h2v2h-2zm0 4h2v6h-2zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
              <span class="btn-text">${this._t("updateAvailable")}</span>
            </button>
          ` : ""}
          <div class="toolbar-dropdown">
            <button id="btn-backup-restore">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C7.58 3 4 6.58 4 11H1l3.89 3.89.07.14L9 11H6c0-3.31 2.69-6 6-6s6 2.69 6 6-2.69 6-6 6c-1.66 0-3.14-.69-4.22-1.78L6.34 16.66C7.9 18.24 9.83 19 12 19c4.42 0 8-3.58 8-8s-3.58-8-8-8zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H11z"/></svg>
              <span class="btn-text">${this._t("backupRestore")}</span>
            </button>
            ${this._showBackupMenu ? `
              <div class="toolbar-dropdown-menu" id="backup-dropdown-menu">
                <button id="btn-dropdown-export-pdf" ${this._devices.length === 0 ? "disabled" : ""}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>
                  ${this._t("exportPdf")}
                </button>
                <button id="btn-download-backup">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                  ${this._t("downloadBackup")}
                </button>
                <button id="btn-restore-backup">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
                  ${this._t("restoreBackup")}
                </button>
                <button id="btn-editor">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                  ${this._t("editor")}
                </button>
              </div>
            ` : ""}
          </div>
          <input type="file" id="restore-file-input" accept=".json" style="display:none;">
          <button id="btn-import">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            <span class="btn-text">${this._t("importDevices")}</span>
          </button>
          <button id="btn-scan">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5z"/></svg>
            <span class="btn-text">${this._t("scan")}</span>
          </button>
          <button id="btn-add">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
            <span class="btn-text">${this._t("add")}</span>
          </button>
        </div>
      </div>

      <div class="content">
        ${this._updateAvailable && !this._updateDismissed ? `
          <div class="update-banner">
            <div class="update-banner-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>
            </div>
            <div class="update-banner-text">
              <strong>${this._t("updateAvailable")}</strong>
              <div class="update-banner-versions">v${this._escHtml(this._version)} → v${this._escHtml(this._latestVersion || "")}</div>
            </div>
            <button class="update-banner-view" id="btn-banner-view">${this._t("openReleasePage").replace("?", "")}</button>
            <button class="update-banner-dismiss" id="btn-banner-dismiss" title="Dismiss">✕</button>
          </div>
        ` : ""}
        ${this._devices.length > 0
          ? `<div class="search-bar">
              <input type="text" id="search-input" placeholder="${this._t("search")}" value="${this._escHtml(this._searchQuery)}">
            </div>
            <div class="controls-row">
              <button class="sort-btn" id="btn-sort">${this._sortAZ ? this._t("sortAZ") : this._t("sortZA")}</button>
              <select class="filter-select" id="filter-connection">
                <option value="">${this._t("filterAll")}</option>
                <option value="thread"${this._filterConnection === "thread" ? " selected" : ""}>${this._t("connectionThread")}</option>
                <option value="wifi"${this._filterConnection === "wifi" ? " selected" : ""}>${this._t("connectionWifi")}</option>
                <option value="bluetooth"${this._filterConnection === "bluetooth" ? " selected" : ""}>${this._t("connectionBluetooth")}</option>
                <option value="ethernet"${this._filterConnection === "ethernet" ? " selected" : ""}>${this._t("connectionEthernet")}</option>
              </select>
            </div>`
          : ""}

        ${devices.length === 0
          ? `<div class="empty-state">${this._t(this._searchQuery ? "noResults" : "noDevices")}</div>`
          : devices.map((d) => {
              const decoded = this._getDecodedInfo(d.matter_qr_code);
              const displayNumeric = d.numeric_code || (decoded ? _computeManualCode(decoded.discriminator, decoded.passcode) : "");
              const mfr = d.manufacturer || "";
              const mdl = d.model || "";
              const mfrLine = mfr ? (mdl ? mfr + " " + mdl : mfr) : mdl;
              return `
                <div class="device-card" data-id="${d.id}">
                  ${d.matter_qr_code
                    ? `<div class="device-qr" data-qr="${this._escHtml(d.matter_qr_code)}"></div>`
                    : `<div class="device-qr"><div class="no-qr-placeholder">No QR Code</div></div>`}
                  <div class="device-info">
                    <div class="device-name-row">
                      <div class="device-name">${this._escHtml(d.name)}</div>
                      ${d.connection_type && CONNECTION_ICONS[d.connection_type] ? `<span class="connection-icon" title="${this._t("connection" + d.connection_type.charAt(0).toUpperCase() + d.connection_type.slice(1))}">${CONNECTION_ICONS[d.connection_type]}</span>` : ""}
                    </div>
                    ${mfrLine ? `<div class="device-manufacturer">${this._escHtml(mfrLine)}</div>` : ""}
                    ${d.matter_qr_code ? `<div class="device-code">${this._escHtml(d.matter_qr_code)}</div>` : ""}
                    ${displayNumeric
                      ? `<div class="device-code">
                          ${this._escHtml(formatNumericCode(displayNumeric))}
                          <button class="copy-btn" data-copy="${this._escHtml(displayNumeric)}" title="${this._t("copyCode")}">
                            ${this._copiedId === d.id ? this._t("copied") : "\u{1F4CB}"}
                          </button>
                        </div>`
                      : ""}
                    ${d.ha_device_id ? `<a class="device-link-badge" href="/config/devices/device/${this._escHtml(d.ha_device_id)}" title="${this._t("linkedDevice")}">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
                      ${this._t("linkedDevice")}
                    </a>` : ""}
                  </div>
                  <div class="device-actions">
                    <button class="menu-btn" data-menu="${d.id}">\u22EE</button>
                  </div>
                </div>`;
            }).join("")}
      </div>

      ${this._renderDialog()}
    `;

    _scriptsReady.then(() => {
      this.shadowRoot.querySelectorAll(".device-qr[data-qr]").forEach((el) => {
        this._generateQRCode(el.dataset.qr, el);
      });
      if (this._zoomedQR) {
        const zoomContainer = this.shadowRoot.querySelector("#qr-zoom-container");
        if (zoomContainer) this._generateQRCode(this._zoomedQR, zoomContainer);
      }
    });

    this._bindEvents();
  }

  _renderDialog() {
    if (this._zoomedQR) {
      return `
        <style>.device-qr { visibility: hidden; }</style>
        <div class="overlay" id="qr-zoom-overlay">
          <div class="qr-zoom-dialog">
            <div class="qr-zoom-container" id="qr-zoom-container"></div>
            <div class="qr-zoom-text">${this._escHtml(this._zoomedQR)}</div>
          </div>
        </div>`;
    }
    if (this._scanning) {
      return `
        <div class="overlay" id="overlay">
          <div class="dialog">
            <h2>${this._t("scanTitle")}</h2>
            <div class="scanner-container">
              <video id="scanner-video" autoplay playsinline></video>
              <canvas id="scanner-canvas" style="display:none;"></canvas>
            </div>
            <div class="scanner-hint">${this._t("scanHint")}</div>
            <div class="form-error" id="scan-error" style="display:none;"></div>
            <div class="dialog-actions">
              <button class="btn-cancel" id="btn-scan-stop">${this._t("scanStop")}</button>
            </div>
          </div>
        </div>
      `;
    }

    if (this._showImportDialog) {
      return this._renderImportDialog();
    }

    if (this._showEditorDialog) {
      return this._renderEditorDialog();
    }

    if (!this._editingDevice) return "";

    const d = this._editingDevice;
    const isEdit = !!(d && d.id);
    const qrVal = (d && d.matter_qr_code) || "";
    const derivedNumeric = deriveNumericCode(qrVal);
    const numericVal = (d && d.numeric_code) || "";
    const showAutoHint = !numericVal && derivedNumeric;
    const haDeviceId = (d && d.ha_device_id) || "";

    return `
      <div class="overlay" id="overlay">
        <div class="dialog">
          <h2>${this._t(isEdit ? "editDevice" : "addDevice")}</h2>
          <div class="form-error" id="form-error" style="display:none;"></div>

          <div class="form-field">
            <label>${this._t("linkDevice")}</label>
            <select id="field-ha-device">
              <option value="">${this._t("linkNone")}</option>
              ${(this._matterHADevices || []).map((dev) => {
                if (!dev) return "";
                const devName = dev.name_by_user || dev.name || "Unknown";
                const extra = dev.manufacturer ? ` (${dev.manufacturer}${dev.model ? " " + dev.model : ""})` : "";
                const selected = dev.id === haDeviceId ? " selected" : "";
                return `<option value="${this._escHtml(dev.id)}"${selected}>${this._escHtml(devName + extra)}</option>`;
              }).join("")}
            </select>
          </div>

          <div class="form-field">
            <label>${this._t("name")}</label>
            <input type="text" id="field-name" value="${this._escHtml((d && d.name) || "")}" />
          </div>
          <div class="form-field">
            <label>${this._t("manufacturer")}</label>
            <input type="text" id="field-manufacturer" value="${this._escHtml((d && d.manufacturer) || "")}" />
          </div>
          <div class="form-field">
            <label>${this._t("model")}</label>
            <input type="text" id="field-model" value="${this._escHtml((d && d.model) || "")}" />
          </div>
          <div class="form-field">
            <label>${this._t("connectionType")}</label>
            <select id="field-connection-type">
              <option value="">${this._t("connectionNone")}</option>
              <option value="thread"${(d && d.connection_type) === "thread" ? " selected" : ""}>${this._t("connectionThread")}</option>
              <option value="wifi"${(d && d.connection_type) === "wifi" ? " selected" : ""}>${this._t("connectionWifi")}</option>
              <option value="bluetooth"${(d && d.connection_type) === "bluetooth" ? " selected" : ""}>${this._t("connectionBluetooth")}</option>
              <option value="ethernet"${(d && d.connection_type) === "ethernet" ? " selected" : ""}>${this._t("connectionEthernet")}</option>
            </select>
          </div>
          <div class="form-field">
            <label>${this._t("matterQr")}</label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="field-qr" value="${this._escHtml(qrVal)}" placeholder="MT:..." style="flex:1;" />
              <button type="button" class="btn-scan-inline" id="btn-dialog-scan" title="${this._t("scanTitle")}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 6.5v3h-3v-3h3M11 5H5v6h6V5zm-1.5 9.5v3h-3v-3h3M11 13H5v6h6v-6zm6.5-6.5v3h-3v-3h3M19 5h-6v6h6V5zm-6 8h1.5v1.5H13V13zm1.5 1.5H16V16h-1.5v-1.5zM16 13h1.5v1.5H16V13zm-3 3h1.5v1.5H13V16zm1.5 1.5H16V19h-1.5v-1.5zM16 16h1.5v1.5H16V16zm1.5-1.5H19V16h-1.5v-1.5zm0 3H19V19h-1.5v-1.5z"/></svg>
              </button>
            </div>
          </div>
          <div class="form-field">
            <label>${this._t("numericCode")}</label>
            <input type="text" id="field-numeric" value="${this._escHtml(numericVal)}"
              placeholder="${derivedNumeric ? formatNumericCode(derivedNumeric) : ""}" inputmode="numeric" />
            ${showAutoHint ? `<div class="form-hint">${this._t("autoNumeric")}</div>` : ""}
          </div>
          <div class="dialog-actions">
            <button class="btn-cancel" id="btn-dialog-cancel">${this._t("cancel")}</button>
            <button class="btn-save" id="btn-dialog-save">${this._t("save")}</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderImportDialog() {
    const importedIds = new Set(this._devices.map((d) => d.ha_device_id).filter(Boolean));
    const unimported = (this._matterHADevices || []).filter((d) => d && !importedIds.has(d.id));
    const selCount = this._importSelection.size;

    return `
      <div class="overlay" id="overlay">
        <div class="dialog">
          <h2>${this._t("importTitle")}</h2>
          <p style="color: var(--secondary-text); font-size: 14px; margin: 0 0 12px 0;">${this._t("importHint")}</p>
          ${unimported.length === 0
            ? `<div class="empty-state" style="padding: 30px 20px;">${this._t("importAllDone")}</div>`
            : `
              <div class="import-toolbar">
                <button id="btn-import-select-all">${this._t("importSelectAll")}</button>
                <button id="btn-import-deselect-all">${this._t("importDeselectAll")}</button>
              </div>
              <div class="import-list">
                ${unimported.map((dev) => {
                  const devName = dev.name_by_user || dev.name || "Unknown";
                  const detail = dev.manufacturer ? `${dev.manufacturer}${dev.model ? " " + dev.model : ""}` : (dev.model || "");
                  const checked = this._importSelection.has(dev.id) ? "checked" : "";
                  return `
                    <label class="import-item" data-import-id="${this._escHtml(dev.id)}">
                      <input type="checkbox" ${checked} data-dev-id="${this._escHtml(dev.id)}" />
                      <div class="import-item-info">
                        <div class="import-item-name">${this._escHtml(devName)}</div>
                        ${detail ? `<div class="import-item-detail">${this._escHtml(detail)}</div>` : ""}
                      </div>
                    </label>`;
                }).join("")}
              </div>
            `}
          <div class="dialog-actions">
            <button class="btn-cancel" id="btn-import-cancel">${this._t("cancel")}</button>
            ${unimported.length > 0
              ? `<button class="btn-save" id="btn-import-go" ${selCount === 0 ? "disabled" : ""}>${this._t("importSelected")} (${selCount})</button>`
              : ""}
          </div>
        </div>
      </div>
    `;
  }

  _renderEditorDialog() {
    return `
      <div class="overlay" id="overlay">
        <div class="dialog">
          <h2>${this._t("editorTitle")}</h2>
          <textarea class="editor-textarea" id="editor-textarea">${this._escHtml(this._editorData)}</textarea>
          <div class="form-error" id="editor-error" style="display:none;"></div>
          <div class="dialog-actions">
            <button class="btn-cancel" id="btn-editor-cancel">${this._t("cancel")}</button>
            <button class="btn-save" id="btn-editor-save">${this._t("editorSave")}</button>
          </div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    const $$ = (sel) => this.shadowRoot.querySelectorAll(sel);

    $("#btn-menu")?.addEventListener("click", () => {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    });

    // QR zoom handlers
    $$(".device-qr[data-qr]").forEach((el) => {
      el.addEventListener("click", () => {
        this._zoomedQR = el.dataset.qr;
        this._render();
      });
    });
    $("#qr-zoom-overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "qr-zoom-overlay") {
        this._zoomedQR = null;
        this._render();
      }
    });

    $("#btn-update-info")?.addEventListener("click", () => {
      const msg = `${this._t("updateAvailableDetail")}\n\n${this._t("installedVersion")}: v${this._version}\n${this._t("latestVersion")}: v${this._latestVersion}\n\n${this._t("openReleasePage")}`;
      if (confirm(msg) && this._releaseUrl) {
        window.open(this._releaseUrl, "_blank");
      }
    });

    $("#btn-banner-view")?.addEventListener("click", () => {
      if (this._releaseUrl) window.open(this._releaseUrl, "_blank");
    });

    $("#btn-banner-dismiss")?.addEventListener("click", () => {
      this._updateDismissed = true;
      this._render();
    });

    $("#btn-add")?.addEventListener("click", () => {
      this._editingDevice = { name: "", matter_qr_code: "", numeric_code: "", manufacturer: "", model: "", ha_device_id: "", connection_type: "" };
      this._render();
    });

    $("#btn-dropdown-export-pdf")?.addEventListener("click", () => { this._showBackupMenu = false; this._exportPdf(); });

    // Backup / Restore dropdown
    $("#btn-backup-restore")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._showBackupMenu = !this._showBackupMenu;
      this._render();
    });

    $("#btn-download-backup")?.addEventListener("click", () => {
      this._showBackupMenu = false;
      this._downloadBackup();
    });

    $("#btn-restore-backup")?.addEventListener("click", () => {
      this._showBackupMenu = false;
      this._render();
      this.shadowRoot.querySelector("#restore-file-input")?.click();
    });

    $("#restore-file-input")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this._restoreFromFile(file);
      e.target.value = "";
    });

    $("#btn-editor")?.addEventListener("click", () => {
      this._showBackupMenu = false;
      this._openEditor();
    });

    // Editor dialog events
    $("#btn-editor-cancel")?.addEventListener("click", () => {
      this._showEditorDialog = false;
      this._render();
    });

    $("#btn-editor-save")?.addEventListener("click", () => this._handleEditorSave());

    $("#btn-import")?.addEventListener("click", () => {
      this._showImportDialog = true;
      this._importSelection = new Set();
      this._render();
    });

    $("#btn-scan")?.addEventListener("click", () => {
      this._scanning = true;
      this._editingDevice = null;
      this._render();
      this._startScanner();
    });

    $("#search-input")?.addEventListener("input", (e) => {
      this._searchQuery = e.target.value;
      const pos = e.target.selectionStart;
      this._render();
      const input = $("#search-input");
      if (input) {
        input.focus();
        input.setSelectionRange(pos, pos);
      }
    });

    $("#btn-sort")?.addEventListener("click", () => {
      this._sortAZ = !this._sortAZ;
      this._render();
    });

    $("#filter-connection")?.addEventListener("change", (e) => {
      this._filterConnection = e.target.value;
      this._render();
    });

    $$(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const text = btn.dataset.copy;
        const card = btn.closest(".device-card");
        if (!card) return;
        this._copyToClipboard(text).then(() => {
          this._copiedId = card.dataset.id;
          this._render();
          setTimeout(() => { this._copiedId = null; this._render(); }, 1500);
        }).catch((err) => {
          console.error("Failed to copy:", err);
        });
      });
    });

    $$(".menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.menu;
        if (!id) return;
        const existing = this.shadowRoot.querySelector(`.dropdown[data-for="${id}"]`);
        if (existing) { existing.remove(); return; }
        $$(".dropdown").forEach((d) => d.remove());
        const dd = document.createElement("div");
        dd.className = "dropdown";
        dd.dataset.for = id;
        dd.innerHTML = `
          <button class="edit-btn">${this._t("edit")}</button>
          <button class="delete-btn danger">${this._t("delete")}</button>
        `;
        btn.parentElement.appendChild(dd);
        dd.querySelector(".edit-btn").addEventListener("click", () => {
          const device = this._devices.find((d) => d.id === id);
          if (device) { this._editingDevice = { ...device }; this._render(); }
        });
        dd.querySelector(".delete-btn").addEventListener("click", () => {
          if (confirm(this._t("confirmDelete"))) this._deleteDevice(id);
        });
      });
    });

    this.shadowRoot.addEventListener("click", (e) => {
      if (!e.target.closest(".menu-btn") && !e.target.closest(".dropdown")) {
        $$(".dropdown").forEach((d) => d.remove());
      }
      if (!e.target.closest(".toolbar-dropdown")) {
        if (this._showBackupMenu) {
          this._showBackupMenu = false;
          this._render();
        }
      }
    });

    document.addEventListener("click", (e) => {
      if (!e.composedPath().includes(this.shadowRoot.host)) {
        $$(".dropdown").forEach((d) => d.remove());
      }
    }, true);

    $("#btn-dialog-cancel")?.addEventListener("click", () => {
      this._editingDevice = null;
      this._render();
    });

    $("#btn-dialog-save")?.addEventListener("click", () => this._handleSave());

    // HA device dropdown - auto-fill name, manufacturer, model
    $("#field-ha-device")?.addEventListener("change", (e) => {
      const devId = e.target.value;
      if (!devId) return;
      const haDev = this._matterHADevices.find((d) => d && d.id === devId);
      if (!haDev) return;

      const nameField = $("#field-name");
      const mfrField = $("#field-manufacturer");
      const modelField = $("#field-model");

      if (nameField) nameField.value = haDev.name_by_user || haDev.name || "";
      if (mfrField) mfrField.value = haDev.manufacturer || "";
      if (modelField) modelField.value = haDev.model || "";

      // Auto-suggest connection type from QR code if present
      const connField = $("#field-connection-type");
      const qrField = $("#field-qr");
      if (connField && !connField.value && qrField) {
        const qr = qrField.value.trim();
        if (qr.toUpperCase().startsWith("MT:")) {
          const info = _decodeMatterQR(qr);
          if (info) {
            const caps = info.discoveryCaps;
            const suggestion = caps === 1 ? "wifi" : caps === 2 ? "bluetooth" : caps === 3 ? "wifi" : caps === 6 ? "thread" : null;
            if (suggestion) connField.value = suggestion;
          }
        }
      }
    });

    // Dialog scan button - scan QR into current device
    $("#btn-dialog-scan")?.addEventListener("click", () => {
      // Preserve current form values before switching to scanner
      if (this._editingDevice) {
        this._editingDevice.name = ($("#field-name")?.value || "").trim();
        this._editingDevice.matter_qr_code = ($("#field-qr")?.value || "").trim().toUpperCase();
        this._editingDevice.numeric_code = ($("#field-numeric")?.value || "").trim();
        this._editingDevice.manufacturer = ($("#field-manufacturer")?.value || "").trim();
        this._editingDevice.model = ($("#field-model")?.value || "").trim();
        this._editingDevice.connection_type = ($("#field-connection-type")?.value || "");
        this._editingDevice.ha_device_id = ($("#field-ha-device")?.value || "").trim();
      }
      this._scanning = true;
      this._render();
      this._startScanner();
    });

    // QR field - auto-compute numeric on input
    $("#field-qr")?.addEventListener("input", (e) => {
      const qr = e.target.value.trim();
      const numericField = $("#field-numeric");
      if (numericField && qr.toUpperCase().startsWith("MT:")) {
        const derived = deriveNumericCode(qr);
        if (derived) {
          numericField.placeholder = formatNumericCode(derived);
          const hint = numericField.parentElement.querySelector(".form-hint");
          if (!hint && !numericField.value.trim()) {
            const h = document.createElement("div");
            h.className = "form-hint";
            h.textContent = this._t("autoNumeric");
            numericField.parentElement.appendChild(h);
          }
        }
        // Auto-suggest connection type from discoveryCaps
        const connField = $("#field-connection-type");
        if (connField && !connField.value) {
          const info = _decodeMatterQR(qr);
          if (info) {
            const caps = info.discoveryCaps;
            const suggestion = caps === 1 ? "wifi" : caps === 2 ? "bluetooth" : caps === 3 ? "wifi" : caps === 6 ? "thread" : null;
            if (suggestion) connField.value = suggestion;
          }
        }
      }
    });

    $$("#field-name, #field-qr, #field-numeric").forEach((input) => {
      input?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this._handleSave();
      });
    });

    // Import dialog events
    $("#btn-import-cancel")?.addEventListener("click", () => {
      this._showImportDialog = false;
      this._importSelection = new Set();
      this._render();
    });

    $("#btn-import-select-all")?.addEventListener("click", () => {
      const importedIds = new Set(this._devices.map((d) => d.ha_device_id).filter(Boolean));
      const unimported = (this._matterHADevices || []).filter((d) => d && !importedIds.has(d.id));
      this._importSelection = new Set(unimported.map((d) => d.id));
      this._render();
    });

    $("#btn-import-deselect-all")?.addEventListener("click", () => {
      this._importSelection = new Set();
      this._render();
    });

    $$("input[data-dev-id]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const devId = e.target.dataset.devId;
        if (e.target.checked) {
          this._importSelection.add(devId);
        } else {
          this._importSelection.delete(devId);
        }
        this._render();
      });
    });

    $("#btn-import-go")?.addEventListener("click", () => this._handleImport());

    $("#overlay")?.addEventListener("click", (e) => {
      if (e.target.id === "overlay") {
        if (this._scanning && this._editingDevice) {
          // Scanning from dialog: stop scanner and return to dialog
          this._stopScanner();
          this._scanning = false;
        } else if (this._editingDevice && !this._scanning) {
          // Edit dialog open: ignore overlay click, close only via Save/Cancel
          return;
        } else {
          this._stopScanner();
          this._editingDevice = null;
          this._scanning = false;
          this._showImportDialog = false;
          this._showEditorDialog = false;
        }
        this._render();
      }
    });

    $("#btn-scan-stop")?.addEventListener("click", () => {
      this._stopScanner();
      this._scanning = false;
      // If _editingDevice is set, return to dialog; otherwise back to main
      this._render();
    });
  }

  async _handleSave() {
    const $ = (sel) => this.shadowRoot.querySelector(sel);
    const name = ($("#field-name")?.value || "").trim();
    const qr = ($("#field-qr")?.value || "").trim().toUpperCase();
    let numeric = ($("#field-numeric")?.value || "").trim();
    const manufacturer = ($("#field-manufacturer")?.value || "").trim();
    const model = ($("#field-model")?.value || "").trim();
    const connectionType = ($("#field-connection-type")?.value || "");
    const haDeviceId = ($("#field-ha-device")?.value || "").trim();
    const errorEl = $("#form-error");

    if (!name) {
      if (errorEl) { errorEl.textContent = this._t("nameRequired"); errorEl.style.display = "block"; }
      return;
    }
    if (!qr && !numeric && !(this._editingDevice && this._editingDevice.id)) {
      if (errorEl) { errorEl.textContent = this._t("codeRequired"); errorEl.style.display = "block"; }
      return;
    }

    // Auto-derive numeric code from QR if not manually entered
    if (!numeric && qr) {
      const derived = deriveNumericCode(qr);
      if (derived) numeric = derived;
    }

    // Duplicate detection for new devices
    if (!this._editingDevice || !this._editingDevice.id) {
      const isDuplicate = this._devices.some((d) => {
        if (qr && d.matter_qr_code && d.matter_qr_code === qr) return true;
        if (numeric && d.numeric_code && d.numeric_code === numeric) return true;
        return false;
      });
      if (isDuplicate) {
        if (errorEl) { errorEl.textContent = this._t("duplicateCode"); errorEl.style.display = "block"; }
        return;
      }
    }

    try {
      if (this._editingDevice && this._editingDevice.id) {
        await this._updateDevice(this._editingDevice.id, name, qr, numeric, manufacturer, model, haDeviceId, connectionType);
      } else {
        await this._addDevice(name, qr, numeric, manufacturer, model, haDeviceId, connectionType);
      }
      this._editingDevice = null;
      this._render();
      await this._loadDevices();
    } catch (e) {
      console.error("Save error:", e);
      if (errorEl) { errorEl.textContent = e.message || "Error saving device"; errorEl.style.display = "block"; }
    }
  }

  async _handleImport() {
    if (this._importSelection.size === 0) return;
    const devicesToImport = [];
    for (const devId of this._importSelection) {
      const haDev = this._matterHADevices.find((d) => d && d.id === devId);
      if (haDev) {
        devicesToImport.push({
          ha_device_id: haDev.id,
          name: haDev.name_by_user || haDev.name || "Unknown",
          manufacturer: haDev.manufacturer || "",
          model: haDev.model || "",
        });
      }
    }
    try {
      await this._hass.callWS({
        type: "matter_code_organizer/import_devices",
        devices: devicesToImport,
      });
      this._showImportDialog = false;
      this._importSelection = new Set();
      await this._loadDevices();
    } catch (e) {
      console.error("Import error:", e);
    }
  }

  async _downloadBackup() {
    try {
      const result = await this._hass.callWS({
        type: "matter_code_organizer/backup",
      });
      const json = JSON.stringify(result, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `matter-codes-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Backup error:", e);
    }
  }

  async _restoreFromFile(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.devices || !Array.isArray(data.devices)) {
        alert(this._t("restoreError"));
        return;
      }
      if (!confirm(this._t("restoreConfirm"))) return;
      await this._hass.callWS({
        type: "matter_code_organizer/restore",
        data: data,
      });
      await this._loadDevices();
      alert(this._t("restoreSuccess"));
    } catch (e) {
      console.error("Restore error:", e);
      alert(this._t("restoreError"));
    }
  }

  async _openEditor() {
    try {
      const result = await this._hass.callWS({
        type: "matter_code_organizer/backup",
      });
      this._editorData = JSON.stringify(result, null, 2);
      this._showEditorDialog = true;
      this._render();
    } catch (e) {
      console.error("Editor load error:", e);
    }
  }

  async _handleEditorSave() {
    const textarea = this.shadowRoot.querySelector("#editor-textarea");
    const errorEl = this.shadowRoot.querySelector("#editor-error");
    if (!textarea) return;

    let data;
    try {
      data = JSON.parse(textarea.value);
    } catch (e) {
      if (errorEl) {
        errorEl.textContent = this._t("editorInvalidJson");
        errorEl.style.display = "block";
      }
      return;
    }

    if (!data.devices || !Array.isArray(data.devices)) {
      if (errorEl) {
        errorEl.textContent = this._t("editorInvalidJson");
        errorEl.style.display = "block";
      }
      return;
    }

    if (!confirm(this._t("restoreConfirm"))) return;

    try {
      await this._hass.callWS({
        type: "matter_code_organizer/restore",
        data: data,
      });
      this._showEditorDialog = false;
      await this._loadDevices();
    } catch (e) {
      console.error("Editor save error:", e);
      if (errorEl) {
        errorEl.textContent = e.message || "Error saving data";
        errorEl.style.display = "block";
      }
    }
  }

  async _startScanner() {
    await _scriptsReady;
    const video = this.shadowRoot.querySelector("#scanner-video");
    const canvas = this.shadowRoot.querySelector("#scanner-canvas");
    const errorEl = this.shadowRoot.querySelector("#scan-error");

    if (!video || !canvas) return;

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      video.srcObject = this._stream;
      video.play();

      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const scan = () => {
        if (!this._scanning || !this._stream) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          if (window.jsQR) {
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: "dontInvert",
            });

            const scannedData = code ? code.data.toUpperCase() : "";
            if (code && scannedData && scannedData.startsWith("MT:")) {
              this._stopScanner();
              this._scanning = false;
              const derived = deriveNumericCode(scannedData);
              if (this._editingDevice) {
                // Dialog scan: fill QR into existing device
                this._editingDevice.matter_qr_code = scannedData;
                this._editingDevice.numeric_code = derived || this._editingDevice.numeric_code || "";
              } else {
                // Main page scan: create new device
                this._editingDevice = {
                  name: "",
                  matter_qr_code: scannedData,
                  numeric_code: derived || "",
                  manufacturer: "",
                  model: "",
                  connection_type: "",
                };
              }
              this._render();
              return;
            }
          }
        }

        this._scanAnimFrame = requestAnimationFrame(scan);
      };

      this._scanAnimFrame = requestAnimationFrame(scan);
    } catch (e) {
      console.error("Camera error:", e);
      if (errorEl) {
        errorEl.textContent = this._t("cameraError");
        errorEl.style.display = "block";
      }
    }
  }

  _stopScanner() {
    if (this._scanAnimFrame) {
      cancelAnimationFrame(this._scanAnimFrame);
      this._scanAnimFrame = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
  }

  async _exportPdf() {
    await _jspdfReady;
    await _scriptsReady;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const devices = this._filteredDevices;
    const pageW = 210;
    const margin = 15;
    const colW = (pageW - margin * 2 - 10) / 2; // two columns with 10mm gap
    const qrSize = 28;

    // Title
    doc.setFontSize(18);
    doc.text(this._t("exportPdfTitle"), pageW / 2, 18, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(new Date().toLocaleDateString(), pageW / 2, 24, { align: "center" });
    doc.setTextColor(0);

    let col = 0;
    let yPos = 32;
    const cardH = 52; // height per device card
    const pageH = 280;

    for (const d of devices) {
      if (yPos + cardH > pageH) {
        doc.addPage();
        yPos = 15;
      }

      const x = margin + col * (colW + 10);

      // Card background
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(200);
      doc.roundedRect(x, yPos, colW, cardH, 2, 2, "FD");

      // QR code
      let qrX = x + 3;
      let textX = x + qrSize + 6;
      let textW = colW - qrSize - 9;

      if (d.matter_qr_code && window.qrcode) {
        try {
          const qr = window.qrcode(0, "M");
          qr.addData(d.matter_qr_code, 'Alphanumeric');
          qr.make();
          const svgStr = qr.createSvgTag(4, 0);
          // Convert SVG to data URL for PDF embedding
          const svgBlob = new Blob([svgStr], { type: "image/svg+xml" });
          const url = URL.createObjectURL(svgBlob);
          const img = new Image();
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
            img.src = url;
          });
          const canvas = document.createElement("canvas");
          canvas.width = 200;
          canvas.height = 200;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, 200, 200);
          ctx.drawImage(img, 0, 0, 200, 200);
          URL.revokeObjectURL(url);
          const imgData = canvas.toDataURL("image/png");
          doc.addImage(imgData, "PNG", qrX, yPos + 2, qrSize, qrSize);
        } catch (e) {
          console.error("PDF QR error:", e);
        }
      } else {
        textX = x + 4;
        textW = colW - 8;
      }

      // Device name
      doc.setFontSize(11);
      doc.setFont(undefined, "bold");
      const nameLines = doc.splitTextToSize(d.name || "Unnamed", textW);
      doc.text(nameLines.slice(0, 2), textX, yPos + 6);
      doc.setFont(undefined, "normal");

      // Connection type
      let infoY = yPos + 6 + nameLines.slice(0, 2).length * 4.5;
      if (d.connection_type) {
        doc.setFontSize(8);
        doc.setTextColor(80);
        const connLabel = this._t("connection" + d.connection_type.charAt(0).toUpperCase() + d.connection_type.slice(1));
        doc.text(connLabel, textX, infoY);
        infoY += 4;
      }

      // Manufacturer / Model
      const mfr = d.manufacturer || "";
      const mdl = d.model || "";
      const mfrLine = mfr ? (mdl ? mfr + " " + mdl : mfr) : mdl;
      if (mfrLine) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(doc.splitTextToSize(mfrLine, textW).slice(0, 1), textX, infoY);
        infoY += 4;
        doc.setTextColor(0);
      }

      // QR code string
      if (d.matter_qr_code) {
        doc.setFontSize(6.5);
        doc.setTextColor(60);
        doc.text(doc.splitTextToSize(d.matter_qr_code, textW).slice(0, 1), textX, infoY);
        infoY += 3.5;
      }

      // Numeric code
      const decoded = this._getDecodedInfo(d.matter_qr_code);
      const displayNumeric = d.numeric_code || (decoded ? _computeManualCode(decoded.discriminator, decoded.passcode) : "");
      if (displayNumeric) {
        doc.setFontSize(9);
        doc.setTextColor(0);
        doc.setFont(undefined, "bold");
        doc.text(formatNumericCode(displayNumeric), textX, infoY + 1);
        doc.setFont(undefined, "normal");
      }

      doc.setTextColor(0);

      // Advance to next position
      col++;
      if (col >= 2) {
        col = 0;
        yPos += cardH + 4;
      }
    }

    doc.save("matter-devices.pdf");
  }

  _escHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

customElements.define("matter-code-panel", MatterCodePanel);
