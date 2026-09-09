/* Strataflow sign-in: carry the app's theme choice onto the login page.
 *
 * The shell stores an explicit light/dark pick under `strataflow.theme` (core/theme.js).
 * Without this, someone who chose dark inside the app would be thrown a light login every
 * time their device is set to light. Only an explicit choice is stamped — with nothing
 * stored the stylesheet already follows `prefers-color-scheme`, so there is no flash.
 *
 * Deliberately not an @odoo-module: it runs on the public login page, needs nothing from
 * the webclient, and must stay tiny.
 */
(function () {
    "use strict";
    var root = document.querySelector(".o_sf_login");
    if (!root) {
        return;
    }
    var saved;
    try {
        saved = localStorage.getItem("strataflow.theme");
    } catch (e) {
        return; // storage blocked: the device preference stands
    }
    if (saved === "light" || saved === "dark") {
        root.setAttribute("data-theme", saved);
    }
})();
