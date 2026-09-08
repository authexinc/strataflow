import { Component, useRef, useState } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

const PX_PER_M = 1 / 0.15; // design scale: 1 px ≈ 0.15 m
const MIN_SEG_PX = 8;

/**
 * The locate print: freehand utility lines with metre labels, plus point
 * notes, drawn over the site map. Pointer events so mouse, touch and pen all
 * work. Coordinates are canvas pixels and persist as-is on the ticket.
 */
export class LocateCanvas extends Component {
    static template = "strataflow_workorder.LocateCanvas";
    static props = {
        utilities: Array, // [{code, name, color}]
        drawing: { type: Object, optional: true }, // {segments, notes}
        onChange: Function,
    };

    setup() {
        this.svgRef = useRef("svg");
        this.noteRef = useRef("note");
        this.state = useState({
            tool: this.props.utilities[0]?.code || "note",
            basemap: "streets",
            live: null,
            noteDraft: null, // {x, y, text}
        });
    }

    get segments() {
        return this.props.drawing?.segments || [];
    }

    get notes() {
        return this.props.drawing?.notes || [];
    }

    get tools() {
        return [...this.props.utilities.map((u) => ({ ...u, on: this.state.tool === u.code })), {
            code: "note",
            name: _t("Note"),
            color: "",
            on: this.state.tool === "note",
        }];
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
            return this.state.tool === "note" ? _t("click to place a note") : _t("drag to draw a locate line");
        }
        const metres = (this.segments.reduce((sum, s) => sum + this.length(s), 0) / PX_PER_M).toFixed(1);
        return _t("%(lines)s line(s) · %(notes)s note(s) · %(m)s m", { lines: segs, notes, m: metres });
    }

    color(code) {
        return this.props.utilities.find((u) => u.code === code)?.color || "var(--ink)";
    }

    // Colour alone must not carry the utility: prefix the metre label with the class letter.
    label(seg) {
        const letter = (this.props.utilities.find((u) => u.code === seg.util)?.name || "?")[0];
        return `${letter} ${(this.length(seg) / PX_PER_M).toFixed(1)} m`;
    }

    length(seg) {
        return Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    }

    dash(seg, live) {
        return live ? "6 5" : seg.util === "gas" ? "1 8" : "none";
    }

    // ---- pointer drawing ----------------------------------------------------

    pos(ev) {
        const r = this.svgRef.el.getBoundingClientRect();
        return { x: Math.round(ev.clientX - r.left), y: Math.round(ev.clientY - r.top) };
    }

    onPointerDown(ev) {
        if (ev.button !== 0 && ev.pointerType === "mouse") {
            return;
        }
        const p = this.pos(ev);
        if (this.state.tool === "note") {
            this.state.noteDraft = { x: p.x, y: p.y, text: "" };
            requestAnimationFrame(() => this.noteRef.el?.focus());
            return;
        }
        ev.currentTarget.setPointerCapture(ev.pointerId);
        this.state.live = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, util: this.state.tool };
    }

    onPointerMove(ev) {
        if (!this.state.live) {
            return;
        }
        const p = this.pos(ev);
        this.state.live = { ...this.state.live, x2: p.x, y2: p.y };
    }

    onPointerUp() {
        const live = this.state.live;
        this.state.live = null;
        if (live && this.length(live) > MIN_SEG_PX) {
            this.commit({ segments: [...this.segments, live], notes: this.notes });
        }
    }

    onPointerCancel() {
        this.state.live = null;
    }

    commitNote() {
        const draft = this.state.noteDraft;
        this.state.noteDraft = null;
        if (draft?.text.trim()) {
            this.commit({ segments: this.segments, notes: [...this.notes, { ...draft, text: draft.text.trim() }] });
        }
    }

    onNoteKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.commitNote();
        } else if (ev.key === "Escape") {
            this.state.noteDraft = null;
        }
    }

    undo() {
        this.commit({ segments: this.segments.slice(0, -1), notes: this.notes });
    }

    clear() {
        this.state.live = null;
        this.state.noteDraft = null;
        this.commit({ segments: [], notes: [] });
    }

    commit(drawing) {
        const el = this.svgRef.el;
        const size = el ? { w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) } : this.props.drawing?.size;
        this.props.onChange({ ...drawing, size });
    }
}
