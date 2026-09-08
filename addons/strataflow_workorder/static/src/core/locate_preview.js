import { Component } from "@odoo/owl";

const PX_PER_M = 1 / 0.15;

export class LocatePreview extends Component {
    static template = "strataflow_workorder.LocatePreview";
    static props = { drawing: { type: Object, optional: true }, utilities: Array };

    get size() {
        return this.props.drawing?.size || { w: 900, h: 470 };
    }
    get segments() {
        return this.props.drawing?.segments || [];
    }
    get notes() {
        return this.props.drawing?.notes || [];
    }
    color(code) {
        return this.props.utilities.find((u) => u.code === code)?.color || "var(--ink)";
    }
    label(seg) {
        const letter = (this.props.utilities.find((u) => u.code === seg.util)?.name || "?")[0];
        return `${letter} ${(Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) / PX_PER_M).toFixed(1)} m`;
    }
}
