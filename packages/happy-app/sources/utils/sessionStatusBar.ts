export type ContextUsageLevel = 'normal' | 'warning' | 'critical';

export function clampContextSize(value: number | null | undefined, maxValue: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(maxValue) || maxValue <= 0) {
        return 0;
    }

    return Math.min(Math.max(0, value ?? 0), maxValue);
}

export function getContextUsagePercentage(value: number | null | undefined, maxValue: number): number {
    if (!Number.isFinite(maxValue) || maxValue <= 0) {
        return 0;
    }

    return (clampContextSize(value, maxValue) / maxValue) * 100;
}

export function getContextUsageLevel(value: number | null | undefined, maxValue: number): ContextUsageLevel {
    const percentage = getContextUsagePercentage(value, maxValue);
    if (percentage >= 95) {
        return 'critical';
    }
    if (percentage >= 90) {
        return 'warning';
    }
    return 'normal';
}

/** No guessed window or fabricated zero when the backend has not reported usage. */
export function getContextUsageSummary(used: number | null | undefined, total: number | null | undefined) {
    if (typeof used !== 'number' || !Number.isFinite(used) || used < 0
        || typeof total !== 'number' || !Number.isFinite(total) || total <= 0) {
        return null;
    }
    return { used, total, percent: getContextUsagePercentage(used, total), level: getContextUsageLevel(used, total) };
}

export function formatContextTokenCount(value: number | undefined, allowZero = true): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) return null;
    if (value >= 999500) return `${Number((value / 1000000).toFixed(2))}M`;
    if (value >= 1000) return `${Math.round(value / 1000)}K`;
    return String(Math.round(value));
}

// --- Plan rate-limit windows (agentState.usageLimits) ---

export type UsageLimitWindowLike = {
    id: string;
    label?: string;
    status?: string;
    utilization?: number | null;
    resetsAt?: number | null;
};

export type UsageLimitsLike = {
    capturedAt: number;
    windows: UsageLimitWindowLike[];
} | null | undefined;

export type UsageLimitStatus = 'allowed' | 'allowed_warning' | 'rejected';

const CHIP_WINDOW_LABELS: Record<string, string> = {
    five_hour: '5h',
    seven_day: '7d',
    thirty_day: '30d',
};

/**
 * Trust the CLI-provided status when it's a value we know; otherwise fall
 * back to utilization thresholds so an unknown status string from a newer
 * CLI degrades instead of breaking the color mapping.
 */
export function getUsageLimitStatus(window: UsageLimitWindowLike): UsageLimitStatus {
    if (window.status === 'allowed' || window.status === 'allowed_warning' || window.status === 'rejected') {
        return window.status;
    }
    const u = window.utilization;
    if (typeof u === 'number' && Number.isFinite(u)) {
        if (u >= 100) return 'rejected';
        if (u >= 90) return 'allowed_warning';
    }
    return 'allowed';
}

export type UsageLimitChip = {
    id: string;
    shortLabel: string;
    utilization: number;
    status: UsageLimitStatus;
};

/**
 * Chips normally show only the well-known windows (5h/7d) with a numeric
 * utilization. If none exist, surface one critical unknown/unbound window so
 * a rejected or warning state can never disappear entirely. When `collapsed`
 * (narrow bar), only the window closest to its limit survives.
 */
export function getUsageLimitChips(limits: UsageLimitsLike, collapsed: boolean): UsageLimitChip[] {
    if (!limits || !Array.isArray(limits.windows)) {
        return [];
    }
    const chips: UsageLimitChip[] = [];
    for (const id of Object.keys(CHIP_WINDOW_LABELS)) {
        const window = limits.windows.find(w => w.id === id);
        if (!window) continue;
        const u = window.utilization;
        if (typeof u !== 'number' || !Number.isFinite(u)) continue;
        chips.push({
            id,
            shortLabel: CHIP_WINDOW_LABELS[id],
            utilization: Math.round(Math.min(100, Math.max(0, u))),
            status: getUsageLimitStatus(window),
        });
    }
    if (chips.length === 0) {
        const fallbackCandidates = limits.windows
            .map(window => ({ window, status: getUsageLimitStatus(window) }));
        const fallback = fallbackCandidates.find(({ status }) => status === 'rejected')
            ?? fallbackCandidates.find(({ status }) => status === 'allowed_warning');
        if (fallback) {
            const u = fallback.window.utilization;
            const utilization = typeof u === 'number' && Number.isFinite(u)
                ? Math.round(Math.min(100, Math.max(0, u)))
                : fallback.status === 'rejected' ? 100 : 90;
            chips.push({
                id: fallback.window.id,
                shortLabel: fallback.window.label?.trim()
                    || (fallback.window.id === 'plan' ? 'Plan' : fallback.window.id.replace(/_/g, ' ')),
                utilization,
                status: fallback.status,
            });
        }
    }
    if (collapsed && chips.length > 1) {
        return [chips.reduce((a, b) => (b.utilization > a.utilization ? b : a))];
    }
    return chips;
}

export type UsageLimitRow = {
    id: string;
    label: string;
    utilization: number | null;
    resetsAt: number | null;
    status: UsageLimitStatus;
};

/** All windows for the detail popover, well-known ids first. */
export function getUsageLimitRows(limits: UsageLimitsLike): UsageLimitRow[] {
    if (!limits || !Array.isArray(limits.windows)) {
        return [];
    }
    const known = Object.keys(CHIP_WINDOW_LABELS);
    const sorted = [...limits.windows].sort((a, b) => {
        const ai = known.indexOf(a.id);
        const bi = known.indexOf(b.id);
        return (ai < 0 ? known.length : ai) - (bi < 0 ? known.length : bi);
    });
    return sorted.map(w => ({
        id: w.id,
        label: w.label ?? w.id.replace(/_/g, ' '),
        utilization: typeof w.utilization === 'number' && Number.isFinite(w.utilization)
            ? Math.round(Math.min(100, Math.max(0, w.utilization)))
            : null,
        resetsAt: typeof w.resetsAt === 'number' && Number.isFinite(w.resetsAt) ? w.resetsAt : null,
        status: getUsageLimitStatus(w),
    }));
}

/** The composer shows only the requested 5-hour and 7-day plan windows. */
export function getComposerUsageRows(limits: UsageLimitsLike): UsageLimitRow[] {
    return getUsageLimitRows(limits)
        .filter(row => row.id === 'five_hour' || row.id === 'seven_day')
        .map(row => ({ ...row, label: CHIP_WINDOW_LABELS[row.id] }));
}

/**
 * `utilization` is always "percent used" — the wire format and the color
 * thresholds both depend on that, so the remaining view is a display-time
 * flip only.
 */
export function getUsageLimitDisplayPercentage(utilization: number, showRemaining: boolean): number {
    return showRemaining ? 100 - utilization : utilization;
}

/** Short reset moment: a clock time within a day, a date beyond that. */
export function formatUsageLimitResetTime(ms: number): string {
    const d = new Date(ms);
    if (ms - Date.now() < 22 * 3600_000) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/** Compact age like "3m" / "2h" for the "as of" footer. */
export function formatUsageLimitAge(capturedAt: number, now: number): string {
    const deltaMin = Math.max(0, Math.floor((now - capturedAt) / 60000));
    if (deltaMin < 1) return '<1m';
    if (deltaMin < 60) return `${deltaMin}m`;
    const hours = Math.round(deltaMin / 60);
    if (hours < 48) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
}
