import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
const { DateTime } = luxon;
import { AssignLocatorPopover } from "./assign_popover";
import { LocateCanvas } from "./locate_canvas";

const STATUS_LABEL = {
    new: _t("New"),
    assigned: _t("Assigned"),
    onsite: _t("On site"),
    located: _t("Located"),
    closed: _t("Closed"),
    invoiced: _t("Invoiced"),
};
const CHIPS = ["all", "new", "assigned", "onsite", "located", "invoiced"];
const NEXT_ACTION = {
    new: _t("Assign locator"),
    assigned: _t("Mark on site"),
    onsite: _t("Mark located"),
    located: _t("Close ticket"),
    closed: _t("Create invoice"),
    invoiced: _t("View invoice"),
};
const STAGE = { new: 0, assigned: 1, onsite: 2, located: 3, closed: 4, invoiced: 4 };
const NAV = [
    { key: "home", label: _t("Home") },
    { key: "dispatch", label: _t("Dispatch") },
    { key: "workorders", label: _t("Work Orders") },
    { key: "crm", label: _t("CRM") },
    { key: "invoices", label: _t("Invoices") },
];
const THEME_KEY = "strataflow.theme";

function readTheme() {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === "light" || saved === "dark") {
            return saved;
        }
    } catch {
        // storage blocked: fall through to the system preference
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export class WorkOrderApp extends Component {
    static template = "strataflow_workorder.WorkOrderApp";
    static components = { LocateCanvas };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.rootRef = useRef("root");
        this.searchRef = useRef("search");
        this.state = useState({
            skeleton: "on", // on -> fading -> off
            theme: readTheme(),
            chip: "all",
            query: "",
            selId: null,
            data: { me: { initials: "" }, utilities: [], crew: [], tickets: [] },
        });
        this.assignPopover = usePopover(AssignLocatorPopover, {
            position: "bottom-end",
            popoverClass: "o_sf_popover",
        });
        useHotkey("control+k", () => this.searchRef.el?.focus(), { bypassEditableProtection: true });
        onMounted(() => this.load());
        onWillUnmount(() => this.flushDrawing());
    }

    // ---- data -------------------------------------------------------------

    async load() {
        const data = await this.orm.call("strataflow.workorder", "get_board_data", []);
        this.state.data = data;
        if (!data.tickets.some((t) => t.id === this.state.selId)) {
            this.state.selId = this.ordered[0]?.id ?? null;
        }
        if (this.state.skeleton === "on") {
            // first frame is up: fade the shell out, then drop it (same beat as strataline app.js)
            requestAnimationFrame(() => {
                this.state.skeleton = "fading";
                setTimeout(() => (this.state.skeleton = "off"), 500);
            });
        }
    }

    get utilById() {
        return Object.fromEntries(this.state.data.utilities.map((u) => [u.id, u]));
    }

    get chips() {
        const tickets = this.state.data.tickets;
        return CHIPS.map((key) => ({
            key,
            label: key === "all" ? _t("All") : STATUS_LABEL[key],
            count: key === "all" ? tickets.length : tickets.filter((t) => t.status === key).length,
            on: this.state.chip === key,
        }));
    }

    // Dispatch order: live work soonest-dig first, then located, then closed/invoiced newest first.
    get ordered() {
        const rank = { new: 0, assigned: 0, onsite: 0, located: 1, closed: 2, invoiced: 2 };
        return [...this.state.data.tickets].sort((a, b) => {
            const ra = rank[a.status];
            const rb = rank[b.status];
            if (ra !== rb) {
                return ra - rb;
            }
            return ra === 2 ? b.dig_date.localeCompare(a.dig_date) : a.dig_date.localeCompare(b.dig_date);
        });
    }

    get visible() {
        const q = this.state.query.trim().toLowerCase();
        return this.ordered.filter(
            (t) =>
                (this.state.chip === "all" || t.status === this.state.chip) &&
                (!q || `${t.address} ${t.name} ${t.requester} ${t.lld}`.toLowerCase().includes(q))
        );
    }

    get sel() {
        return this.state.data.tickets.find((t) => t.id === this.state.selId) || null;
    }

    get selUtilities() {
        const byId = this.utilById;
        return (this.sel?.utility_ids || []).map((id) => byId[id]).filter(Boolean);
    }

    get primaryAction() {
        return this.sel ? NEXT_ACTION[this.sel.status] : "";
    }

    get activity() {
        const t = this.sel;
        if (!t) {
            return [];
        }
        const stage = STAGE[t.status];
        const steps = [
            [_t("Ticket received"), t.received_at, t.source],
            [_t("Assigned"), t.assigned_at, t.assigned_by ? _t("by %s", t.assigned_by) : ""],
            [_t("On site"), t.onsite_at, _t("field check-in")],
            [_t("Print complete"), t.located_at, _t("field app")],
            [_t("Closed"), t.closed_at, ""],
        ];
        return steps.map(([what, at, who], i) => ({
            what,
            done: i <= stage,
            when: i <= stage ? [this.fmtWhen(at), who].filter(Boolean).join(" · ") || _t("done") : _t("pending"),
            last: i === steps.length - 1,
        }));
    }

    statusLabel(status) {
        return STATUS_LABEL[status];
    }

    fmtDate(iso) {
        return iso ? DateTime.fromISO(iso).toFormat("LLL dd, yyyy") : "";
    }

    fmtWhen(sql) {
        return sql ? DateTime.fromSQL(sql, { zone: "utc" }).toLocal().toFormat("LLL dd · HH:mm") : "";
    }

    // ---- interactions -----------------------------------------------------

    select(id) {
        this.flushDrawing();
        this.assignPopover.close();
        this.state.selId = id;
    }

    pickChip(key) {
        this.state.chip = key;
        if (!this.visible.some((t) => t.id === this.state.selId) && this.visible.length) {
            this.select(this.visible[0].id);
        }
    }

    onListKeydown(ev) {
        if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") {
            return;
        }
        const rows = this.visible;
        const i = rows.findIndex((t) => t.id === this.state.selId);
        const next = rows[Math.min(rows.length - 1, Math.max(0, i + (ev.key === "ArrowDown" ? 1 : -1)))];
        if (next) {
            ev.preventDefault();
            this.select(next.id);
            this.rootRef.el?.querySelector(".o_sf_row.is-selected")?.focus();
        }
    }

    async onPrimary(ev) {
        const t = this.sel;
        if (!t) {
            return;
        }
        if (t.status === "new") {
            if (this.assignPopover.isOpen) {
                this.assignPopover.close();
                return;
            }
            this.assignPopover.open(ev.currentTarget, {
                crew: this.state.data.crew,
                onPick: (userId) => this.assign(t.id, userId),
            });
            return;
        }
        if (t.status === "invoiced") {
            this.notification.add(_t("Invoices open from the Invoices screen."), { type: "info" });
            return;
        }
        await this.orm.call("strataflow.workorder", "action_advance", [[t.id]]);
        await this.load();
    }

    async assign(ticketId, userId) {
        await this.orm.call("strataflow.workorder", "action_assign", [[ticketId], userId]);
        await this.load();
        this.notification.add(_t("Locator assigned."), { type: "success" });
    }

    onDrawingChange(drawing) {
        const t = this.sel;
        if (!t) {
            return;
        }
        t.drawing = drawing;
        clearTimeout(this._saveTimer);
        this._pending = { id: t.id, drawing };
        this._saveTimer = setTimeout(() => this.flushDrawing(), 600);
    }

    flushDrawing() {
        clearTimeout(this._saveTimer);
        if (this._pending) {
            const { id, drawing } = this._pending;
            this._pending = null;
            this.orm.write("strataflow.workorder", [id], { drawing });
        }
    }

    print() {
        window.print();
    }

    toggleTheme() {
        this.state.theme = this.state.theme === "dark" ? "light" : "dark";
        try {
            localStorage.setItem(THEME_KEY, this.state.theme);
        } catch {
            // storage blocked: the choice lives for this session only
        }
    }

    get nav() {
        return NAV;
    }

    goNav(key) {
        if (key === "workorders") {
            return;
        }
        const tag = `strataflow_${key}`;
        if (registry.category("actions").contains(tag)) {
            this.action.doAction({ type: "ir.actions.client", tag });
        } else {
            this.notification.add(_t("%s is coming soon.", NAV.find((n) => n.key === key).label), { type: "info" });
        }
    }

    openOdoo() {
        this.action.doAction({ type: "ir.actions.act_url", url: "/odoo", target: "self" });
    }
}

registry.category("actions").add("strataflow_workorders", WorkOrderApp);
