const { DateTime } = luxon;

export function fmtDate(iso, fmt = "LLL dd, yyyy") {
    return iso ? DateTime.fromISO(iso).toFormat(fmt) : "";
}

export function fmtWhen(sql, fmt = "LLL dd · HH:mm") {
    return sql ? DateTime.fromSQL(sql, { zone: "utc" }).toLocal().toFormat(fmt) : "";
}

export function money(n, symbol = "$") {
    return symbol + Math.round(n || 0).toLocaleString("en-CA");
}

// "$18k/yr" style for pipeline cards
export function moneyShort(n, symbol = "$", suffix = "") {
    const v = n || 0;
    const body = v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString("en-CA") + "k" : Math.round(v).toLocaleString("en-CA");
    return symbol + body + suffix;
}

export function initials(name) {
    return (name || "")
        .replace(/\./g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

export function ago(days) {
    if (days < 1) {
        return "today";
    }
    if (days < 7) {
        return `${days}d`;
    }
    return `${Math.round(days / 7)}w`;
}
