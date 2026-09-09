import { Component } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { GROUP_ORDER, PRESETS, applyPreset, groupRows, groupState, layerVisible, setVisible, toggleGroup, toggleOpen, useLayers } from "./layers";

/**
 * Strataline's layer panel, in the shell's glass: presets, a filter, collapsible groups with
 * a tri-state toggle, one row per dataset with its swatch. State lives in layers.js and the
 * map applies it; this component only reads and pokes the store.
 */
export class LayerPanel extends Component {
    static template = "strataflow_workorder.LayerPanel";
    static props = { onClose: Function, aboveCard: { type: Boolean, optional: true } }; // aboveCard: stop short of a card in the bottom-right

    setup() {
        this.layers = useLayers();
    }

    get presets() {
        return PRESETS.map((p) => ({ ...p, on: this.layers.preset === p.key }));
    }

    get filter() {
        return this.layers.filter.trim().toLowerCase();
    }

    get groups() {
        const q = this.filter;
        return GROUP_ORDER.map((g) => {
            const rows = groupRows(g);
            const matches = q ? rows.filter((r) => r.search.includes(q)) : rows;
            if (!rows.length || (q && !matches.length)) {
                return null;
            }
            const open = q ? true : this.layers.open.includes(g);
            return {
                key: g, label: g, count: rows.length, state: groupState(g), open,
                rows: open ? matches.map((r) => ({ ...r, on: layerVisible(r.id) })) : [],
            };
        }).filter(Boolean);
    }

    get placeholder() {
        return _t("Filter %s layers…", this.layers.rows.length);
    }

    onFilter(ev) {
        this.layers.filter = ev.target.value;
    }
    toggleOpen(g) {
        toggleOpen(g);
    }
    toggleGroup(g) {
        toggleGroup(g);
    }
    toggleRow(r) {
        setVisible(r.id, !r.on);
    }
    preset(key) {
        applyPreset(key);
    }
}
