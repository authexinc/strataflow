import { Component } from "@odoo/owl";

export class FauxMap extends Component {
    static template = "strataflow_workorder.FauxMap";
    static props = { basemap: { type: String, optional: true }, slots: { type: Object, optional: true } };
    static defaultProps = { basemap: "streets" };
}
