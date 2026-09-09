import { Component } from "@odoo/owl";
import { projectDrawing } from "./locate_geo";

/** A north-up print of the geo-referenced drawing, fitted into a fixed box. */
export class LocatePreview extends Component {
    static template = "strataflow_workorder.LocatePreview";
    static props = { drawing: { type: Object, optional: true }, utilities: Array };
    static W = 900;
    static H = 470;

    get print() {
        return projectDrawing(this.props.drawing, LocatePreview.W, LocatePreview.H);
    }
    get size() {
        return { w: LocatePreview.W, h: LocatePreview.H };
    }
    get segments() {
        return this.print.segments;
    }
    get notes() {
        return this.print.notes;
    }
    // the print's scale, for its caption: metres per pixel, sensibly rounded
    get scale() {
        const m = this.print.mPerPx;
        return m ? `1 px ≈ ${m < 0.1 ? m.toFixed(3) : m.toFixed(2)} m` : "";
    }
    color(code) {
        return this.props.utilities.find((u) => u.code === code)?.color || "var(--ink)";
    }
    label(seg) {
        const letter = (this.props.utilities.find((u) => u.code === seg.util)?.name || "?")[0];
        return `${letter} ${seg.metres.toFixed(1)} m`;
    }
}
