import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { toggleTheme, useTheme } from "./theme";

export const NAV = [
    { key: "home", label: _t("Home") },
    { key: "dispatch", label: _t("Dispatch"), dispatcher: true },
    { key: "workorders", label: _t("Work Orders") },
    { key: "crm", label: _t("CRM"), dispatcher: true },
    { key: "invoices", label: _t("Invoices"), dispatcher: true },
];

/**
 * The Strataline glass shell every Strataflow screen sits in: faux-map ground,
 * brand + nav + search pills, avatar, theme toggle, optional footer, generic
 * skeleton while the first payload loads.
 */
export class StrataflowShell extends Component {
    static template = "strataflow_workorder.Shell";
    static props = {
        active: String,
        me: { type: Object, optional: true }, // {initials, is_dispatcher}
        loading: { type: Boolean, optional: true },
        skeleton: { type: String, optional: true }, // list | board | grid | map
        bgmap: { type: String, optional: true }, // grid | home | none
        scroll: { type: Boolean, optional: true },
        searchPlaceholder: { type: String, optional: true },
        onSearch: { type: Function, optional: true },
        locatorLink: { type: Boolean, optional: true },
        slots: { type: Object, optional: true },
    };
    static defaultProps = { skeleton: "list", bgmap: "grid", scroll: false };

    setup() {
        this.action = useService("action");
        this.notification = useService("notification");
        this.theme = useTheme();
        this.searchRef = useRef("search");
        useHotkey("control+k", () => this.searchRef.el?.focus(), { bypassEditableProtection: true });
        // safety: a stalled first request must never leave the opaque skeleton on screen
        this.guard = useState({ expired: false });
        onMounted(() => (this._skTimer = setTimeout(() => (this.guard.expired = true), 4000)));
        onWillUnmount(() => clearTimeout(this._skTimer));
    }

    get showSkeleton() {
        return this.props.loading && !this.guard.expired;
    }

    get nav() {
        const dispatcher = this.props.me?.is_dispatcher ?? true;
        return NAV.filter((n) => dispatcher || !n.dispatcher);
    }

    goNav(key) {
        if (key === this.props.active) {
            return;
        }
        const tag = `strataflow_${key}`;
        if (registry.category("actions").contains(tag)) {
            this.action.doAction({ type: "ir.actions.client", tag }, { clearBreadcrumbs: true });
        } else {
            this.notification.add(_t("%s is coming soon.", key), { type: "info" });
        }
    }

    toggleTheme() {
        toggleTheme();
    }

    openOdoo() {
        this.action.doAction({ type: "ir.actions.act_url", url: "/odoo", target: "self" });
    }
}
