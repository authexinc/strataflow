import { Component, onMounted, onWillUnmount, useRef, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { StrataflowShell } from "../core/shell";
import { FauxMap } from "../core/faux_map";
import { LocateCanvas } from "../core/locate_canvas";
import { LocatePreview } from "../core/locate_preview";
import { auditDrawing, linesByUtility } from "../core/audit";
import { fmtDate, fmtWhen } from "../core/format";
import { bboxOf, project } from "../core/geo";

const STAGES = [
    { key: "map", label: _t("On site") },
    { key: "draw", label: _t("Draw") },
    { key: "review", label: _t("Review") },
];
// a ticket at or past `located` is finished as far as the field is concerned:
// `action_complete_locate` refuses it, so the locator sees the print, not the tools
const DONE_STATUSES = ["located", "closed", "invoiced"];
const DONE_LABEL = { located: _t("Located"), closed: _t("Closed"), invoiced: _t("Invoiced") };

export class LocatorScreen extends Component {
    static template = "strataflow_workorder.Locator";
    static components = { StrataflowShell, FauxMap, LocateCanvas, LocatePreview };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.fileRef = useRef("file");
        this.state = useState({
            loading: true,
            view: "route", // route | map
            stage: "map", // map | draw | review
            selId: this.props.action?.context?.active_id || null,
            panelOpen: true,
            detailsOpen: false,
            basemap: "streets",
            mapFocus: false,
            audit: null,
            auditOpen: false,
            attachments: [],
            uploading: false,
            data: { me: { id: 0, initials: "" }, utilities: [], crew: [], tickets: [] },
        });
        onMounted(() => this.load());
        onWillUnmount(() => this.flushDrawing());
    }

    async load() {
        this.state.data = await this.orm.call("strataflow.workorder", "get_board_data", []);
        if (!this.stops.some((s) => s.id === this.state.selId)) {
            this.state.selId = (this.stops.find((s) => !s.done) || this.stops[0])?.id ?? null;
        }
        this.state.loading = false;
        await this.loadAttachments();
    }

    async loadAttachments() {
        if (!this.sel) {
            this.state.attachments = [];
            return;
        }
        this.state.attachments = await this.orm.searchRead("ir.attachment", [["res_model", "=", "strataflow.workorder"], ["res_id", "=", this.sel.id]], ["name", "mimetype", "create_date"], { order: "create_date desc" });
    }

    // ---- route ----------------------------------------------------------------

    get mineOnly() {
        return this.state.data.tickets.some((t) => t.locator?.id === this.state.data.me.id && ["assigned", "onsite"].includes(t.status));
    }

    // my open tickets today; a dispatcher with no tickets of their own sees the whole crew's route
    get stops() {
        const me = this.state.data.me.id;
        const mine = this.state.data.tickets.filter((t) => (this.mineOnly ? t.locator?.id === me : t.locator) && ["assigned", "onsite", "located", "closed"].includes(t.status));
        const rank = { onsite: 0, assigned: 1, located: 2, closed: 3 };
        return mine
            .sort((a, b) => (b.emergency ? 1 : 0) - (a.emergency ? 1 : 0) || rank[a.status] - rank[b.status] || a.dig_date.localeCompare(b.dig_date))
            .map((t, i) => ({
                ...t, n: i + 1,
                done: DONE_STATUSES.includes(t.status),
                stopStatus: DONE_STATUSES.includes(t.status) ? "located" : t.status === "onsite" ? "onsite" : i === 0 || t.emergency ? "new" : "closed",
                stopLabel: DONE_STATUSES.includes(t.status) ? _t("Done") : t.status === "onsite" ? _t("On site") : t.emergency ? _t("Next") : _t("Queued"),
                meta: `${t.name} · dig ${fmtDate(t.dig_date, "LLL dd")}${t.emergency ? " · EMERGENCY" : ""} · ${this.utilNames(t).join(", ")}`,
            }));
    }

    get sel() {
        return this.state.data.tickets.find((t) => t.id === this.state.selId) || null;
    }

    utilNames(t) {
        const byId = Object.fromEntries(this.state.data.utilities.map((u) => [u.id, u]));
        return (t.utility_ids || []).map((id) => byId[id]?.name).filter(Boolean);
    }

    get selUtilities() {
        const byId = Object.fromEntries(this.state.data.utilities.map((u) => [u.id, u]));
        return (this.sel?.utility_ids || []).map((id) => byId[id]).filter(Boolean);
    }

    // NB: `done` is computed in `stops`, which maps copies — it never exists on the
    // raw ticket `sel` returns, so `sel.done` read undefined and every guard using it
    // was dead. Ask the status directly.
    get selDone() {
        return DONE_STATUSES.includes(this.sel?.status);
    }

    get doneLabel() {
        return DONE_LABEL[this.sel?.status] || "";
    }

    get completedNote() {
        const t = this.sel;
        if (t.status === "invoiced") {
            return _t("Invoiced on %s — nothing further to do here.", t.invoice || "—");
        }
        if (t.status === "closed") {
            return _t("Closed %s — awaiting invoicing.", fmtWhen(t.closed_at));
        }
        return _t("Located %s — a dispatcher closes it after reviewing the print.", fmtWhen(t.located_at));
    }

    get nextOpenStop() {
        return this.stops.find((s) => !s.done && s.id !== this.state.selId) || null;
    }

    get selUtilCodes() {
        return this.selUtilities.map((u) => u.code);
    }

    get steps() {
        // a finished ticket is past every stage, whatever `state.stage` happens to hold
        const idx = this.selDone ? STAGES.length : STAGES.findIndex((s) => s.key === this.state.stage);
        return STAGES.map((s, i) => ({ ...s, label: `${i + 1} · ${s.label}`, on: i === idx, done: i < idx }));
    }

    get selPin() {
        const t = this.sel;
        const p = t ? project(t, bboxOf(this.state.data.tickets)) : null;
        return p ? { ...p, name: t.name, address: t.address, status: t.status } : null;
    }

    get audit() {
        return this.state.audit || [{ level: "faint", text: _t("Run the audit to check your locate against the ticket scope and the Strataline utility layer.") }];
    }

    get lines() {
        return linesByUtility(this.sel?.drawing, this.state.data.utilities);
    }

    get hasLines() {
        return (this.sel?.drawing?.segments || []).length > 0;
    }

    get routeFoot() {
        const n = this.stops.filter((s) => !s.done).length;
        return this.mineOnly ? _t("%s open stops · your route", n) : _t("%s open stops · whole crew (no tickets assigned to you)", n);
    }

    fmtWhen(v) {
        return fmtWhen(v);
    }
    fmtDate(v) {
        return fmtDate(v);
    }

    // ---- interactions ---------------------------------------------------------

    async selectStop(id) {
        this.flushDrawing();
        Object.assign(this.state, { selId: id, stage: "map", audit: null, auditOpen: false, detailsOpen: false, mapFocus: false });
        await this.loadAttachments();
    }

    navigate() {
        const t = this.sel;
        const q = encodeURIComponent(`${t.address}, Calgary AB`);
        window.open(t.latitude ? `https://maps.apple.com/?daddr=${t.latitude},${t.longitude}&q=${q}` : `https://maps.apple.com/?daddr=${q}`, "_blank", "noopener");
    }

    async markOnSite() {
        if (this.sel?.status === "assigned") {
            await this.orm.call("strataflow.workorder", "action_advance", [[this.sel.id]]);
            await this.load();
            this.notification.add(_t("Checked in on site."), { type: "success" });
        }
    }

    onDrawingChange(drawing) {
        const t = this.sel;
        if (!t) {
            return;
        }
        t.drawing = drawing;
        this.state.audit = null;
        clearTimeout(this._saveTimer);
        this._pending = { id: t.id, drawing };
        this._saveTimer = setTimeout(() => this.flushDrawing(), 600);
    }

    flushDrawing() {
        clearTimeout(this._saveTimer);
        if (this._pending) {
            const { id, drawing } = this._pending;
            this._pending = null;
            return this.orm.write("strataflow.workorder", [id], { drawing });
        }
    }

    runAudit() {
        this.state.audit = auditDrawing(this.sel?.drawing, this.selUtilCodes, this.state.data.utilities);
        this.state.auditOpen = true;
    }

    toReview() {
        this.runAudit();
        this.state.stage = "review";
    }

    async confirmLocate() {
        if (!this.hasLines || this.selDone) {
            return;
        }
        await this.flushDrawing();
        try {
            await this.orm.call("strataflow.workorder", "action_complete_locate", [[this.sel.id]]);
        } catch (e) {
            this.notification.add(e.data?.message || e.message, { type: "danger" });
            return;
        }
        this.notification.add(_t("%s located. Print saved; a dispatcher closes it after review.", this.sel.name), { type: "success" });
        const next = this.stops.find((s) => !s.done && s.id !== this.sel.id);
        await this.load();
        await this.selectStop(next?.id ?? this.state.selId);
    }

    // ---- documents (ir.attachment on the ticket) -------------------------------

    pickFile() {
        this.fileRef.el?.click();
    }

    async upload(ev) {
        const files = [...(ev.target.files || [])];
        if (!files.length || !this.sel) {
            return;
        }
        this.state.uploading = true;
        try {
            for (const file of files) {
                const form = new FormData();
                form.append("csrf_token", odoo.csrf_token);
                form.append("model", "strataflow.workorder");
                form.append("id", this.sel.id);
                form.append("ufile", file, file.name);
                const res = await fetch("/web/binary/upload_attachment", { method: "POST", body: form });
                if (!res.ok) {
                    throw new Error(_t("Upload failed for %s", file.name));
                }
            }
            this.notification.add(_t("%s file(s) attached to %s", files.length, this.sel.name), { type: "success" });
            await this.loadAttachments();
        } catch (e) {
            this.notification.add(e.message, { type: "danger" });
        } finally {
            this.state.uploading = false;
            ev.target.value = "";
        }
    }

    openAttachment(a) {
        window.open(`/web/content/${a.id}?download=true`, "_blank", "noopener");
    }
}

registry.category("actions").add("strataflow_locator", LocatorScreen);
