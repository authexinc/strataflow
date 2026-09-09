import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { StrataflowShell } from "../core/shell";
import { fmtDate, money } from "../core/format";

const STATUS_LABEL = { draft: _t("Draft"), sent: _t("Sent"), paid: _t("Paid"), overdue: _t("Overdue") };
const STATUS_STYLE = { draft: "closed", sent: "new", paid: "located", overdue: "danger" };

export class InvoicesScreen extends Component {
    static template = "strataflow_workorder.Invoices";
    // URL segment — see core/router_paths.js. Keep in step with strataflow_actions.xml.
    static path = "invoices";
    static components = { StrataflowShell };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({ loading: true, filter: "all", query: "", me: { initials: "", is_dispatcher: true }, board: { stats: {}, invoices: [], month: "", currency: "$" } });
        onMounted(() => this.load());
    }

    async load() {
        const [board, data] = await Promise.all([
            this.orm.call("account.move", "get_invoice_board", []),
            this.orm.call("strataflow.workorder", "get_board_data", []),
        ]);
        this.state.board = board;
        this.state.me = data.me;
        this.state.loading = false;
    }

    onSearch(v) {
        this.state.query = v;
    }

    get cur() {
        return this.state.board.currency;
    }

    get cards() {
        const s = this.state.board.stats;
        const f = this.state.filter;
        return [
            { key: "outstanding", label: _t("Outstanding"), value: money(s.outstanding, this.cur), sub: _t("%s invoices open · click to filter", s.outstanding_count ?? 0), on: f === "outstanding" },
            { key: "overdue", label: _t("Overdue"), value: money(s.overdue, this.cur), sub: _t("%(n)s invoices · oldest %(d)s days", { n: s.overdue_count ?? 0, d: s.oldest_overdue_days ?? 0 }), danger: true, on: f === "overdue" },
            { key: "paid", label: _t("Paid · %s", (this.state.board.month || "").split(" ")[0]), value: money(s.paid_month, this.cur), sub: _t("posted this month"), ok: true, on: f === "paid" },
            { key: "uninvoiced", label: _t("Uninvoiced work"), value: money(s.uninvoiced_amount, this.cur), sub: _t("%s closed tickets ready", s.uninvoiced_count ?? 0), on: f === "uninvoiced" },
        ];
    }

    get rows() {
        const f = this.state.filter;
        const q = this.state.query.trim().toLowerCase();
        const keep = (r) =>
            f === "all" ? true : f === "outstanding" ? ["sent", "overdue", "draft"].includes(r.status) : f === "overdue" ? r.status === "overdue" : f === "paid" ? r.status === "paid" : false;
        return this.state.board.invoices
            .filter((r) => keep(r) && (!q || `${r.name} ${r.customer} ${r.tickets.join(" ")}`.toLowerCase().includes(q)))
            .map((r) => ({
                ...r,
                ticketsLabel: r.tickets.length ? r.tickets[0] + (r.tickets.length > 1 ? ` +${r.tickets.length - 1}` : "") : "—",
                issuedLabel: fmtDate(r.issued, "LLL dd"), dueLabel: fmtDate(r.due, "LLL dd"),
                amountLabel: money(r.amount, r.currency), statusLabel: STATUS_LABEL[r.status], statusStyle: STATUS_STYLE[r.status],
            }));
    }

    get footNote() {
        const s = this.state.board.stats;
        const n = this.rows.length;
        switch (this.state.filter) {
            case "outstanding": return _t("%(n)s outstanding invoices · %(m)s · click the card again to clear", { n, m: money(s.outstanding, this.cur) });
            case "overdue": return _t("%(n)s overdue invoices · %(m)s · click the card again to clear", { n, m: money(s.overdue, this.cur) });
            case "paid": return _t("%(n)s paid invoices · %(m)s · click the card again to clear", { n, m: this.state.board.month });
            case "uninvoiced": return _t("closed tickets awaiting invoicing");
            default: return _t("%(n)s invoices · %(m)s", { n: this.state.board.invoices.length, m: this.state.board.month });
        }
    }

    pick(key) {
        this.state.filter = this.state.filter === key ? "all" : key;
    }

    open(row) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "account.move", res_id: row.id, views: [[false, "form"]], target: "current" });
    }

    newInvoice() {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "account.move", views: [[false, "form"]], target: "current", context: { default_move_type: "out_invoice" }, name: _t("New invoice") });
    }

    async createFromTickets() {
        const res = await this.orm.call("strataflow.workorder", "action_invoice_closed", []);
        this.notification.add(_t("%(n)s draft invoice(s) created from %(t)s closed ticket(s).", { n: res.created, t: res.tickets }), { type: res.created ? "success" : "info" });
        this.state.filter = "outstanding";
        await this.load();
    }

    openAccounting() {
        this.action.doAction("account.action_move_out_invoice_type");
    }
}

registry.category("actions").add("strataflow_invoices", InvoicesScreen);
