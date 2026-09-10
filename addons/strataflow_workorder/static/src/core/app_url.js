/** @odoo-module **/
// The web client lives at /app/<path>; the address bar never says "odoo".
//
// Stock's router builds every URL it pushes from a hard-coded "odoo" prefix
// (web/static/src/core/browser/router.js, `startUrl`) and only recognises that prefix when it
// reads one back (`urlToState`). Both conversions sit on the exported `router` object, which
// stock marks as the place to patch "in a custom webclient". The server answers /app exactly as
// /odoo (controllers/home.py); in production nginx redirects any /odoo the server still emits.
//
// Not covered: the router's own click guard, which turns an <a href="/odoo/…"> click into an
// in-app navigation only while the page is under /odoo. Under /app such a link is a full
// page load — served directly in development, redirected to /app by nginx in production.

import { router, startRouter } from "@web/core/browser/router";
import { patch } from "@web/core/utils/patch";

const STOCK = "/odoo";
const OURS = "/app";

function hasPrefix(path, prefix) {
    return path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?");
}

patch(router, {
    stateToUrl(state) {
        const url = super.stateToUrl(state);
        return hasPrefix(url, STOCK) ? OURS + url.slice(STOCK.length) : url;
    },
    urlToState(urlObj) {
        if (hasPrefix(urlObj.pathname, OURS)) {
            urlObj = new URL(urlObj);
            urlObj.pathname = STOCK + urlObj.pathname.slice(OURS.length);
        }
        return super.urlToState(urlObj);
    },
});

// router.js called startRouter() when it was imported, before this patch existed, so the state
// it read from an /app URL is empty. Read the URL again; nothing has consumed the state yet
// (services start only after every module has loaded).
startRouter();
