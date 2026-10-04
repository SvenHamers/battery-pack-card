/**
 * battery-pack-card — visual battery card for Home Assistant
 *
 * Basic config (prefix-driven, all entities derived):
 *   type: custom:battery-pack-card
 *   prefix: bms_master
 *   alarm_prefix: bms_master_bms_master
 *   cells: 16
 *
 * Advanced config: override any individual entity ID via `entity_*` keys
 * (any field left blank falls back to the prefix-derived default).
 * For cells use a pattern with {n}, e.g.
 *   cell_voltage_pattern: sensor.foo_cell_{n}_voltage
 *
 * Click any element to open the matching entity's more-info dialog.
 */

const VERSION = "1.9.0-alpha.1";

const DEFAULTS = {
  name: "",
  prefix: "",
  alarm_prefix: "",
  cells: 16,
  show_battery: true,
  show_stats: true,
  show_pills: true,
  show_cells: true,
  show_summary: true,
  show_temperatures: true,
  cell_voltage_from: "V",
  summary_voltage_from: "",      // "" = same as cell_voltage_from
  cell_voltage_decimals: 3,
  cell_resistance_from: "ohm",
  cell_resistance_decimals: 0,
  cells_min_width: 48,
  cells_max_columns: 8,
  // "auto" shows temperatures as Home Assistant reports them; "C" / "F"
  // converts. The colours always follow the real temperature either way.
  temperature_unit: "auto",
  // Temperature colour bands, in the unit the card shows (blank = 5 / 35 /
  // 50 °C, or the same in °F): blue below cold, amber from warm, red from hot.
  temp_cold: "",
  temp_warm: "",
  temp_hot: "",
  // Cell tint bands, in mV of deviation from the pack average. Packs differ in
  // how much spread is normal, so these are configurable rather than fixed.
  cell_dev_soft: 2,
  cell_dev_warn: 5,
  cell_dev_bad: 10,
  // Summary Δ (max − min) bands, in mV.
  delta_warn: 5,
  delta_bad: 15,
  // Lowest cell red / highest green by default. On: the reverse, for people
  // who watch for the top cell running into overvoltage while charging.
  max_cell_red: false,
  // Free-form label/value rows per pack behind a "More info" button. Stored in
  // HA (2025.12+), keyed by info_key, else the prefix, SOC entity or name.
  show_info: true,
  // Tiles, pills and lines for sensors that don't exist are hidden. On: show
  // them anyway (as 0, OFF or —), the way the card worked before 1.8.
  show_missing: false,
  info_key: "",
  // Capacity as charge (Ah) or as energy (kWh = Ah × nominal voltage). The
  // nominal voltage defaults to cells × 3.2 V, LiFePO4's nominal cell voltage.
  capacity_unit: "Ah",
  nominal_voltage: "",
  // One switch per status pill. A pill whose entity doesn't exist is hidden
  // regardless, so a BMS without a heater shows no Heater pill.
  show_pill_charge: true,
  show_pill_discharge: true,
  show_pill_balance: true,
  show_pill_heater: true,
};

// LiFePO4 nominal cell voltage, for kWh when no nominal_voltage is set.
const NOMINAL_CELL_V = 3.2;

const BASIC_SCHEMA = [
  { name: "name", selector: { text: {} } },
  { name: "prefix", selector: { text: {} } },
  { name: "alarm_prefix", selector: { text: {} } },
  { name: "cells", selector: { number: { min: 4, max: 32, step: 1, mode: "box" } } },
  {
    type: "grid",
    name: "",
    schema: [
      { name: "show_battery",      selector: { boolean: {} } },
      { name: "show_stats",        selector: { boolean: {} } },
      { name: "show_pills",        selector: { boolean: {} } },
      { name: "show_cells",        selector: { boolean: {} } },
      { name: "show_summary",      selector: { boolean: {} } },
      { name: "show_temperatures", selector: { boolean: {} } },
      { name: "show_info",         selector: { boolean: {} } },
      { name: "show_missing",      selector: { boolean: {} } },
    ],
  },
];

const ENT_SENSOR = { entity: { domain: "sensor" } };
const ENT_BIN    = { entity: { domain: "binary_sensor" } };
// Threshold fields are all "a number of millivolts", so they share one selector.
const MV_BAND    = { number: { min: 0, max: 500, step: 0.5, mode: "box" } };
const TEMP_BAND  = { number: { min: -60, max: 250, step: 0.5, mode: "box" } };

const ADVANCED_SECTIONS = [
  {
    title: "Pack metrics",
    schema: [
      { name: "entity_soc",              selector: ENT_SENSOR },
      { name: "entity_soh",              selector: ENT_SENSOR },
      { name: "entity_pack_voltage",     selector: ENT_SENSOR },
      { name: "entity_current",          selector: ENT_SENSOR },
      { name: "entity_power",            selector: ENT_SENSOR },
      { name: "entity_balance_current",  selector: ENT_SENSOR },
      { name: "entity_cycles",           selector: ENT_SENSOR },
      { name: "entity_capacity_remaining", selector: ENT_SENSOR },
      { name: "entity_capacity_total",   selector: ENT_SENSOR },
      { name: "entity_runtime",          selector: ENT_SENSOR },
      { name: "entity_charge_phase",     selector: ENT_SENSOR },
    ],
  },
  {
    title: "Cell summary",
    schema: [
      { name: "entity_cell_voltage_avg",   selector: ENT_SENSOR },
      { name: "entity_cell_voltage_min",   selector: ENT_SENSOR },
      { name: "entity_cell_voltage_max",   selector: ENT_SENSOR },
      { name: "entity_cell_voltage_delta", selector: ENT_SENSOR },
      { name: "entity_cell_min_number",    selector: ENT_SENSOR },
      { name: "entity_cell_max_number",    selector: ENT_SENSOR },
    ],
  },
  {
    title: "Status",
    schema: [
      { name: "entity_alarm_status",    selector: ENT_SENSOR },
      { name: "entity_alarm_active",    selector: ENT_BIN },
      { name: "entity_switch_charge",   selector: ENT_BIN },
      { name: "entity_switch_discharge",selector: ENT_BIN },
      { name: "entity_switch_balance",  selector: ENT_BIN },
      { name: "entity_balance_active",  selector: ENT_BIN },
      { name: "entity_heating",         selector: ENT_BIN },
    ],
  },
  {
    title: "Temperatures",
    schema: [
      { name: "entity_temp_mos",     selector: ENT_SENSOR },
      { name: "entity_temp_probe_1", selector: ENT_SENSOR },
      { name: "entity_temp_probe_2", selector: ENT_SENSOR },
      { name: "entity_temp_probe_3", selector: ENT_SENSOR },
      { name: "entity_temp_probe_4", selector: ENT_SENSOR },
    ],
  },
  {
    title: "Cells (use {n} or {nn} placeholder for cell index 1..N)",
    schema: [
      { name: "cell_voltage_pattern",    selector: { text: {} } },
      { name: "cell_resistance_pattern", selector: { text: {} } },
    ],
  },
  {
    title: "Display",
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          {
            name: "cell_voltage_from",
            selector: { select: { options: [
              { value: "V",  label: "V (volts)" },
              { value: "mV", label: "mV (millivolts)" },
            ], mode: "dropdown" } },
          },
          {
            name: "summary_voltage_from",
            selector: { select: { options: [
              { value: "V",  label: "V (volts)" },
              { value: "mV", label: "mV (millivolts)" },
            ], mode: "dropdown" } },
          },
          { name: "cell_voltage_decimals", selector: { number: { min: 0, max: 6, step: 1, mode: "box" } } },
          {
            name: "cell_resistance_from",
            selector: { select: { options: [
              { value: "ohm",  label: "Ω (ohms)" },
              { value: "mohm", label: "mΩ (milliohms)" },
            ], mode: "dropdown" } },
          },
          { name: "cell_resistance_decimals", selector: { number: { min: 0, max: 4, step: 1, mode: "box" } } },
          { name: "cells_min_width",   selector: { number: { min: 30, max: 200, step: 1, mode: "box" } } },
          { name: "cells_max_columns", selector: { number: { min: 1, max: 32, step: 1, mode: "box" } } },
          {
            name: "temperature_unit",
            selector: { select: { options: [
              { value: "auto", label: "As Home Assistant reports it" },
              { value: "C",    label: "°C (Celsius)" },
              { value: "F",    label: "°F (Fahrenheit)" },
            ], mode: "dropdown" } },
          },
          {
            name: "capacity_unit",
            selector: { select: { options: [
              { value: "Ah",  label: "Ah (charge)" },
              { value: "kWh", label: "kWh (energy)" },
            ], mode: "dropdown" } },
          },
          { name: "nominal_voltage", selector: { number: { min: 1, max: 1000, step: 0.1, mode: "box", unit_of_measurement: "V" } } },
        ],
      },
    ],
  },
  {
    title: "Status pills",
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "show_pill_charge",    selector: { boolean: {} } },
          { name: "show_pill_discharge", selector: { boolean: {} } },
          { name: "show_pill_balance",   selector: { boolean: {} } },
          { name: "show_pill_heater",    selector: { boolean: {} } },
        ],
      },
    ],
  },
  {
    title: "Cell colouring (mV of deviation from the pack average)",
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "cell_dev_soft", selector: MV_BAND },
          { name: "cell_dev_warn", selector: MV_BAND },
          { name: "cell_dev_bad",  selector: MV_BAND },
          { name: "delta_warn",    selector: MV_BAND },
          { name: "delta_bad",     selector: MV_BAND },
        ],
      },
      { name: "max_cell_red", selector: { boolean: {} } },
    ],
  },
  {
    title: "Temperature colours (in the unit the card shows)",
    schema: [
      {
        type: "grid",
        name: "",
        schema: [
          { name: "temp_cold", selector: TEMP_BAND },
          { name: "temp_warm", selector: TEMP_BAND },
          { name: "temp_hot",  selector: TEMP_BAND },
        ],
      },
    ],
  },
  {
    title: "Pack info (Home Assistant 2025.12 or newer)",
    schema: [
      { name: "info_key", selector: { text: {} } },
    ],
  },
];

const LABELS = {
  name: "Card title",
  prefix: "Entity prefix (optional, supplies defaults)",
  alarm_prefix: "Alarm prefix (default: <prefix>_<prefix>)",
  cells: "Cell count",
  show_battery: "Battery icon",
  show_stats: "Stats grid",
  show_pills: "Status pills",
  show_cells: "Cell array",
  show_summary: "Min/Max summary",
  show_temperatures: "Temperatures",
  entity_soc: "State of charge",
  entity_soh: "State of health",
  entity_pack_voltage: "Pack voltage",
  entity_current: "Pack current",
  entity_power: "Pack power",
  entity_balance_current: "Balance current",
  entity_cycles: "Cycle count",
  entity_capacity_remaining: "Capacity remaining (Ah)",
  entity_capacity_total: "Capacity total (Ah)",
  entity_runtime: "Runtime",
  entity_charge_phase: "Charge phase",
  entity_cell_voltage_avg: "Cell voltage average",
  entity_cell_voltage_min: "Cell voltage min value",
  entity_cell_voltage_max: "Cell voltage max value",
  entity_cell_voltage_delta: "Cell voltage delta",
  entity_cell_min_number: "Lowest cell number",
  entity_cell_max_number: "Highest cell number",
  entity_alarm_status: "Alarm status text",
  entity_alarm_active: "Alarm active flag",
  entity_switch_charge: "Charge MOSFET",
  entity_switch_discharge: "Discharge MOSFET",
  entity_switch_balance: "Balancer enabled",
  entity_balance_active: "Balancer active now",
  entity_heating: "Heater on",
  entity_temp_mos: "MOSFET temperature",
  entity_temp_probe_1: "Probe 1 temperature",
  entity_temp_probe_2: "Probe 2 temperature",
  entity_temp_probe_3: "Probe 3 temperature",
  entity_temp_probe_4: "Probe 4 temperature",
  cell_voltage_pattern: "Cell voltage pattern (uses {n} or {nn}; may be a template)",
  cell_resistance_pattern: "Cell resistance pattern (uses {n} or {nn}; may be a template)",
  cell_voltage_from: "Cell voltage source unit",
  summary_voltage_from: "Min/avg/max/Δ source unit (blank = same as cells)",
  cell_voltage_decimals: "Cell voltage decimals",
  cell_resistance_from: "Cell resistance source unit",
  cell_resistance_decimals: "Cell resistance decimals (mΩ)",
  cells_min_width: "Cell tile min width (px)",
  cells_max_columns: "Cell grid max columns",
  temperature_unit: "Temperature unit",
  capacity_unit: "Capacity shown in",
  nominal_voltage: "Nominal pack voltage for kWh (blank = cells × 3.2 V)",
  show_pill_charge: "Charge",
  show_pill_discharge: "Discharge",
  show_pill_balance: "Balance",
  show_pill_heater: "Heater",
  temp_cold: "Blue below (default 5 °C / 41 °F)",
  temp_warm: "Amber from (default 35 °C / 95 °F)",
  temp_hot: "Red from (default 50 °C / 122 °F)",
  cell_dev_soft: "Yellow above (mV)",
  cell_dev_warn: "Orange above (mV)",
  cell_dev_bad: "Red above (mV)",
  delta_warn: "Summary Δ amber at (mV)",
  delta_bad: "Summary Δ red at (mV)",
  max_cell_red: "Highest cell in red, lowest in green",
  show_info: "Pack info (More info button)",
  show_missing: "Also show sensors that don't exist",
  info_key: "Pack info key (blank = prefix, SOC entity or card title)",
};

