# Battery Pack Card

A visual Lovelace card for Home Assistant that renders a 16-series (or any 4–32-series) battery pack — SOC silhouette, six headline stats, status pills for charge/discharge/balance/heater, a colour-coded per-cell array (voltage + internal resistance, tinted by deviation from pack average), min/max/avg/Δ summary line, and a temperature strip. Read-only: it never writes to the BMS.

Every region is clickable and opens the matching entity's more-info dialog.

## Install

### Via HACS (recommended)

1. HACS → Frontend → ⋮ → Custom repositories → add this repo URL with type **Lovelace**.
2. Install **Battery Pack Card**.
3. Hard-refresh the dashboard (Ctrl/Cmd+Shift+R).

### Manual

1. Copy `battery-pack-card.js` to `/config/www/`.
2. Settings → Dashboards → ⋮ → Resources → add `/local/battery-pack-card.js` as type **JavaScript module**.
3. Hard-refresh.

## Usage

The card derives every entity ID from a single `prefix:` string — e.g. with `prefix: bms_master` it reads `sensor.bms_master_soc_pourcentage`, `sensor.bms_master_cell_1_volt`, `binary_sensor.bms_master_switch_charge`, etc.

Add via the UI: "Add Card" → search "Battery Pack Card", fill the form.

Or in YAML:

```yaml
type: custom:battery-pack-card
name: BMS Master
prefix: bms_master
alarm_prefix: bms_master_bms_master
cells: 16
```

## Configuration

| Option              | Type    | Default                     | Description                                                   |
| ------------------- | ------- | --------------------------- | ------------------------------------------------------------- |
| `prefix`            | string  | —                           | **Required.** Entity prefix (e.g. `bms_master`).              |
| `name`              | string  | `<prefix>`                  | Title shown in the card header.                               |
| `alarm_prefix`      | string  | `<prefix>_<prefix>`         | Prefix for `*_alarm_status` / `*_alarm_active`.               |
| `cells`             | integer | `16`                        | Number of series cells to render (4–32).                      |
| `show_battery`      | bool    | `true`                      | Show the SVG battery silhouette with SOC fill.                |
| `show_stats`        | bool    | `true`                      | Show the 6-tile stat grid.                                    |
| `show_pills`        | bool    | `true`                      | Show charge / discharge / balance / heater status pills.      |
| `show_cells`        | bool    | `true`                      | Show the per-cell voltage + resistance grid.                  |
| `show_summary`      | bool    | `true`                      | Show the min / avg / max / Δ summary line.                    |
| `show_temperatures` | bool    | `true`                      | Show the MOSFET + 4-probe temperature strip.                  |

## Expected entities

For a given `prefix: X` the card reads:

- `sensor.X_soc_pourcentage`, `sensor.X_soh_pourcentage`
- `sensor.X_tension_totale_volt`, `sensor.X_courant_total`, `sensor.X_puissance_totale`
- `sensor.X_balance_courant`, `sensor.X_nombre_cycle`, `sensor.X_charge_status_text`
- `sensor.X_capacite_restante_ah`, `sensor.X_capacite_batterie_ah`, `sensor.X_total_runtime_formatted`
- `sensor.X_cell_voltage_{average,min_value,max_value,delta,min_number,max_number}`
- `sensor.X_cell_<1..N>_volt`, `sensor.X_cell_<1..N>_ohm`
- `sensor.X_mos_temp`, `sensor.X_sonde_<1..4>_temp`
- `binary_sensor.X_switch_charge`, `binary_sensor.X_switch_decharge`
- `binary_sensor.X_switch_balance`, `binary_sensor.X_balance_action`
- `binary_sensor.X_heating`
- `sensor.<alarm_prefix>_alarm_status`, `binary_sensor.<alarm_prefix>_alarm_active`

Designed against the [Diysolarforum JK-BMS MQTT integration](https://github.com/syssi/esphome-jk-bms) entity naming.

## License

MIT.
