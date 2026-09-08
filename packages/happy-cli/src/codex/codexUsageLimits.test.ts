import { describe, expect, it } from 'vitest';
import { codexUsageLimitsFromRateLimits, mergeCodexUsageLimits } from './codexUsageLimits';

describe('Codex usage limits', () => {
    it('maps native weekly and monthly windows into the shared agent-state shape', () => {
        expect(codexUsageLimitsFromRateLimits({
            primary: { usedPercent: 25, windowDurationMins: 10_080, resetsAt: 1_789_435_405 },
            secondary: { usedPercent: 40, windowDurationMins: 43_200, resetsAt: 1_791_000_000 },
        }, 123)).toEqual({
            capturedAt: 123,
            windows: [
                { id: 'seven_day', utilization: 25, resetsAt: 1_789_435_405_000, status: 'allowed' },
                { id: 'thirty_day', label: '30d', utilization: 40, resetsAt: 1_791_000_000_000, status: 'allowed' },
            ],
        });
    });

    it('uses the canonical Codex bucket when the top-level snapshot is absent', () => {
        expect(codexUsageLimitsFromRateLimits({
            rateLimitsByLimitId: {
                codex: {
                    primary: { usedPercent: 92, windowDurationMins: 300, resetsAt: 1_789_000_000 },
                },
            },
        }, 456)?.windows).toEqual([
            { id: 'five_hour', utilization: 92, resetsAt: 1_789_000_000_000, status: 'allowed_warning' },
        ]);
    });

    it('merges a native update without dropping a different known window', () => {
        expect(mergeCodexUsageLimits(
            { capturedAt: 1, windows: [{ id: 'seven_day', utilization: 10 }] },
            { capturedAt: 2, windows: [{ id: 'five_hour', utilization: 20 }] },
        )).toEqual({
            capturedAt: 2,
            windows: [
                { id: 'seven_day', utilization: 10 },
                { id: 'five_hour', utilization: 20 },
            ],
        });
    });
});
