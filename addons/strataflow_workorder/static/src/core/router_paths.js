import { patch } from "@web/core/utils/patch";
import { router } from "@web/core/browser/router";

/**
 * Keep the product screens at the root of the domain: /dispatch, not /odoo/dispatch.
 *
 * The server serves those paths (controllers/home.py), but that alone is not enough — the
 * first in-app navigation would call `stateToUrl`, get "/odoo/dispatch" back, and push that
 * into the address bar, so the clean URL would survive exactly one page load. Upstream marks
 * both conversions as the supported seam for this: "state <-> url conversions can be patched
 * if needed in a custom webclient" (web/static/src/core/browser/router.js).
 *
 * Deliberately narrow. Only the six exact paths below are rewritten, and only when they are
 * the whole path — anything with a record id, an active_id, a breadcrumb stack, or any other
 * action keeps Odoo's own URL untouched. Stock screens are never affected, so /odoo remains
 * the way into the backend.
 *
 * The list is duplicated in controllers/home.py `SCREEN_PATHS`; adding a screen means adding
 * it in both, and it must match the `path` on that screen's client action.
 */
const SCREENS = ["home", "dispatch", "workorders", "pipeline", "invoices", "locator"];
const TO_CLEAN = new Map(SCREENS.map((s) => [`/odoo/${s}`, `/${s}`]));
const TO_ODOO = new Map(SCREENS.map((s) => [`/${s}`, `/odoo/${s}`]));

patch(router, {
    stateToUrl(state) {
        const url = super.stateToUrl(state);
        // url is a path plus an optional query string; only the path part is ours to rewrite
        const [path, query] = url.split("?");
        const clean = TO_CLEAN.get(path);
        return clean ? clean + (query ? `?${query}` : "") : url;
    },

    urlToState(urlObj) {
        const odooPath = TO_ODOO.get(urlObj.pathname);
        if (odooPath) {
            // Hand upstream the shape it knows how to parse. Mutating rather than cloning is
            // deliberate: urlToState also rewrites urlObj itself when migrating a legacy hash
            // URL, and a clone would drop that.
            urlObj.pathname = odooPath;
        }
        return super.urlToState(urlObj);
    },
});
