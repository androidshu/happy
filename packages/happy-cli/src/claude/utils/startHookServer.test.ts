import { describe, expect, it } from 'vitest';
import { parseClaudeUsageSnapshot } from './startHookServer';

describe('parseClaudeUsageSnapshot', () => {
    it('extracts Claude status line usage fields', () => {
        expect(parseClaudeUsageSnapshot({
            context_window: {
                used_percentage: 37.2,
                remaining_percentage: 62.8,
                context_window_size: 200000,
                total_input_tokens: 12000,
                total_output_tokens: 4000,
                current_usage: {
                    input_tokens: 1000,
                    output_tokens: 200,
                    cache_creation_input_tokens: 300,
                    cache_read_input_tokens: 400,
                },
            },
            rate_limits: {
                five_hour: {
                    used_percentage: 44,
                    resets_at: 1800000000,
                },
                seven_day: {
                    used_percentage: 55,
                    resets_at: 1800100000,
                },
            },
        }, 1234)).toEqual({
            updatedAt: 1234,
            contextWindow: {
                usedPercentage: 37.2,
                remainingPercentage: 62.8,
                size: 200000,
                totalInputTokens: 12000,
                totalOutputTokens: 4000,
                currentUsage: {
                    inputTokens: 1000,
                    outputTokens: 200,
                    cacheCreationInputTokens: 300,
                    cacheReadInputTokens: 400,
                },
            },
            rateLimits: {
                fiveHour: {
                    usedPercentage: 44,
                    resetsAt: 1800000000,
                },
                sevenDay: {
                    usedPercentage: 55,
                    resetsAt: 1800100000,
                },
            },
        });
    });

    it('returns null when status line data has no usage fields', () => {
        expect(parseClaudeUsageSnapshot({ model: { display_name: 'Claude' } }, 1234)).toBeNull();
    });
});
