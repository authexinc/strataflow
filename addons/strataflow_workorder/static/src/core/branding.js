/** @odoo-module **/
// The window title falls back to "StrataFlow", not "Odoo".
//
// Stock's title service (web/static/src/core/browser/title_service.js) joins the parts it has
// been given and writes "Odoo" when there are none — the bare /app page, and the moment
// before an action mounts. The fallback is a literal inside a closure, so the service is
// wrapped and document.title corrected after each write instead.

import { titleService } from "@web/core/browser/title_service";
import { patch } from "@web/core/utils/patch";

const STOCK_FALLBACK = /(^|\) )Odoo$/;

patch(titleService, {
    start() {
        const service = super.start(...arguments);
        const fix = () => {
            document.title = document.title.replace(STOCK_FALLBACK, "$1StrataFlow");
        };
        for (const name of ["setParts", "setCounters"]) {
            const stock = service[name];
            service[name] = (...args) => {
                stock(...args);
                fix();
            };
        }
        fix();
        return service;
    },
});
