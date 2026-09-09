import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { user } from "@web/core/user";
import { StrataflowShell } from "../core/shell";
import { initials, money } from "../core/format";

const { DateTime } = luxon;

const APPS = [
    { key: "dispatch", name: _t("Dispatch"), hue: "#0f6ed8", icon: "dispatch", dispatcher: true },
    { key: "workorders", name: _t("Work Orders"), hue: "#0a9648", icon: "wo" },
    { key: "crm", name: _t("CRM"), hue: "#c08a1e", icon: "crm", dispatcher: true },
    { key: "invoices", name: _t("Invoices"), hue: "#c2453e", icon: "inv", dispatcher: true },
    { key: "locator", name: _t("Locator view"), hue: "#0e93c9", icon: "loc" },
    { key: "equipment", name: _t("Equipment"), hue: "#7a5cc4", icon: "equip", soon: true },
    { key: "timesheets", name: _t("Timesheets"), hue: "#5b6167", icon: "time", soon: true },
    { key: "reports", name: _t("Reports"), hue: "#3a7a8c", icon: "rep", soon: true },
];

export class HomeScreen extends Component {
    static template = "strataflow_workorder.Home";
    // URL segment (/odoo/<path>). Keep in step with the action's `path` in strataflow_actions.xml.
    // Not "home": stock Odoo registers a client action with the tag `home` (web/static/src/webclient/
    // actions/client_actions.js) that navigates to "/", and the URL resolver checks registry tags
    // before action paths, so /odoo/home ran that instead of this screen and looped through /.
    static path = "desk";
    static components = { StrataflowShell };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({ loading: true, stats: {}, me: { initials: initials(user.name), is_dispatcher: true } });
        onMounted(async () => {
            const [stats, board] = await Promise.all([
                this.orm.call("strataflow.workorder", "get_home_stats", []),
                this.orm.call("strataflow.workorder", "get_board_data", []),
            ]);
            this.state.stats = stats;
            this.state.me = board.me;
            this.state.loading = false;
        });
    }

    get greeting() {
        const h = DateTime.local().hour;
        const part = h < 12 ? _t("Good morning") : h < 17 ? _t("Good afternoon") : _t("Good evening");
        return `${part}, ${(user.name || "").split(" ")[0]}`;
    }

    get dateLine() {
        return DateTime.local().toFormat("cccc, LLLL d") + " · " + (user.context?.company_name || "Calgary + area");
    }

    get chips() {
        const s = this.state.stats;
        return [
            { key: "open", label: _t("%s open tickets", s.open ?? 0), dot: "new" },
            s.emergency ? { key: "emerg", label: _t("%s emergency", s.emergency), danger: true } : null,
            { key: "due", label: _t("%s due today", s.due_today ?? 0), dot: "assigned" },
            { key: "unassigned", label: _t("%s unassigned", s.unassigned ?? 0), dot: "closed" },
            { key: "shift", label: _t("%s locators on shift", s.on_shift ?? 0), dot: "located" },
        ].filter(Boolean);
    }

    get apps() {
        const s = this.state.stats;
        const dispatcher = this.state.me.is_dispatcher;
        const stat = {
            dispatch: _t("%(o)s open · %(e)s emergency", { o: s.open ?? 0, e: s.emergency ?? 0 }),
            workorders: _t("%(d)s due today · %(s)s on site", { d: s.due_today ?? 0, s: s.on_site ?? 0 }),
            crm: _t("%(l)s leads · %(q)s quotes out", { l: s.leads ?? 0, q: s.quotes ?? 0 }),
            invoices: s.uninvoiced ? _t("%(m)s outstanding · %(u)s to invoice", { m: money(s.outstanding), u: s.uninvoiced }) : _t("%s outstanding", money(s.outstanding)),
            locator: _t("route, on-site map, locate print"),
            equipment: _t("coming soon"),
            timesheets: _t("coming soon"),
            reports: _t("coming soon"),
        };
        return APPS.filter((a) => dispatcher || !a.dispatcher).map((a) => ({ ...a, stat: stat[a.key] }));
    }

    open(app) {
        if (app.soon) {
            this.notification.add(_t("%s is coming soon.", app.name), { type: "info" });
            return;
        }
        this.action.doAction({ type: "ir.actions.client", tag: `strataflow_${app.key}` }, { clearBreadcrumbs: true });
    }
}

registry.category("actions").add("strataflow_home", HomeScreen);
