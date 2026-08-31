import { describe, expect, it, vi } from 'vitest';
import { claudeUsageSnapshotFromSdkMessage, mergeClaudeUsageSnapshot } from './claudeUsageSnapshot';

describe('claudeUsageSnapshotFromSdkMessage', () => {
    it('extracts context usage from SDK result messages', () => {
        vi.setSystemTime(1781490000000);

        const snapshot = claudeUsageSnapshotFromSdkMessage({
            type: 'result',
            subtype: 'success',
            duration_ms: 1,
            duration_api_ms: 1,
            is_error: false,
            num_turns: 1,
            result: '',
            stop_reason: null,
            total_cost_usd: 0,
            usage: {
                input_tokens: 1000,
                output_tokens: 100,
                cache_creation_input_tokens: 2000,
                cache_read_input_tokens: 7000,
                server_tool_use: null,
                service_tier: null,
            },
            modelUsage: {
                'claude-opus-4-6': {
                    inputTokens: 1000,
                    outputTokens: 100,
                    cacheCreationInputTokens: 2000,
                    cacheReadInputTokens: 7000,
                    webSearchRequests: 0,
                    costUSD: 0,
                    contextWindow: 200000,
                    maxOutputTokens: 64000,
                },
            },
            permission_denials: [],
            session_id: 'claude-session',
            uuid: 'result-id',
        } as any);

        expect(snapshot?.contextWindow).toMatchObject({
            usedPercentage: 5,
            remainingPercentage: 95,
            size: 200000,
            currentUsage: {
                inputTokens: 1000,
                outputTokens: 100,
                cacheCreationInputTokens: 2000,
                cacheReadInputTokens: 7000,
            },
        });
    });

    it('extracts 5h and 7d rate limit usage from SDK rate limit events', () => {
        const fiveHour = claudeUsageSnapshotFromSdkMessage({
            type: 'rate_limit_event',
            rate_limit_info: {
                rateLimitType: 'five_hour',
                status: 'allowed',
                utilization: 0.12,
                resetsAt: 1781500000,
            },
        } as any);
        const sevenDay = claudeUsageSnapshotFromSdkMessage({
            type: 'rate_limit_event',
            rate_limit_info: {
                rateLimitType: 'seven_day_opus',
                status: 'allowed_warning',
                utilization: 44,
                resetsAt: 1781600000,
            },
        } as any);

        const merged = mergeClaudeUsageSnapshot(fiveHour, sevenDay!);

        expect(merged.rateLimits?.fiveHour).toEqual({
            usedPercentage: 12,
            resetsAt: 1781500000,
            status: 'allowed',
        });
        expect(merged.rateLimits?.sevenDay).toEqual({
            usedPercentage: 44,
            resetsAt: 1781600000,
            status: 'allowed_warning',
        });
    });
});
