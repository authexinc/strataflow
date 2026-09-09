import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { StrataflowShell } from "../core/shell";
import { StratalineMap } from "../core/strataline_map";
import { LayerPanel } from "../core/layer_panel";
import { fmtDate } from "../core/format";
import { haversineKm, planRoutes } from "../core/geo";

const STATUS_LABEL = { new: _t("New"), assigned: _t("Assigned"), onsite: _t("On site"), located: _t("Located"), closed: _t("Closed"), invoiced: _t("Invoiced") };
const CHIPS = ["all", "new", "assigned", "onsite", "located", "closed"];
const HUES = ["#0f6ed8", "#0a9648", "#c08a1e", "#7a5cc4", "#0e93c9", "#c2453e"];

export class DispatchScreen extends Component {
    static template = "strataflow_workorder.Dispatch";
    // URL segment (/odoo/<path>). Keep in step with the action's `path` in strataflow_actions.xml.
    static path = "dispatch";
    static components = { StrataflowShell, StratalineMap, LayerPanel };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";
    // the part of the map the queue (left), rail (right), top bar and footer leave free
    static MAP_PADDING = { top: 90, left: 360, right: 80, bottom: 70 };

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.state = useState({
            loading: true,
            chip: "all",
            query: "",
            selId: this.props.action?.context?.active_id || null,
            selCrew: null,
            basemap: "streets",
            auto: false,
            showCrew: true,
            layersOpen: false,
            cardOpen: true,
            data: { me: { initials: "" }, utilities: [], crew: [], tickets: [] },
        });
        this.mapApi = null; // { zoomIn, zoomOut } once the live map is up
        onMounted(() => this.load());
    }

    async load() {
        this.state.data = await this.orm.call("strataflow.workorder", "get_board_data", []);
        if (!this.state.data.tickets.some((t) => t.id === this.state.selId)) {
            this.state.selId = this.queue[0]?.id ?? null;
        }
        this.state.loading = false;
    }

    // ---- derived --------------------------------------------------------------

    get utilById() {
        return Object.fromEntries(this.state.data.utilities.map((u) => [u.id, u]));
    }

    get queue() {
        const rank = { new: 0, assigned: 1, onsite: 1, located: 2, closed: 3, invoiced: 3 };
        return [...this.state.data.tickets].sort((a, b) => (b.emergency ? 1 : 0) - (a.emergency ? 1 : 0) || rank[a.status] - rank[b.status] || a.dig_date.localeCompare(b.dig_date));
    }

    get visible() {
        const q = this.state.query.trim().toLowerCase();
        return this.queue.filter((t) => (this.state.chip === "all" || t.status === this.state.chip) && (!q || `${t.address} ${t.name} ${t.requester}`.toLowerCase().includes(q)));
    }

    get chips() {
        const all = this.state.data.tickets;
        return CHIPS.map((key) => ({ key, label: key === "all" ? _t("All") : STATUS_LABEL[key], count: key === "all" ? all.length : all.filter((t) => t.status === key).length, on: this.state.chip === key }));
    }

    get sel() {
        return this.state.data.tickets.find((t) => t.id === this.state.selId) || null;
    }

    get selUtilities() {
        const byId = this.utilById;
        return (this.sel?.utility_ids || []).map((id) => byId[id]).filter(Boolean);
    }

    get markers() {
        return this.state.data.tickets
            .filter((t) => t.latitude && t.longitude)
            .map((t) => ({
                id: t.id, name: t.name, address: t.address, status: t.status, emergency: t.emergency,
                latitude: t.latitude, longitude: t.longitude, on: t.id === this.state.selId,
                badge: this.state.showCrew && t.status === "onsite" && t.locator ? t.locator.initials : "",
            }));
    }

    // where each locator currently is: their on-site ticket, else their next assigned one
    get crewAnchors() {
        const anchors = {};
        for (const c of this.state.data.crew) {
            const mine = this.queue.filter((t) => t.locator?.id === c.id && ["onsite", "assigned"].includes(t.status) && t.latitude);
            const here = mine.find((t) => t.status === "onsite") || mine[0];
            if (here) {
                anchors[c.id] = here;
            }
        }
        return anchors;
    }

    get crews() {
        const anchors = this.crewAnchors;
        const sel = this.sel;
        return this.state.data.crew.map((c, i) => {
            const km = sel && anchors[c.id] ? haversineKm(anchors[c.id], sel) : null;
            return {
                ...c,
                hue: HUES[i % HUES.length],
                load: c.busy ? _t("on site · %s open", c.open) : _t("%s open today", c.open),
                dist: km === null ? "—" : `${km.toFixed(1)} km`,
                on: this.state.selCrew === c.id,
            };
        });
    }

    get selCrewName() {
        return this.crews.find((c) => c.on)?.name || "";
    }

    // `action_assign` refuses anything past `assigned`, so on a ticket that far along
    // the picker is not rendered at all — a live crew list above a permanently greyed
    // "Assign to X" button reads as a control that is merely slow, not one that is shut.
    get canAssign() {
        return ["new", "assigned"].includes(this.sel?.status);
    }

    get assignLocked() {
        return _t("%s · assignment is locked", STATUS_LABEL[this.sel.status]);
    }

    get routes() {
        if (!this.state.auto) {
            return [];
        }
        const crewIndex = Object.fromEntries(this.state.data.crew.map((c, i) => [c.id, i]));
        return planRoutes(this.state.data.tickets, this.state.data.crew, this.crewAnchors).map((r) => ({
            id: r.crew.id, crew: r.crew, km: r.km, stops: r.stops, color: HUES[crewIndex[r.crew.id] % HUES.length],
            coords: [this.crewAnchors[r.crew.id], ...r.stops].filter((t) => t?.latitude).map((t) => [t.longitude, t.latitude]),
        }));
    }

    get routeSummary() {
        const rs = this.routes;
        if (!rs.length) {
            return _t("Auto-assign · no unassigned tickets with coordinates");
        }
        const km = rs.reduce((a, r) => a + r.km, 0);
        const stops = rs.reduce((a, r) => a + r.stops.length, 0);
        return _t("Auto-assign · %(r)s routes · %(s)s stops · %(km)s km", { r: rs.length, s: stops, km: km.toFixed(1) });
    }

    statusLabel(s) {
        return STATUS_LABEL[s];
    }
    fmtDate(iso) {
        return fmtDate(iso, "LLL dd");
    }

    // ---- interactions ---------------------------------------------------------

    select(id) {
        this.state.selId = id;
        this.state.selCrew = null;
        this.state.cardOpen = true;
    }
    onSearch(v) {
        this.state.query = v;
    }
    pickChip(key) {
        this.state.chip = key;
    }

    async assignSelected() {
        if (!this.sel || !this.state.selCrew) {
            return;
        }
        await this.orm.call("strataflow.workorder", "action_assign", [[this.sel.id], this.state.selCrew]);
        this.notification.add(_t("%(t)s assigned to %(c)s.", { t: this.sel.name, c: this.selCrewName }), { type: "success" });
        await this.load();
    }

    async applyRoutes() {
        const rs = this.routes;
        for (const r of rs) {
            for (const t of r.stops) {
                await this.orm.call("strataflow.workorder", "action_assign", [[t.id], r.crew.id]);
            }
        }
        this.state.auto = false;
        this.notification.add(_t("%s tickets assigned along suggested routes.", rs.reduce((a, r) => a + r.stops.length, 0)), { type: "success" });
        await this.load();
    }

    newTicket() {
        this.action.doAction({
            type: "ir.actions.act_window", res_model: "strataflow.workorder", views: [[false, "form"]],
            target: "current", name: _t("New ticket"),
        });
    }

    openTicket() {
        this.action.doAction({ type: "ir.actions.client", tag: "strataflow_workorders", context: { active_id: this.sel?.id } });
    }

    onMapReady(api) {
        this.mapApi = api;
    }
    zoom(dir) {
        if (!this.mapApi) {
            this.notification.add(_t("The map is not connected to Strataline yet."), { type: "info" });
            return;
        }
        dir > 0 ? this.mapApi.zoomIn() : this.mapApi.zoomOut();
    }
    disclaimer() {
        this.notification.add(_t("Strataline is a reference aid, not a locate. The field locate governs."), { type: "warning", title: _t("Reference only") });
    }
}

registry.category("actions").add("strataflow_dispatch", DispatchScreen);
