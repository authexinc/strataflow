import { Component, onMounted, useRef } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";

/**
 * Popover under "Assign locator". Options come pre-sorted by the server
 * (not busy first, then lightest open load). Escape / outside click /
 * focus return are handled by the popover service.
 */
export class AssignLocatorPopover extends Component {
    static template = "strataflow_workorder.AssignLocatorPopover";
    static props = {
        crew: Array,
        onPick: Function,
        close: Function,
    };

    setup() {
        this.rootRef = useRef("root");
        onMounted(() => this.rootRef.el?.querySelector("button")?.focus());
    }

    get options() {
        let suggested = false;
        return this.props.crew.map((c) => {
            const isSuggested = !c.busy && !suggested;
            suggested = suggested || isSuggested;
            return {
                ...c,
                meta: c.busy ? _t("on site · %s open", c.open) : _t("%s open", c.open),
                tag: c.busy ? _t("Busy") : isSuggested ? _t("Suggested") : "",
                suggested: isSuggested,
            };
        });
    }

    pick(option) {
        this.props.onPick(option.id);
        this.props.close();
    }
}
