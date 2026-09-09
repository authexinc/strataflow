import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { usePopover } from "@web/core/popover/popover_hook";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { StrataflowShell } from "../core/shell";
import { AssignLocatorPopover } from "../core/assign_popover";
import { LocateCanvas } from "../core/locate_canvas";
import { useTheme } from "../core/theme";
import { fmtDate, fmtWhen } from "../core/format";
import { downloadBlob, downloadText, svgToPng } from "../core/download";
import { geoDrawing, projectDrawing, segMetres } from "../core/locate_geo";

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

export class WorkOrdersScreen extends Component {
    static template = "strataflow_workorder.WorkOrders";
    // URL segment (/odoo/<path>). Keep in step with the action's `path` in strataflow_actions.xml.
    static path = "workorders";
    static components = { StrataflowShell, LocateCanvas, Dropdown, DropdownItem };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.theme = useTheme();
        this.rootRef = useRef("root");
        this.state = useState({
            loading: true,
            chip: "all",
            query: "",
            selId: this.props.action?.context?.active_id || null,
            data: { me: { initials: "", is_dispatcher: true }, utilities: [], crew: [], tickets: [] },
        });
        this.assignPopover = usePopover(AssignLocatorPopover, { position: "bottom-end", popoverClass: "o_sf_popover" });
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
        this.state.loading = false;
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

    // Dispatch order: emergencies, then live work soonest-dig first, then located, then closed/invoiced newest first.
    get ordered() {
        const rank = { new: 0, assigned: 0, onsite: 0, located: 1, closed: 2, invoiced: 2 };
        return [...this.state.data.tickets].sort((a, b) => {
            const ra = rank[a.status];
            const rb = rank[b.status];
            if (ra !== rb) {
                return ra - rb;
            }
            if (ra === 0 && a.emergency !== b.emergency) {
                return a.emergency ? -1 : 1;
            }
            return ra === 2 ? b.dig_date.localeCompare(a.dig_date) : a.dig_date.localeCompare(b.dig_date);
        });
    }

    get visible() {
        const q = this.state.query.trim().toLowerCase();
        return this.ordered.filter(
            (t) =>
                (this.state.chip === "all" || t.status === this.state.chip) &&
                (!q || `${t.address} ${t.name} ${t.requester} ${t.lld} ${t.parcel}`.toLowerCase().includes(q))
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
            [t.status === "invoiced" ? _t("Closed · invoiced") : _t("Closed"), t.closed_at, t.invoice],
        ];
        return steps.map(([what, at, who], i) => ({
            what,
            done: i <= stage,
            when: i <= stage ? [fmtWhen(at), who].filter(Boolean).join(" · ") || _t("done") : _t("pending"),
            last: i === steps.length - 1,
        }));
    }

