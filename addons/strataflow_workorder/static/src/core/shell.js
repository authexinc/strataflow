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
// Swapping one client action for another unmounts the old screen before the new one mounts, so
// for a moment nothing of ours is on the page and Odoo's own white shows through — the blank
// flash between screens. Painting the same ground on <html> keeps something on screen across
// that gap. The class has to come off when Strataflow is left entirely (otherwise a stock Odoo
// page inherits our background), but removing it on unmount would reopen the very gap it exists
// to cover — hence the deferred removal, which the next screen's mount cancels.
let pageGroundTimer = null;

function holdPageGround(theme) {
    clearTimeout(pageGroundTimer);
    const root = document.documentElement;
    root.classList.add("o_sf_page");
    root.dataset.sfTheme = theme;
}

function releasePageGround() {
    clearTimeout(pageGroundTimer);
    pageGroundTimer = setTimeout(() => {
        document.documentElement.classList.remove("o_sf_page");
        delete document.documentElement.dataset.sfTheme;
    }, 600);
}

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
        this.pending = useState({ key: null });
        // keep the ground painted across screen swaps, and in step with the theme toggle
        useEffect(
            () => {
                holdPageGround(this.theme.theme);
            },
            () => [this.theme.theme]
        );
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
            releasePageGround();
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

    // Nav has to look pressed on the click, not when the next screen finishes mounting.
    // `props.active` belongs to the screen that is on its way out, so on its own the pill
    // does not move until the swap is over, and the click reads as having done nothing.
    get activeKey() {
        return this.pending.key || this.props.active;
    }

    // Switching screens swaps one client action for another. Deliberately not wrapped in a
    // View Transition: that snapshots the outgoing screen and holds it frozen until the
    // callback resolves, so every screen change sat on a dead frame for as long as the next
    // action took to mount — no skeleton, no spinner, nothing. Guideline — Loading: "Show
    // something as soon as possible. If you make people wait for loading to complete before
    // displaying anything, they can interpret the lack of content as a problem." The new
    // screen now mounts straight away and paints its own skeleton, which is that something.
    goNav(key) {
        if (key === this.props.active) {
            return;
        }
        const tag = `strataflow_${key}`;
        if (!registry.category("actions").contains(tag)) {
            this.notification.add(_t("%s is coming soon.", key), { type: "info" });
            return;
        }
        this.pending.key = key;
        this.action
            .doAction({ type: "ir.actions.client", tag }, { clearBreadcrumbs: true })
            .catch((err) => {
                this.pending.key = null;   // the pill must not lie about where we are
                throw err;
            });
    }

    toggleTheme() {
        toggleTheme();
    }

    openOdoo() {
        this.action.doAction({ type: "ir.actions.act_url", url: "/odoo", target: "self" });
    }
}
