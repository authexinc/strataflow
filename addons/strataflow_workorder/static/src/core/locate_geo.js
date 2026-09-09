import { haversineKm } from "./geo";

/**
 * The locate print is geo-referenced (Stefan, 2026-09-09): every line end and every note is a
 * [lng, lat], drawn as a layer on the live map, so it pans and zooms with the utilities it
 * marks and its metres are real. Shape, persisted as-is on `strataflow.workorder.drawing`:
 *
 *   { v: 2, segments: [{ a: [lng, lat], b: [lng, lat], util }], notes: [{ at: [lng, lat], text }] }
 *
 * Anything without `v: 2` is the old canvas-pixel format and is treated as empty — demo data
 * never carried drawings, so nothing real is lost. `controllers/export.py` mirrors
 * `projectDrawing` for the PDF; keep the two in step.
 */

export const M_PER_DEG_LAT = 111320;
const MIN_SPAN_M = 30; // a single short line is not blown up to fill the print
const MAX_PX_PER_M = 12; // …and never drawn finer than 1 px ≈ 8 cm

export function emptyDrawing() {
    return { v: 2, segments: [], notes: [] };
}

export function isGeoDrawing(d) {
    return d?.v === 2;
}

/** The drawing as the code expects it: geo, or empty when it is the old pixel format. */
export function geoDrawing(d) {
    return isGeoDrawing(d) ? d : emptyDrawing();
}

export function segMetres(s) {
    return haversineKm({ latitude: s.a[1], longitude: s.a[0] }, { latitude: s.b[1], longitude: s.b[0] }) * 1000;
}

function points(d) {
    const pts = [];
    for (const s of d.segments || []) {
        pts.push(s.a, s.b);
    }
    for (const n of d.notes || []) {
        pts.push(n.at);
    }
    return pts;
}

/**
 * North-up print of the drawing in a w×h pixel box: equirectangular around the drawing's own
 * centre, scaled to fit with `pad` px of margin. Returns pixel segments/notes plus the scale.
 */
export function projectDrawing(drawing, w, h, pad = 28) {
    const d = geoDrawing(drawing);
    const pts = points(d);
    if (!pts.length) {
        return { segments: [], notes: [], mPerPx: 0, w, h };
    }
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    const lng0 = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
    const mPerDegLng = M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180);
    const toM = ([lng, lat]) => ({ x: (lng - lng0) * mPerDegLng, y: -(lat - lat0) * M_PER_DEG_LAT });
    const m = pts.map(toM);
    const spanX = Math.max(MIN_SPAN_M, ...m.map((p) => Math.abs(p.x) * 2));
    const spanY = Math.max(MIN_SPAN_M, ...m.map((p) => Math.abs(p.y) * 2));
    const pxPerM = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY, MAX_PX_PER_M);
    const toPx = (p) => {
        const q = toM(p);
        return { x: w / 2 + q.x * pxPerM, y: h / 2 + q.y * pxPerM };
    };
    return {
        w, h, mPerPx: 1 / pxPerM,
        segments: d.segments.map((s) => {
            const a = toPx(s.a);
            const b = toPx(s.b);
            return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, util: s.util, metres: segMetres(s) };
        }),
        notes: d.notes.map((n) => ({ ...toPx(n.at), text: n.text })),
    };
}
