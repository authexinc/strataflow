import { Component, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { geoDrawing, segMetres } from "./locate_geo";
import { StratalineMap } from "./strataline_map";

/**
 * The locate print: utility lines with metre labels and point notes, drawn on the live map
 * over the utilities they mark. Coordinates are geographic and persist as-is on the ticket
 * (see locate_geo.js). The toolbar picks what a drag draws; "Pan" hands the map back.
 */
export class LocateCanvas extends Component {
    static template = "strataflow_workorder.LocateCanvas";
    static components = { StratalineMap };
    static props = {
        ticket: Object, // the ticket: centre of the map, its pin
        utilities: Array, // [{code, name, color}]
        drawing: { type: Object, optional: true },
        onChange: Function,
    };
    // the site card and toolbar sit around the map, not on it; keep the pin clear of the edges
    static PADDING = { top: 60, left: 40, right: 40, bottom: 50 };

    setup() {
        this.state = useState({ tool: "pan", basemap: "streets" });
    }

    get drawing() {
        return geoDrawing(this.props.drawing);
    }

    get segments() {
        return this.drawing.segments;
    }

    get notes() {
        return this.drawing.notes;
    }

    get tools() {
        return [
            { code: "pan", name: _t("Pan"), color: "", on: this.state.tool === "pan" },
            ...this.props.utilities.map((u) => ({ ...u, on: this.state.tool === u.code })),
            { code: "note", name: _t("Note"), color: "", on: this.state.tool === "note" },
        ];
    }

    get drawTool() {
        return this.state.tool === "pan" ? false : this.state.tool;
    }

    get markers() {
        const t = this.props.ticket;
        return t?.latitude ? [{ id: t.id, name: t.name, address: t.address, status: t.status, emergency: t.emergency, latitude: t.latitude, longitude: t.longitude, on: true }] : [];
    }

    get basemaps() {
        return [
            { key: "streets", label: _t("Map"), on: this.state.basemap === "streets" },
            { key: "satellite", label: _t("Satellite"), on: this.state.basemap === "satellite" },
        ];
    }

    get hint() {
        const segs = this.segments.length;
        const notes = this.notes.length;
        if (!segs && !notes) {
            return this.state.tool === "pan" ? _t("pick a utility, then drag to draw a locate line") : this.state.tool === "note" ? _t("click to place a note") : _t("drag to draw a locate line");
        }
        const metres = this.segments.reduce((sum, s) => sum + segMetres(s), 0).toFixed(1);
        return _t("%(lines)s line(s) · %(notes)s note(s) · %(m)s m", { lines: segs, notes, m: metres });
    }

    onDraw(drawing) {
        this.props.onChange(drawing);
    }

    undo() {
        this.props.onChange({ ...this.drawing, segments: this.segments.slice(0, -1) });
    }

    clear() {
        this.props.onChange({ ...this.drawing, segments: [], notes: [] });
    }
}
