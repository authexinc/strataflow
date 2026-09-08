import { reactive, useState } from "@odoo/owl";

const KEY = "strataflow.theme";
const FADE_MS = 480;

function readTheme() {
    try {
        const saved = localStorage.getItem(KEY);
        if (saved === "light" || saved === "dark") {
            return saved;
        }
    } catch {
        // storage blocked: fall through to the system preference
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// One store for every screen, so navigating never flashes the other theme.
const store = reactive({ theme: readTheme(), fading: false });
let fadeTimer;

/** Reactive {theme, fading} for the calling component. */
export function useTheme() {
    return useState(store);
}

/** Flip the theme; .is-theming turns on colour transitions for the swap only. */
export function toggleTheme() {
    store.fading = true;
    store.theme = store.theme === "dark" ? "light" : "dark";
    try {
        localStorage.setItem(KEY, store.theme);
    } catch {
        // session-only preference
    }
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => (store.fading = false), FADE_MS);
}
