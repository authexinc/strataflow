// Faux-map projection until live Strataline tiles land: equirectangular within a bbox.
export const CALGARY = { w: -114.32, s: 50.84, e: -113.86, n: 51.22 };

export function bboxOf(points, pad = 0.14) {
    const pts = points.filter((p) => p.latitude && p.longitude);
    if (pts.length < 2) {
        return CALGARY;
    }
    let w = Math.min(...pts.map((p) => p.longitude));
    let e = Math.max(...pts.map((p) => p.longitude));
    let s = Math.min(...pts.map((p) => p.latitude));
    let n = Math.max(...pts.map((p) => p.latitude));
    const dx = Math.max(e - w, 0.05) * pad;
    const dy = Math.max(n - s, 0.03) * pad;
    return { w: w - dx, e: e + dx, s: s - dy, n: n + dy };
}

export function project(p, bbox) {
    if (!p.latitude || !p.longitude) {
        return null;
    }
    return {
        x: ((p.longitude - bbox.w) / (bbox.e - bbox.w)) * 100,
        y: ((bbox.n - p.latitude) / (bbox.n - bbox.s)) * 100,
    };
}

export function haversineKm(a, b) {
    if (!a?.latitude || !b?.latitude) {
        return null;
    }
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Greedy route builder: every free locator starts from their current ticket (or the
 * centroid of the queue), and the shortest route always takes the next-nearest
 * unassigned ticket. Honest "suggested routes", not an optimiser.
 */
export function planRoutes(tickets, crew, anchors = {}) {
    const pool = tickets.filter((t) => t.status === "new" && t.latitude && t.longitude);
    const free = crew.filter((c) => !c.busy);
    if (!pool.length || !free.length) {
        return [];
    }
    const centroid = {
        latitude: pool.reduce((s, t) => s + t.latitude, 0) / pool.length,
        longitude: pool.reduce((s, t) => s + t.longitude, 0) / pool.length,
    };
    const routes = free.map((c) => ({ crew: c, stops: [], km: 0, last: anchors[c.id] || centroid }));
    const remaining = [...pool].sort((a, b) => (b.emergency ? 1 : 0) - (a.emergency ? 1 : 0));
    while (remaining.length) {
        const route = routes.reduce((best, r) => (r.km < best.km ? r : best), routes[0]);
        let bestI = 0;
        let bestD = Infinity;
        remaining.forEach((t, i) => {
            const d = haversineKm(route.last, t) ?? Infinity;
            if (d < bestD) {
                bestD = d;
                bestI = i;
            }
        });
        const [t] = remaining.splice(bestI, 1);
        route.stops.push(t);
        route.km += Number.isFinite(bestD) ? bestD : 0;
        route.last = t;
    }
    return routes.filter((r) => r.stops.length);
}
