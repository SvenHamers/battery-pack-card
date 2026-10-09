/**
 * battery-stacked-pack-card — many battery packs at a glance, drawn as their
 * cases stacked in a cabinet. Tapping a pack opens the full battery-pack-card
 * for it, under its row or in a popup.
 *
 *   type: custom:battery-stacked-pack-card
 *   name: Battery Bank
 *   packs:                       # each entry takes the battery-pack-card options
 *     - name: Pack 1
 *       prefix: jk_pack1
 *     - name: Pack 2
 *       prefix: jk_pack2
 *   pack_defaults:               # optional, merged under every pack
 *     cells: 16
 *
 * Loaded by battery-pack-card.js (HACS registers only that file); it relies on
 * that card for entity resolution and for the detail view.
 */

(() => {
const VERSION = "2.0.0-alpha.1";
if (customElements.get("battery-stacked-pack-card")) return;

const DEFAULTS = {
  name: "Battery Bank",
  layout: "grid",        // "grid" = cabinet with up to `columns` per row, "stack" = one column
  columns: 4,
  box_min_width: 130,    // px; rows hold fewer boxes before one gets narrower than this
  detail: "inline",      // "inline" = opens under the pack's row, "popup" = dialog
  highlight_soc: true,   // red border on the lowest SOC pack, green on the highest
  show_legend: true,
  show_bank_display: true,   // the JK-style display on top of the cabinet
  bank_display_size: "full", // "full", or "compact": one slim line
  capacity_unit: "Ah",       // "Ah" or "kWh", for the display and, unless set there, the packs
  // Bank totals for that display, each an entity or a template. Whatever is
  // left blank is worked out from the packs where that makes sense.
  entity_soc: "",
  entity_voltage: "",
  entity_current: "",
  entity_power: "",
  entity_capacity_remaining: "",
  entity_capacity_total: "",
  // For kWh from a bank entity in Ah. Blank: the packs' mean nominal voltage,
  // or without packs the bank voltage.
  nominal_voltage: "",
  pack_defaults: {},
  packs: [],
};

// [config key, label, short label, default unit, decimals, signed], in the
// order of the TOTALS editor fields.
const TOTALS = [
  ["entity_soc",                "SOC",       "SOC", "%",  0, false],
  ["entity_voltage",            "VOLTAGE",   "V",   "V",  2, false],
  ["entity_current",            "CURRENT",   "A",   "A",  1, true],
  ["entity_capacity_remaining", "REMAINING", "Ah",  "Ah", 0, false],
  ["entity_power",              "POWER",     "W",   "W",  0, true],
  ["entity_capacity_total",     "CAPACITY",  "Cap", "Ah", 0, false],
];

// More display values, mainly for display-only cards (no packs to work them
// out from): [config key, entity domain for the picker, or null for any].
// Set on a card with packs, they take priority like the totals above.
const EXTRAS = [
  ["entity_cell_max", "sensor"],
  ["entity_cell_min", "sensor"],
  ["entity_temperature", "sensor"],
  ["entity_alarm", null],
  ["entity_pack_count", "sensor"],
  ["entity_charge", null],
  ["entity_discharge", null],
];
// A state read as on / off: on, true, a non-zero number, or (for alarms) any
// text other than an all-clear like "Normal".
const isOn = (state, alarm = false) => {
  const v = String(state ?? "").trim().toLowerCase();
  if (/^(on|true|yes|problem|alarm|warning)$/.test(v)) return true;
  if (/^(off|false|no|ok|normal|none|no alarm|unavailable|unknown|)$/.test(v)) return false;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n > 0 : alarm;
};

const fmt = (n, d = 0, signed = false) => {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const s = Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  return signed && n > 0 ? `+${s}` : s;
};
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const esc = (s) => (s === null || s === undefined ? "" : String(s).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[c])));
// Same template rules as the pack card: anything with {{ / {% / {# is a
// Home Assistant template, rendered live by HA.
const isTpl = (s) => typeof s === "string" && /\{\{|\{%|\{#/.test(s);
// One render_template subscription per wanted template; `onChange` runs on
// every new result.
class TemplateSubs {
  constructor(onChange) { this.map = new Map(); this.onChange = onChange; }
  get(t) { return this.map.get(t); }
  sync(conn, want) {
    for (const [t, e] of this.map) {
      if (want.has(t) && e.conn === conn) continue;
      e.unsub.then((u) => u && u()).catch(() => {});
      this.map.delete(t);
    }
    if (!conn) return;
    for (const t of want) {
      if (this.map.has(t)) continue;
      const e = { conn, result: undefined, error: null, entities: [] };
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
const intOr = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };
// The display's SOC ring: the SOC colour over most of the arc, fading into a
// matching tail colour over the last 40 % of it; full is one solid colour.
const RING = { green: ["#84fa5c", "#68c8cc"], orange: ["#ff9800", "#ffd54f"], red: ["#ef5350", "#b71c1c"] };
const ringGradient = (soc) => {
  const [c, tail] = soc > 50 ? RING.green : soc > 20 ? RING.orange : RING.red;
  if (soc >= 99) return `conic-gradient(${c} 0 100%)`;
  return `conic-gradient(${c} 0%, ${c} ${(soc * 0.6).toFixed(1)}%, ${tail} ${soc}%, #1c1c1c ${soc}% 100%)`;
};
const socColor = (s) => (s > 50 ? "var(--clr-green)" : s > 20 ? "var(--clr-orange)" : "var(--clr-red)");

// Every pack's effective battery-pack-card config.
const packConfigs = (cfg) => (Array.isArray(cfg.packs) ? cfg.packs : []).map((p, i) => {
  const c = { capacity_unit: cfg.capacity_unit, ...(cfg.pack_defaults || {}), ...(p || {}) };
  if (!c.name) c.name = `Pack ${i + 1}`;
  delete c.alerts;   // the stacked card owns the alerts
  return c;
});

class BatteryStackedPackCard extends HTMLElement {
  static getStubConfig(hass) {
    // Start with the JK-BMS add-on packs found in this Home Assistant, if any.
    const Pack = customElements.get("battery-pack-card");
    const found = Pack && Pack.findPacks ? Pack.findPacks(hass) : [];
    if (found.length) return { name: "Battery Bank", packs: found.slice(0, 16) };
    return {
      name: "Battery Bank",
      packs: [
        { name: "Pack 1", prefix: "bms_1" },
        { name: "Pack 2", prefix: "bms_2" },
      ],
    };
  }
  static getConfigElement() {
    return document.createElement("battery-stacked-pack-card-editor");
  }

  setConfig(config) {
    if (!config) throw new Error("Configuration required");
    this._config = { ...DEFAULTS, ...config };
    this._packCfgs = packConfigs(this._config);
    if (!this.shadowRoot) this._setup();
    this._open = -1;
    this._buildSources();
    this._buildCabinet();
    this._syncTemplates();
    this._queue();
  }

  set hass(hass) {
    this._hass = hass;
    (this._sources || []).forEach((s) => { s.hass = hass; });
    if (this._detailCard) this._detailCard.hass = hass;
    this._syncTemplates();
    this._queue();
  }

  // Templated bank totals: subscribed while the card is on screen.
  _syncTemplates() {
    this._tpl = this._tpl || new TemplateSubs(() => this._queue());
    const c = this._config || {}, conn = this._hass && this._hass.connection;
    const want = new Set(this.isConnected && conn ? [...TOTALS, ...EXTRAS].map(([k]) => c[k]).filter(isTpl) : []);
    this._tpl.sync(conn, want);
  }

  connectedCallback() {
    this._syncTemplates();
    (this._sources || []).forEach((s) => s.setSummaryLive(true));
    if (this._cab && !this._ro) {
      this._ro = new ResizeObserver(() => this._placeDetail());
      this._ro.observe(this._cab);
    }
  }

  disconnectedCallback() {
    this._syncTemplates();
    (this._sources || []).forEach((s) => s.setSummaryLive(false));
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  }

  getCardSize() {
    const n = (this._packCfgs || []).length;
    const cols = this._config && this._config.layout === "stack" ? 1 : intOr(this._config && this._config.columns, 4);
    return 2 + Math.ceil(n / cols) * 3 + (this._config && this._config.show_bank_display !== false ? 3 : 0);
  }

  // One headless battery-pack-card per pack does the entity work; see
  // BatteryPackCard.summarySource. The pack card may load after this file
  // when someone registered both as resources, so wait for it.
  _buildSources() {
    (this._sources || []).forEach((s) => s.setSummaryLive(false));
    this._sources = [];
    const Pack = customElements.get("battery-pack-card");
    this._incompatible = !!Pack && typeof Pack.summarySource !== "function";
    if (this._incompatible) return;   // an older copy won the registration; see _renderHead
    if (!Pack) {
      if (!this._waiting) {
        this._waiting = true;
        customElements.whenDefined("battery-pack-card").then(() => {
          this._waiting = false;
          if (this._config) this.setConfig(this._config);
          if (this._hass) this.hass = this._hass;
        });
      }
      return;
    }
    this._sources = this._packCfgs.map((c) => {
      const s = Pack.summarySource(c, () => this._queue());
      s.setSummaryLive(this.isConnected);
      if (this._hass) s.hass = this._hass;
      return s;
    });
  }

  _queue() {
    if (this._raf) return;
    this._raf = true;
    requestAnimationFrame(() => { this._raf = false; this._render(); });
  }

  _setup() {
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>${CSS}</style>
      <ha-card>
        <div id="head"></div>
        <div id="rack"><div id="disp" class="mounted" hidden></div><div id="cab" class="cabinet"></div></div>
        <div id="legend"></div>
      </ha-card>
      <dialog id="dlg">
        <div class="dlg-bar">
          <span class="nav">
            <button type="button" data-nav="-1" aria-label="Previous pack">‹ Prev</button>
            <button type="button" data-nav="1" aria-label="Next pack">Next ›</button>
          </span>
          <button type="button" data-nav="close">Close ✕</button>
        </div>
        <div id="dlg-body"></div>
      </dialog>`;
    const r = this.shadowRoot;
    this._head = r.getElementById("head");
    this._cab = r.getElementById("cab");
    this._legend = r.getElementById("legend");
    this._rack = r.getElementById("rack");
    this._disp = r.getElementById("disp");
    this._disp.addEventListener("click", (e) => {
      const t = e.composedPath().find((n) => n.dataset && n.dataset.entity);
      if (t) this._moreInfo(t.dataset.entity);
    });
    this._dlg = r.getElementById("dlg");

    this._head.addEventListener("click", (e) => {
      const path = e.composedPath();
      if (path.some((n) => n.classList && n.classList.contains("bpc-pop"))) return;
      if (path.some((n) => n.dataset && n.dataset.action === "alerts")) {
        this._alertsOpen = !this._alertsOpen;
        this._headHtml = null;
        return this._render();
      }
      const t = path.find((n) => n.dataset && n.dataset.entity);
      if (t) this._moreInfo(t.dataset.entity);
    });
    // Any other click closes the alerts popover.
    this.shadowRoot.addEventListener("click", (e) => {
      if (!this._alertsOpen || e.composedPath().some((n) => n === this._head)) return;
      this._alertsOpen = false;
      this._headHtml = null;
      this._render();
    });
    this._cab.addEventListener("click", (e) => {
      const path = e.composedPath();
      const box = path.find((n) => n.classList && n.classList.contains("box"));
      if (!box) return;
      const i = Number(box.dataset.i);
      if (this._config.detail === "popup") this._showPopup(i);
      else this._toggleInline(i);
    });
    this._dlg.addEventListener("click", (e) => {
      const nav = e.composedPath().find((n) => n.dataset && n.dataset.nav);
      if (e.target === this._dlg || (nav && nav.dataset.nav === "close")) return this._dlg.close();
      if (nav) {
        const n = this._packCfgs.length;
        this._showPopup((this._open + Number(nav.dataset.nav) + n) % n);
      }
    });
    this._dlg.addEventListener("close", () => { this._open = -1; this._dropDetail(); this._markOpen(); });
    // A modal dialog makes everything else inert, Home Assistant's own
    // more-info dialog included; step aside before HA opens it.
    this._dlg.addEventListener("hass-more-info", () => this._dlg.close());
    if (this.isConnected) this.connectedCallback();
  }

  _moreInfo(entityId) {
    const ev = new Event("hass-more-info", { bubbles: true, composed: true });
    ev.detail = { entityId };
    this.dispatchEvent(ev);
  }

  // Boxes are created once per config and then only have their contents
  // swapped, so the open detail row (a sibling in the same grid) survives
  // every state update.
  _buildCabinet() {
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    this._dropDetail();
    const c = this._config;
    this._cab.className = `cabinet${c.layout === "stack" ? " single" : ""}`;
    this._rack.className = c.layout === "stack" ? "single" : "";
    this._rack.style.setProperty("--max-cols", c.layout === "stack" ? 1 : intOr(c.columns, 4));
    this._rack.style.setProperty("--box-min", `${intOr(c.box_min_width, 130)}px`);
    this._cab.innerHTML = this._packCfgs.map((p, i) =>
      `<button type="button" class="box" data-i="${i}" style="order:${i * 2}" aria-expanded="false" title="${esc(p.name)}"></button>`,
    ).join("") + `<div class="bdetail"><div></div></div>`;
    this._boxes = [...this._cab.querySelectorAll(".box")];
    this._boxHtml = [];
    this._detail = this._cab.querySelector(".bdetail");
    this._headHtml = this._legendHtml = this._dispHtml = null;
    if (this.isConnected) this.connectedCallback();
  }

  _render() {
    if (!this._config || !this._cab) return;
    const sums = (this._sources || []).map((s) => s.summary());
    const c = this._config;
    // No packs: a display-only card (e.g. the totals of several stacks).
    this._cab.hidden = !!this._incompatible || !this._packCfgs.length;
    this._rack.classList.toggle("no-packs", !this._packCfgs.length);

    // SOC extremes, as the cell grid marks its lowest and highest cell.
    let minI = -1, maxI = -1;
    if (c.highlight_soc !== false) {
      const socs = sums.map((s) => (s && fin(s.soc) ? s.soc : null));
      const known = socs.filter((v) => v !== null);
      if (known.length > 1 && Math.min(...known) !== Math.max(...known)) {
        minI = socs.indexOf(Math.min(...known));
        maxI = socs.indexOf(Math.max(...known));
      }
    }
    this._boxes.forEach((box, i) => {
      const s = sums[i];
      const cls = ["box", ...(s ? this._boxState(s) : []), i === minI ? "min" : i === maxI ? "max" : "", i === this._open ? "open" : ""]
        .filter(Boolean).join(" ");
      if (box.className !== cls) box.className = cls;
      const html = this._boxInner(s, this._packCfgs[i]);
      if (html !== this._boxHtml[i]) { this._boxHtml[i] = html; box.innerHTML = html; }
      box.style.setProperty("--soc", s && fin(s.soc) ? `${Math.max(0, Math.min(100, s.soc))}%` : "0%");
      box.style.setProperty("--sc", s && fin(s.soc) ? socColor(s.soc) : "var(--clr-grey)");
    });

    const disp = this._incompatible ? "" : this._renderDisplay(sums);
    if (disp !== this._dispHtml) {
      this._dispHtml = disp;
      this._disp.innerHTML = disp;
      this._disp.hidden = !disp;
      this._rack.classList.toggle("has-disp", !!disp);
    }
    const head = this._renderHead(sums);
    if (head !== this._headHtml) { this._headHtml = head; this._head.innerHTML = head; }
    const legend = c.show_legend !== false ? this._renderLegend(sums, minI >= 0) : "";
    if (legend !== this._legendHtml) { this._legendHtml = legend; this._legend.innerHTML = legend; }
  }

  _boxState(s) {
    const out = [];
    if (s.alarm) out.push("alarm");
    else if (s.deltaState === "bad") out.push("d-bad");
    else if (s.deltaState === "warn") out.push("d-warn");
    if (s.charge === false && s.discharge === false) out.push("idle");
    return out;
  }

  _boxInner(s, p) {
    if (!s) return `<span class="screen"><span class="scr-big">…</span></span>`;
    const big = s.soc !== null ? `${fmt(s.soc, 0)}%` : s.voltage !== null ? `${fmt(s.voltage, 1)}<small>V</small>` : "—";
    const line1 = [
      s.soc !== null && s.voltage !== null ? `${fmt(s.voltage, 1)}<span class="u">V</span>` : "",
      s.current !== null ? `${fmt(s.current, 1, true)}<span class="u">A</span>` : "",
    ].filter(Boolean).join(" ");
    const line2 = [
      s.deltaMv !== null ? `Δ${fmt(s.deltaMv, 0)}<span class="u">mV</span>` : "",
      s.temp ? `${fmt(s.temp.shown, 0)}<span class="u">°</span>` : "",
    ].filter(Boolean).join(" ");
    const known = s.charge !== null || s.discharge !== null;
    const run = known ? !!(s.charge || s.discharge) : s.soc !== null || s.voltage !== null;
    return `
      <span class="term neg"></span><span class="term pos"></span>
      <span class="sign neg">−</span><span class="sign pos">+</span>
      <span class="breaker"></span>
      <span class="screen">
        <span class="scr-big">${big}</span>
        ${s.soc !== null ? `<span class="scr-bar"><i></i></span>` : ""}
        ${line1 ? `<span class="scr-line">${line1}</span>` : ""}
        ${line2 ? `<span class="scr-line">${line2}</span>` : ""}
      </span>
      <span class="plabel">${esc(p.name)}</span>
      <span class="pfoot">
        <span class="leds"><span><i class="run${run ? " on" : ""}"></i>RUN</span><span><i class="alm${s.alarm ? " on" : ""}"></i>ALM</span></span>
        <span class="ports"><i class="dry"></i><i></i><i></i></span>
      </span>`;
  }

  // Alerts: the stacked card owns them for all of its packs (the pack cards
  // it draws don't), using the pack card's alerts module.
  _alertsHtml(sums) {
    const c = this._config;
    const Pack = customElements.get("battery-pack-card");
    const A = Pack && Pack.alerts;
    if (!A || !c.alerts || this._incompatible) return "";
    if (!this._alertsCss) {
      this._alertsCss = true;
      const st = document.createElement("style");
      st.textContent = A.css;
      this.shadowRoot.appendChild(st);
    }
    this._alertSync = this._alertSync || new A.Sync(() => { this._headHtml = null; this._queue(); });
    this._alertSync.tick(this, this._hass, c, () => (this._sources || []).map((s) => s.alertInputs()).filter(Boolean));
    if (!c.alerts.enabled) return "";
    const first = this._sources && this._sources[0] && this._sources[0].alertInputs();
    const status = A.status(c, sums, first && first.bands);
    const admin = this._hass && this._hass.user && this._hass.user.is_admin === true;
    const st = this._alertSync.state;
    return `<span class="bpc-bellwrap">${A.bell(status, st, admin)}${this._alertsOpen ? A.popover(status, st, c, esc) : ""}</span>`;
  }

  _renderHead(sums) {
    const c = this._config;
    const watched = sums.filter((s) => s && s.alarm !== null);
    const alarms = watched.filter((s) => s.alarm).length;
    const pill = watched.length
      ? `<div class="alarm ${alarms ? "alert" : "ok"}"><span class="dot"></span>${alarms ? `${alarms} pack${alarms > 1 ? "s" : ""} in alarm` : "All packs normal"}</div>`
      : "";
    return `
      <div class="s-head"><div class="s-title">${esc(c.name)}</div><div class="s-hr">${this._alertsHtml(sums)}${pill}</div></div>
      ${this._incompatible ? `<div class="empty warn">An older Battery Pack Card is loaded in this browser, from a second dashboard resource or bundled with an integration, and the stacked card needs v${VERSION} or newer. Remove the extra copy so only the HACS one loads, then reload.</div>` : ""}
      ${this._packCfgs.length || this._dispHtml ? "" : `<div class="empty">No packs yet. Add them in the card editor, or under <code>packs:</code> in YAML.</div>`}`;
  }

  // The bank display: a JK BMS-style screen in a bezel on top of the cabinet.
  // Each value comes from its bank setting (entity or template) when set,
  // otherwise from the packs where that adds up: voltage = the packs' mean
  // (they're in parallel), current and capacities = their sum, SOC = weighted
  // by capacity, cells / temperature = the extremes over all packs.
  _renderDisplay(sums) {
    const c = this._config;
    if (c.show_bank_display === false) return "";
    const st = (this._hass && this._hass.states) || {};
    const packs = sums.filter(Boolean);
    const T = {};
    for (const [key] of TOTALS) {
      const t = this._total(c[key], st);
      if (!t) continue;
      let n = t.text === null ? parseFloat(t.value) : NaN;
      if (key === "entity_power" && Number.isFinite(n)) n *= /^kW$/i.test(t.unit || "") ? 1000 : /^MW$/i.test(t.unit || "") ? 1e6 : 1;
      T[key] = { ...t, n };
    }
    if (!packs.length && !Object.keys(T).length && !EXTRAS.some(([k]) => c[k])) return "";
    const vals = (k) => packs.map((p) => p[k]).filter(fin);
    const sum = (k) => { const v = vals(k); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
    const mean = (k) => { const v = vals(k); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    const pick = (key, derived) => (T[key] ? T[key] : derived !== null && derived !== undefined && Number.isFinite(derived) ? { n: derived, text: null } : null);

    const capTot = sum("capacityTotal"), capRemSum = sum("capacityRemaining");
    // Capacity as energy (kWh): each pack's Ah × its nominal voltage. A bank
    // entity in Ah gets the packs' mean nominal voltage; one in Wh / kWh is
    // energy already.
    const kwh = c.capacity_unit === "kWh";
    const V = pick("entity_voltage", mean("voltage"));
    const nvSet = parseFloat(c.nominal_voltage);
    const nomV = nvSet > 0 ? nvSet : mean("nominalVoltage") || (V && V.text === null && Number.isFinite(V.n) ? V.n : null);
    const toKwh = (t) => {
      if (!t || t.text !== null || !Number.isFinite(t.n)) return t;
      const u = String(t.unit || "").trim();
      const n = /^kWh$/i.test(u) ? t.n : /^Wh$/i.test(u) ? t.n / 1000 : nomV ? (t.n * nomV) / 1000 : NaN;
      return { ...t, n };
    };
    const A = pick("entity_current", sum("current"));
    const socDerived = capTot && capRemSum !== null ? (capRemSum / capTot) * 100 : mean("soc");
    const SOC = pick("entity_soc", socDerived);
    const REM = kwh ? (T.entity_capacity_remaining ? toKwh(T.entity_capacity_remaining) : pick("", sum("energyRemaining")))
                    : pick("entity_capacity_remaining", capRemSum);
    const CAP = kwh ? (T.entity_capacity_total ? toKwh(T.entity_capacity_total) : pick("", sum("energyTotal")))
                    : pick("entity_capacity_total", capTot);
    const capUnit = kwh ? "kWh" : "Ah";
    const vxa = V && A && Number.isFinite(V.n) && Number.isFinite(A.n) && V.text === null && A.text === null ? V.n * A.n : null;
    const PWR = pick("entity_power", vxa !== null ? vxa : sum("power"));
    // Extra display entities, set: they win over what the packs give.
    const X = {};
    for (const [key] of EXTRAS) { const t = this._total(c[key], st); if (t) X[key] = t; }
    const xNum = (key) => { const t = X[key]; const n = t && t.text === null ? parseFloat(t.value) : NaN; return Number.isFinite(n) ? n : null; };
    const xState = (key) => { const t = X[key]; return t ? (t.text !== null ? t.text : t.value) : undefined; };
    const cellV = (n) => (n === null ? null : n > 100 ? n / 1000 : n);   // mV sensors read as V
    const cellMax = X.entity_cell_max ? cellV(xNum("entity_cell_max")) : vals("cellMax").length ? Math.max(...vals("cellMax")) : null;
    const cellMin = X.entity_cell_min ? cellV(xNum("entity_cell_min")) : vals("cellMin").length ? Math.min(...vals("cellMin")) : null;
    const temps = packs.map((p) => p.temp && p.temp.shown).filter(fin);
    const temp = X.entity_temperature ? xNum("entity_temperature") : temps.length ? Math.max(...temps) : null;
    const watchedPacks = packs.filter((p) => p.alarm !== null);
    const watched = X.entity_alarm ? [true] : watchedPacks;
    const alarms = X.entity_alarm ? (isOn(xState("entity_alarm"), true) ? 1 : 0) : watchedPacks.filter((p) => p.alarm).length;
    const alarmText = X.entity_alarm ? "Alarm" : alarms === 1 ? "1 pack" : `${alarms} packs`;
    const sw = (k) => {
      const key = k === "charge" ? "entity_charge" : "entity_discharge";
      if (X[key]) return isOn(xState(key)) ? ["ON", ""] : ["OFF", "red"];
      const known = packs.filter((p) => p[k] !== null);
      if (!known.length) return null;
      const on = known.filter((p) => p[k]).length;
      return on === known.length ? ["ON", ""] : on === 0 ? ["OFF", "red"] : [`${on}/${known.length}`, "amber"];
    };
    const chg = sw("charge"), dch = sw("discharge");
    const packCount = X.entity_pack_count ? xNum("entity_pack_count") : this._packCfgs.length || null;

    const attrs = (t) => `${t && t.entity ? ` data-entity="${esc(t.entity)}" role="button"` : ""}${t && t.error ? ` title="${esc(t.error)}"` : ""}`;
    const show = (t, d, unit, scale = 1) => (t.text !== null ? esc(t.text) : `${fmt(Number.isFinite(t.n) ? t.n / scale : NaN, d)}${unit}`);
    const item = (label, html, t, cls = "") => (html === null ? "" : `<span${attrs(t)}>${label}<span class="v ${cls}">${html}</span></span>`);

    const socN = SOC && SOC.text === null && Number.isFinite(SOC.n) ? Math.max(0, Math.min(100, SOC.n)) : null;
    const top = [
      V ? `<span${attrs(V)}><span class="ico">V</span>Vtg.: <span class="v big">${show(V, 2, "V")}</span></span>` : "",
      A ? `<span${attrs(A)}><span class="ico">A</span>Cur.: <span class="v big">${show(A, 1, "A")}</span></span>` : "",
    ].join("");
    const capDec = (n) => (Math.abs(n) >= 100 ? 0 : 1);
    const mid = [
      SOC ? `<div class="ring"${attrs(SOC)}><span class="arc" style="background:${socN === null ? "#1c1c1c" : ringGradient(socN)}"></span><span class="pct">${SOC.text !== null ? esc(SOC.text) : `${fmt(socN === null ? NaN : socN, 0)}%`}</span></div>` : "",
      CAP ? `<div class="cap"${attrs(CAP)}><span class="v">${CAP.text !== null ? esc(CAP.text) : fmt(CAP.n, capDec(CAP.n || 0))}</span><span class="k">Bat-Capacity(${capUnit})</span></div>` : "",
      REM ? `<div class="cap"${attrs(REM)}><span class="v">${REM.text !== null ? esc(REM.text) : fmt(REM.n, capDec(REM.n || 0))}</span><span class="k">Rem-Capacity(${capUnit})</span></div>` : "",
    ].join("");
    const col = (a, b) => (a || b ? `<div class="col">${a}${b}</div>` : "");
    const bot = [
      col(item("Max.Cell:", cellMax === null ? null : `${fmt(cellMax, 3)}V`, X.entity_cell_max), item("Min.Cell:", cellMin === null ? null : `${fmt(cellMin, 3)}V`, X.entity_cell_min)),
      col(item("Temp:", temp === null ? null : `${fmt(temp, 0)}°`, X.entity_temperature), PWR ? item("Pwr(kW):", show(PWR, 2, "", 1000), PWR) : ""),
      col(watched.length ? item("Alarm:", alarms ? "Alarm" : "Normal", X.entity_alarm, alarms ? "red" : "") : "", packCount ? item("Packs:", fmt(packCount, 0), X.entity_pack_count) : ""),
      col(chg ? item("CHG:", chg[0], X.entity_charge, chg[1]) : "", dch ? item("DCH:", dch[0], X.entity_discharge, dch[1]) : ""),
    ].filter(Boolean);
    if (!top && !mid && !bot.length) return "";
    if (c.bank_display_size === "compact") {
      // Always the same shape: the SOC ring on the left, the four headline
      // figures 2 × 2 on the right as "Vtg: 53.39V", all scaling with the
      // display's width; an alarm gets its own line underneath.
      const cell = (label, html, t) => (html === null ? "" : `<span class="c"${attrs(t)}><span class="k">${label}:</span><span class="v">${html}</span></span>`);
      const cells = [
        V ? cell("Vtg", show(V, 2, "V"), V) : "",
        A ? cell("Cur", show(A, 1, "A"), A) : "",
        PWR ? cell("Pwr", show(PWR, 2, "kW", 1000), PWR) : "",
        REM ? cell("Rem", REM.text !== null ? esc(REM.text) : `${fmt(REM.n, capDec(REM.n || 0))}${capUnit}`, REM) : "",
      ].join("");
      return `<div class="jk compact">
        ${SOC ? `<div class="ring sm"${attrs(SOC)}><span class="arc" style="background:${socN === null ? "#1c1c1c" : ringGradient(socN)}"></span><span class="pct">${SOC.text !== null ? esc(SOC.text) : `${fmt(socN === null ? NaN : socN, 0)}%`}</span></div>` : ""}
        ${cells ? `<div class="grid4">${cells}</div>` : ""}
        ${alarms ? `<div class="alarmline"${attrs(X.entity_alarm)}>Alarm: <span class="v red">${esc(alarmText)}</span></div>` : ""}
      </div>`;
    }
    return `<div class="jk">
      ${top ? `<div class="top">${top}</div>` : ""}
      ${mid ? `<div class="mid">${mid}</div>` : ""}
      ${bot.length ? `<div class="bot" style="--cols:${bot.length}">${bot.join("")}</div>` : ""}
    </div>`;
  }

  // One bank total: an entity's state, or a template's rendered result. A
  // plain number is formatted with its unit and decimals; anything
  // else a template returns (say "1,234 Ah") is shown as it is. null = no tile.
  _total(setting, st) {
    if (!setting) return null;
    if (isTpl(setting)) {
      const e = this._tpl && this._tpl.get(setting);
      const r = e && !e.error ? e.result : undefined;
      const entity = (e && e.entities[0]) || null;
      if (r === undefined || r === null) return { value: NaN, text: null, unit: "", entity, error: e && e.error };
      const str = typeof r === "object" ? JSON.stringify(r) : String(r).trim();
      const numeric = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(str);
      return { value: numeric ? str : NaN, text: numeric ? null : str, unit: "", entity, error: null };
    }
    const e = st[setting];
    if (!e) return null;
    return { value: e.state, text: null, unit: e.attributes && e.attributes.unit_of_measurement, entity: setting, error: null };
  }

  _renderLegend(sums, extremes) {
    const first = sums.find(Boolean);
    if (!first) return "";
    const c0 = this._packCfgs[0] || {};
    const warn = Number(c0.delta_warn) || 5, bad = Number(c0.delta_bad) || 15;
    const [w, b] = [warn, bad].sort((x, y) => x - y);
    const anyDelta = sums.some((s) => s && s.deltaMv !== null);
    const anyAlarm = sums.some((s) => s && s.alarm !== null);
    return `<div class="legend">
      ${anyDelta ? `<span><b class="sw ok"></b>ok</span><span><b class="sw d-warn"></b>Δ ≥ ${w} mV</span><span><b class="sw d-bad"></b>Δ ≥ ${b} mV</span>` : ""}
      ${anyAlarm ? `<span><b class="sw alarm"></b>alarm</span>` : ""}
      ${extremes ? `<span><b class="sw min"></b>lowest SOC</span><span><b class="sw max"></b>highest SOC</span>` : ""}
    </div>`;
  }

  // ─── Detail ─────────────────────────────────────────────────────────────

  _makeDetail(i) {
    const card = document.createElement("battery-pack-card");
    card._noAlerts = true;
    card.setConfig(this._packCfgs[i]);
    if (this._hass) card.hass = this._hass;
    this._detailCard = card;
    return card;
  }

  _dropDetail() {
    this._detailCard = null;
    if (this._detail) { this._detail.classList.remove("open"); this._detail.firstElementChild.innerHTML = ""; }
    const body = this.shadowRoot && this.shadowRoot.getElementById("dlg-body");
    if (body) body.innerHTML = "";
  }

  _markOpen() {
    (this._boxes || []).forEach((b, i) => {
      b.classList.toggle("open", i === this._open);
      b.setAttribute("aria-expanded", String(i === this._open));
    });
  }

  // One detail row for the whole grid, slotted (CSS order) right after the
  // last box of the tapped box's row, so it opens underneath that row.
  _placeDetail() {
    if (this._open < 0 || !this._detail) return;
    const cols = getComputedStyle(this._cab).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const rowEnd = Math.min(this._boxes.length - 1, Math.floor(this._open / cols) * cols + cols - 1);
    this._detail.style.order = String(rowEnd * 2 + 1);
  }

  _toggleInline(i) {
    if (this._open === i) {
      this._open = -1;
      this._detail.classList.remove("open");
      this._markOpen();
      setTimeout(() => { if (this._open < 0) this._dropDetail(); }, 260);
      return;
    }
    const wasOpen = this._open >= 0;
    this._open = i;
    this._markOpen();
    this._placeDetail();
    const slot = this._detail.firstElementChild;
    slot.innerHTML = "";
    slot.appendChild(this._makeDetail(i));
    if (wasOpen) this._detail.classList.add("open");
    else requestAnimationFrame(() => requestAnimationFrame(() => this._detail.classList.add("open")));
  }

  _showPopup(i) {
    this._open = i;
    this._markOpen();
    const body = this.shadowRoot.getElementById("dlg-body");
    body.innerHTML = "";
    body.appendChild(this._makeDetail(i));
    this._dlg.querySelector(".nav").hidden = this._packCfgs.length < 2;
    if (!this._dlg.open) this._dlg.showModal();
  }
}

const CSS = `
  :host {
    display: block;
    --clr-green: #4caf50; --clr-amber: #ffc107; --clr-orange: #ff9800;
    --clr-red: #ef5350; --clr-blue: #42a5f5; --clr-purple: #ab47bc; --clr-grey: #9e9e9e;
  }
  ha-card { display: block; padding: 18px 18px 14px; container-type: inline-size; }
  [data-entity] { cursor: pointer; }
  .s-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
  .s-hr { display: flex; align-items: center; gap: 4px; }
  .s-title { font-size: 20px; font-weight: 600; letter-spacing: 0.3px; }
  .s-head .alarm { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 4px 12px; border-radius: 14px; white-space: nowrap; }
  .s-head .alarm.ok    { color: var(--clr-green); background: rgba(76,175,80,0.13); }
  .s-head .alarm.alert { color: var(--clr-red);   background: rgba(239,83,80,0.18); }
  .s-head .alarm .dot  { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; }
  .empty { font-size: 13px; opacity: 0.7; padding: 8px 0; }
  .empty.warn { opacity: 1; color: var(--clr-red); line-height: 1.4; }

  /* The cabinet: at most --max-cols boxes per row, fewer once a box would
     drop below --box-min (same rule as the cell grid). */
  .cabinet {
    --gap: 6px;
    display: grid; gap: var(--gap);
    grid-template-columns: repeat(auto-fit, minmax(
      min(100%, max(var(--box-min, 130px), calc((100% - (var(--max-cols, 4) - 1) * var(--gap)) / var(--max-cols, 4) - 0.1px))), 1fr));
    padding: 10px 14px; border-radius: 10px;
    background:
      repeating-linear-gradient(180deg, transparent 0 7px, rgba(255,255,255,0.05) 7px 8px) left / 6px 100% no-repeat,
      repeating-linear-gradient(180deg, transparent 0 7px, rgba(255,255,255,0.05) 7px 8px) right / 6px 100% no-repeat,
      linear-gradient(#141414, #101010);
    border: 1px solid rgba(255,255,255,0.07);
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.6);
  }
  .cabinet:empty { display: none; }
  .cabinet[hidden] { display: none; }   /* the grid display above would override [hidden] */
  /* One column, as wide as box_min_width but never narrower than 220px; the
     cabinet grows with it, so the packs stay inside it and centred. */
  .cabinet.single { --gap: 3px; }

  /* One pack: the front of its case. Sizes are in cqw so the whole face
     scales with the box. */
  .box {
    all: unset; box-sizing: border-box; cursor: pointer; position: relative;
    aspect-ratio: 4 / 3; container-type: inline-size; color: #fff;
    font-family: inherit; border-radius: 5px;
    background: linear-gradient(170deg, #2b2b2b 0%, #1d1d1d 45%, #171717 100%);
    border: 1px solid rgba(255,255,255,0.09);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), inset 5px 0 0 rgba(0,0,0,0.25), 0 3px 6px rgba(0,0,0,0.5);
    transition: filter 0.15s;
  }
  .box:hover { filter: brightness(1.18); }
  .box:focus-visible { outline: 2px solid var(--clr-blue); outline-offset: 2px; }
  .box.open { outline: 2px solid var(--primary-color, #03a9f4); outline-offset: 2px; }
  .box.min { border: 2px solid var(--clr-red);   box-shadow: 0 0 12px rgba(239,83,80,0.4), inset 0 1px 0 rgba(255,255,255,0.1); }
  .box.max { border: 2px solid var(--clr-green); box-shadow: 0 0 12px rgba(76,175,80,0.4), inset 0 1px 0 rgba(255,255,255,0.1); }

  .term { position: absolute; top: 6%; width: 14%; aspect-ratio: 1; border-radius: 2px; display: grid; place-items: center; }
  .term::after {
    content: ""; width: 46%; aspect-ratio: 1; border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #f2f2f2, #9a9a9a 60%, #5c5c5c);
    box-shadow: 0 0 0 1.5px rgba(0,0,0,0.5);
  }
  .term.neg { left: 6%;  background: #0d0d0d; box-shadow: inset 0 0 0 1.5px #3a3a3a; }
  .term.pos { right: 6%; background: linear-gradient(#ff8a2b, #e0650c); box-shadow: inset 0 0 0 1.5px rgba(0,0,0,0.25); }
  .sign { position: absolute; top: 23%; font-size: 9cqw; font-weight: 700; opacity: 0.55; line-height: 1; }
  .sign.neg { left: 10.5%; } .sign.pos { right: 10%; }
  .breaker { position: absolute; left: 8%; top: 38%; width: 8%; height: 22%; border-radius: 2px; background: #0c0c0c; box-shadow: inset 0 0 0 1px #333; }
  .breaker::after { content: ""; position: absolute; left: 30%; right: 30%; top: 22%; height: 30%; background: #444; border-radius: 1px; }
  .box.idle .breaker::after { top: 50%; }

  /* The screen, tinted like a cell tile. */
  .screen {
    position: absolute; left: 23%; right: 23%; top: 9%; height: 52%;
    border-radius: 3px; padding: 5% 6%; box-sizing: border-box;
    --tint: rgba(76,175,80,0.24);
    background: linear-gradient(var(--tint), var(--tint)), #0c0c0c;
    border: 1.5px solid #050505;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 8px 14px rgba(255,255,255,0.04);
    display: flex; flex-direction: column; justify-content: space-evenly; text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .box.d-warn .screen { --tint: rgba(255,214,0,0.26); }
  .box.d-bad  .screen { --tint: rgba(255,120,0,0.34); }
  .box.alarm  .screen { --tint: rgba(239,60,60,0.42); }
  .scr-big { font-size: 12.5cqw; font-weight: 700; line-height: 1; }
  .scr-big small { font-size: 0.6em; margin-left: 1px; opacity: 0.7; }
  .scr-bar { height: 5%; min-height: 3px; border-radius: 2px; background: rgba(0,0,0,0.45); overflow: hidden; }
  .scr-bar i { display: block; height: 100%; width: var(--soc); background: var(--sc); }
  .scr-line { font-size: 5.8cqw; line-height: 1.15; opacity: 0.85; white-space: nowrap; overflow: hidden; }
  .scr-line .u { opacity: 0.55; }

  .plabel {
    position: absolute; right: 6%; top: 66%; max-width: 62%;
    font-size: 7.5cqw; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
    color: rgba(255,255,255,0.8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .pfoot {
    position: absolute; left: 6%; right: 6%; bottom: 7%;
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 5.6cqw; letter-spacing: 0.04em; color: rgba(255,255,255,0.55);
  }
  .leds { display: flex; gap: 6cqw; align-items: center; }
  .leds span { display: flex; align-items: center; gap: 1.8cqw; }
  .leds i { width: 3.6cqw; aspect-ratio: 1; border-radius: 50%; background: #333; }
  .leds .run.on { background: var(--clr-green); box-shadow: 0 0 5px var(--clr-green); }
  .leds .alm.on { background: var(--clr-red); box-shadow: 0 0 6px var(--clr-red); animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { opacity: 0.25; } }
  .ports { display: flex; gap: 1.6cqw; }
  .ports i { width: 6cqw; height: 4.4cqw; background: #0b0b0b; border: 1px solid #333; border-radius: 1px; }
  .ports i.dry { background: #3d9a4a; border-color: #2c6e35; }
  @container (max-width: 115px) { .scr-line, .ports { display: none; } }

  /* The rack: the display bezel on top of the cabinet, both the same width.
     In single stack it's as wide as one pack plus the cabinet's padding. */
  #rack.single { max-width: calc(max(220px, var(--box-min, 130px)) + 30px); margin: 0 auto; }
  .mounted { position: relative; padding: 9px 9px 10px; border-radius: 10px 10px 0 0; border: 1px solid rgba(255,255,255,0.08); border-bottom: 0;
    background: linear-gradient(#262626, #1a1a1a); }
  .mounted[hidden] { display: none; }
  .mounted::before, .mounted::after { content: ""; position: absolute; top: 4px; width: 4px; height: 4px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #bbb, #555); }
  .mounted::before { left: 4px; } .mounted::after { right: 4px; }
  #rack.has-disp .cabinet { border-radius: 0 0 10px 10px; }
  /* Display only (no packs): the bezel is the whole device */
  #rack.no-packs .mounted { border-radius: 10px; border-bottom: 1px solid rgba(255,255,255,0.08); }

  /* Compact display: ring left, 2 × 2 figures right, scaling with the width */
  .jk.compact { display: grid; grid-template-columns: auto 1fr; align-items: center; column-gap: clamp(6px, 5cqw, 28px); row-gap: 4px; padding: 8px clamp(8px, 4cqw, 12px); }
  .jk.compact .ring.sm { width: clamp(36px, 16cqw, 76px); height: clamp(36px, 16cqw, 76px); }
  .jk.compact .ring.sm .arc { -webkit-mask: radial-gradient(farthest-side, transparent 72%, #000 73%);
                                      mask: radial-gradient(farthest-side, transparent 72%, #000 73%); }
  .jk.compact .ring.sm .pct { inset: 18%; font-size: clamp(9px, 4cqw, 17px); }
  .jk.compact .grid4 { display: grid; grid-template-columns: auto auto; justify-content: space-between; align-items: baseline; gap: clamp(2px, 1.6cqw, 10px) clamp(6px, 3cqw, 24px); min-width: 0; }
  .jk.compact .c { display: flex; align-items: baseline; gap: clamp(2px, 0.8cqw, 5px); min-width: 0; white-space: nowrap; }
  .jk.compact .c .k { font-size: clamp(8px, 3.4cqw, 15px); }
  .jk.compact .c .v { margin: 0; font-size: clamp(9.5px, 5.2cqw, 24px); overflow: hidden; text-overflow: ellipsis; }
  .jk.compact .alarmline { grid-column: 1 / -1; font-size: clamp(11px, 3.4cqw, 14px); }

  /* The display itself, after the JK BMS screen: black, white labels, light
     green figures (sampled from the JK screen), the SOC ring. */
  .jk {
    container-type: inline-size; color: #fff; background: #070707; border-radius: 3px; padding: 12px 14px;
    box-shadow: inset 0 0 0 2px #000, 0 0 0 1px rgba(255,255,255,0.06);
    font-family: "Roboto Condensed", "Arial Narrow", var(--paper-font-body1_-_font-family, system-ui), sans-serif; font-stretch: condensed;
  }
  .jk .v { color: #84fa5c; font-weight: 700; font-variant-numeric: tabular-nums; margin-left: 3px; }
  .jk .v.red { color: #ff3b30; } .jk .v.amber { color: var(--clr-amber); }
  .jk [data-entity] { cursor: pointer; }
  .jk .top { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .jk .top > span { display: flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 15px; }
  .jk .top .v.big { font-size: 26px; line-height: 1; margin-left: 0; }
  .jk .ico { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; border: 1.5px solid #84fa5c; color: #84fa5c; font-size: 11px; font-weight: 700; flex: none; }
  .jk .mid { display: grid; grid-template-columns: auto 1fr 1fr; align-items: center; gap: 10px; margin: 10px 0 8px; }
  .jk .ring { position: relative; width: 92px; height: 92px; }
  .jk .ring .arc { position: absolute; inset: 0; border-radius: 50%;
    -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 15px), #000 calc(100% - 14.5px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 15px), #000 calc(100% - 14.5px)); }
  .jk .ring .pct { position: absolute; inset: 15px; border-radius: 50%; display: grid; place-items: center; font-size: 20px; font-weight: 700; background: #0c0c0c; box-shadow: 0 0 0 1px #2a2a2a; }
  .jk .cap { text-align: center; }
  .jk .cap .v { display: block; font-size: 34px; line-height: 1; margin: 0; }
  .jk .cap .k { font-size: 10.5px; font-weight: 600; white-space: nowrap; }
  .jk .bot { display: grid; grid-template-columns: repeat(var(--cols, 4), auto); justify-content: space-between; gap: 4px 12px; font-size: 13px; white-space: nowrap; }
  .jk .bot .col { display: flex; flex-direction: column; gap: 4px; }
  .jk .bot .v { font-size: 15px; }
  @container (max-width: 380px) {
    .jk { padding: 10px 11px; }
    .jk .top > span { font-size: 12px; gap: 4px; }
    .jk .top .v.big { font-size: 20px; }
    .jk .ico { width: 16px; height: 16px; font-size: 9px; }
    .jk .mid { gap: 6px; margin: 8px 0 6px; }
    .jk .ring { width: 74px; height: 74px; }
    .jk .ring .pct { font-size: 16px; inset: 12px; }
    .jk .ring .arc { -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11.5px));
                             mask: radial-gradient(farthest-side, transparent calc(100% - 12px), #000 calc(100% - 11.5px)); }
    .jk .cap .v { font-size: 27px; }
    .jk .cap .k { font-size: 9px; }
    .jk .bot { grid-template-columns: repeat(2, auto); font-size: 11.5px; gap: 6px 10px; }
    .jk .bot .col { gap: 3px; }
    .jk .bot .v { font-size: 13px; }
  }

  /* Inline detail: a full-width grid row under the tapped box's row. */
  .bdetail {
    order: 9999; grid-column: 1 / -1; display: grid; grid-template-rows: 0fr;
    margin-top: calc(-1 * var(--gap)); transition: grid-template-rows 0.25s ease, margin 0.25s;
  }
  .bdetail.open { grid-template-rows: 1fr; margin-top: 0; }
  .bdetail > div { overflow: hidden; min-height: 0; }
  .bdetail battery-pack-card { display: block; margin: 4px 0; border: 1px solid var(--primary-color, #03a9f4); border-radius: var(--ha-card-border-radius, 12px); }
  .cabinet.single .bdetail { width: min(560px, calc(100cqw - 36px)); justify-self: center; }

  .legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; font-size: 11px; opacity: 0.65; margin-top: 10px; }
  .legend:empty { display: none; }
  .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .sw.ok { background: rgba(76,175,80,0.55); }
  .sw.d-warn { background: rgba(255,214,0,0.6); }
  .sw.d-bad { background: rgba(255,120,0,0.75); }
  .sw.alarm { background: rgba(239,60,60,0.85); }
  .sw.min { border: 2px solid var(--clr-red); width: 7px; height: 7px; }
  .sw.max { border: 2px solid var(--clr-green); width: 7px; height: 7px; }

  dialog {
    padding: 0; border: 0; border-radius: 14px; color: var(--primary-text-color);
    background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
    width: min(600px, calc(100vw - 32px)); max-height: calc(100vh - 48px);
    box-shadow: 0 12px 48px rgba(0,0,0,0.6);
  }
  dialog::backdrop { background: rgba(0,0,0,0.6); }
  .dlg-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 0 12px; }
  .dlg-bar button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: 6px; font-size: 13px; color: var(--secondary-text-color); font-family: inherit; }
  .dlg-bar button:hover { background: rgba(127,127,127,0.12); color: var(--primary-text-color); }
  .dlg-bar button:focus-visible { outline: 2px solid var(--clr-blue); }
  .nav { display: flex; gap: 4px; }
  #dlg-body battery-pack-card { display: block; }
`;

// ─── Editor ───────────────────────────────────────────────────────────────
// "Bank" tab for the stack's own options; one tab per pack, each holding the
// regular battery-pack-card editor for that pack's config.

const ENT = { entity: { domain: "sensor" } };
const BANK_SCHEMA = [
  { name: "name", selector: { text: {} } },
  {
    type: "grid", name: "", schema: [
      { name: "layout", selector: { select: { mode: "dropdown", options: [
        { value: "grid", label: "Cabinet grid" }, { value: "stack", label: "Single stack" }] } } },
      { name: "detail", selector: { select: { mode: "dropdown", options: [
        { value: "inline", label: "Under the pack" }, { value: "popup", label: "Popup" }] } } },
      { name: "columns", selector: { number: { min: 1, max: 8, step: 1, mode: "box" } } },
      { name: "box_min_width", selector: { number: { min: 90, max: 320, step: 5, mode: "box", unit_of_measurement: "px" } } },
      { name: "highlight_soc", selector: { boolean: {} } },
      { name: "show_legend", selector: { boolean: {} } },
      { name: "show_bank_display", selector: { boolean: {} } },
      { name: "capacity_unit", selector: { select: { mode: "dropdown", options: [{ value: "Ah", label: "Ah (charge)" }, { value: "kWh", label: "kWh (energy)" }] } } },
      { name: "bank_display_size", selector: { select: { mode: "dropdown", options: [{ value: "full", label: "Full" }, { value: "compact", label: "Compact (one line)" }] } } },
      { name: "nominal_voltage", selector: { number: { min: 1, max: 1000, step: 0.1, mode: "box", unit_of_measurement: "V" } } },
    ],
  },
];
const LABELS = {
  name: "Title",
  layout: "Layout",
  detail: "Pack details open",
  columns: "Max packs per row",
  box_min_width: "Min pack width",
  highlight_soc: "Red / green border on lowest / highest SOC pack",
  show_legend: "Show colour legend",
  show_bank_display: "Show the bank display",
  capacity_unit: "Capacity shown in",
  bank_display_size: "Bank display",
  nominal_voltage: "Nominal voltage for kWh (blank = from the packs)",
  entity_capacity_total: "Bank total capacity",
  entity_cell_max: "Highest cell voltage",
  entity_cell_min: "Lowest cell voltage",
  entity_temperature: "Temperature",
  entity_alarm: "Alarm (on / non-zero / a warning text = alarm)",
  entity_pack_count: "Number of packs",
  entity_charge: "Charge switch (CHG)",
  entity_discharge: "Discharge switch (DCH)",
  entity_soc: "Bank SOC",
  entity_voltage: "Bank voltage",
  entity_current: "Bank current",
  entity_power: "Bank power",
  entity_capacity_remaining: "Bank remaining capacity",
};

class BatteryStackedPackCardEditor extends HTMLElement {
  constructor() {
    super();
    this._tab = -1;   // -1 = Bank, -2 = Alerts, otherwise a pack index
    this._totRows = [];            // bank totals: entity-or-template fields
    this._tplForced = new Set();   // switched to template mode but still empty
    this._tplStash = {};           // templates set aside when switching back to an entity
  }

  setConfig(config) {
    this._config = { ...config, packs: Array.isArray(config.packs) ? [...config.packs] : [] };
    if (this._tab >= this._config.packs.length) this._tab = -1;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._packEditor) this._packEditor.hass = hass;
    this._render();
  }

  _dispatch(config) {
    this._config = config;
    const ev = new Event("config-changed", { bubbles: true, composed: true });
    ev.detail = { config };
    this.dispatchEvent(ev);
  }

  _setPacks(packs, tab) {
    if (tab !== undefined) this._tab = tab;
    this._dispatch({ ...this._config, packs });
    this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._mounted) this._mount();
    this._renderTabs();
    const bank = this._tab === -1, alerts = this._tab === -2;
    this._bankPane.hidden = !bank;
    this._packPane.hidden = this._tab < 0;
    this._alertsPane.hidden = !alerts;
    if (alerts) {
      this._packEditor = null;
      this._packSlot.innerHTML = "";
      this._packEditorFor = -1;
      if (!customElements.get("battery-pack-card-alerts-editor")) {
        this._alertsPane.textContent = "Alerts need battery-pack-card.js v2 or newer.";
        return;
      }
      if (!this._alertsEd) {
        this._alertsEd = document.createElement("battery-pack-card-alerts-editor");
        this._alertsEd.addEventListener("alerts-changed", (e) => { e.stopPropagation(); this._dispatch({ ...this._config, alerts: e.detail.alerts }); });
        this._alertsPane.appendChild(this._alertsEd);
      }
      // Headless pack cards, as the card itself uses, so the alerts cover the
      // same entities; rebuilt when the packs change.
      const Pack = customElements.get("battery-pack-card");
      const cfgs = packConfigs({ ...DEFAULTS, ...this._config });
      const sig = JSON.stringify(cfgs);
      if (sig !== this._alertSrcSig) {
        this._alertSrcSig = sig;
        this._alertSrcs = cfgs.map((c) => Pack.summarySource(c, () => {}));
      }
      this._alertSrcs.forEach((src) => { src.hass = this._hass; });
      this._alertsEd.inputs = () => this._alertSrcs.map((src) => src.alertInputs()).filter(Boolean);
      this._alertsEd.config = this._config;
      this._alertsEd.hass = this._hass;
      return;
    }
    if (bank) {
      this._packEditor = null;
      this._packSlot.innerHTML = "";
      this._packEditorFor = -1;
      this._bankForm.hass = this._hass;
      this._bankForm.schema = BANK_SCHEMA;
      this._bankForm.data = { ...DEFAULTS, ...this._config };
      this._updateTotalRows();
      this._updateFound();
      return;
    }
    const i = this._tab, packs = this._config.packs;
    this._packPane.querySelector('[data-act="left"]').disabled = i === 0;
    this._packPane.querySelector('[data-act="right"]').disabled = i === packs.length - 1;
    // A fresh pack editor per pack: it keeps per-field UI state (template
    // toggles) that must not carry over to the next pack.
    if (this._packEditorFor !== i || !this._packEditor) {
      this._packEditorFor = i;
      this._packSlot.innerHTML = "";
      if (!customElements.get("battery-pack-card-editor")) {
        this._packSlot.textContent = "battery-pack-card.js is not loaded.";
        return;
      }
      const ed = document.createElement("battery-pack-card-editor");
      ed._noAlerts = true;   // the alerts are set for the whole stack
      ed.addEventListener("config-changed", (e) => {
        e.stopPropagation();   // a pack's config, not this card's
        const next = [...this._config.packs];
        next[this._packEditorFor] = e.detail.config;
        this._dispatch({ ...this._config, packs: next });
        this._renderTabs();
      });
      this._packEditor = ed;
      this._packSlot.appendChild(ed);
    }
    this._packEditor.hass = this._hass;
    this._packEditor.setConfig(packs[i] || {});
  }

  _mount() {
    this._mounted = true;
    this.innerHTML = `
      <style>
        battery-stacked-pack-card-editor { display: block; }
        .bspc-tabs { display: flex; flex-wrap: wrap; gap: 2px; border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.12)); margin-bottom: 12px; }
        .bspc-tab {
          padding: 9px 14px; cursor: pointer; border: none; background: none; font: 500 14px/1.2 inherit;
          color: var(--secondary-text-color); border-bottom: 2px solid transparent; font-family: inherit;
        }
        .bspc-tab:hover { color: var(--primary-text-color); }
        .bspc-tab.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
        .bspc-tab.add { color: var(--primary-color); }
        .bspc-title {
          font-size: 12px; font-weight: 600; letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--secondary-text-color); margin: 18px 0 6px; padding-bottom: 4px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.08));
        }
        .bspc-hint { font-size: 12px; color: var(--secondary-text-color); margin: 4px 0 10px; line-height: 1.4; }
        .bspc-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .bspc-tools button {
          font: 500 13px/1 inherit; font-family: inherit; padding: 7px 10px; border-radius: 6px; cursor: pointer;
          color: var(--primary-text-color); background: none; border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
        }
        .bspc-tools button:disabled { opacity: 0.4; cursor: default; }
        .bspc-tools button.danger { color: var(--error-color, #db4437); }
        .bspc-form-totals { display: grid; gap: 8px; }
        .bspc-ent { display: flex; align-items: center; gap: 6px; }
        .bspc-ent ha-selector { flex: 1; min-width: 0; }
        .bspc-tpl {
          flex: none; font: 600 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace; padding: 8px 7px;
          border-radius: 6px; cursor: pointer; color: var(--secondary-text-color); background: none;
          border: 1px solid var(--divider-color, rgba(0,0,0,0.15));
        }
        .bspc-tpl:hover { color: var(--primary-text-color); }
        .bspc-tpl.on { color: var(--primary-color); border-color: var(--primary-color); }
      </style>
      <div class="bspc-tabs"></div>
      <div class="bspc-bank">
        <div class="bspc-form-bank"></div>
        <div class="bspc-found" hidden>
          <div class="bspc-title">Packs found</div>
          <div class="bspc-hint"></div>
          <div class="bspc-tools"><button type="button" class="bspc-add-found"></button></div>
        </div>
        <div class="bspc-title">Bank totals</div>
        <div class="bspc-hint">Optional, for the bank display on top of the cabinet. A field left empty is worked out from the packs where possible (voltage, current, SOC, power, remaining capacity). Use { } next to a field to enter a template instead of an entity, e.g. to add up several stacks.</div>
        <div class="bspc-form-totals"></div>
        <div class="bspc-extras">
          <div class="bspc-title">More display values</div>
          <div class="bspc-hint">For a card without packs, so the display can show these too. With packs they're worked out from the packs; set here they take priority.</div>
          <div class="bspc-form-extras"></div>
        </div>
      </div>
      <div class="bspc-alerts" hidden></div>
      <div class="bspc-pack">
        <div class="bspc-tools">
          <button type="button" data-act="left">◀ Move</button>
          <button type="button" data-act="right">Move ▶</button>
          <button type="button" data-act="dup">Duplicate</button>
          <button type="button" data-act="remove" class="danger">Remove</button>
        </div>
        <div class="bspc-pack-slot"></div>
      </div>`;
    this._tabs = this.querySelector(".bspc-tabs");
    this._bankPane = this.querySelector(".bspc-bank");
    this._packPane = this.querySelector(".bspc-pack");
    this._packSlot = this.querySelector(".bspc-pack-slot");
    this._alertsPane = this.querySelector(".bspc-alerts");

    const form = (sel) => {
      const f = document.createElement("ha-form");
      f.computeLabel = (s) => LABELS[s.name] || s.name || "";
      f.addEventListener("value-changed", (ev) => this._dispatch({ ...this._config, ...ev.detail.value }));
      this.querySelector(sel).appendChild(f);
      return f;
    };
    this._bankForm = form(".bspc-form-bank");
    this.querySelector(".bspc-add-found").addEventListener("click", () => {
      if (this._found && this._found.length) this._setPacks([...this._config.packs, ...this._found]);
    });
    const totals = this.querySelector(".bspc-form-totals");
    for (const [name] of TOTALS) totals.appendChild(this._totalRow(name));
    const extras = this.querySelector(".bspc-form-extras");
    extras.style.cssText = "display:grid;gap:8px";
    for (const [name, domain] of EXTRAS) extras.appendChild(this._totalRow(name, domain === null ? { entity: {} } : { entity: { domain } }));

    this._tabs.addEventListener("click", (e) => {
      const t = e.target.closest(".bspc-tab");
      if (!t) return;
      if (t.dataset.tab === "add") {
        const packs = this._config.packs;
        // Start from the last pack: packs in one bank usually share their
        // BMS, so only the name and prefix / entities need changing.
        const base = packs.length ? { ...packs[packs.length - 1] } : {};
        base.name = `Pack ${packs.length + 1}`;
        return this._setPacks([...packs, base], packs.length);
      }
      this._tab = Number(t.dataset.tab);
      this._render();
    });
    this._packPane.querySelector(".bspc-tools").addEventListener("click", (e) => {
      const act = e.target.closest("button") && e.target.closest("button").dataset.act;
      const i = this._tab, packs = [...this._config.packs];
      if (!act || i < 0) return;
      if (act === "left" && i > 0) { [packs[i - 1], packs[i]] = [packs[i], packs[i - 1]]; this._packEditorFor = -1; this._setPacks(packs, i - 1); }
      if (act === "right" && i < packs.length - 1) { [packs[i + 1], packs[i]] = [packs[i], packs[i + 1]]; this._packEditorFor = -1; this._setPacks(packs, i + 1); }
      if (act === "dup") { packs.splice(i + 1, 0, { ...packs[i], name: `${packs[i].name || `Pack ${i + 1}`} copy` }); this._setPacks(packs, i + 1); }
      if (act === "remove") { packs.splice(i, 1); this._packEditorFor = -1; this._setPacks(packs, Math.min(i, packs.length - 1)); }
    });
  }

  // Bank totals: an entity picker, or (after { }) a template editor, as in
  // the pack card's editor.
  _totalRow(name, entSel = ENT) {
    const row = document.createElement("div");
    row.className = "bspc-ent";
    const sel = document.createElement("ha-selector");
    // Not required: HA then shows its ✕ to clear the field, instead of
    // leaving YAML or the { } switch as the only way to empty it.
    sel.required = false;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bspc-tpl";
    btn.textContent = "{ }";
    row.append(sel, btn);
    const rec = { name, sel, btn, mode: null, entSel };
    sel.addEventListener("value-changed", (ev) => { ev.stopPropagation(); this._setField(name, ev.detail.value); });
    btn.addEventListener("click", () => this._toggleTemplate(name));
    this._totRows.push(rec);
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
    this._updateTotalRows();
  }

  _toggleTemplate(name) {
    const cur = this._config[name];
    if (this._isTemplateMode(name)) {
      // Back to an entity: a plain {{ states('x') }} becomes x again; anything
      // richer is set aside for this session in case the click was a mistake.
      this._tplForced.delete(name);
      const m = typeof cur === "string" && /^\s*\{\{\s*states\(\s*['"]([\w.]+)['"]\s*\)\s*\}\}\s*$/.exec(cur);
      if (cur && !m) this._tplStash[name] = cur;
      this._setField(name, m ? m[1] : undefined);
    } else {
      this._tplForced.add(name);
      const next = this._tplStash[name] || (typeof cur === "string" && cur ? `{{ states('${cur}') }}` : undefined);
      if (next !== undefined && next !== cur) this._setField(name, next);
      else this._updateTotalRows();
    }
  }

  _updateTotalRows() {
    // The extra display values only matter without packs; keep them visible
    // when one is set anyway, so it can still be cleared.
    const ex = this.querySelector(".bspc-extras");
    if (ex) ex.hidden = this._config.packs.length > 0 && !EXTRAS.some(([k]) => this._config[k]);
    for (const r of this._totRows) {
      const tpl = this._isTemplateMode(r.name);
      r.sel.hass = this._hass;
      if (r.mode !== tpl) {   // only swap the inner selector when the mode flips
        r.mode = tpl;
        r.sel.selector = tpl ? { template: {} } : r.entSel;
        r.btn.classList.toggle("on", tpl);
        r.btn.setAttribute("aria-pressed", String(tpl));
        r.btn.title = tpl ? "Use an entity instead" : "Use a template instead of an entity";
      }
      r.sel.label = LABELS[r.name] || r.name;
      r.sel.value = this._config[r.name] ?? (tpl ? "" : undefined);
    }
  }

  // JK-BMS add-on packs in this HA that aren't in the card yet, with a button
  // to add them all (Multi-Pack names like pack_1_bms_1 included).
  _updateFound() {
    const box = this.querySelector(".bspc-found");
    const Pack = customElements.get("battery-pack-card");
    const have = new Set(this._config.packs.map((p) => p && p.prefix).filter(Boolean));
    this._found = (Pack && Pack.findPacks ? Pack.findPacks(this._hass) : []).filter((f) => !have.has(f.prefix));
    box.hidden = !this._found.length;
    if (!this._found.length) return;
    box.querySelector(".bspc-hint").textContent =
      `In Home Assistant but not in this card: ${this._found.map((f) => f.prefix).join(", ")}.`;
    box.querySelector(".bspc-add-found").textContent = `+ Add ${this._found.length === 1 ? "this pack" : `these ${this._found.length} packs`}`;
  }

  _renderTabs() {
    const packs = this._config.packs;
    const html = [`<button type="button" class="bspc-tab${this._tab === -1 ? " active" : ""}" data-tab="-1">Bank</button>`,
      `<button type="button" class="bspc-tab${this._tab === -2 ? " active" : ""}" data-tab="-2">Alerts</button>`]
      .concat(packs.map((p, i) => `<button type="button" class="bspc-tab${this._tab === i ? " active" : ""}" data-tab="${i}">${esc((p && p.name) || `Pack ${i + 1}`)}</button>`))
      .concat(`<button type="button" class="bspc-tab add" data-tab="add">+ Add pack</button>`)
      .join("");
    if (html !== this._tabsHtml) { this._tabsHtml = html; this._tabs.innerHTML = html; }
  }
}

customElements.define("battery-stacked-pack-card", BatteryStackedPackCard);
customElements.define("battery-stacked-pack-card-editor", BatteryStackedPackCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "battery-stacked-pack-card",
  name: "Battery Stacked Pack Card",
  description: "Many battery packs drawn as stacked cases; tap one for its full Battery Pack Card.",
  preview: false,
  documentationURL: "https://github.com/SvenHamers/battery-pack-card#battery-stacked-pack-card",
});

console.info(
  `%c BATTERY-STACKED-PACK-CARD %c v${VERSION} `,
  "color:#fff;background:#e0650c;font-weight:700;padding:2px 6px;border-radius:3px 0 0 3px;",
  "color:#fff;background:#555;padding:2px 6px;border-radius:0 3px 3px 0;"
);
})();
