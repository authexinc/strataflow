import { Component, onMounted, onWillUnmount, useEffect, useRef, useState } from "@odoo/owl";
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
        // strataline fades its skeleton out (app.css `#skeleton.sk-done`) rather than cutting it.
        // A `t-if` alone unmounts the node instantly, so hold it one transition longer: mark it
        // done, let the opacity run, then drop it.
        this.sk = useState({ mounted: true, done: false });
        useEffect(
            () => {
                if ((!this.props.loading || this.guard.expired) && !this.sk.done) {
                    this.sk.done = true;
                    this._skFade = setTimeout(() => (this.sk.mounted = false), 450);
                }
            },
            () => [this.props.loading, this.guard.expired]
        );
        onWillUnmount(() => {
            clearTimeout(this._skTimer);
            clearTimeout(this._skFade);
        });
    }

    get showSkeleton() {
        return this.sk.mounted;
    }

    get skeletonDone() {
        return this.sk.done;
    }

    get nav() {
        const dispatcher = this.props.me?.is_dispatcher ?? true;
        return NAV.filter((n) => dispatcher || !n.dispatcher);
    }

    // Each screen is its own client action, so switching destroys the old `.o_sf` before the
    // new one mounts. Fading the incoming screen in (o_sf_enter) does not hide that: for a
    // frame or two there is no screen at all, which reads as a cut with a flash in it. The
    // View Transitions API is the only way to have both frames on screen at once here — it
    // snapshots the old DOM, runs the callback, then cross-fades to the new one. Where it is
    // missing, the o_sf_enter fallback still runs and behaves exactly as before.
    goNav(key) {
        if (key === this.props.active) {
            return;
        }
        const tag = `strataflow_${key}`;
        if (!registry.category("actions").contains(tag)) {
            this.notification.add(_t("%s is coming soon.", key), { type: "info" });
            return;
        }
        const swap = () => this.action.doAction({ type: "ir.actions.client", tag }, { clearBreadcrumbs: true });
        // Reduce Motion asks for cross-fades in place of movement, so the transition stays on;
        // it is the incoming-only fade that gets switched off in the stylesheet.
        if (!document.startViewTransition) {
            swap();
            return;
        }
        // suppress o_sf_enter for this swap, or the new screen fades in twice over
        document.documentElement.classList.add("o_sf_swapping");
        const transition = document.startViewTransition(() => swap());
        transition.finished.finally(() => document.documentElement.classList.remove("o_sf_swapping"));
    }

    toggleTheme() {
        toggleTheme();
    }

    openOdoo() {
        this.action.doAction({ type: "ir.actions.act_url", url: "/odoo", target: "self" });
    }
}
