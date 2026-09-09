import { reactive, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

/**
 * Which map layers are on — one reactive store for the map and the layer panel.
 *
 * Rows come from strataline's layers.json (one per dataset; many datasets share a merged
 * style layer and are told apart by the `sub_layer` feature attribute), plus this client's own
 * basemap and reference layers. Only the user's overrides persist (localStorage), so a new
 * dataset on strataline's side is drawn by default here too.
 */

export const GROUP_ORDER = ["Gas", "Electric", "Telecom", "Water", "Sanitary", "Storm", "Notes", "Other", "Reference", "Basemap"];
export const PRESETS = [
    { key: "all", label: _t("All") },
    { key: "Gas", label: _t("Gas") },
    { key: "Electric", label: _t("Electric") },
    { key: "Telecom", label: _t("Telecom") },
    { key: "Water", label: _t("Water") },
];
const PRESET_GROUPS = { Water: ["Water", "Sanitary", "Storm"] };
const PRESET_ALWAYS = new Set(["Notes", "Other", "Reference", "Basemap"]);
// Datasets strataline's own client never draws — customer-site points (privacy) and capital
// project buffers. Should be a flag in layers.json; until it is, mirrored from map-sys
// web/app.js EXCLUDED_SUBS. Never a row, always filtered out.
export const EXCLUDED_SUBS = [
    "fortis_electric_customer", "fortis_electric_customerhub_pt", "fortis_electric_customerhub_dc_pt",
    "atco_gas_capitalproject", "atco_gas_buffer_capitalproject", "atco_gas_trans_capitalproject",
];
// Safety layers stay on: not hidden by a group toggle or a preset, never persisted off.
const SAFETY = new Set(["atco_gas_hp_pipe", "rogers_cable_highrisk"]);
const KEY = "strataflow.layers";

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        return { vis: saved.vis || {}, open: saved.open || ["Gas"], preset: saved.preset ?? "all" };
    } catch {
        return { vis: {}, open: ["Gas"], preset: "all" };
    }
}

const store = reactive({ rows: [], ...load(), filter: "", version: 0 });
let index = {};

function persist() {
    const vis = { ...store.vis };
    for (const id of SAFETY) {
        delete vis[id];
    }
    try {
        localStorage.setItem(KEY, JSON.stringify({ vis, open: store.open, preset: store.preset }));
    } catch {
        // session-only
    }
    store.version++;
}

export function useLayers() {
    return useState(store);
}

/** Rows from strataline's manifest: one per dataset, merged twins folded into their parent. */
export function rowsFromManifest(manifest) {
    const rows = [];
    for (const [id, m] of Object.entries(manifest || {})) {
        if (EXCLUDED_SUBS.includes(id) || m.mergedInto) {
            continue;
        }
        const parts = [{ sub: id, merged: m.merged }];
        for (const mid of m.members || []) {
            if (manifest[mid] && !EXCLUDED_SUBS.includes(mid)) {
                parts.push({ sub: mid, merged: manifest[mid].merged });
            }
        }
        rows.push({
            id, parts, group: m.group, kind: m.kind, color: `rgb(${m.color})`,
            name: m.name || id, subtitle: `${m.group} › ${m.dataset}`, search: `${m.name} ${id} ${m.group} ${m.dataset} ${m.company}`.toLowerCase(),
            safety: SAFETY.has(id), defaultVis: m.defaultVis !== false,
        });
    }
    return rows;
}

/** A row for one of this client's own style layers (basemap, ATS grid, addresses). */
export function ownRow(id, group, kind, color, name, extra = {}) {
    return { id, group, kind, color, name, subtitle: group, search: `${name} ${group}`.toLowerCase(), safety: false, defaultVis: true, ...extra };
}

export function registerRows(rows) {
    store.rows = rows;
    index = Object.fromEntries(rows.map((r) => [r.id, r]));
    store.version++;
}

export function layerVisible(id) {
    if (id in store.vis) {
        return store.vis[id];
    }
    return index[id]?.defaultVis ?? true;
}

export function setVisible(id, on) {
    if (!on && SAFETY.has(id)) {
        return; // safety layers do not go off
    }
    store.vis[id] = on;
    store.preset = null;
    persist();
}

export function groupRows(g) {
    return store.rows.filter((r) => r.group === g);
}

export function groupState(g) {
    const rows = groupRows(g);
    const on = rows.filter((r) => layerVisible(r.id)).length;
    return on === 0 ? "off" : on === rows.length ? "on" : "mixed";
}

export function toggleGroup(g) {
    const turnOn = groupState(g) !== "on";
    for (const r of groupRows(g)) {
        if (!turnOn && r.safety) {
            continue;
        }
        store.vis[r.id] = turnOn;
    }
    store.preset = null;
    persist();
}

export function toggleOpen(g) {
    store.open = store.open.includes(g) ? store.open.filter((x) => x !== g) : [...store.open, g];
    persist();
}

export function applyPreset(key) {
    for (const r of store.rows) {
        const wanted = key === "all" || (PRESET_GROUPS[key] || [key]).includes(r.group) || PRESET_ALWAYS.has(r.group);
        store.vis[r.id] = r.safety ? true : wanted && r.defaultVis;
    }
    store.preset = key;
    persist();
}

/** For the map: hidden datasets per merged style layer, and this client's own layers that are off. */
export function hiddenState() {
    const merged = {};
    const own = [];
    for (const r of store.rows) {
        if (r.parts) {
            for (const p of r.parts) {
                (merged[p.merged] ||= { all: [], hidden: [] }).all.push(p.sub);
                if (!layerVisible(r.id)) {
                    merged[p.merged].hidden.push(p.sub);
                }
            }
        } else if (!layerVisible(r.id)) {
            own.push(r.id);
        }
    }
    return { merged, own };
}
