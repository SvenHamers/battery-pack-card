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

const VERSION = "1.2.0";

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
};

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
    ],
  },
];

const ENT_SENSOR = { entity: { domain: "sensor" } };
const ENT_BIN    = { entity: { domain: "binary_sensor" } };

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
    title: "Cells (use {n} placeholder for cell index 1..N)",
    schema: [
      { name: "cell_voltage_pattern",    selector: { text: {} } },
      { name: "cell_resistance_pattern", selector: { text: {} } },
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
  cell_voltage_pattern: "Cell voltage pattern (uses {n})",
  cell_resistance_pattern: "Cell resistance pattern (uses {n})",
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

// ─── Main card ─────────────────────────────────────────────────────────────
class BatteryPackCard extends HTMLElement {
  static getStubConfig() {
    return {
      prefix: "bms_master",
      name: "BMS Master",
      alarm_prefix: "bms_master_bms_master",
      cells: 16,
    };
  }
  static getConfigElement() {
    return document.createElement("battery-pack-card-editor");
  }

  setConfig(config) {
    if (!config) throw new Error("Configuration required");
    const merged = { ...DEFAULTS, ...config };
    if (!merged.name) merged.name = merged.prefix || "Battery";
    if (merged.prefix && !merged.alarm_prefix) {
      merged.alarm_prefix = `${merged.prefix}_${merged.prefix}`;
    }
    this._config = merged;
    if (!this._root) this._setup();
  }

  _setup() {
    this.attachShadow({ mode: "open" });
    const wrap = document.createElement("div");
    wrap.innerHTML = `<style>${this._css()}</style><ha-card><div id="body"></div></ha-card>`;
    this.shadowRoot.appendChild(wrap);
    this._root = this.shadowRoot.querySelector("#body");
    this._root.addEventListener("click", (e) => {
      const el = e.composedPath().find((n) => n.dataset && n.dataset.entity);
      if (el && el.dataset.entity) this._moreInfo(el.dataset.entity);
    });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
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

  _state(eid) { return eid ? this._hass?.states[eid]?.state : undefined; }
  _num(eid)   { const v = parseFloat(this._state(eid)); return Number.isFinite(v) ? v : 0; }
  _on(eid)    { return this._state(eid) === "on"; }

  _resolveEntities() {
    const c = this._config;
    const p = c.prefix;
    const ap = c.alarm_prefix;
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
    const patternKey = kind === "v" ? "cell_voltage_pattern" : "cell_resistance_pattern";
    const pat = orNull(c[patternKey]);
    if (pat) return pat.replace("{n}", n);
    if (!c.prefix) return null;
    return kind === "v"
      ? `sensor.${c.prefix}_cell_${n}_volt`
      : `sensor.${c.prefix}_cell_${n}_ohm`;
  }

  _render() {
    if (!this._hass || !this._config) return;
    const cfg = this._config;
    const E = this._resolveEntities();

    const soc   = this._num(E.soc);
    const soh   = this._num(E.soh);
    const packV = this._num(E.packV);
    const curA  = this._num(E.curA);
    const powW  = this._num(E.powW);
    const balA  = this._num(E.balA);
    const cycles= this._state(E.cycles) || "0";
    const capRem= this._num(E.capRem);
    const capTot= this._num(E.capTot);
    const runtime= this._state(E.runtime) || "";
    const vAvg  = this._num(E.vAvg);
    const vMin  = this._num(E.vMin);
    const vMax  = this._num(E.vMax);
    const vDelta= this._num(E.vDelta);
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

    let powerDir = "idle", powerColor = "var(--clr-grey)";
    if (powW > 5)  { powerDir = "discharging"; powerColor = "var(--clr-orange)"; }
    if (powW < -5) { powerDir = "charging";    powerColor = "var(--clr-green)"; }
    const socColor = soc > 50 ? "var(--clr-green)" : soc > 20 ? "var(--clr-orange)" : "var(--clr-red)";

    this._root.innerHTML = `
      <div class="header">
        <div class="title">${this._esc(cfg.name)}</div>
        <div class="alarm ${alarmActive ? "alert" : "ok"}" ${this._dataE(E.alarmB)} role="button">
          <span class="dot"></span>${this._esc(alarm)}
        </div>
      </div>

      ${(cfg.show_battery || cfg.show_stats) ? `
      <div class="hero">
        ${cfg.show_battery ? this._renderBattery(soc, socColor, capRem, capTot, soh, E.soc) : ""}
        ${cfg.show_stats ? `
          <div class="stats">
            ${this._stat("VOLTAGE", `${fmt(packV, 2)} V`, "var(--clr-amber)",  null, E.packV)}
            ${this._stat("CURRENT", `${fmt(curA, 1)} A`,  "var(--clr-blue)",   null, E.curA)}
            ${this._stat("POWER",   `${fmt(powW, 0)} W`,  powerColor, powerDir.toUpperCase(), E.powW)}
            ${this._stat("BALANCE", `${fmt(balA, 2)} A`,  "var(--clr-purple)", null, E.balA)}
            ${this._stat("CYCLES",  cycles, "var(--clr-cyan)", null, E.cycles)}
            ${this._stat("PHASE",   phase,  "var(--clr-grey)", null, E.phase)}
          </div>` : ""}
      </div>` : ""}

      ${cfg.show_pills ? `
      <div class="pills">
        ${this._pill("Charge",    chgOn ? "ON" : "OFF",   chgOn ? "on" : "off", E.chg)}
        ${this._pill("Discharge", dchOn ? "ON" : "OFF",   dchOn ? "on" : "off", E.dch)}
        ${this._pill("Balance",   balAct ? "ACTIVE" : (balAllow ? "READY" : "OFF"),
                     balAct ? "active" : (balAllow ? "on" : "off"), E.balAct)}
        ${this._pill("Heater",    heatOn ? "ON" : "OFF",  heatOn ? "alert" : "off", E.heat)}
      </div>` : ""}

      ${cfg.show_cells ? `
        <div class="section-label">CELLS — voltage and resistance, colour = mV from pack avg</div>
        <div class="cells">${this._renderCells(cfg.cells, vAvg, minCell, maxCell)}</div>` : ""}

      ${cfg.show_summary ? `
        <div class="cell-summary">
          <span ${this._dataE(E.vMin)}><b style="color:var(--clr-red)">${fmt(vMin, 3)}</b> V <span class="muted">min #${minCell}</span></span>
          <span ${this._dataE(E.vAvg)}><b>${fmt(vAvg, 3)}</b> V <span class="muted">avg</span></span>
          <span ${this._dataE(E.vMax)}><b style="color:var(--clr-green)">${fmt(vMax, 3)}</b> V <span class="muted">max #${maxCell}</span></span>
          <span ${this._dataE(E.vDelta)}><b style="color:${vDelta * 1000 < 5 ? "var(--clr-green)" : vDelta * 1000 < 15 ? "var(--clr-amber)" : "var(--clr-red)"}">${fmt(vDelta * 1000, 0)}</b> mV <span class="muted">Δ</span></span>
        </div>` : ""}

      ${cfg.show_temperatures ? `
        <div class="section-label">TEMPERATURES</div>
        <div class="temps">
          ${this._tempTile("MOS",    this._num(E.tMos), E.tMos)}
          ${this._tempTile("Probe 1", this._num(E.t1),  E.t1)}
          ${this._tempTile("Probe 2", this._num(E.t2),  E.t2)}
          ${this._tempTile("Probe 3", this._num(E.t3),  E.t3)}
          ${this._tempTile("Probe 4", this._num(E.t4),  E.t4)}
        </div>` : ""}

      <div class="footer" ${this._dataE(E.runtime)}>Runtime ${this._esc(runtime)}</div>
    `;
  }

  _dataE(eid) { return eid ? `data-entity="${eid}"` : ""; }

  _renderBattery(soc, color, capRem, capTot, soh, entityId) {
    const fillH = (Math.max(0, Math.min(100, soc)) / 100) * 210;
    const fillY = 235 - fillH;
    const gid = `g_${this._config.prefix || "x"}_${Math.random().toString(36).slice(2, 6)}`;
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
        <text x="65" y="155" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11">${fmt(capRem, 1)} / ${fmt(capTot, 0)} Ah</text>
        <text x="65" y="172" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="11">SOH ${Math.round(soh)}%</text>
      </svg>
    `;
  }

  _stat(label, value, color, sub, entityId) {
    return `
      <div class="stat" style="border-left-color:${color};" ${this._dataE(entityId)} role="button">
        <div class="stat-label">${label}${sub ? ` · <span class="muted">${this._esc(sub)}</span>` : ""}</div>
        <div class="stat-value">${this._esc(value)}</div>
      </div>
    `;
  }

  _pill(label, value, status, entityId) {
    return `<span class="pill pill-${status}" ${this._dataE(entityId)} role="button">${this._esc(label)} <b>${this._esc(value)}</b></span>`;
  }

  _renderCells(N, vAvg, minCell, maxCell) {
    let out = "";
    for (let n = 1; n <= N; n++) {
      const ev = this._cellEntity("v", n);
      const er = this._cellEntity("r", n);
      const v = this._num(ev);
      const r = this._num(er);
      const devMv = Math.abs((v - vAvg) * 1000);
      let cls = "ok";
      if (devMv > 10) cls = "bad";
      else if (devMv > 5) cls = "warn";
      else if (devMv > 2) cls = "soft";
      const tag = n === maxCell ? "max" : n === minCell ? "min" : "";
      out += `
        <div class="cell ${cls} ${tag}" ${this._dataE(ev)} role="button">
          <div class="cell-n">#${n}</div>
          <div class="cell-v">${fmt(v, 3)}</div>
          <div class="cell-r">${fmt(r * 1000, 0)} mΩ</div>
        </div>
      `;
    }
    return out;
  }

  _tempTile(label, val, entityId) {
    const color = val < 5  ? "var(--clr-blue)"
                : val < 35 ? "var(--clr-green)"
                : val < 50 ? "var(--clr-amber)"
                :            "var(--clr-red)";
    return `
      <div class="temp" ${this._dataE(entityId)} role="button">
        <div class="temp-label">${this._esc(label)}</div>
        <div class="temp-val" style="color:${color};">${fmt(val, 1)}°</div>
      </div>
    `;
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
        --clr-green:  #4caf50; --clr-amber:  #ffc107; --clr-orange: #ff9800;
        --clr-red:    #ef5350; --clr-blue:   #42a5f5; --clr-cyan:   #00bcd4;
        --clr-purple: #ab47bc; --clr-grey:   #9e9e9e;
      }
      ha-card { padding: 18px 18px 14px; }
      #body { display: flex; flex-direction: column; gap: 12px; }
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
      .stat  { padding: 8px 12px; background: rgba(255,255,255,0.035); border-left: 3px solid var(--clr-grey); border-radius: 7px; transition: background 0.15s; }
      .stat:hover { background: rgba(255,255,255,0.07); }
      .stat-label { font-size: 10px; letter-spacing: 1.2px; opacity: 0.7; }
      .stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }

      .pills { display:flex; flex-wrap:wrap; gap: 6px; }
      .pill  { padding: 5px 11px; border-radius: 14px; font-size: 12px; font-weight: 500; letter-spacing: 0.2px; transition: filter 0.15s; }
      .pill:hover { filter: brightness(1.15); }
      .pill b { margin-left: 4px; font-weight: 700; }
      .pill-on     { color: var(--clr-green);  background: rgba(76,175,80,0.13); }
      .pill-off    { color: var(--clr-grey);   background: rgba(158,158,158,0.10); }
      .pill-active { color: #fff;              background: var(--clr-purple); box-shadow: 0 0 10px rgba(171,71,188,0.5); }
      .pill-alert  { color: var(--clr-red);    background: rgba(239,83,80,0.15); }

      .section-label { font-size: 10px; letter-spacing: 1.5px; opacity: 0.55; margin-top: 4px; }

      .cells { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }
      @media (max-width: 520px) { .cells { grid-template-columns: repeat(4, 1fr); } }
      .cell  {
        position: relative; padding: 8px 4px 6px; text-align: center;
        background: rgba(76,175,80,0.18); border: 1px solid rgba(255,255,255,0.08);
        border-radius: 7px; transition: transform 0.15s;
      }
      .cell::before, .cell::after {
        content: ""; position: absolute; top: -3px; width: 12%; height: 4px;
        background: rgba(255,255,255,0.4); border-radius: 1.5px 1.5px 0 0;
      }
      .cell::before { left: 28%; }
      .cell::after  { right: 28%; }
      .cell:hover { transform: translateY(-2px); }
      .cell.soft { background: rgba(255,193,7,0.18); }
      .cell.warn { background: rgba(255,152,0,0.22); }
      .cell.bad  { background: rgba(239,83,80,0.28); }
      .cell.min  { border: 2px solid var(--clr-red);   box-shadow: 0 0 12px rgba(239,83,80,0.4); }
      .cell.max  { border: 2px solid var(--clr-green); box-shadow: 0 0 12px rgba(76,175,80,0.4); }
      .cell-n { font-size: 9px; opacity: 0.55; line-height: 1; }
      .cell-v { font-size: 14px; font-weight: 700; line-height: 1.4; font-variant-numeric: tabular-nums; }
      .cell-r { font-size: 9px; opacity: 0.55; line-height: 1; }

      .cell-summary { display:flex; justify-content:space-between; flex-wrap:wrap; gap:6px; font-size:12px; padding: 4px 2px 0; }
      .cell-summary .muted { opacity: 0.5; margin-left: 3px; }
      .cell-summary span { padding: 2px 6px; border-radius: 4px; transition: background 0.15s; }
      .cell-summary span:hover { background: rgba(255,255,255,0.04); }

      .temps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
      .temp  { padding: 8px 6px; background: rgba(255,255,255,0.03); border-radius: 7px; text-align: center; transition: background 0.15s; }
      .temp:hover { background: rgba(255,255,255,0.07); }
      .temp-label { font-size: 10px; opacity: 0.6; letter-spacing: 0.5px; }
      .temp-val   { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }

      .muted { opacity: 0.55; }
      .footer { font-size: 10px; opacity: 0.4; text-align: right; }
    `;
  }
}

// ─── Visual config editor (tabbed Basic / Advanced) ────────────────────────
class BatteryPackCardEditor extends HTMLElement {
  constructor() {
    super();
    this._tab = "basic";
    this._advForms = [];
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
      "Override individual entity IDs. Any field left blank falls back to the prefix-derived default from the Basic tab.";
    this._advPane.appendChild(hint);

    this._advForms = [];
    for (const section of ADVANCED_SECTIONS) {
      const h = document.createElement("div");
      h.className = "bpc-section-title";
      h.textContent = section.title;
      this._advPane.appendChild(h);

      const f = document.createElement("ha-form");
      f.schema = section.schema;
      f.computeLabel = (s) => LABELS[s.name] || s.name || "";
      f.addEventListener("value-changed", (ev) => {
        this._dispatch({ ...this._config, ...ev.detail.value });
      });
      this._advPane.appendChild(f);
      this._advForms.push(f);
    }
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
      this._basicForm.schema = BASIC_SCHEMA;
      this._basicForm.data = { ...DEFAULTS, ...this._config };
    } else {
      for (const f of this._advForms) {
        f.hass = this._hass;
        f.data = this._config;
      }
    }
  }
}

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

console.info(
  `%c BATTERY-PACK-CARD %c v${VERSION} `,
  "color:#fff;background:#4caf50;font-weight:700;padding:2px 6px;border-radius:3px 0 0 3px;",
  "color:#fff;background:#555;padding:2px 6px;border-radius:0 3px 3px 0;"
);
