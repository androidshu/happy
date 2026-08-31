import type { ClaudeUsageSnapshot } from '@/api/types';
import type { SDKMessage, SDKResultMessage } from '@/claude/sdk';

type SdkRateLimitInfo = {
    status?: 'allowed' | 'allowed_warning' | 'rejected';
    resetsAt?: number;
    rateLimitType?: 'five_hour' | 'seven_day' | 'seven_day_opus' | 'seven_day_sonnet' | 'overage';
    utilization?: number;
};

type SdkRateLimitEvent = {
    type: 'rate_limit_event';
    rate_limit_info?: SdkRateLimitInfo;
};

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function usedPercentageFromUtilization(value: unknown): number | undefined {
    const utilization = finiteNumber(value);
    if (utilization === undefined) {
        return undefined;
    }
    const percent = utilization <= 1 ? utilization * 100 : utilization;
    return Math.max(0, Math.min(100, percent));
}

function currentUsageTokens(usage: SDKResultMessage['usage'] | undefined): number | undefined {
    if (!usage) {
        return undefined;
    }
    return (usage.input_tokens ?? 0)
        + (usage.cache_creation_input_tokens ?? 0)
        + (usage.cache_read_input_tokens ?? 0);
}

function contextWindowSize(message: SDKResultMessage): number | undefined {
    const sizes = Object.values(message.modelUsage ?? {})
        .map((usage) => finiteNumber(usage.contextWindow))
        .filter((size): size is number => size !== undefined && size > 0);
    return sizes.length > 0 ? Math.max(...sizes) : undefined;
}

function fromResultMessage(message: SDKResultMessage): ClaudeUsageSnapshot | null {
    const currentTokens = currentUsageTokens(message.usage);
    const size = contextWindowSize(message);

    if (currentTokens === undefined && size === undefined) {
        return null;
    }

    const usedPercentage = currentTokens !== undefined && size !== undefined && size > 0
        ? Math.max(0, Math.min(100, (currentTokens / size) * 100))
        : undefined;

    return {
        updatedAt: Date.now(),
        contextWindow: {
            usedPercentage,
            remainingPercentage: usedPercentage !== undefined ? 100 - usedPercentage : undefined,
            size,
            currentUsage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
                cacheReadInputTokens: message.usage.cache_read_input_tokens,
            },
        },
    };
}

function fromRateLimitEvent(message: SdkRateLimitEvent): ClaudeUsageSnapshot | null {
    const info = message.rate_limit_info;
    if (!info?.rateLimitType) {
        return null;
    }

    const limit = {
        usedPercentage: usedPercentageFromUtilization(info.utilization),
        resetsAt: finiteNumber(info.resetsAt),
        status: info.status,
    };

    if (
        limit.usedPercentage === undefined
        && limit.resetsAt === undefined
        && limit.status === undefined
    ) {
        return null;
    }

    const rateLimits: NonNullable<ClaudeUsageSnapshot['rateLimits']> = {};
    if (info.rateLimitType === 'five_hour') {
        rateLimits.fiveHour = limit;
    } else if (
        info.rateLimitType === 'seven_day'
        || info.rateLimitType === 'seven_day_opus'
        || info.rateLimitType === 'seven_day_sonnet'
    ) {
        rateLimits.sevenDay = limit;
    } else {
        return null;
    }

    return {
        updatedAt: Date.now(),
        rateLimits,
    };
}

export function claudeUsageSnapshotFromSdkMessage(message: SDKMessage): ClaudeUsageSnapshot | null {
    if (message.type === 'result') {
        return fromResultMessage(message as SDKResultMessage);
    }
    if (message.type === 'rate_limit_event') {
        return fromRateLimitEvent(message as unknown as SdkRateLimitEvent);
    }
    return null;
}

export function mergeClaudeUsageSnapshot(
    current: ClaudeUsageSnapshot | null | undefined,
    next: ClaudeUsageSnapshot,
): ClaudeUsageSnapshot {
    return {
        updatedAt: next.updatedAt,
        contextWindow: next.contextWindow ?? current?.contextWindow,
        rateLimits: {
            fiveHour: next.rateLimits?.fiveHour ?? current?.rateLimits?.fiveHour,
            sevenDay: next.rateLimits?.sevenDay ?? current?.rateLimits?.sevenDay,
        },
    };
}
