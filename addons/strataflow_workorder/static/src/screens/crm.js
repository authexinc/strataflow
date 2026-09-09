import { Component, onMounted, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_service";
import { StrataflowShell } from "../core/shell";
import { ago, moneyShort } from "../core/format";

const STAGE_DOT = ["new", "onsite", "assigned", "located"];
const TAG_STYLE = { "Annual contract": "new", Project: "assigned", "One-off": "closed", Municipal: "located" };

export class CrmScreen extends Component {
    static template = "strataflow_workorder.Crm";
    // URL segment (/odoo/<path>). Keep in step with the action's `path` in strataflow_actions.xml.
    static path = "pipeline";
    static components = { StrataflowShell };
    static props = { ...standardActionServiceProps };
    static target = "fullscreen";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.state = useState({ loading: true, query: "", me: { initials: "", is_dispatcher: true }, pipeline: { stages: [], leads: [] } });
        onMounted(async () => {
            const [pipeline, board] = await Promise.all([
                this.orm.call("crm.lead", "get_pipeline", []),
                this.orm.call("strataflow.workorder", "get_board_data", []),
            ]);
            this.state.pipeline = pipeline;
            this.state.me = board.me;
            this.state.loading = false;
        });
    }

    onSearch(v) {
        this.state.query = v;
    }

    get columns() {
        const q = this.state.query.trim().toLowerCase();
        const { stages, leads } = this.state.pipeline;
        return stages.map((s, i) => {
            const cards = leads
                .filter((l) => l.stage_id === s.id && (!q || `${l.company} ${l.summary} ${l.tags.join(" ")}`.toLowerCase().includes(q)))
                .map((l) => ({
                    ...l,
                    value: l.recurring ? moneyShort(l.recurring, l.currency, "/yr") : moneyShort(l.amount, l.currency),
                    tag: l.tags[0] || "",
                    tagStyle: TAG_STYLE[l.tags[0]] || "closed",
                    when: ago(l.age_days),
                }));
            const total = cards.reduce((a, l) => a + (l.recurring || l.amount || 0), 0);
            return { ...s, dot: STAGE_DOT[i % STAGE_DOT.length], cards, total: moneyShort(total, cards[0]?.currency || "$") };
        });
    }

    open(lead) {
        this.action.doAction({ type: "ir.actions.act_window", res_model: "crm.lead", res_id: lead.id, views: [[false, "form"]], target: "current" });
    }

    newLead() {
        this.action.doAction({
            type: "ir.actions.act_window", res_model: "crm.lead", views: [[false, "form"]], target: "current",
            context: { default_type: "opportunity" }, name: _t("New lead"),
        });
    }

    openPipeline() {
        this.action.doAction("crm.crm_lead_action_pipeline");
    }
}

registry.category("actions").add("strataflow_crm", CrmScreen);
