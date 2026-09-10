import { patch } from "@web/core/utils/patch";
import { registry } from "@web/core/registry";
import { user } from "@web/core/user";
import { useBus, useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { NavBar } from "@web/webclient/navbar/navbar";
import { UserMenu } from "@web/webclient/user_menu/user_menu";
import { onWillStart, useState } from "@odoo/owl";
import { NAV } from "@strataflow_workorder/core/shell";

// The two systray items worth keeping. `web.user_menu` is the only route to Preferences and
// Log out; `burger_menu` is what a phone gets instead of the nav pills. Messaging, activities
// and the company switcher are dropped: the six screens carry none of them, and the tenant is
// a single company by construction (DB-per-tenant, ARCHITECTURE.md).
const KEEP_SYSTRAY = new Set(["web.user_menu", "burger_menu"]);

// Which nav pill lights up on a stock page. The pill has to say where the record belongs, not
// where the URL points — an invoice reached from a lead's smart button is still Invoices.
const MODEL_NAV = {
    "strataflow.workorder": "workorders",
    "crm.lead": "crm",
    "account.move": "invoices",
};

patch(NavBar.prototype, {
    setup() {
        super.setup();
        this.notification = useService("notification");
        this.sf = useState({ dispatcher: true, pending: null });
        onWillStart(async () => {
            this.sf.dispatcher = await user.hasGroup(
                "strataflow_workorder.group_strataflow_manager"
            );
        });
        // The pill has to follow the action, and the navbar only re-renders on menu and
        // systray changes of its own accord.
        useBus(this.env.bus, "ACTION_MANAGER:UI-UPDATED", () => {
            this.sf.pending = null;
            this.render();
        });
    },

    get sfNav() {
        return NAV.filter((n) => this.sf.dispatcher || !n.dispatcher);
    },

    // Same reason the shell keeps a `pending` key: the pill must look pressed on the click,
    // not when the next screen has finished mounting.
    get sfActiveKey() {
        if (this.sf.pending) {
            return this.sf.pending;
        }
        return MODEL_NAV[this.actionService.currentController?.action?.res_model] || null;
    },

    get systrayItems() {
        return super.systrayItems.filter((item) => KEEP_SYSTRAY.has(item.key));
    },

    sfGoNav(key) {
        const tag = `strataflow_${key}`;
        if (!registry.category("actions").contains(tag)) {
            this.notification.add(_t("%s is coming soon.", key), { type: "info" });
            return;
        }
        this.sf.pending = key;
        this.actionService
            .doAction({ type: "ir.actions.client", tag }, { clearBreadcrumbs: true })
            .catch((err) => {
                this.sf.pending = null; // the pill must not lie about where we are
                throw err;
            });
    },
});

NavBar.template = "strataflow_workorder.NavBar";

// Same rule as `strataflow.workorder._initials` on the server, so the disc in the corner of a
// stock page reads the same letters as the one on Dispatch.
patch(UserMenu.prototype, {
    setup() {
        super.setup();
        this.sfInitials = (user.name || "")
            .replace(/\./g, " ")
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
    },
});