    statusLabel(status) {
        return STATUS_LABEL[status];
    }
    fmtDate(iso) {
        return fmtDate(iso);
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

    onSearch(value) {
        this.state.query = value;
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
                theme: this.theme.theme,
                onPick: (userId) => this.assign(t.id, userId),
            });
            return;
        }
        if (t.status === "invoiced") {
            if (t.move_id) {
                this.openInvoice(t.move_id);
            }
            return;
        }
        if (t.status === "closed") {
            const res = await this.orm.call("strataflow.workorder", "action_invoice_closed", []);
            this.notification.add(_t("%(n)s invoice(s) created from %(t)s closed ticket(s).", { n: res.created, t: res.tickets }), { type: "success" });
            await this.load();
            return;
        }
        await this.orm.call("strataflow.workorder", "action_advance", [[t.id]]);
        await this.load();
    }

    openInvoice(moveId) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "account.move", res_id: moveId, views: [[false, "form"]], target: "current" });
    }

    newTicket() {
        this.action.doAction({
            type: "ir.actions.act_window", res_model: "strataflow.workorder", views: [[false, "form"]],
            target: "current", name: _t("New ticket"),
        });
    }

    openRecord() {
        if (this.sel) {
            this.action.doAction({ type: "ir.actions.act_window", res_model: "strataflow.workorder", res_id: this.sel.id, views: [[false, "form"]], target: "current" });
        }
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

    // ---- export -----------------------------------------------------------

    get menuClass() {
        return "o_sf_menu" + (this.theme.theme === "dark" ? " o_sf_theme_dark" : "");
    }

    exportPdf() {
        this.flushDrawing();
        window.open(`/strataflow/workorder/${this.sel.id}/locate.pdf`, "_blank");
    }

    async exportPng() {
        const t = this.sel;
        const w = 900;
        const h = 470;
        const print = projectDrawing(t.drawing, w, h);
        const byCode = Object.fromEntries(this.state.data.utilities.map((u) => [u.code, u]));
        const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
        const font = "font: 600 11px ui-monospace, Menlo, monospace; paint-order: stroke; stroke: #f4f5f3; stroke-width: 3px;";
        const parts = [`<rect width="100%" height="100%" fill="#f4f5f3"/>`];
        for (const s of print.segments) {
            const u = byCode[s.util];
            parts.push(`<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${u?.color || "#1c2124"}" stroke-width="3" stroke-linecap="round"${s.util === "gas" ? ' stroke-dasharray="1 8"' : ""}/>`);
            parts.push(`<text x="${(s.x1 + s.x2) / 2}" y="${(s.y1 + s.y2) / 2 - 7}" text-anchor="middle" fill="${u?.color || "#1c2124"}" style="${font}">${esc((u?.name || "?")[0])} ${s.metres.toFixed(1)} m</text>`);
        }
        for (const n of print.notes) {
            parts.push(`<circle cx="${n.x}" cy="${n.y}" r="4" fill="#1c2124" stroke="#f4f5f3" stroke-width="1.5"/><text x="${n.x + 8}" y="${n.y + 3}" fill="#1a1d21" style="${font}">${esc(n.text)}</text>`);
        }
        const scale = print.mPerPx ? ` · north up · 1 px ≈ ${print.mPerPx.toFixed(2)} m` : "";
        parts.push(`<text x="10" y="${h - 8}" fill="#5b6167" style="font: 10px ui-monospace, Menlo, monospace">${esc(t.name)} · ${esc(t.address)}${scale} · reference only, not a locate</text>`);
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
        try {
            downloadBlob(await svgToPng(svg, w, h), `${t.name}-locate.png`);
        } catch (e) {
            this.notification.add(e.message, { type: "danger" });
        }
    }

    exportCsv() {
        const t = this.sel;
        const byCode = Object.fromEntries(this.state.data.utilities.map((u) => [u.code, u.name]));
        const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const head = ["ticket", "address", "status", "dig_date", "source", "requested_by", "locator", "utilities", "parcel", "lld", "latitude", "longitude"];
        const row = [t.name, t.address, t.status, t.dig_date, t.source, t.requester, t.locator?.name || "", this.selUtilities.map((u) => u.name).join("; "), t.parcel, t.lld, t.latitude, t.longitude];
        const d = geoDrawing(t.drawing);
        const lines = [head.join(","), row.map(q).join(","), "", "segment,utility,from_longitude,from_latitude,to_longitude,to_latitude,metres"];
        d.segments.forEach((s, i) => lines.push([i + 1, byCode[s.util] || s.util, s.a[0], s.a[1], s.b[0], s.b[1], segMetres(s).toFixed(1)].join(",")));
        if (d.notes.length) {
            lines.push("", "note,longitude,latitude,text");
            d.notes.forEach((n) => lines.push([n.at[0], n.at[1], q(n.text)].join(",")));
        }
        downloadText(lines.join("\n"), `${t.name}.csv`, "text/csv");
    }
}

registry.category("actions").add("strataflow_workorders", WorkOrdersScreen);
