# Gobel Monitor BMS — example config

Working configuration for the Gobel monitor integration (entities prefixed
`sensor.gobel_monitor_pack_01_view_*`), which reports cell voltages in **mV**
and uses zero-padded cell indices (`view_cell_voltage_01..16`).

## Requires

Battery Pack Card **v1.3.2** or newer. Earlier versions don't accept the
`cell_voltage_from` / `{nn}` placeholder used below — cells will overflow the
tile and cells 1–9 won't resolve.

## A) As a standalone card

Use this when you paste into the card editor's YAML view (top-level, no list
prefix).

```yaml
type: custom:battery-pack-card
name: BMS Master
cells: 16

# Gobel reports cell voltages in millivolts and resistances likely in milliohms.
# If your view_wire_resistance_01 entity reads e.g. 0.0005 instead of 0.5,
# change cell_resistance_from to "ohm".
cell_voltage_from: mV
cell_resistance_from: mohm

# {nn} substitutes a zero-padded index (01..16) — matches view_cell_voltage_01.
cell_voltage_pattern: sensor.gobel_monitor_pack_01_view_cell_voltage_{nn}
cell_resistance_pattern: sensor.gobel_monitor_pack_01_view_wire_resistance_{nn}

entity_soc: sensor.gobel_monitor_pack_01_view_soc
entity_soh: sensor.gobel_monitor_pack_01_view_soh
entity_pack_voltage: sensor.gobel_monitor_pack_01_view_voltage
entity_current: sensor.gobel_monitor_pack_01_view_current
entity_power: sensor.gobel_monitor_pack_01_view_power
entity_balance_current: sensor.gobel_monitor_pack_01_view_balance_current
entity_cycles: sensor.gobel_monitor_pack_01_view_cycle_count
entity_capacity_remaining: sensor.gobel_monitor_pack_01_view_remain_capacity
entity_capacity_total: sensor.gobel_monitor_pack_01_view_design_capacity
entity_runtime: sensor.gobel_monitor_pack_01_view_total_runtime

entity_cell_voltage_min: sensor.gobel_monitor_pack_01_view_cell_voltage_min
entity_cell_voltage_max: sensor.gobel_monitor_pack_01_view_cell_voltage_max
entity_cell_voltage_delta: sensor.gobel_monitor_pack_01_view_cell_voltage_diff

entity_switch_charge: binary_sensor.gobel_monitor_pack_01_view_charge_mos
entity_switch_discharge: binary_sensor.gobel_monitor_pack_01_view_discharge_mos
entity_switch_balance: binary_sensor.gobel_monitor_pack_01_view_balance_mos

entity_temp_mos: sensor.gobel_monitor_pack_01_view_temp_mos
entity_temp_probe_1: sensor.gobel_monitor_pack_01_view_temperature_01
entity_temp_probe_2: sensor.gobel_monitor_pack_01_view_temperature_02
entity_temp_probe_3: sensor.gobel_monitor_pack_01_view_temperature_03
entity_temp_probe_4: sensor.gobel_monitor_pack_01_view_temperature_04
```

## B) As an item inside a `cards:` list

Use this when the card is nested under a `vertical-stack`, `horizontal-stack`,
`grid`, or any other layout that has a `cards:` array. Every property is
indented under `- type:`.

```yaml
- type: custom:battery-pack-card
  name: BMS Master
  cells: 16

  cell_voltage_from: mV
  cell_resistance_from: mohm

  cell_voltage_pattern: sensor.gobel_monitor_pack_01_view_cell_voltage_{nn}
  cell_resistance_pattern: sensor.gobel_monitor_pack_01_view_wire_resistance_{nn}

  entity_soc: sensor.gobel_monitor_pack_01_view_soc
  entity_soh: sensor.gobel_monitor_pack_01_view_soh
  entity_pack_voltage: sensor.gobel_monitor_pack_01_view_voltage
  entity_current: sensor.gobel_monitor_pack_01_view_current
  entity_power: sensor.gobel_monitor_pack_01_view_power
  entity_balance_current: sensor.gobel_monitor_pack_01_view_balance_current
  entity_cycles: sensor.gobel_monitor_pack_01_view_cycle_count
  entity_capacity_remaining: sensor.gobel_monitor_pack_01_view_remain_capacity
  entity_capacity_total: sensor.gobel_monitor_pack_01_view_design_capacity
  entity_runtime: sensor.gobel_monitor_pack_01_view_total_runtime

  entity_cell_voltage_min: sensor.gobel_monitor_pack_01_view_cell_voltage_min
  entity_cell_voltage_max: sensor.gobel_monitor_pack_01_view_cell_voltage_max
  entity_cell_voltage_delta: sensor.gobel_monitor_pack_01_view_cell_voltage_diff

  entity_switch_charge: binary_sensor.gobel_monitor_pack_01_view_charge_mos
  entity_switch_discharge: binary_sensor.gobel_monitor_pack_01_view_discharge_mos
  entity_switch_balance: binary_sensor.gobel_monitor_pack_01_view_balance_mos

  entity_temp_mos: sensor.gobel_monitor_pack_01_view_temp_mos
  entity_temp_probe_1: sensor.gobel_monitor_pack_01_view_temperature_01
  entity_temp_probe_2: sensor.gobel_monitor_pack_01_view_temperature_02
  entity_temp_probe_3: sensor.gobel_monitor_pack_01_view_temperature_03
  entity_temp_probe_4: sensor.gobel_monitor_pack_01_view_temperature_04
```

## How to verify the resistance unit

Open Developer Tools → States in HA and look up
`sensor.gobel_monitor_pack_01_view_wire_resistance_01`. The raw state value
tells you which `cell_resistance_from` to use:

| Raw state          | What it means     | Set `cell_resistance_from:` |
| ------------------ | ----------------- | --------------------------- |
| around `0.5`       | reported in mΩ    | `mohm`                      |
| around `0.0005`    | reported in Ω     | `ohm`                       |

The card always displays cell resistance as `mΩ`; the `_from` value just tells
it how to normalize the input.

## Install / update

1. HACS → Battery Pack Card → Update.
2. Update to `v1.3.2` (or newer).
3. Paste one of the configs above into the card.
4. Hard-refresh the dashboard (Ctrl+Shift+R / Cmd+Shift+R).
5. Open the browser console — the green banner should read
   `BATTERY-PACK-CARD v1.3.2`. That confirms the new build is loaded.
