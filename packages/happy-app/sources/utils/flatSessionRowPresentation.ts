import type { SessionState } from '@/sync/sessionState';

export const SESSION_RUNNING_DOT_COLOR = '#007AFF';
export const SESSION_BLOCKED_DOT_COLOR = '#FF9500';
export const SESSION_READY_DOT_COLOR = '#34C759';
export const SESSION_DISCONNECTED_DOT_COLOR = '#999999';

export type FlatSessionRowStatusDot =
    | { type: 'dot'; color: string; pulsing: boolean }
    | { type: 'none' };

/**
 * Splits the flat row's two progress signals: active work is carried by the
 * title shimmer, while the session's own state is a small dot on the metadata
 * line. Blue breathes while the agent runs, orange breathes while it is
 * blocked, and green settles once there is an unread result — and only then;
 * the dot disappears as soon as the session has been read, so a list of
 * seen-and-idle sessions carries no dots at all. The same language the old
 * project-card list spoke, shrunk to sit next to the draft and git badges.
 */
export function resolveFlatSessionRowPresentation({
    state,
    hasUnread,
    faded,
}: {
    state: SessionState;
    hasUnread: boolean;
    faded: boolean;
}): {
    shimmerTitle: boolean;
    statusDot: FlatSessionRowStatusDot;
} {
    if (faded) {
        return { shimmerTitle: false, statusDot: { type: 'none' } };
    }

    if (state === 'permission_required' || state === 'input_required') {
        return {
            shimmerTitle: false,
            statusDot: { type: 'dot', color: SESSION_BLOCKED_DOT_COLOR, pulsing: true },
        };
    }

    if (state === 'thinking') {
        return {
            shimmerTitle: true,
            statusDot: { type: 'dot', color: SESSION_RUNNING_DOT_COLOR, pulsing: true },
        };
    }

    if (hasUnread) {
        return {
            shimmerTitle: false,
            statusDot: { type: 'dot', color: SESSION_READY_DOT_COLOR, pulsing: false },
        };
    }

    if (state === 'waiting') {
        // Idle and read: nothing to say — opening the session cancels the dot.
        return { shimmerTitle: false, statusDot: { type: 'none' } };
    }

    return {
        shimmerTitle: false,
        statusDot: { type: 'dot', color: SESSION_DISCONNECTED_DOT_COLOR, pulsing: false },
    };
}
