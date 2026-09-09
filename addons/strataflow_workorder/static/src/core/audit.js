import { _t } from "@web/core/l10n/translation";
import { geoDrawing, segMetres } from "./locate_geo";

/**
 * Rule-based check of a locate print against the ticket scope. Advisory only —
 * the locator's judgment governs. Returns [{ level: danger|warn|ok|faint, text }].
 */
export function auditDrawing(drawing, ticketUtilCodes, utilities) {
    const d = geoDrawing(drawing);
    const segs = d.segments;
    const notes = d.notes;
    const name = (code) => utilities.find((u) => u.code === code)?.name || code;
    const drawn = [...new Set(segs.map((s) => s.util))];
    const findings = [];
    ticketUtilCodes.forEach((u) => {
        if (!drawn.includes(u)) {
            findings.push({ level: "danger", text: _t("%s is on the ticket but has no drawn line — locate incomplete?", name(u)) });
        }
    });
    drawn.forEach((u) => {
        if (!ticketUtilCodes.includes(u)) {
            findings.push({ level: "warn", text: _t("%s drawn but not requested on the ticket — confirm scope with dispatch before closing.", name(u)) });
        }
    });
    segs.forEach((s, i) => {
        const m = segMetres(s);
        if (m < 2) {
            findings.push({ level: "warn", text: _t("%(util)s line %(n)s is only %(m)s m — unusually short for a service run.", { util: name(s.util), n: i + 1, m: m.toFixed(1) }) });
        }
        if (m > 90) {
            findings.push({ level: "warn", text: _t("%(util)s line %(n)s is %(m)s m — longer than typical for this lot; double-check the end point.", { util: name(s.util), n: i + 1, m: m.toFixed(0) }) });
        }
    });
    if (segs.length && !notes.length) {
        findings.push({ level: "warn", text: _t("No notes on the print — add access or hand-dig notes if any apply.") });
    }
    if (segs.length && !findings.length) {
        findings.push({ level: "ok", text: _t("No anomalies flagged. Coverage and measurements are within expected ranges for this address.") });
    }
    if (!segs.length) {
        findings.push({ level: "faint", text: _t("Nothing drawn yet — the audit runs against your locate lines.") });
    }
    return findings;
}

export function linesByUtility(drawing, utilities) {
    const segs = geoDrawing(drawing).segments;
    const rows = utilities
        .map((u) => {
            const mine = segs.filter((s) => s.util === u.code);
            return mine.length ? { code: u.code, name: u.name, color: u.color, count: mine.length, metres: mine.reduce((a, s) => a + segMetres(s), 0) } : null;
        })
        .filter(Boolean);
    return { rows, total: segs.reduce((a, s) => a + segMetres(s), 0) };
}
