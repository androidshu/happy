import type { UsageLimitWindow, UsageLimits } from '@/api/types';
import type { AccountRateLimitSnapshot, AccountRateLimitsResponse } from './codexAppServerTypes';

function normalizeWindowId(durationMinutes: number): { id: string; label?: string } {
    if (durationMinutes === 300) return { id: 'five_hour' };
    if (durationMinutes === 10_080) return { id: 'seven_day' };
    if (durationMinutes >= 40_320 && durationMinutes <= 44_640) {
        return { id: 'thirty_day', label: '30d' };
    }
    return { id: `window_${durationMinutes}m`, label: `${durationMinutes}m` };
}

function normalizeSnapshot(snapshot: AccountRateLimitSnapshot | null | undefined): UsageLimitWindow[] {
    if (!snapshot) return [];

    const windows: UsageLimitWindow[] = [];
    for (const source of [snapshot.primary, snapshot.secondary]) {
        if (!source || !Number.isFinite(source.usedPercent) || !Number.isFinite(source.windowDurationMins)) {
            continue;
        }
        const durationMinutes = Math.round(source.windowDurationMins ?? 0);
        if (durationMinutes <= 0) continue;

        const utilization = Math.min(100, Math.max(0, source.usedPercent));
        const { id, label } = normalizeWindowId(durationMinutes);
        windows.push({
            id,
            ...(label ? { label } : {}),
            utilization,
            resetsAt: typeof source.resetsAt === 'number' && Number.isFinite(source.resetsAt)
                ? source.resetsAt * 1000
                : null,
            status: utilization >= 100 || snapshot.rateLimitReachedType
                ? 'rejected'
                : utilization >= 90
                    ? 'allowed_warning'
                    : 'allowed',
        });
    }
    return windows;
}

export function codexUsageLimitsFromRateLimits(
    response: AccountRateLimitsResponse | AccountRateLimitSnapshot | null | undefined,
    capturedAt: number = Date.now(),
): UsageLimits | null {
    if (!response) return null;

    const container = response as AccountRateLimitsResponse;
    const directSnapshot = 'primary' in response || 'secondary' in response
        ? response as AccountRateLimitSnapshot
        : null;
    const primarySnapshot = directSnapshot
        ?? container.rateLimits
        ?? container.rateLimitsByLimitId?.codex
        ?? null;
    const windows = normalizeSnapshot(primarySnapshot);
    return windows.length > 0 ? { capturedAt, windows } : null;
}

export function mergeCodexUsageLimits(
    current: UsageLimits | null | undefined,
    incoming: UsageLimits,
): UsageLimits {
    const windows = [...(current?.windows ?? [])];
    for (const next of incoming.windows) {
        const index = windows.findIndex((window) => window.id === next.id);
        if (index >= 0) {
            windows[index] = next;
        } else {
            windows.push(next);
        }
    }
    return { capturedAt: incoming.capturedAt, windows };
}
