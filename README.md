# 🔔 Zabbix Sound Alerts

Tampermonkey userscript that adds persistent sound alerts to Zabbix for **Critical** and **High** severity **unacknowledged** problems.

## Features

- 🚨 **Loud siren alarm** that does NOT stop until you press the button
- 🔴🟠 **Separate thresholds** for Critical and High severity
- 🔍 **Name filters** (comma-separated) to only alert on specific problems
- 🚫 **Exceptions** (comma-separated) to exclude specific problem names
- ⏱ **Configurable time thresholds** per severity
- 🔊 **Auto audio unlock** on first user interaction
- 💾 **Persistent config** saved in localStorage
- 📡 Uses **Zabbix JSON-RPC API** (`problem.get`) with `acknowledged: false`

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser
2. Create a new script
3. Copy and paste the contents of `zabbix-sound-alerts.user.js`
4. Update the `@match` line to match your Zabbix URL
5. Save and reload Zabbix

## Configuration

Click the 🔔 floating button (bottom-right corner) to open the config panel:

| Setting | Description |
|---|---|
| ⏱ Umbral HIGH (min) | Time threshold for High alerts |
| ⏱ Umbral CRITICAL (min) | Time threshold for Critical alerts |
| 🟠 Filtro HIGH | Only alert HIGH matching these names (comma-separated, empty = all) |
| 🔴 Filtro CRITICAL | Only alert CRITICAL matching these names (comma-separated, empty = all) |
| 🚫 Excepciones | Never alert problems matching these names (comma-separated) |

## Changelog

### v8.0
- Separate time thresholds for HIGH and CRITICAL
- Exception list (comma-separated) to exclude specific problem names
- Shows active config in panel

### v7.0
- Audio unlock system for browser autoplay policy
- Comma-separated name filters for HIGH and CRITICAL
- Pending alarm system when audio is blocked

### v6.0
- Added `acknowledged: false` filter (only Unacknowledged problems)
- Problem names shown in alarm overlay

### v5.0
- Dual detection: API + HTML table fallback
- Full-screen alarm overlay

### v4.0
- Injected into `document.documentElement` for maximum compatibility
- Multiple injection retry attempts

### v3.0
- Floating button (position:fixed) independent of Zabbix DOM

### v1.0-v2.0
- Initial versions with sidebar injection attempts

## License

MIT