const fmt = (n, d = 0) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

const orNull = (v) => (typeof v === "string" && v.trim() ? v : null);
const pick   = (override, fallback) => orNull(override) || fallback || null;

// Source-unit → volts scale factor. Accepts "V" / "mV" (case-insensitive).
const voltScale = (s) => (String(s || "V").toLowerCase() === "mv" ? 0.001 : 1);
// A lithium cell sits between roughly 1.5 V and 5 V, so a reading in the
// thousands can only be millivolts — the two ranges never overlap. That makes
// the unit recoverable from the readings themselves, which matters because
// `cell_voltage_from` is easy to leave wrong: the *display* can be patched with
// `cell_voltage_decimals` while the cell tint stays 1000× off (issues #5, #8).
const MV_CUTOFF = 100;
// Source-unit → ohms scale factor. Accepts "ohm" / "mohm" / "Ω" / "mΩ".
const ohmScale = (s) => {
  const k = String(s || "ohm").toLowerCase();
  return (k === "mohm" || k === "mω") ? 0.001 : 1;
};
const intOr = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const numOr = (v, d) => {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const numOrAny = (v, d) => {   // like numOr, but negatives allowed (temperatures)
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// Cell tint bands in mV from the pack average. Sorted ascending so a
// mis-ordered config (red below yellow) still yields usable bands instead of
// a tint that never fires.
const devBands = (cfg) => {
  const [soft, warn, bad] = [
    numOr(cfg.cell_dev_soft, DEFAULTS.cell_dev_soft),
    numOr(cfg.cell_dev_warn, DEFAULTS.cell_dev_warn),
    numOr(cfg.cell_dev_bad,  DEFAULTS.cell_dev_bad),
  ].sort((a, b) => a - b);
  return { soft, warn, bad };
};

// Summary Δ bands, same ordering guarantee.
const deltaBands = (cfg) => {
  const [warn, bad] = [
    numOr(cfg.delta_warn, DEFAULTS.delta_warn),
    numOr(cfg.delta_bad,  DEFAULTS.delta_bad),
  ].sort((a, b) => a - b);
  return { warn, bad };
};

// Bring `el`'s children in line with `next`'s, reusing nodes wherever the tag
// matches. Swapping the whole tree (innerHTML) destroys the tile under the
// cursor; its replacement only picks up :hover on the browser's next hit-test,
// so every render flashed the hovered tile for a frame (issue #9).
const patchChildren = (el, next) => {
  const have = [...el.childNodes], want = [...next.childNodes];
  want.forEach((w, i) => {
    const h = have[i];
    if (!h) return el.appendChild(w);
    if (h.nodeType !== w.nodeType || h.nodeName !== w.nodeName) return el.replaceChild(w, h);
    if (h.nodeType !== 1) {
      if (h.nodeValue !== w.nodeValue) h.nodeValue = w.nodeValue;
      return;
    }
    for (const { name } of [...h.attributes]) if (!w.hasAttribute(name)) h.removeAttribute(name);
    for (const { name, value } of [...w.attributes]) if (h.getAttribute(name) !== value) h.setAttribute(name, value);
    patchChildren(h, w);
  });
  for (let i = want.length; i < have.length; i++) have[i].remove();
};

// Pack info lives in HA's shared frontend store ("system data", HA 2025.12+):
// every user and device sees the same rows, only admins can write (HA enforces
// it), and it survives restarts and is part of backups. One key per pack, so
// editing one pack can never overwrite another.
const INFO_KEY_PREFIX = "battery_pack_card.info.";
const infoFields = (v) => (v && Array.isArray(v.fields) ? v.fields : [])
  .filter((f) => f && typeof f === "object")
  .map((f, i) => ({ id: String(f.id || `f${i}`), label: String(f.label ?? ""), value: String(f.value ?? "") }));
const newFieldId = () => `f_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
// Fields may hold Home Assistant templates. They're rendered by HA itself
// (render_template, available to every user) and re-render live whenever an
// entity they read changes.
const TPL_RE = /\{\{|\{%|\{#/;
const isTpl = (s) => TPL_RE.test(s || "");
const tplText = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
// One live render_template subscription per template in the wanted set;
// anything no longer wanted is unsubscribed. `onChange` runs on every render.
class TemplateSubs {
  constructor(onChange) { this.map = new Map(); this.onChange = onChange; }
  get(t) { return this.map.get(t); }
  clear() { this.sync(null, new Set()); }
  sync(conn, want) {
    for (const [t, e] of this.map) {
      if (want.has(t)) continue;
      e.unsub.then((u) => u && u()).catch(() => {});
      this.map.delete(t);
    }
    if (!conn) return;
    for (const t of want) {
      if (this.map.has(t)) continue;
      const e = { result: undefined, error: null, entities: [] };
      e.unsub = conn.subscribeMessage((ev) => {
        if (ev && "result" in ev) {
          e.result = ev.result; e.error = null;
          e.entities = (ev.listeners && ev.listeners.entities) || [];
        } else if (ev && ev.error && ev.level === "ERROR") e.error = ev.error;   // warnings keep the result
        this.onChange();
      }, { type: "render_template", template: t, report_errors: true, timeout: 3 });
      e.unsub.catch((err) => { e.error = (err && err.message) || "Template error"; this.onChange(); });
      this.map.set(t, e);
    }
  }
}

// Autocomplete snippets: [name, text to insert, caret steps back from its end, hint]
const TPL_FUNCS = [
  ["states", "states('')", 2, "State of an entity"],
  ["state_attr", "state_attr('', '')", 6, "Attribute of an entity"],
  ["is_state", "is_state('', '')", 6, "True if an entity has a state"],
  ["has_value", "has_value('')", 2, "True if an entity is available"],
  ["state_translated", "state_translated('')", 2, "State in your language"],
  ["now", "now()", 0, "Current date and time"],
  ["today_at", "today_at('')", 2, "Today at a time, e.g. '18:00'"],
  ["relative_time", "relative_time()", 1, "e.g. “3 days” since a datetime"],
  ["time_since", "time_since()", 1, "Time since a datetime"],
  ["time_until", "time_until()", 1, "Time until a datetime"],
  ["as_datetime", "as_datetime()", 1, "Parse into a datetime"],
  ["as_timestamp", "as_timestamp()", 1, "Datetime to UNIX timestamp"],
  ["as_local", "as_local()", 1, "Datetime in local time"],
  ["timedelta", "timedelta(days=)", 1, "A duration, e.g. days=30"],
  ["area_name", "area_name('')", 2, "Area of an entity or device"],
  ["iif", "iif(, '', '')", 9, "Inline if: iif(test, yes, no)"],
];
const TPL_FILTERS = [
  ["round", "round(1)", 1, "Round to N decimals"],
  ["float", "float(0)", 1, "To a number (default if not numeric)"],
  ["int", "int(0)", 1, "To a whole number"],
  ["default", "default('')", 2, "Fallback when undefined"],
  ["timestamp_custom", "timestamp_custom('%d-%m-%Y')", 2, "Format a timestamp"],
  ["as_datetime", "as_datetime", 0, "Parse into a datetime"],
  ["as_timestamp", "as_timestamp", 0, "Datetime to UNIX timestamp"],
  ["relative_time", "relative_time", 0, "e.g. “3 days” since a datetime"],
  ["replace", "replace('', '')", 6, "Replace text"],
  ["title", "title", 0, "Title Case"],
  ["upper", "upper", 0, "UPPER CASE"],
  ["lower", "lower", 0, "lower case"],
  ["abs", "abs", 0, "Absolute value"],
];

// Home Assistant converts temperature sensors to the system's unit (°F on US
// setups), so a reading's unit has to come from the entity, not be assumed.
const isFahrenheit = (u) => /^\s*°?\s*F\s*$/i.test(String(u || "")) || u === "℉";

// Packs of the JK-BMS RS485 add-on in this Home Assistant, found by their
// SOC sensor: the classic naming ("bms_master", "bms_1") and Multi-Pack's
// pack-aware one ("pack_1_bms_1") alike, in natural order.
const findPrefixes = (hass) => {
  const st = (hass && hass.states) || {};
  return Object.keys(st)
    .map((id) => /^sensor\.(.+)_soc_pourcentage$/.exec(id))
    .filter(Boolean).map((m) => m[1])
    .filter((p) => st[`sensor.${p}_tension_totale_volt`] || st[`sensor.${p}_cell_1_volt`])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};
// Number of cells a pack has, from its cell voltage sensors.
const countCells = (hass, prefix) => {
  const st = (hass && hass.states) || {};
  let n = 0;
  while (n < 32 && st[`sensor.${prefix}_cell_${n + 1}_volt`]) n++;
  return n;
};
// "pack_1_bms_1" → "Pack 1 BMS 1", "bms_master" → "BMS master"
const prefixName = (p) => String(p).split("_").filter(Boolean)
  .map((w, i) => (/^bms$/i.test(w) ? "BMS" : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } };

// ─── Main card ─────────────────────────────────────────────────────────────
class BatteryPackCard extends HTMLElement {
  static getStubConfig(hass) {
    // Start from the first pack the JK-BMS add-on has in this Home Assistant
    // (any naming); the alarm entities are then found by the card itself.
    const p = findPrefixes(hass)[0];
    if (p) return { prefix: p, name: prefixName(p), cells: countCells(hass, p) || 16 };
    return {
      prefix: "bms_master",
      name: "BMS Master",
      alarm_prefix: "bms_master_bms_master",
      cells: 16,
    };
  }

  // For the stacked card and the editors: every add-on pack in this HA.
  static findPacks(hass) {
    return findPrefixes(hass).map((p) => ({ prefix: p, name: prefixName(p), cells: countCells(hass, p) || 16 }));
  }
  static getConfigElement() {
    return document.createElement("battery-pack-card-editor");
  }

  setConfig(config) {
    if (!config) throw new Error("Configuration required");
    const merged = { ...DEFAULTS, ...config };
    if (!merged.name) merged.name = merged.prefix || "Battery";
    // Without an alarm prefix the add-on's classic naming is assumed
    // (bms_master → bms_master_bms_master); see _alarmBase for other naming.
    this._alarmAuto = !!merged.prefix && !orNull(merged.alarm_prefix);
    if (merged.prefix && !merged.alarm_prefix) {
      merged.alarm_prefix = `${merged.prefix}_${merged.prefix}`;
    }
    this._alarmFound = undefined;
    this._config = merged;
    if (!this._root) this._setup();
    this._syncInfo();
    this._syncCfgTemplates();
  }

  _setup() {
    this.attachShadow({ mode: "open" });
    const wrap = document.createElement("div");
    // #info sits outside #body so the per-update render never touches it:
    // someone typing in the pack info must not have it redrawn under them.
    wrap.innerHTML = `<style>${this._css()}</style><ha-card><div id="body"></div><div id="info" hidden></div></ha-card>`;
    this.shadowRoot.appendChild(wrap);
    this._root = this.shadowRoot.querySelector("#body");
    this._root.addEventListener("click", (e) => {
      const path = e.composedPath();
      if (path.some((n) => n.dataset && n.dataset.action === "info")) return this._toggleInfo();
      const el = path.find((n) => n.dataset && n.dataset.entity);
      if (el && el.dataset.entity) this._moreInfo(el.dataset.entity);
    });
    this._infoEl = this.shadowRoot.querySelector("#info");
    this._infoEl.addEventListener("click", (e) => this._onInfoClick(e));
    this._infoEl.addEventListener("input", (e) => { this._scheduleInfoSave(); this._onInfoInput(e); });
    this._infoEl.addEventListener("keyup", (e) => {
      if (/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) this._acUpdate(e.composedPath()[0]);
    });
    this._infoEl.addEventListener("focusout", (e) => {
      if (!this._ac || e.composedPath()[0] !== this._ac.input) return;
      setTimeout(() => { if (this._ac && this.shadowRoot.activeElement !== this._ac.input) this._acClose(); }, 0);
    });
    this._infoEl.addEventListener("keydown", (e) => this._onInfoKey(e));
    this._infoEl.addEventListener("pointerdown", (e) => this._onInfoPointer(e));
  }

  connectedCallback() { this._syncInfo(); this._syncCfgTemplates(); }

  disconnectedCallback() {
    if (this._infoSaveT) this._saveInfo();   // don't lose the last keystrokes
    this._unsubInfo();
    this._acClose();
    this._tplSync(new Set());
    if (this._cfgTpl) this._cfgTpl.clear();
    this._cfgTplSig = null;
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  set hass(hass) {
    this._hass = hass;
    this._syncInfo();
    this._syncCfgTemplates();
    this._queueRender();
  }

  // Coalesce bursts of state-changed events into one render per frame.
  _queueRender() {
    if (this._summaryCb) return this._summaryCb();   // headless: the owner renders
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  // Every entity setting (incl. per-cell overrides and patterns) that holds a
  // template gets one render_template subscription while the card is on
  // screen. Cheap to call on every update: a signature short-circuits it.
  _syncCfgTemplates() {
    this._cfgTpl = this._cfgTpl || new TemplateSubs(() => this._queueRender());
    if (this._config && this._cfgTplFor !== this._config) {   // only changes with the config
      this._cfgTplFor = this._config;
      const all = new Set();
      Object.values(this._resolveEntities()).forEach((v) => { if (typeof v === "string" && isTpl(v)) all.add(v); });
      for (let n = 1; n <= (this._config.cells || 0); n++) {
        for (const k of ["v", "r"]) { const t = this._cellEntity(k, n); if (isTpl(t)) all.add(t); }
      }
      this._cfgTplAll = all;
    }
    const conn = this._hass && this._hass.connection;
    const live = this.isConnected || this._summaryLive;
    const want = live && conn && this._cfgTplAll ? this._cfgTplAll : new Set();
    const sig = [...want].sort().join("\u0000");
    if (sig === this._cfgTplSig && conn === this._cfgTplConn) return;
    this._cfgTplSig = sig;
    this._cfgTplConn = conn;
    this._cfgTpl.sync(conn, want);
  }

  // ─── Pack info ──────────────────────────────────────────────────────────
  // State: _infoState "off" | "loading" | "ready" | "unsupported";
  // _infoFields = last known rows; _infoOpen / _infoEditing = UI mode.

  _infoId() {
    const c = this._config || {};
    return orNull(c.info_key) || orNull(c.prefix) || orNull(c.entity_soc) || orNull(c.name);
  }

  _isAdmin() { return this._hass?.user?.is_admin === true; }

  // Keep exactly one live subscription, for this pack's key, while the card
  // is on screen. Cheap enough to call from every `hass` update.
  _syncInfo() {
    const id = this._infoId(), conn = this._hass?.connection;
    const want = this.isConnected && this._config?.show_info !== false &&
      conn && id ? INFO_KEY_PREFIX + id : null;
    if (want === this._infoKey && conn === this._infoConn) {
      // Same subscription; only the viewer's rights can have changed (the
      // Edit button follows them).
      const admin = this._isAdmin();
      if (admin !== this._infoAdmin) { this._infoAdmin = admin; if (this._infoState === "ready") this._infoChanged(); }
      return;
    }
    if (this._infoSaveT) this._saveInfo();   // flush under the old key first
    this._unsubInfo();
    this._infoKey = want;
    this._infoConn = conn;
    this._infoAdmin = this._isAdmin();
    this._infoFields = [];
    this._infoEditing = false;
    this._infoState = want ? "loading" : "off";
    if (!want) return this._infoChanged();
    this._infoOpen = lsGet(`battery-pack-card:info-open:${id}`) === "1";
    const key = want;
    this._infoSub = this._hass.connection.subscribeMessage(
      (ev) => { if (this._infoKey === key) this._onInfo(ev && ev.value); },
      { type: "frontend/subscribe_system_data", key },
    );
    this._infoSub.catch(() => {        // HA before 2025.12: unknown command
      if (this._infoKey !== key) return;
      this._infoSub = null;
      this._infoState = "unsupported";
      this._infoChanged();
    });
  }

  _unsubInfo() {
    const sub = this._infoSub;
    this._infoSub = null;
    this._infoKey = null;
    if (sub) sub.then((unsub) => unsub && unsub()).catch(() => {});
  }

  _onInfo(value) {
    this._infoState = "ready";
    const fields = infoFields(value);
    // Never rebuild the editor under someone's cursor; pick up the latest
    // version (usually our own save echoed back) when they press Done.
    if (this._infoEditing) { this._infoPending = fields; return; }
    this._infoFields = fields;
    this._infoChanged();
  }

  _infoChanged() {
    if (this._summaryCb) return;
    if (this._hass && this._config) this._render();   // footer button
    this._renderInfo();
  }

  _infoButton() {
    if (this._infoState !== "ready") return "";
    if (!this._infoFields.length && !this._isAdmin()) return "";
    const open = !!this._infoOpen;
    return `<button class="info-toggle" data-action="info" aria-expanded="${open}">${open ? "Less info ▴" : "More info ▾"}</button>`;
  }

  _toggleInfo() {
    this._infoOpen = !this._infoOpen;
    lsSet(`battery-pack-card:info-open:${this._infoId()}`, this._infoOpen ? "1" : "0");
    if (!this._infoOpen && this._infoEditing) this._finishInfoEdit();
    this._infoChanged();
  }

  _renderInfo() {
    const el = this._infoEl;
    if (!el) return;
    const open = this._infoOpen && this._infoState === "ready";
    el.hidden = !open;
    if (!open) { el.innerHTML = ""; this._tplSync(new Set()); return; }
    if (this._infoEditing) return;    // the editor manages its own DOM
    const admin = this._isAdmin(), f = this._infoFields;
    el.innerHTML = `
      <div class="info-head">
        <div class="section-label">PACK INFO</div>
        ${admin ? `<button class="info-btn" data-info="edit">Edit</button>` : ""}
      </div>
      ${f.length ? `<dl class="info-list">${f.map((x) => `<dt>${this._tplCell(x.label)}</dt><dd>${this._tplCell(x.value)}</dd>`).join("")}</dl>`
                 : `<div class="info-empty">No info yet.${admin ? " Use Edit to add fields like BMS, cells or installation date." : ""}</div>`}
    `;
    this._tplSync(new Set(f.flatMap((x) => [x.label, x.value]).filter(isTpl)));
    this._tplPaint();
  }

  _tplCell(text) {
    return isTpl(text) ? `<span data-tpl="${this._esc(text)}">…</span>` : this._esc(text);
  }

  // Pack-info templates: subscribed while on screen (open panel or editor),
  // released for anything that isn't.
  _tplSync(want) {
    this._infoTpl = this._infoTpl || new TemplateSubs(() => this._tplPaint());
    this._infoTpl.sync(this._hass && this._hass.connection, want);
  }

  _tplPaint() {
    if (!this._infoEl) return;
    for (const el of this._infoEl.querySelectorAll("[data-tpl]")) {
      const e = this._infoTpl && this._infoTpl.get(el.getAttribute("data-tpl"));
      const err = e && e.error;
      // The editor preview gets the full error; the read-only list stays compact.
      el.textContent = !e || (e.result === undefined && !err) ? "…"
        : err ? (el.closest(".preview") ? `⚠ ${err}` : "⚠ Template error") : tplText(e.result);
      el.classList.toggle("tpl-err", !!err);
      if (err) el.title = err; else el.removeAttribute("title");
    }
  }

  _infoRowHtml(f) {
    return `
      <div class="info-row" data-id="${this._esc(f.id)}">
        <button class="drag" data-info="drag" title="Drag to reorder (or focus and use ↑ ↓)" aria-label="Move field">⋮⋮</button>
        <input class="k" placeholder="Label" aria-label="Label" value="${this._esc(f.label)}" autocomplete="off" spellcheck="false" aria-autocomplete="list">
        <input class="v" placeholder="Value or {{ template }}" aria-label="Value" value="${this._esc(f.value)}" autocomplete="off" spellcheck="false" aria-autocomplete="list">
        <button class="del" data-info="del" title="Remove field" aria-label="Remove field">✕</button>
      </div>`;
  }

  _startInfoEdit() {
    if (!this._isAdmin()) return;
    this._infoEditing = true;
    this._infoPending = null;
    const rows = this._infoFields.length ? this._infoFields : [{ id: newFieldId(), label: "", value: "" }];
    this._infoEl.innerHTML = `
      <div class="info-head">
        <div class="section-label">PACK INFO</div>
        <span class="info-status" aria-live="polite">Changes save automatically</span>
        <button class="info-btn primary" data-info="done">Done</button>
      </div>
      <div class="info-rows">${rows.map((f) => this._infoRowHtml(f)).join("")}</div>
      <button class="info-btn add" data-info="add">+ Add field</button>
    `;
    const first = this._infoEl.querySelector(this._infoFields.length ? ".v" : ".k");
    if (first) first.focus();
    this._updatePreviews();
  }

  _schedulePreviews() {
    clearTimeout(this._prevT);
    this._prevT = setTimeout(() => this._updatePreviews(), 350);
  }

  // Under each row that holds a template: what it renders to right now.
  _updatePreviews() {
    if (!this._infoEditing) return;
    const want = new Set();
    for (const row of this._infoEl.querySelectorAll(".info-row")) {
      const parts = [row.querySelector(".k").value, row.querySelector(".v").value].filter(isTpl);
      let pv = row.querySelector(".preview");
      if (!parts.length) { if (pv) pv.remove(); continue; }
      parts.forEach((t) => want.add(t));
      if (!pv) { pv = document.createElement("div"); pv.className = "preview"; row.appendChild(pv); }
      pv.innerHTML = parts.map((t) => `<span data-tpl="${this._esc(t)}"></span>`).join(" · ");
    }
    this._tplSync(want);
    this._tplPaint();
  }

  async _finishInfoEdit() {
    this._acClose();
    clearTimeout(this._prevT);
    if (this._infoSaveT) await this._saveInfo();
    this._infoEditing = false;
    if (this._infoPending) { this._infoFields = this._infoPending; this._infoPending = null; }
    this._infoChanged();
  }

  _readInfoRows() {
    return [...this._infoEl.querySelectorAll(".info-row")].map((r) => ({
      id: r.dataset.id,
      label: r.querySelector(".k").value.trim(),
      value: r.querySelector(".v").value.trim(),
    }));
  }

  _setInfoStatus(text, isError) {
    const st = this._infoEl.querySelector(".info-status");
    if (!st) return;
    st.textContent = text;
    st.classList.toggle("err", !!isError);
  }

  _scheduleInfoSave() {
    if (!this._infoEditing) return;
    this._setInfoStatus("Saving…");
    clearTimeout(this._infoSaveT);
    this._infoSaveT = setTimeout(() => this._saveInfo(), 700);
  }

  async _saveInfo() {
    clearTimeout(this._infoSaveT);
    this._infoSaveT = null;
    const key = this._infoKey;
    // Only ever save what's in an open editor: saving from a torn-down one
    // would read zero rows and wipe the pack's info.
    if (!key || !this._hass || !this._infoEl.querySelector(".info-rows")) return;
    const fields = this._readInfoRows().filter((f) => f.label || f.value);
    const seq = (this._infoSaveSeq = (this._infoSaveSeq || 0) + 1);
    try {
      await this._hass.callWS({ type: "frontend/set_system_data", key, value: { v: 1, fields } });
      if (key !== this._infoKey) return;    // flushed while switching packs
      this._infoFields = fields;
      if (seq === this._infoSaveSeq) this._setInfoStatus("Saved");
    } catch (err) {
      const why = err && err.code === "unauthorized" ? " — only admins can edit" : "";
      this._setInfoStatus(`Couldn't save${why}`, true);
    }
  }

  _onInfoClick(e) {
    const t = e.composedPath()[0];
    if (t && t.classList && (t.classList.contains("k") || t.classList.contains("v"))) return this._acUpdate(t);
    const btn = e.composedPath().find((n) => n.dataset && n.dataset.info);
    if (!btn) return;
    const act = btn.dataset.info;
    if (act === "edit") this._startInfoEdit();
    else if (act === "done") this._finishInfoEdit();
    else if (act === "add") {
      const list = this._infoEl.querySelector(".info-rows");
      list.insertAdjacentHTML("beforeend", this._infoRowHtml({ id: newFieldId(), label: "", value: "" }));
      list.lastElementChild.querySelector(".k").focus();
    } else if (act === "del") {
      btn.closest(".info-row").remove();
      this._scheduleInfoSave();
    }
  }

  _onInfoKey(e) {
    const t = e.composedPath()[0];
    if (!t || !t.classList) return;
    if (this._ac && t === this._ac.input) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); return this._acMove(e.key === "ArrowDown" ? 1 : -1); }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); return this._acAccept(this._ac.idx); }
      if (e.key === "Escape") { e.preventDefault(); return this._acClose(); }
    }
    // Arrow keys on the handle reorder: the keyboard (and screen-reader)
    // alternative to dragging.
    if (t.classList.contains("drag") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const row = t.closest(".info-row");
      const sib = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
      if (!sib) return;
      this._acClose();
      row.parentElement.insertBefore(row, e.key === "ArrowUp" ? sib : sib.nextElementSibling);
      t.focus();
      this._scheduleInfoSave();
    }
    // Enter in a value jumps to the next row, adding one at the end.
    if (t.classList.contains("v") && e.key === "Enter") {
      e.preventDefault();
      const next = t.closest(".info-row").nextElementSibling;
      if (next) next.querySelector(".k").focus();
      else this._infoEl.querySelector('[data-info="add"]').click();
    }
  }

  // Pointer-based drag (mouse, touch and pen alike). Listeners go on window:
  // moving the row re-parents the handle, which drops pointer capture.
  _onInfoPointer(e) {
    const item = e.composedPath().find((n) => n.classList && n.classList.contains("ac-item"));
    if (item) { e.preventDefault(); return this._acAccept(+item.dataset.i); }   // keep focus in the input
    const handle = e.composedPath().find((n) => n.classList && n.classList.contains("drag"));
    if (!handle || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    this._acClose();
    const row = handle.closest(".info-row"), list = row.parentElement;
    const order = () => [...list.children].map((r) => r.dataset.id).join();
    const before = order();
    row.classList.add("dragging");
    const move = (ev) => {
      let target = null;
      for (const r of list.children) {
        if (r === row) continue;
        const b = r.getBoundingClientRect();
        if (ev.clientY < b.top + b.height / 2) { target = r; break; }
      }
      if (target !== row.nextElementSibling) list.insertBefore(row, target);
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      row.classList.remove("dragging");
      if (order() !== before) this._scheduleInfoSave();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // ─── Template autocomplete ───────────────────────────────────────────────
  _onInfoInput(e) {
    const t = e.composedPath()[0];
    if (!t || !t.classList || !(t.classList.contains("k") || t.classList.contains("v"))) return;
    // Typing "{{" or "{%" closes the block and leaves the cursor inside it.
    if (e.inputType === "insertText" && (e.data === "{" || e.data === "%")) {
      const pos = t.selectionStart, pre = t.value.slice(0, pos), post = t.value.slice(pos);
      const close = pre.endsWith("{{") ? "}}" : pre.endsWith("{%") ? "%}" : null;
      if (close && !/^\s*(\}\}|%\})/.test(post)) {
        t.value = `${pre}  ${close}${post}`;
        t.setSelectionRange(pos + 1, pos + 1);
      }
    }
    this._schedulePreviews();
    this._acUpdate(t);
  }

  // What is being typed at the cursor, if it's inside an open {{ or {% block.
  _acContext(pre) {
    const o = Math.max(pre.lastIndexOf("{{"), pre.lastIndexOf("{%"));
    if (o < 0) return null;
    const inner = pre.slice(o + 2);
    if (/\}\}|%\}/.test(inner)) return null;
    let m;
    if ((m = /state_attr\(\s*(['"])([\w.]+)\1\s*,\s*['"](\w*)$/.exec(inner))) return { kind: "attr", entity: m[2], partial: m[3] };
    if ((m = /['"]([\w.]*)$/.exec(inner)) &&
        (/\b(?:states|state_attr|is_state|is_state_attr|has_value|state_translated|area_name|area_id|device_id|expand|closest)\(\s*$/.test(inner.slice(0, m.index)) ||
         /^[a-z_]+\./.test(m[1]))) return { kind: "entity", partial: m[1] };
    if ((m = /\bstates\.([a-z_]+\.?\w*)$/.exec(inner))) return { kind: "entity", partial: m[1], bare: true };
    if ((m = /\|\s*([a-z_]*)$/.exec(inner))) return { kind: "filter", partial: m[1] };
    if (!inner.trim()) return { kind: "func", partial: "" };
    if ((m = /(?:^|[\s(,+\-*/%<>=!])([a-z_]+)$/.exec(inner))) return { kind: "func", partial: m[1] };
    return null;
  }

  _acItems(ctx) {
    const q = ctx.partial.toLowerCase();
    const pick = (list) => [...list.filter(([n]) => n.startsWith(q)), ...list.filter(([n]) => !n.startsWith(q) && n.includes(q))]
      .slice(0, 8).map(([name, insert, back, hint]) => ({ main: name, sub: hint, insert, back }));
    if (ctx.kind === "func") return pick(TPL_FUNCS);
    if (ctx.kind === "filter") return pick(TPL_FILTERS);
    if (ctx.kind === "attr") {
      const attrs = (this._hass.states[ctx.entity] || {}).attributes || {};
      return Object.keys(attrs).filter((k) => k.toLowerCase().includes(q))
        .sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q)) || a.localeCompare(b))
        .slice(0, 8).map((k) => ({ main: k, sub: tplText(attrs[k]).slice(0, 40), insert: k, back: 0 }));
    }
    // Entities: this pack's own first, then the rest; id matches before name matches.
    const own = this._packEntities(), prefix = orNull(this._config.prefix);
    const hits = [];
    for (const [id, st] of Object.entries(this._hass.states)) {
      const name = String((st.attributes && st.attributes.friendly_name) || "");
      const obj = id.slice(id.indexOf(".") + 1);
      const rank = !q || id.startsWith(q) || obj.startsWith(q) ? 0 : id.includes(q) ? 1 : name.toLowerCase().includes(q) ? 2 : -1;
      if (rank < 0) continue;
      const mine = own.has(id) || (prefix && obj.startsWith(`${prefix}_`)) ? 0 : 1;
      hits.push([mine, rank, id, name, st]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2].localeCompare(b[2]));
    return hits.slice(0, 8).map(([, , id, name, st]) => {
      const unit = st.attributes && st.attributes.unit_of_measurement;
      return { main: id, sub: `${name ? `${name} · ` : ""}${st.state}${unit ? ` ${unit}` : ""}`, insert: id, back: 0 };
    });
  }

  _packEntities() {
    const set = new Set(Object.values(this._resolveEntities()).filter(Boolean));
    for (let n = 1; n <= (this._config.cells || 0); n++) { set.add(this._cellEntity("v", n)); set.add(this._cellEntity("r", n)); }
    return set;
  }

  _acUpdate(input) {
    if (!this._infoEditing || !input || !input.classList || !(input.classList.contains("k") || input.classList.contains("v"))) return this._acClose();
    const pos = input.selectionStart;
    const ctx = pos === input.selectionEnd ? this._acContext(input.value.slice(0, pos)) : null;
    const items = ctx ? this._acItems(ctx) : [];
    if (!items.length) return this._acClose();
    if (this._ac && this._ac.input !== input) this._acClose();
    if (!this._ac) {
      const el = document.createElement("div");
      el.className = "ac";
      el.setAttribute("role", "listbox");
      input.closest(".info-row").appendChild(el);   // inline: can't be clipped by the card or covered by the next one
      this._ac = { el, input };
      input.setAttribute("aria-expanded", "true");
    }
    Object.assign(this._ac, { ctx, items, idx: 0 });
    this._ac.el.innerHTML = items.map((it, i) => `
      <div class="ac-item${i ? "" : " on"}" role="option" aria-selected="${!i}" data-i="${i}">
        <span class="ac-main">${this._esc(it.main)}</span><span class="ac-sub">${this._esc(it.sub)}</span>
      </div>`).join("");
  }

  _acMove(d) {
    const ac = this._ac, n = ac.items.length;
    ac.idx = (ac.idx + d + n) % n;
    ac.el.querySelectorAll(".ac-item").forEach((el, i) => {
      el.classList.toggle("on", i === ac.idx);
      el.setAttribute("aria-selected", String(i === ac.idx));
    });
  }

  _acAccept(i) {
    const ac = this._ac, it = ac && ac.items[i];
    if (!it) return;
    const inp = ac.input, pos = inp.selectionStart, post = inp.value.slice(pos);
    const start = pos - ac.ctx.partial.length;
    let caret = start + it.insert.length - it.back;
    // After an entity or attribute, step over the quote(s) the snippet already
    // closed: states('x')| and state_attr('x', '|').
    if ((ac.ctx.kind === "entity" && !ac.ctx.bare) || ac.ctx.kind === "attr") {
      const skip = /^(['"]\)|['"],\s*['"]|['"])/.exec(post);
      if (skip) caret = start + it.insert.length + skip[0].length;
    }
    inp.value = inp.value.slice(0, start) + it.insert + post;
    inp.setSelectionRange(caret, caret);
    this._acClose();
    inp.dispatchEvent(new Event("input", { bubbles: true, composed: true }));   // save, preview, next suggestions
  }

  _acClose() {
    const ac = this._ac;
    this._ac = null;
    if (!ac) return;
    ac.el.remove();
    ac.input.setAttribute("aria-expanded", "false");
  }

  // ─── Headless use (battery-stacked-pack-card) ───────────────────────────
  // A pack card that never goes on screen: it renders nothing and loads no
  // pack info, it only resolves this pack's entities (prefix defaults,
  // overrides, templates, unit detection) and hands back the headline values.
  static summarySource(config, onChange) {
    const el = document.createElement("battery-pack-card");
    el._summaryCb = onChange;
    el.setConfig(config);
    return el;
  }

  // Templates need a live subscription; the owner switches it with its own
  // connected state, since this element is never connected itself.
  setSummaryLive(live) {
    this._summaryLive = !!live;
    this._syncCfgTemplates();
  }

  // Values are null when the setting resolves to no entity in HA (show
  // nothing) and NaN when the entity exists but has no number (show "—").
  summary() {
    if (!this._hass || !this._config) return null;
    const cfg = this._config, E = this._resolveEntities();
    const val = (eid) => (this._exists(eid) ? this._raw(eid) : null);
    const has = (eid) => this._exists(eid);

    let deltaMv = null, cellMin = null, cellMax = null;
    const sSc = this._voltScaleFor(
      [E.vMin, E.vAvg, E.vMax].map((e) => this._raw(e)),
      voltScale(orNull(cfg.summary_voltage_from) || cfg.cell_voltage_from), "Min/avg/max voltages",
    );
    if (has(E.vMin) && has(E.vMax)) { cellMin = this._raw(E.vMin) * sSc; cellMax = this._raw(E.vMax) * sSc; }
    else {
      const raws = [];
      for (let n = 1; n <= cfg.cells; n++) raws.push(this._raw(this._cellEntity("v", n)));
      const vSc = this._voltScaleFor(raws, voltScale(cfg.cell_voltage_from), "Cell voltages");
      const v = raws.filter((x) => Number.isFinite(x) && x > 0).map((x) => x * vSc);
      if (v.length) { cellMin = Math.min(...v); cellMax = Math.max(...v); }
    }
    if (has(E.vDelta)) deltaMv = this._raw(E.vDelta) * sSc * 1000;
    else if (Number.isFinite(cellMin) && Number.isFinite(cellMax)) deltaMv = (cellMax - cellMin) * 1000;
    const dBand = deltaBands(cfg);
    const deltaState = !Number.isFinite(deltaMv) ? "" : deltaMv >= dBand.bad ? "bad" : deltaMv >= dBand.warn ? "warn" : "ok";

    // Hottest sensor, in the unit the card shows, with its band colour.
    let temp = null;
    for (const eid of [E.tMos, E.t1, E.t2, E.t3, E.t4]) {
      if (!has(eid)) continue;
      const t = this._tempInfo(eid);
      if (t.shown !== null && (!temp || t.shown > temp.shown)) temp = t;
    }

    return {
      name: cfg.name,
      soc: val(E.soc), soh: val(E.soh),
      voltage: val(E.packV), current: val(E.curA), power: has(E.powW) ? this._watts(E.powW) : null,
      cellMin, cellMax,
      capacityRemaining: has(E.capRem) ? this._capacity(E.capRem).ah : null,
      capacityTotal: has(E.capTot) ? this._capacity(E.capTot).ah : null,
      energyRemaining: has(E.capRem) ? this._capacity(E.capRem).kwh : null,
      energyTotal: has(E.capTot) ? this._capacity(E.capTot).kwh : null,
      nominalVoltage: this._nominalV(),
      deltaMv, deltaState, temp,
      alarm: has(E.alarmB) ? this._on(E.alarmB) : null,
      alarmText: has(E.alarmS) ? this._state(E.alarmS) : null,
      charge: has(E.chg) ? this._on(E.chg) : null,
      discharge: has(E.dch) ? this._on(E.dch) : null,
      entities: E,
    };
  }

  getCardSize() {
    const c = this._config || {};
    let n = 2;
    if (c.show_battery || c.show_stats) n += 3;
    if (c.show_pills) n += 1;
    if (c.show_cells) n += 3;
    if (c.show_summary) n += 1;
    if (c.show_temperatures) n += 1;
    return n;
  }

  // Any entity setting may instead hold a template; it reads like a state
  // once Home Assistant has rendered it (see _syncCfgTemplates).
  _state(eid) {
    if (!eid) return undefined;
    if (isTpl(eid)) {
      const e = this._cfgTpl && this._cfgTpl.get(eid);
      return e && !e.error && e.result !== undefined ? tplText(e.result) : undefined;
    }
    return this._hass?.states[eid]?.state;
  }
  _exists(eid){ return isTpl(eid) ? this._state(eid) !== undefined : !!(eid && this._hass?.states[eid]); }
  _num(eid)   { const v = parseFloat(this._state(eid)); return Number.isFinite(v) ? v : 0; }
  // Power in W, whatever unit the entity reports it in (W, kW, MW): a
  // 3.25 kW sensor read as a bare number showed as "3 W". A template's
  // result has no unit and is taken as W.
  // Nominal pack voltage, for converting Ah into kWh.
  _nominalV() {
    const v = numOr(this._config.nominal_voltage, 0);
    return v > 0 ? v : (intOr(this._config.cells, 16) || 16) * NOMINAL_CELL_V;
  }

  // A capacity reading as { ah, kwh }. Most BMSes report Ah; a sensor in Wh
  // or kWh is energy already, and Ah is then worked back from the nominal V.
  _capacity(eid) {
    const v = parseFloat(this._state(eid));
    if (!Number.isFinite(v)) return { ah: NaN, kwh: NaN };
    const u = isTpl(eid) ? "" : String(this._hass?.states[eid]?.attributes?.unit_of_measurement || "").trim();
    const nv = this._nominalV();
    if (/^kWh$/i.test(u)) return { ah: (v * 1000) / nv, kwh: v };
    if (/^Wh$/i.test(u)) return { ah: v / nv, kwh: v / 1000 };
    return { ah: v, kwh: (v * nv) / 1000 };
  }

  // "624.0 / 628 Ah" or "31.9 / 32.2 kWh", as configured.
  _capacityText(E) {
    const r = this._capacity(E.capRem), t = this._capacity(E.capTot);
    const z = (x) => (Number.isFinite(x) ? x : 0);
    if (this._config.capacity_unit === "kWh") return `${fmt(z(r.kwh), 1)} / ${fmt(z(t.kwh), 1)} kWh`;
    return `${fmt(z(r.ah), 1)} / ${fmt(z(t.ah), 0)} Ah`;
  }

  _watts(eid) {
    const v = parseFloat(this._state(eid));
    if (!Number.isFinite(v)) return NaN;
    const u = isTpl(eid) ? "" : String(this._hass?.states[eid]?.attributes?.unit_of_measurement || "").trim();
    return /^kW$/i.test(u) ? v * 1000 : /^MW$/i.test(u) ? v * 1e6 : v;
  }
  _on(eid)    { return /^(on|true)$/i.test(String(this._state(eid))); }
  _raw(eid)   { return parseFloat(this._state(eid)); }

  // Effective V scale for a group of readings. The data wins over the
  // configured unit: for cell voltages the magnitude is unambiguous (see
  // MV_CUTOFF), and a wrong unit silently breaks the colouring rather than
  // just the formatting. Config is the fallback when nothing readable is in.
  _voltScaleFor(raws, configured, what) {
    const sample = raws.find((v) => Number.isFinite(v) && v > 0);
    if (sample === undefined) return configured;
    const detected = sample >= MV_CUTOFF ? 0.001 : 1;
    if (detected !== configured) this._noteUnit(what, detected);
    return detected;
  }

  // Tell the user once per session, so a mis-set unit is diagnosable from the
  // browser console instead of looking like a colouring bug.
  _noteUnit(what, scale) {
    this._unitNotes = this._unitNotes || new Set();
    const key = `${what}:${scale}`;
    if (this._unitNotes.has(key)) return;
    this._unitNotes.add(key);
    console.info(
      `%c BATTERY-PACK-CARD %c ${what} read like ${scale === 0.001 ? "mV" : "V"}; using that instead of the configured unit. Set the matching source unit in the card editor to silence this.`,
      "color:#fff;background:#3949ab;border-radius:3px", "color:inherit",
    );
  }

  // The alarm entities' prefix. Set in the config: used as is. Not set: the
  // classic {prefix}_{prefix} when that exists, as always; only when it
  // doesn't, look for alarm entities that belong to this prefix, so other
  // naming (e.g. the add-on's Multi-Pack mode) works without configuring it.
  // Searched at most every 30 s while nothing is found.
  _alarmBase() {
    const c = this._config, st = this._hass?.states;
    if (!this._alarmAuto || !st) return c.alarm_prefix;
    const has = (ap) => !!(st[`sensor.${ap}_alarm_status`] || st[`binary_sensor.${ap}_alarm_active`]);
    if (has(c.alarm_prefix)) return c.alarm_prefix;
    if (this._alarmFound && has(this._alarmFound)) return this._alarmFound;
    const now = Date.now();
    if (this._alarmFound === null && now - (this._alarmScan || 0) < 30000) return c.alarm_prefix;
    this._alarmScan = now;
    const p = c.prefix;
    const ours = (ap) => ap === p || ap.startsWith(`${p}_`) || ap.endsWith(`_${p}`) || ap.includes(`_${p}_`);
    const found = Object.keys(st)
      .map((id) => /^(?:sensor\.(.+)_alarm_status|binary_sensor\.(.+)_alarm_active)$/.exec(id))
      .filter(Boolean).map((m) => m[1] || m[2])
      .filter(ours)
      .sort((a, b) => a.length - b.length)[0];
    this._alarmFound = found || null;
    return found || c.alarm_prefix;
  }

  _resolveEntities() {
    const c = this._config;
    const p = c.prefix;
    const ap = this._alarmBase();
    const def = (suf, dom = "sensor") => (p ? `${dom}.${p}_${suf}` : null);
    const adef = (suf, dom = "sensor") => (ap ? `${dom}.${ap}_${suf}` : null);
    return {
      soc:      pick(c.entity_soc,      def("soc_pourcentage")),
      soh:      pick(c.entity_soh,      def("soh_pourcentage")),
      packV:    pick(c.entity_pack_voltage,    def("tension_totale_volt")),
      curA:     pick(c.entity_current,         def("courant_total")),
      powW:     pick(c.entity_power,           def("puissance_totale")),
      balA:     pick(c.entity_balance_current, def("balance_courant")),
      cycles:   pick(c.entity_cycles,          def("nombre_cycle")),
      capRem:   pick(c.entity_capacity_remaining, def("capacite_restante_ah")),
      capTot:   pick(c.entity_capacity_total,     def("capacite_batterie_ah")),
      runtime:  pick(c.entity_runtime,            def("total_runtime_formatted")),
      phase:    pick(c.entity_charge_phase,       def("charge_status_text")),
      vAvg:     pick(c.entity_cell_voltage_avg,   def("cell_voltage_average")),
      vMin:     pick(c.entity_cell_voltage_min,   def("cell_voltage_min_value")),
      vMax:     pick(c.entity_cell_voltage_max,   def("cell_voltage_max_value")),
      vDelta:   pick(c.entity_cell_voltage_delta, def("cell_voltage_delta")),
      minCell:  pick(c.entity_cell_min_number,    def("cell_voltage_min_number")),
      maxCell:  pick(c.entity_cell_max_number,    def("cell_voltage_max_number")),
      alarmS:   pick(c.entity_alarm_status, adef("alarm_status")),
      alarmB:   pick(c.entity_alarm_active, adef("alarm_active", "binary_sensor")),
      chg:      pick(c.entity_switch_charge,   def("switch_charge",   "binary_sensor")),
      dch:      pick(c.entity_switch_discharge,def("switch_decharge", "binary_sensor")),
      balAct:   pick(c.entity_balance_active,  def("balance_action",  "binary_sensor")),
      balAllow: pick(c.entity_switch_balance,  def("switch_balance",  "binary_sensor")),
      heat:     pick(c.entity_heating,         def("heating",         "binary_sensor")),
      tMos:     pick(c.entity_temp_mos,     def("mos_temp")),
      t1:       pick(c.entity_temp_probe_1, def("sonde_1_temp")),
      t2:       pick(c.entity_temp_probe_2, def("sonde_2_temp")),
      t3:       pick(c.entity_temp_probe_3, def("sonde_3_temp")),
      t4:       pick(c.entity_temp_probe_4, def("sonde_4_temp")),
    };
  }

  _cellEntity(kind, n) {
    const c = this._config;
    const suffix = kind === "v" ? "volt" : "ohm";
    // 1. explicit per-cell override wins
    const explicit = orNull(c[`entity_cell_${n}_${suffix}`]);
    if (explicit) return explicit;
    // 2. pattern with {n} / {nn} placeholders
    const patternKey = kind === "v" ? "cell_voltage_pattern" : "cell_resistance_pattern";
    const pat = orNull(c[patternKey]);
    if (pat) {
      return pat
        .replace(/\{nn\}/g, String(n).padStart(2, "0"))
        .replace(/\{n\}/g, n);
    }
    // 3. prefix-derived default
    if (!c.prefix) return null;
    return `sensor.${c.prefix}_cell_${n}_${suffix}`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const cfg = this._config;
    const E = this._resolveEntities();

    const soc   = this._num(E.soc);
    const soh   = this._num(E.soh);
    const packV = this._num(E.packV);
    const curA  = this._num(E.curA);
    // No power sensor: voltage × current, which is what the BMS would report.
    const powRaw= this._exists(E.powW) ? this._watts(E.powW) : this._num(E.packV) * this._num(E.curA);
    const powW  = Number.isFinite(powRaw) ? powRaw : 0;
    const balA  = this._num(E.balA);
    const cycles= this._state(E.cycles) || "0";
    const runtime= this._state(E.runtime) || "";
    // Voltage units are read off the data (see MV_CUTOFF); the configured
    // units only apply until a reading is available.
    const cellRaw = [];
    for (let n = 1; n <= cfg.cells; n++) cellRaw.push(this._raw(this._cellEntity("v", n)));
    const vScCfg= voltScale(cfg.cell_voltage_from);
    const vSc   = this._voltScaleFor(cellRaw, vScCfg, "Cell voltages");
    // Summary (min/avg/max/Δ) entities may come in a different unit than the
    // per-cell entities; fall back to the cell unit when not set. Δ has no
    // unambiguous magnitude of its own, so it follows min/avg/max.
    const sScCfg= voltScale(orNull(cfg.summary_voltage_from) || cfg.cell_voltage_from);
    const sSc   = this._voltScaleFor(
      [E.vMin, E.vAvg, E.vMax].map((e) => this._raw(e)), sScCfg, "Min/avg/max voltages",
    );
    const rSc   = ohmScale(cfg.cell_resistance_from);
    const dev   = devBands(cfg);
    const dBand = deltaBands(cfg);
    const maxRed = cfg.max_cell_red === true || cfg.max_cell_red === "true";
    const minClr = maxRed ? "var(--clr-green)" : "var(--clr-red)";
    const maxClr = maxRed ? "var(--clr-red)"   : "var(--clr-green)";
    // Decimals chosen while the unit was wrong were tuned to mis-scaled numbers
    // (0 makes "3,331.000" read "3,331") and would now turn 3.331 V into "3";
    // they apply again once the unit is set to match.
    const unitOk= vSc === vScCfg && sSc === sScCfg;
    const vDec  = unitOk ? intOr(cfg.cell_voltage_decimals, 3) : 3;
    const rDec  = intOr(cfg.cell_resistance_decimals, 0);
    // Without a pack-average entity the tint would measure every cell against
    // 0 V and paint the whole grid red; the mean of the cells is what the BMS
    // would have reported anyway.
    const cellV = cellRaw.filter((v) => Number.isFinite(v) && v > 0).map((v) => v * vSc);
    const vAvgE = this._num(E.vAvg) * sSc;
    const vAvg  = vAvgE > 0 ? vAvgE
                : cellV.length ? cellV.reduce((a, b) => a + b, 0) / cellV.length : 0;
    const vMin  = this._num(E.vMin)  * sSc;
    const vMax  = this._num(E.vMax)  * sSc;
    const vDelta= this._num(E.vDelta) * sSc;
    const minCell = parseInt(this._state(E.minCell) || "0", 10);
    const maxCell = parseInt(this._state(E.maxCell) || "0", 10);
    const phase = this._state(E.phase) || "—";
    const alarm = this._state(E.alarmS) || "—";
    const alarmActive = this._on(E.alarmB);
    const chgOn  = this._on(E.chg);
    const dchOn  = this._on(E.dch);
    const balAct = this._on(E.balAct);
    const balAllow = this._on(E.balAllow);
    const heatOn = this._on(E.heat);
    // Each pill only when switched on and its entity exists: a "Heater OFF"
    // on a BMS without a heater is misleading.
    const showMissing = cfg.show_missing === true || cfg.show_missing === "true";
    const shown = (eid) => showMissing || this._exists(eid);
    const showPill = (key, ...eids) => cfg[`show_pill_${key}`] !== false && cfg[`show_pill_${key}`] !== "false" && eids.some(shown);
    const pills = [
      showPill("charge", E.chg)    ? this._pill("Charge",    chgOn ? "ON" : "OFF", chgOn ? "on" : "off", E.chg) : "",
      showPill("discharge", E.dch) ? this._pill("Discharge", dchOn ? "ON" : "OFF", dchOn ? "on" : "off", E.dch) : "",
      showPill("balance", E.balAct, E.balAllow) ? this._pill("Balance", balAct ? "ACTIVE" : (balAllow ? "READY" : "OFF"),
                     balAct ? "active" : (balAllow ? "on" : "off"), this._exists(E.balAct) ? E.balAct : E.balAllow) : "",
      showPill("heater", E.heat)   ? this._pill("Heater",    heatOn ? "ON" : "OFF", heatOn ? "alert" : "off", E.heat) : "",
    ].join("");

    // Temperature tiles: only for sensors that actually exist in HA. An
    // unconfigured probe (or a prefix default that matches nothing) is
    // dropped instead of rendering as a misleading 0°.
    const tempTiles = [
      ["MOS", E.tMos], ["Probe 1", E.t1], ["Probe 2", E.t2], ["Probe 3", E.t3], ["Probe 4", E.t4],
    ].filter(([, eid]) => shown(eid))
     .map(([label, eid]) => this._tempTile(label, eid))
     .join("");

    // Direction comes from the current sensor (signed) — some BMS integrations
    // report power as unsigned magnitude, so current is the source of truth.
    let powerDir = "idle", powerColor = "var(--clr-grey)";
    if (curA > 0.1)  { powerDir = "charging";    powerColor = "var(--clr-green)"; }
    if (curA < -0.1) { powerDir = "discharging"; powerColor = "var(--clr-orange)"; }
    const socColor = soc > 50 ? "var(--clr-green)" : soc > 20 ? "var(--clr-orange)" : "var(--clr-red)";

    // Stat tiles only for sensors that exist (issue #4): a BMS read over RS485
    // via the inverter often has no cycles, phase or balance current, and an
    // empty tile showing 0 suggests a reading that isn't there.
    const has = shown;
    const stats = [
      has(E.packV)  ? this._stat("VOLTAGE", `${fmt(packV, 2)} V`, "var(--clr-amber)",  null, E.packV) : "",
      has(E.curA)   ? this._stat("CURRENT", `${fmt(curA, 1)} A`,  "var(--clr-blue)",   null, E.curA) : "",
      has(E.powW) || (has(E.packV) && has(E.curA))
                    ? this._stat("POWER",   `${fmt(powW, 0)} W`,  powerColor, powerDir.toUpperCase(), has(E.powW) ? E.powW : E.curA) : "",
      has(E.balA)   ? this._stat("BALANCE", `${fmt(balA, 2)} A`,  "var(--clr-purple)", null, E.balA) : "",
      has(E.cycles) ? this._stat("CYCLES",  cycles, "var(--clr-cyan)", null, E.cycles) : "",
      has(E.phase)  ? this._stat("PHASE",   phase,  "var(--clr-grey)", null, E.phase) : "",
    ].join("");
    const html = `
      <div class="header">
        <div class="title">${this._esc(cfg.name)}</div>
        <div class="alarm ${alarmActive ? "alert" : "ok"}" ${this._dataE(E.alarmB)} role="button">
          <span class="dot"></span>${this._esc(alarm)}
        </div>
      </div>

      ${(cfg.show_battery || cfg.show_stats) ? `
      <div class="hero">
        ${cfg.show_battery ? this._renderBattery(soc, socColor,
            shown(E.capRem) || shown(E.capTot) ? this._capacityText(E) : "",
            shown(E.soh) ? `SOH ${Math.round(soh)}%` : "", E.soc) : ""}
        ${cfg.show_stats && stats ? `
          <div class="stats">${stats}</div>` : ""}
      </div>` : ""}

      ${cfg.show_pills && pills ? `
      <div class="pills">${pills}</div>` : ""}

      ${cfg.show_cells ? `
        <div class="section-label">CELLS — voltage and resistance, colour = mV from pack avg (${dev.soft}/${dev.warn}/${dev.bad})</div>
        <div class="cells${maxRed ? " max-red" : ""}" style="--cell-min-w:${intOr(cfg.cells_min_width, 48)}px;--cell-max-cols:${Math.max(1, intOr(cfg.cells_max_columns, 8))}">${this._renderCells(cfg.cells, vAvg, minCell, maxCell, vSc, vDec, rSc, rDec, dev)}</div>` : ""}

      ${cfg.show_summary ? `
        <div class="cell-summary">
          <span ${this._dataE(E.vMin)}><b style="color:${minClr}">${fmt(vMin, vDec)}</b> V <span class="muted">min #<span class="n">${minCell}</span></span></span>
          <span ${this._dataE(E.vAvg)}><b>${fmt(vAvg, vDec)}</b> V <span class="muted">avg</span></span>
          <span ${this._dataE(E.vMax)}><b style="color:${maxClr}">${fmt(vMax, vDec)}</b> V <span class="muted">max #<span class="n">${maxCell}</span></span></span>
          <span ${this._dataE(E.vDelta)}><b class="dv" style="color:${vDelta * 1000 < dBand.warn ? "var(--clr-green)" : vDelta * 1000 < dBand.bad ? "var(--clr-amber)" : "var(--clr-red)"}">${fmt(vDelta * 1000, 0)}</b> mV <span class="muted">Δ</span></span>
        </div>` : ""}

      ${cfg.show_temperatures && tempTiles ? `
        <div class="section-label">TEMPERATURES</div>
        <div class="temps">${tempTiles}</div>` : ""}

      <div class="footer">
        ${this._infoButton()}
        <span class="runtime" ${this._dataE(E.runtime)}>Runtime ${this._esc(runtime)}</span>
      </div>
    `;
    // HA hands every card a new `hass` on any state change in the whole
    // instance, so most renders produce identical output — leave the DOM alone.
    if (html === this._html) return;
    this._html = html;
    const next = document.createElement("div");
    next.innerHTML = html;
    patchChildren(this._root, next);
  }

  // Clicking a templated value opens the first entity the template reads.
  _dataE(eid) {
    if (isTpl(eid)) { const e = this._cfgTpl && this._cfgTpl.get(eid); eid = e && e.entities[0]; }
    return eid ? `data-entity="${this._esc(eid)}"` : "";
  }

  _renderBattery(soc, color, capText, sohText, entityId) {
    const fillH = (Math.max(0, Math.min(100, soc)) / 100) * 210;
    const fillY = 235 - fillH;
    const fillW = (Math.max(0, Math.min(100, soc)) / 100) * 270;   // horizontal variant
    // Unique per card so two packs on one dashboard don't share a gradient, but
    // stable across renders so unchanged state produces unchanged markup.
    this._gid = this._gid || `g_${Math.random().toString(36).slice(2, 8)}`;
    const gid = this._gid;
    return `
      <svg class="battery" viewBox="0 0 130 260" preserveAspectRatio="xMidYMid meet" ${this._dataE(entityId)} aria-hidden="true">
        <defs>
          <linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity="1"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0.55"/>
          </linearGradient>
        </defs>
        <rect x="45" y="0"  width="40"  height="14"  rx="3"  fill="rgba(255,255,255,0.35)"/>
        <rect x="5"  y="18" width="120" height="232" rx="10" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" stroke-width="2.5"/>
        <rect x="11" y="${fillY}" width="108" height="${fillH}" rx="5" fill="url(#${gid})"/>
        <text x="65" y="130" text-anchor="middle" fill="#fff" font-size="36" font-weight="700">${Math.round(soc)}%</text>
        <text x="65" y="155" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11">${this._esc(capText)}</text>
        <text x="65" y="172" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="11">${this._esc(sohText)}</text>
      </svg>
      <svg class="battery-h" viewBox="0 0 300 76" preserveAspectRatio="xMidYMid meet" ${this._dataE(entityId)} aria-hidden="true">
        <defs>
          <linearGradient id="${gid}_h" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="${color}" stop-opacity="1"/>
            <stop offset="1" stop-color="${color}" stop-opacity="0.55"/>
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="282" height="72" rx="10" style="fill:rgba(255,255,255,0.04);stroke:var(--primary-text-color,#fff);stroke-opacity:0.3" stroke-width="2.5"/>
        <rect x="287" y="24" width="11" height="28" rx="3" style="fill:var(--primary-text-color,#fff);fill-opacity:0.35"/>
        <rect x="8" y="8" width="${fillW}" height="60" rx="5" fill="url(#${gid}_h)"/>
        <text x="20" y="49" style="fill:var(--primary-text-color,#fff)" font-size="30" font-weight="700">${Math.round(soc)}%</text>
        <text x="272" y="33" text-anchor="end" style="fill:var(--primary-text-color,#fff);fill-opacity:0.85" font-size="12">${this._esc(capText)}</text>
        <text x="272" y="51" text-anchor="end" style="fill:var(--primary-text-color,#fff);fill-opacity:0.65" font-size="12">${this._esc(sohText)}</text>
      </svg>
    `;
  }

  _stat(label, value, color, sub, entityId) {
    return `
      <div class="stat" style="border-left-color:${color};" ${this._dataE(entityId)} role="button">
        <div class="stat-label">${label}${sub ? ` · <span class="muted">${this._esc(sub)}</span>` : ""}</div>
        <div class="stat-value" title="${this._esc(value)}">${this._esc(value)}</div>
      </div>
    `;
  }

  _pill(label, value, status, entityId) {
    return `<span class="pill pill-${status}" ${this._dataE(entityId)} role="button">${this._esc(label)} <b>${this._esc(value)}</b></span>`;
  }

  _renderCells(N, vAvg, minCell, maxCell, vSc, vDec, rSc, rDec, dev) {
    let out = "";
    for (let n = 1; n <= N; n++) {
      const ev = this._cellEntity("v", n);
      const er = this._cellEntity("r", n);
      const v = this._num(ev) * vSc;       // → volts
      const r = this._num(er) * rSc;       // → ohms
      const devMv = Math.round(Math.abs(v - vAvg) * 1e6) / 1000; // mV, rounded to 1 µV
      let cls = "ok";
      if (devMv > dev.bad) cls = "bad";
      else if (devMv > dev.warn) cls = "warn";
      else if (devMv > dev.soft) cls = "soft";
      const tag = n === maxCell ? "max" : n === minCell ? "min" : "";
      out += `
        <div class="cell ${cls} ${tag}" ${this._dataE(ev)} role="button">
          <div class="cell-n">#${n}</div>
          <div class="cell-v">${fmt(v, vDec)}</div>
          <div class="cell-r">${fmt(r * 1000, rDec)} mΩ</div>
        </div>
      `;
    }
    return out;
  }

  _tempTile(label, entityId) {
    const { shown, color } = this._tempInfo(entityId);
    return `
      <div class="temp" ${this._dataE(entityId)} role="button">
        <div class="temp-label">${this._esc(label)}</div>
        <div class="temp-val" style="color:${color};">${shown === null ? "—" : fmt(shown, 1) + "°"}</div>
      </div>
    `;
  }

  // A temperature in the unit the card shows, plus its band colour.
  _tempInfo(entityId) {
    // Entity exists but is unavailable/unknown → show a dash, not 0°.
    const raw = parseFloat(this._state(entityId));
    const val = Number.isFinite(raw) ? raw : null;
    // Work in °C for the colour bands; a template's result is taken to be in
    // HA's own unit, since that's what states() returns for converted sensors.
    const unit = isTpl(entityId)
      ? this._hass?.config?.unit_system?.temperature
      : this._hass?.states[entityId]?.attributes?.unit_of_measurement;
    const c = val === null ? null : isFahrenheit(unit) ? (val - 32) * 5 / 9 : val;
    const want = String(this._config.temperature_unit || "auto").toUpperCase();
    const shown = c === null ? null : want === "F" ? c * 9 / 5 + 32 : want === "C" ? c : val;
    // Bands are set in the unit the card shows: the chosen one, or on "auto"
    // Home Assistant's own (what the user sees everywhere else).
    const inF = want === "F" || (want !== "C" && isFahrenheit(this._hass?.config?.unit_system?.temperature));
    const toBand = (x) => (inF ? x * 9 / 5 + 32 : x);
    const [cold, warm, hot] = [
      numOrAny(this._config.temp_cold, toBand(5)),
      numOrAny(this._config.temp_warm, toBand(35)),
      numOrAny(this._config.temp_hot,  toBand(50)),
    ].sort((a, b) => a - b);
    const t = c === null ? null : toBand(c);
    const color = t === null ? "inherit"
                : t < cold ? "var(--clr-blue)"
                : t < warm ? "var(--clr-green)"
                : t < hot  ? "var(--clr-amber)"
                :            "var(--clr-red)";
    return { shown, color };
  }

  _esc(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  _css() {
    return `
      :host {
        display: block;
        --clr-green:  #4caf50; --clr-amber:  #ffc107; --clr-orange: #ff9800;
        --clr-red:    #ef5350; --clr-blue:   #42a5f5; --clr-cyan:   #00bcd4;
        --clr-purple: #ab47bc; --clr-grey:   #9e9e9e;
      }
      ha-card { display: block; padding: 18px 18px 14px; }
      /* Layout follows the card's own width, not the viewport: in a horizontal
         stack a wide screen can still give each card a narrow column. */
      #body { display: flex; flex-direction: column; gap: 12px; container-type: inline-size; }
      [data-entity] { cursor: pointer; }
      [data-entity]:focus-visible { outline: 2px solid var(--clr-blue); outline-offset: 2px; }

      .header { display:flex; justify-content:space-between; align-items:center; gap: 12px; }
      .title  { font-size: 20px; font-weight: 600; letter-spacing: 0.3px; }
      .alarm  { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:500; padding:4px 12px; border-radius:14px; }
      .alarm.ok    { color: var(--clr-green); background: rgba(76,175,80,0.13); }
      .alarm.alert { color: var(--clr-red);   background: rgba(239,83,80,0.18); }
      .alarm .dot  { width:8px; height:8px; border-radius:50%; background: currentColor; box-shadow: 0 0 8px currentColor; }

      .hero  { display:flex; gap: 16px; align-items: stretch; }
      .battery { flex: 0 0 130px; height: 250px; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.25)); }
      .stats { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; align-content: start; }
      .stat  { padding: 8px 12px; background: rgba(255,255,255,0.035); border-left: 3px solid var(--clr-grey); border-radius: 7px; }
      .stat:hover { background: rgba(255,255,255,0.07); }
      .stat-label { font-size: 10px; letter-spacing: 1.2px; opacity: 0.7; }
      .stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
      /* Tiles may shrink below their text rather than push past the card edge
         (issue #6). Labels wrap as before; a value that still doesn't fit is
         cut with an ellipsis instead of breaking over two lines. */
      .stats, .stat { min-width: 0; }
      .stat-label { overflow-wrap: anywhere; }
      .stat-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .battery-h { display: none; }
      /* Too narrow for battery + two stat columns side by side (130 + 16 + two
         tiles wide enough for values like "-150.2 A"): lay the battery down as a
         full-width bar above the stats. Same height either way (~250px). */
      @container (max-width: 380px) {
        .hero { flex-direction: column; gap: 10px; }
        .battery { display: none; }
        .battery-h { display: block; width: 100%; height: auto; filter: drop-shadow(0 3px 8px rgba(0,0,0,0.2)); }
      }

      .pills { display:flex; flex-wrap:wrap; gap: 6px; }
      .pill  { padding: 5px 11px; border-radius: 14px; font-size: 12px; font-weight: 500; letter-spacing: 0.2px; }
      .pill:hover { filter: brightness(1.15); }
      .pill b { margin-left: 4px; font-weight: 700; }
      .pill-on     { color: var(--clr-green);  background: rgba(76,175,80,0.13); }
      .pill-off    { color: var(--clr-grey);   background: rgba(158,158,158,0.10); }
      .pill-active { color: #fff;              background: var(--clr-purple); box-shadow: 0 0 10px rgba(171,71,188,0.5); }
      .pill-alert  { color: var(--clr-red);    background: rgba(239,83,80,0.15); }

      .section-label { font-size: 10px; letter-spacing: 1.5px; opacity: 0.55; margin-top: 4px; }

      .cells {
        display: grid;
        /* Never more than --cell-max-cols per row (so 8/16/24-cell packs keep
           their familiar rows on wide cards); wrap to fewer columns when a
           column would drop below --cell-min-w. The 0.1px keeps the
           max-column case from rounding down to one column fewer. */
        --cell-gap: 5px;
        grid-template-columns: repeat(
          auto-fit,
          minmax(
            max(var(--cell-min-w, 48px),
                calc((100% - (var(--cell-max-cols, 8) - 1) * var(--cell-gap)) / var(--cell-max-cols, 8) - 0.1px)),
            1fr));
        gap: var(--cell-gap);
      }
      .cell  {
        position: relative; padding: 8px 4px 6px; text-align: center;
        background: rgba(76,175,80,0.18); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 7px;
      }
      .cell::before, .cell::after {
        content: ""; position: absolute; top: -3px; width: 12%; height: 4px;
        background: rgba(255,255,255,0.4); border-radius: 1.5px 1.5px 0 0;
      }
      .cell::before { left: 28%; }
      .cell::after  { right: 28%; }
      .cell:hover { filter: brightness(1.15); }
      .cell.soft { background: rgba(255,193,7,0.18); }
      .cell.warn { background: rgba(255,152,0,0.22); }
      .cell.bad  { background: rgba(239,83,80,0.28); }
      .cell.min  { border: 2px solid var(--clr-red);   box-shadow: 0 0 12px rgba(239,83,80,0.4); }
      .cell.max  { border: 2px solid var(--clr-green); box-shadow: 0 0 12px rgba(76,175,80,0.4); }
      .max-red .cell.min { border-color: var(--clr-green); box-shadow: 0 0 12px rgba(76,175,80,0.4); }
      .max-red .cell.max { border-color: var(--clr-red);   box-shadow: 0 0 12px rgba(239,83,80,0.4); }
      .cell-n { font-size: 9px; opacity: 0.55; line-height: 1; }
      .cell-v { font-size: 14px; font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; }
      .cell-r { font-size: 9px; opacity: 0.55; line-height: 1; }

      /* A fixed grid, not a wrapping line: whether Δ fitted on the first line
         used to depend on the values ("min #3" vs "min #10"), so the line
         count flipped as cells changed and everything below jumped (issue
         #10). Now the layout depends only on the card width: four columns,
         or 2×2 when the widest possible values wouldn't fit. */
      .cell-summary {
        display: grid; grid-template-columns: repeat(4, auto); justify-content: space-between;
        gap: 6px; font-size: 12px; padding: 4px 2px 0; font-variant-numeric: tabular-nums;
      }
      .cell-summary > span { white-space: nowrap; }
      .cell-summary .muted { opacity: 0.5; margin-left: 3px; }
      .cell-summary span { padding: 2px 6px; border-radius: 4px; }
      .cell-summary > span:hover { background: rgba(255,255,255,0.04); }
      /* Room for two digits either way, so #3 → #10 or 9 → 23 mV moves nothing. */
      .cell-summary .n  { padding: 0; display: inline-block; min-width: 2ch; }
      .cell-summary .dv { display: inline-block; min-width: 2ch; text-align: right; }
      @container (max-width: 456px) {
        .cell-summary { grid-template-columns: repeat(2, auto); }
      }
      @container (max-width: 236px) {
        .cell-summary { grid-template-columns: auto; justify-content: start; }
      }

      .temps { display: grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap: 5px; }
      .temp  { padding: 8px 6px; background: rgba(255,255,255,0.03); border-radius: 7px; text-align: center; }
      .temp:hover { background: rgba(255,255,255,0.07); }
      .temp-label { font-size: 10px; opacity: 0.6; letter-spacing: 0.5px; }
      .temp-val   { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }

      .muted { opacity: 0.55; }
      .footer { display: flex; align-items: center; gap: 8px; font-size: 10px; min-height: 16px; }
      .footer .runtime { opacity: 0.4; margin-left: auto; }
      .info-toggle {
        font: inherit; font-size: 11px; font-weight: 500; letter-spacing: 0.3px;
        color: var(--primary-color, #03a9f4); background: none; border: 0; padding: 4px 0; cursor: pointer;
      }
      .info-toggle:hover { text-decoration: underline; }

      #info { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(127,127,127,0.22); container-type: inline-size; }
      .info-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .info-head .section-label { margin: 0; }
      .info-status { margin-left: auto; font-size: 10px; opacity: 0.55; }
      .info-status.err { color: var(--clr-red); opacity: 1; }
      .info-btn {
        font: inherit; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 12px; cursor: pointer;
        color: inherit; background: rgba(127,127,127,0.14); border: 1px solid rgba(127,127,127,0.25);
      }
      .info-head .info-btn:first-of-type:not(.primary) { margin-left: auto; }
      .info-btn.primary { color: #fff; background: var(--primary-color, #03a9f4); border-color: transparent; }
      .info-btn.add { margin-top: 8px; }
      .info-list { display: grid; grid-template-columns: fit-content(45%) 1fr; gap: 5px 14px; margin: 0; font-size: 12px; }
      .info-list dt { opacity: 0.6; overflow-wrap: anywhere; }
      .info-list dd { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
      .info-empty { font-size: 12px; opacity: 0.6; }
      .info-rows { display: flex; flex-direction: column; gap: 6px; }
      .info-row {
        display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.3fr) auto;
        grid-template-areas: "drag k v del"; gap: 6px; align-items: center;
        border-radius: 7px;
      }
      .info-row.dragging { opacity: 0.6; background: rgba(127,127,127,0.12); }
      .info-row .drag { grid-area: drag; }
      .info-row .k { grid-area: k; }
      .info-row .v { grid-area: v; }
      .info-row .del { grid-area: del; }
      .info-row input {
        min-width: 0; font: inherit; font-size: 12px; color: inherit; padding: 6px 8px; border-radius: 6px;
        background: rgba(127,127,127,0.10); border: 1px solid rgba(127,127,127,0.28);
      }
      .info-row input:focus { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: -1px; }
      .info-row .drag, .info-row .del {
        font: inherit; font-size: 13px; line-height: 1; color: inherit; opacity: 0.6; cursor: pointer;
        background: none; border: 0; padding: 6px 4px; border-radius: 5px;
      }
      .info-row .drag { cursor: grab; touch-action: none; letter-spacing: -2px; }
      .info-row .drag:hover, .info-row .del:hover, .info-row .drag:focus-visible { opacity: 1; background: rgba(127,127,127,0.15); }
      .info-row .preview { grid-column: 2 / 4; order: 1; font-size: 11px; opacity: 0.75; padding: 0 2px 2px; overflow-wrap: anywhere; }
      .info-row .preview::before { content: "→ "; opacity: 0.6; }
      .tpl-err { color: var(--clr-red); }
      .info-row .ac {
        grid-column: 2 / 4; order: 2; display: flex; flex-direction: column; overflow: hidden;
        border: 1px solid rgba(127,127,127,0.3); border-radius: 7px; background: rgba(127,127,127,0.08);
      }
      .ac-item { display: flex; gap: 10px; align-items: baseline; padding: 6px 9px; cursor: pointer; font-size: 12px; min-width: 0; }
      .ac-item.on, .ac-item:hover { background: rgba(127,127,127,0.2); }
      .ac-main { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ac-sub { margin-left: auto; opacity: 0.6; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      /* Narrow card: label above value so both stay readable. */
      @container (max-width: 330px) {
        .info-row { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "drag k del" "drag v del"; }
        .info-row .preview, .info-row .ac { grid-column: 2 / 3; }
      }
    `;
  }
}

// ─── Visual config editor (tabbed Basic / Advanced) ────────────────────────
class BatteryPackCardEditor extends HTMLElement {
  constructor() {
    super();
    this._tab = "basic";
    this._advForms = [];
    this._entRows = [];            // entity-or-template fields (see _entityRow)
    this._tplForced = new Set();   // fields switched to template mode but still empty
    this._tplStash = {};           // templates set aside when switching back to an entity
  }

  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _dispatch(merged) {
    this._config = merged;
    const out = new Event("config-changed", { bubbles: true, composed: true });
    out.detail = { config: merged };
    this.dispatchEvent(out);
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._mounted) this._mount();
    this._updateTabs();
    this._updateActiveTab();
  }

  _mount() {
    this._mounted = true;
    this.innerHTML = `
      <style>
        battery-pack-card-editor { display: block; }
        .bpc-tabs {
          display: flex; gap: 4px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.12));
          margin-bottom: 12px;
        }
        .bpc-tab {
          padding: 10px 18px; cursor: pointer; border: none; background: none;
          color: var(--secondary-text-color);
          font-size: 14px; font-weight: 500; letter-spacing: 0.3px;
          border-bottom: 2px solid transparent; transition: all 0.15s;
          font-family: inherit;
        }
        .bpc-tab:hover { color: var(--primary-text-color); }
        .bpc-tab.active {
          color: var(--primary-color);
          border-bottom-color: var(--primary-color);
        }
        .bpc-pane { display: none; }
        .bpc-pane.active { display: block; }
        .bpc-section-title {
          font-size: 12px; font-weight: 600; letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          margin: 16px 0 6px;
          padding-bottom: 4px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.08));
        }
        .bpc-section-title:first-child { margin-top: 4px; }
        .bpc-hint {
          font-size: 12px; color: var(--secondary-text-color);
          margin: 4px 0 12px; line-height: 1.4;
        }
        .bpc-pane ha-form { display: block; }
        .bpc-pane ha-form + ha-form { margin-top: 8px; }
        .bpc-fields { display: grid; gap: 8px; }
        .bpc-fields.two { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
        .bpc-ent { display: flex; align-items: center; gap: 6px; }
        .bpc-ent ha-selector { flex: 1; min-width: 0; }
        .bpc-tpl {
          flex: none; font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 8px 7px;
          border-radius: 6px; cursor: pointer; color: var(--secondary-text-color); background: none;
          border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
        }
        .bpc-tpl:hover { color: var(--primary-text-color); }
        .bpc-tpl.on { color: var(--primary-color); border-color: var(--primary-color); }
      </style>
      <div class="bpc-tabs">
        <button type="button" class="bpc-tab" data-tab="basic">Basic</button>
        <button type="button" class="bpc-tab" data-tab="advanced">Advanced</button>
      </div>
      <div class="bpc-pane" id="bpc-basic"></div>
      <div class="bpc-pane" id="bpc-advanced"></div>
    `;

    this.querySelectorAll(".bpc-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        this._tab = btn.dataset.tab;
        this._updateTabs();
        this._updateActiveTab();
      });
    });

    // Basic pane — single ha-form
    this._basicPane = this.querySelector("#bpc-basic");
    this._basicForm = document.createElement("ha-form");
    this._basicForm.computeLabel = (s) => LABELS[s.name] || s.name || "";
    this._basicForm.addEventListener("value-changed", (ev) => {
      this._dispatch({ ...this._config, ...ev.detail.value });
    });
    this._basicPane.appendChild(this._basicForm);

    // Advanced pane — one heading + ha-form per section
    this._advPane = this.querySelector("#bpc-advanced");
    const hint = document.createElement("div");
    hint.className = "bpc-hint";
    hint.textContent =
      "Override individual entity IDs. Any field left blank falls back to the prefix-derived default from the Basic tab. Use { } next to a field to enter a template instead of an entity.";
    this._advPane.appendChild(hint);

    this._advForms = [];
    for (const section of ADVANCED_SECTIONS) {
      this._appendAdvSection(section.title, section.schema);
    }
    // Placeholder; the per-cell sections are rebuilt whenever `cells` changes.
    this._cellSlot = document.createElement("div");
    this._advPane.appendChild(this._cellSlot);
    this._cellForms = [];
    this._lastCellsN = -1;
  }

  _appendAdvSection(title, schema, parent) {
    parent = parent || this._advPane;
    const h = document.createElement("div");
    h.className = "bpc-section-title";
    h.textContent = title;
    parent.appendChild(h);

    // Sections made of entity fields get our own rows, so each field can
    // carry an entity/template toggle next to it (ha-form has no room for one).
    const flat = schema.flatMap((it) => (it.type === "grid" ? it.schema : [it]));
    if (flat.length && flat.every((it) => it.selector && it.selector.entity)) {
      const wrap = document.createElement("div");
      wrap.className = `bpc-fields${schema.some((it) => it.type === "grid") ? " two" : ""}`;
      flat.forEach((it) => wrap.appendChild(this._entityRow(it)));
      parent.appendChild(wrap);
      return wrap;
    }

    const f = document.createElement("ha-form");
    f.schema = schema;
    f.computeLabel = (s) => this._fieldLabel(s.name);
    f.addEventListener("value-changed", (ev) => {
      this._dispatch({ ...this._config, ...ev.detail.value });
    });
    parent.appendChild(f);
    this._advForms.push(f);
    return f;
  }

  _fieldLabel(name) {
    if (LABELS[name]) return LABELS[name];
    const m = /^entity_cell_(\d+)_(volt|ohm)$/.exec(name || "");
    if (m) return `Cell #${m[1]} ${m[2] === "volt" ? "voltage" : "resistance"}`;
    return name || "";
  }

  // An entity picker by default; "{ }" swaps it for HA's template editor
  // (with its own entity autocomplete). The card renders either.
  _entityRow(item) {
    const row = document.createElement("div");
    row.className = "bpc-ent";
    const sel = document.createElement("ha-selector");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bpc-tpl";
    btn.textContent = "{ }";
    row.append(sel, btn);
    const rec = { name: item.name, entitySelector: item.selector, sel, btn, mode: null };
    sel.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._setField(item.name, ev.detail.value); });
    btn.addEventListener("click", () => this._toggleTemplate(rec));
    this._entRows.push(rec);
    return row;
  }

  _isTemplateMode(name) {
    return isTpl(this._config[name]) || this._tplForced.has(name);
  }

  _setField(name, value) {
    const cfg = { ...this._config };
    if (value === undefined || value === null || value === "") delete cfg[name];
    else cfg[name] = value;
    this._dispatch(cfg);
    this._updateActiveTab();
  }

  _toggleTemplate(rec) {
    const cur = this._config[rec.name];
    if (this._isTemplateMode(rec.name)) {
      // Back to an entity: a plain {{ states('x') }} becomes x again; anything
      // richer is set aside for this session in case the click was a mistake.
      this._tplForced.delete(rec.name);
      const m = typeof cur === "string" && /^\s*\{\{\s*states\(\s*['"]([\w.]+)['"]\s*\)\s*\}\}\s*$/.exec(cur);
      if (cur && !m) this._tplStash[rec.name] = cur;
      this._setField(rec.name, m ? m[1] : undefined);
    } else {
      this._tplForced.add(rec.name);
      const next = this._tplStash[rec.name] ||
        (typeof cur === "string" && cur ? `{{ states('${cur}') }}` : undefined);
      if (next !== undefined && next !== cur) this._setField(rec.name, next);
      else this._updateActiveTab();
    }
  }

  _updateEntityRows() {
    for (const r of this._entRows) {
      const tpl = this._isTemplateMode(r.name);
      r.sel.hass = this._hass;
      if (r.mode !== tpl) {   // only swap the inner selector when the mode flips
        r.mode = tpl;
        r.sel.selector = tpl ? { template: {} } : r.entitySelector;
        r.btn.classList.toggle("on", tpl);
        r.btn.setAttribute("aria-pressed", String(tpl));
        r.btn.title = tpl ? "Use an entity instead" : "Use a template instead of an entity";
      }
      r.sel.label = this._fieldLabel(r.name);
      r.sel.value = this._config[r.name] ?? (tpl ? "" : undefined);
    }
  }

  _rebuildCellSections(N) {
    // Tear down whatever's there
    this._entRows = this._entRows.filter((r) => !this._cellSlot.contains(r.sel));
    this._cellSlot.innerHTML = "";
    this._cellForms.forEach((f) => {
      const idx = this._advForms.indexOf(f);
      if (idx >= 0) this._advForms.splice(idx, 1);
    });
    this._cellForms = [];

    const buildSchema = (suffix) => {
      const fields = [];
      for (let n = 1; n <= N; n++) {
        fields.push({ name: `entity_cell_${n}_${suffix}`, selector: ENT_SENSOR });
      }
      // Two columns to keep the form compact.
      return [{ type: "grid", name: "", schema: fields }];
    };

    const vForm = this._appendAdvSection(
      `Per-cell voltages (1..${N})`,
      buildSchema("volt"),
      this._cellSlot,
    );
    const rForm = this._appendAdvSection(
      `Per-cell internal resistances (1..${N})`,
      buildSchema("ohm"),
      this._cellSlot,
    );
    this._cellForms = [vForm, rForm];
  }

  // The prefix field offers the add-on packs found in this HA; typing any
  // other prefix keeps working.
  _basicSchema() {
    const found = findPrefixes(this._hass);
    const cur = this._config.prefix;
    if (!found.length) return BASIC_SCHEMA;
    const options = [...new Set([...(cur ? [cur] : []), ...found])].map((p) => ({ value: p, label: found.includes(p) ? `${p} (${prefixName(p)})` : p }));
    if (this._prefixSig !== options.map((o) => o.value).join()) {
      this._prefixSig = options.map((o) => o.value).join();
      this._schema = BASIC_SCHEMA.map((f) => (f.name === "prefix" ? { name: "prefix", selector: { select: { options, custom_value: true, mode: "dropdown" } } } : f));
    }
    return this._schema;
  }

  _updateTabs() {
    this.querySelectorAll(".bpc-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === this._tab);
    });
    this.querySelectorAll(".bpc-pane").forEach((p) => {
      p.classList.toggle("active", p.id === `bpc-${this._tab}`);
    });
  }

  _updateActiveTab() {
    if (this._tab === "basic") {
      this._basicForm.hass = this._hass;
      this._basicForm.schema = this._basicSchema();
      this._basicForm.data = { ...DEFAULTS, ...this._config };
    } else {
      const N = Math.max(1, Math.min(32, parseInt(this._config.cells, 10) || 16));
      if (N !== this._lastCellsN) {
        this._rebuildCellSections(N);
        this._lastCellsN = N;
      }
      for (const f of this._advForms) {
        f.hass = this._hass;
        f.data = this._config;
      }
      this._updateEntityRows();
    }
  }
}

// Another copy may already be registered (a second resource, or one bundled
// with an integration). The first copy wins; defining twice would throw and
// stop this file before it loads the stacked card.
if (!customElements.get("battery-pack-card")) {
  customElements.define("battery-pack-card", BatteryPackCard);
  customElements.define("battery-pack-card-editor", BatteryPackCardEditor);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "battery-pack-card",
    name: "Battery Pack Card",
    description: "Visual battery card: SOC silhouette, cell array, status pills.",
    preview: false,
    documentationURL: "https://github.com/SvenHamers/battery-pack-card",
  });
} else if (customElements.get("battery-pack-card") !== BatteryPackCard) {
  console.warn(`BATTERY-PACK-CARD v${VERSION}: another copy of battery-pack-card was registered first and is the one in use. Remove the extra dashboard resource so only one copy loads.`);
}

// The stacked card ships as battery-stacked-pack-card.js next to this file.
// HACS downloads it too but registers only this file as a dashboard resource,
// so it is loaded from here, with this file's query string (HACS's ?hacstag=)
// so the browser cache never pairs a new pack card with an old stack card.
(() => {
  if (customElements.get("battery-stacked-pack-card")) return;
  const own = (document.currentScript && document.currentScript.src) ||
    (/(https?:\/\/[^\s)]+?battery-pack-card\.js[^\s):]*)/.exec(new Error().stack || "") || [])[1] ||
    ([...document.querySelectorAll("script[src]")].find((el) => /battery-pack-card\.js/.test(el.src)) || {}).src;
  if (!own) return;
  const url = new URL("battery-stacked-pack-card.js", own);
  url.search = new URL(own).search;
  import(url.href).catch(() => console.info(
    "%c BATTERY-PACK-CARD %c battery-stacked-pack-card.js not found next to battery-pack-card.js; the stacked card is unavailable.",
    "color:#fff;background:#3949ab;border-radius:3px", "color:inherit",
  ));
})();

console.info(
  `%c BATTERY-PACK-CARD %c v${VERSION} `,
  "color:#fff;background:#4caf50;font-weight:700;padding:2px 6px;border-radius:3px 0 0 3px;",
  "color:#fff;background:#555;padding:2px 6px;border-radius:0 3px 3px 0;"
);
