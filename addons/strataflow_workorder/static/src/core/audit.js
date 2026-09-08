import { _t } from "@web/core/l10n/translation";

const PX_TO_M = 0.15;

function segLen(s) {
    return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * PX_TO_M;
}

/**
 * Rule-based check of a locate print against the ticket scope. Advisory only —
 * the locator's judgment governs. Returns [{ level: danger|warn|ok|faint, text }].
 */
export function auditDrawing(drawing, ticketUtilCodes, utilities) {
    const segs = drawing?.segments || [];
    const notes = drawing?.notes || [];
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
        const m = segLen(s);
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
    const segs = drawing?.segments || [];
    const rows = utilities
        .map((u) => {
            const mine = segs.filter((s) => s.util === u.code);
            return mine.length ? { code: u.code, name: u.name, color: u.color, count: mine.length, metres: mine.reduce((a, s) => a + segLen(s), 0) } : null;
        })
        .filter(Boolean);
    return { rows, total: segs.reduce((a, s) => a + segLen(s), 0) };
}
