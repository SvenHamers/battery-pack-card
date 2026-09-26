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

const VERSION = "1.4.0-beta.1";

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
  info_key: "",
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
      { name: "show_info",         selector: { boolean: {} } },
    ],
  },
];

const ENT_SENSOR = { entity: { domain: "sensor" } };
const ENT_BIN    = { entity: { domain: "binary_sensor" } };
// Threshold fields are all "a number of millivolts", so they share one selector.
const MV_BAND    = { number: { min: 0, max: 500, step: 0.5, mode: "box" } };

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
  cell_voltage_pattern: "Cell voltage pattern (uses {n} or {nn})",
  cell_resistance_pattern: "Cell resistance pattern (uses {n} or {nn})",
  cell_voltage_from: "Cell voltage source unit",
  summary_voltage_from: "Min/avg/max/Δ source unit (blank = same as cells)",
  cell_voltage_decimals: "Cell voltage decimals",
  cell_resistance_from: "Cell resistance source unit",
  cell_resistance_decimals: "Cell resistance decimals (mΩ)",
  cells_min_width: "Cell tile min width (px)",
  cells_max_columns: "Cell grid max columns",
  cell_dev_soft: "Yellow above (mV)",
  cell_dev_warn: "Orange above (mV)",
  cell_dev_bad: "Red above (mV)",
  delta_warn: "Summary Δ amber at (mV)",
  delta_bad: "Summary Δ red at (mV)",
  max_cell_red: "Highest cell in red, lowest in green",
  show_info: "Pack info (More info button)",
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
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } };

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
    this._syncInfo();
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
    this._infoEl.addEventListener("input", () => this._scheduleInfoSave());
    this._infoEl.addEventListener("keydown", (e) => this._onInfoKey(e));
    this._infoEl.addEventListener("pointerdown", (e) => this._onInfoPointer(e));
  }

  connectedCallback() { this._syncInfo(); }

  disconnectedCallback() {
    if (this._infoSaveT) this._saveInfo();   // don't lose the last keystrokes
    this._unsubInfo();
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
    // Coalesce bursts of state-changed events into one render per frame.
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
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
    if (!open) { el.innerHTML = ""; return; }
    if (this._infoEditing) return;    // the editor manages its own DOM
    const admin = this._isAdmin(), f = this._infoFields;
    el.innerHTML = `
      <div class="info-head">
        <div class="section-label">PACK INFO</div>
        ${admin ? `<button class="info-btn" data-info="edit">Edit</button>` : ""}
      </div>
      ${f.length ? `<dl class="info-list">${f.map((x) => `<dt>${this._esc(x.label)}</dt><dd>${this._esc(x.value)}</dd>`).join("")}</dl>`
                 : `<div class="info-empty">No info yet.${admin ? " Use Edit to add fields like BMS, cells or installation date." : ""}</div>`}
    `;
  }

  _infoRowHtml(f) {
    return `
      <div class="info-row" data-id="${this._esc(f.id)}">
        <button class="drag" data-info="drag" title="Drag to reorder (or focus and use ↑ ↓)" aria-label="Move field">⋮⋮</button>
        <input class="k" placeholder="Label" aria-label="Label" value="${this._esc(f.label)}">
        <input class="v" placeholder="Value" aria-label="Value" value="${this._esc(f.value)}">
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
  }

  async _finishInfoEdit() {
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
    // Arrow keys on the handle reorder: the keyboard (and screen-reader)
    // alternative to dragging.
    if (t.classList.contains("drag") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const row = t.closest(".info-row");
      const sib = e.key === "ArrowUp" ? row.previousElementSibling : row.nextElementSibling;
      if (!sib) return;
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
    const handle = e.composedPath().find((n) => n.classList && n.classList.contains("drag"));
    if (!handle || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
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
  _exists(eid){ return !!(eid && this._hass?.states[eid]); }
  _num(eid)   { const v = parseFloat(this._state(eid)); return Number.isFinite(v) ? v : 0; }
  _on(eid)    { return this._state(eid) === "on"; }
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
    const powW  = this._num(E.powW);
    const balA  = this._num(E.balA);
    const cycles= this._state(E.cycles) || "0";
    const capRem= this._num(E.capRem);
    const capTot= this._num(E.capTot);
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

    // Temperature tiles: only for sensors that actually exist in HA. An
    // unconfigured probe (or a prefix default that matches nothing) is
    // dropped instead of rendering as a misleading 0°.
    const tempTiles = [
      ["MOS", E.tMos], ["Probe 1", E.t1], ["Probe 2", E.t2], ["Probe 3", E.t3], ["Probe 4", E.t4],
    ].filter(([, eid]) => this._exists(eid))
     .map(([label, eid]) => this._tempTile(label, eid))
     .join("");

    // Direction comes from the current sensor (signed) — some BMS integrations
    // report power as unsigned magnitude, so current is the source of truth.
    let powerDir = "idle", powerColor = "var(--clr-grey)";
    if (curA > 0.1)  { powerDir = "charging";    powerColor = "var(--clr-green)"; }
    if (curA < -0.1) { powerDir = "discharging"; powerColor = "var(--clr-orange)"; }
    const socColor = soc > 50 ? "var(--clr-green)" : soc > 20 ? "var(--clr-orange)" : "var(--clr-red)";

    const html = `
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

  _dataE(eid) { return eid ? `data-entity="${eid}"` : ""; }

  _renderBattery(soc, color, capRem, capTot, soh, entityId) {
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
        <text x="65" y="155" text-anchor="middle" fill="rgba(255,255,255,0.85)" font-size="11">${fmt(capRem, 1)} / ${fmt(capTot, 0)} Ah</text>
        <text x="65" y="172" text-anchor="middle" fill="rgba(255,255,255,0.65)" font-size="11">SOH ${Math.round(soh)}%</text>
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
        <text x="272" y="33" text-anchor="end" style="fill:var(--primary-text-color,#fff);fill-opacity:0.85" font-size="12">${fmt(capRem, 1)} / ${fmt(capTot, 0)} Ah</text>
        <text x="272" y="51" text-anchor="end" style="fill:var(--primary-text-color,#fff);fill-opacity:0.65" font-size="12">SOH ${Math.round(soh)}%</text>
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
    // Entity exists but is unavailable/unknown → show a dash, not 0°.
    const raw = parseFloat(this._state(entityId));
    const val = Number.isFinite(raw) ? raw : null;
    const color = val === null ? "inherit"
                : val < 5  ? "var(--clr-blue)"
                : val < 35 ? "var(--clr-green)"
                : val < 50 ? "var(--clr-amber)"
                :            "var(--clr-red)";
    return `
      <div class="temp" ${this._dataE(entityId)} role="button">
        <div class="temp-label">${this._esc(label)}</div>
        <div class="temp-val" style="color:${color};">${val === null ? "—" : fmt(val, 1) + "°"}</div>
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
      /* Narrow card: label above value so both stay readable. */
      @container (max-width: 330px) {
        .info-row { grid-template-columns: auto minmax(0, 1fr) auto; grid-template-areas: "drag k del" "drag v del"; }
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

    const f = document.createElement("ha-form");
    f.schema = schema;
    f.computeLabel = (s) => {
      if (LABELS[s.name]) return LABELS[s.name];
      const m = /^entity_cell_(\d+)_(volt|ohm)$/.exec(s.name);
      if (m) return `Cell #${m[1]} ${m[2] === "volt" ? "voltage" : "resistance"}`;
      return s.name || "";
    };
    f.addEventListener("value-changed", (ev) => {
      this._dispatch({ ...this._config, ...ev.detail.value });
    });
    parent.appendChild(f);
    this._advForms.push(f);
    return f;
  }

  _rebuildCellSections(N) {
    // Tear down whatever's there
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
      const N = Math.max(1, Math.min(32, parseInt(this._config.cells, 10) || 16));
      if (N !== this._lastCellsN) {
        this._rebuildCellSections(N);
        this._lastCellsN = N;
      }
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
