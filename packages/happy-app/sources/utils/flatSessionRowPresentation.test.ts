import { describe, expect, it } from 'vitest';

import {
    resolveFlatSessionRowPresentation,
    SESSION_BLOCKED_DOT_COLOR,
    SESSION_DISCONNECTED_DOT_COLOR,
    SESSION_READY_DOT_COLOR,
    SESSION_RUNNING_DOT_COLOR,
} from './flatSessionRowPresentation';

describe('resolveFlatSessionRowPresentation', () => {
    it('shimmers running work and breathes its dot in blue', () => {
        expect(resolveFlatSessionRowPresentation({
            state: 'thinking',
            hasUnread: false,
            faded: false,
        })).toEqual({
            shimmerTitle: true,
            statusDot: { type: 'dot', color: SESSION_RUNNING_DOT_COLOR, pulsing: true },
        });
    });

    it('settles the dot in green once an unread result is ready', () => {
        expect(resolveFlatSessionRowPresentation({
            state: 'waiting',
            hasUnread: true,
            faded: false,
        })).toEqual({
            shimmerTitle: false,
            statusDot: { type: 'dot', color: SESSION_READY_DOT_COLOR, pulsing: false },
        });
    });

    it('shows no dot once the result has been read', () => {
        expect(resolveFlatSessionRowPresentation({
            state: 'waiting',
            hasUnread: false,
            faded: false,
        })).toEqual({
            shimmerTitle: false,
            statusDot: { type: 'none' },
        });
    });

    it.each(['permission_required', 'input_required'] as const)(
        'pulses the dot in orange for %s',
        (state) => {
            expect(resolveFlatSessionRowPresentation({
                state,
                hasUnread: true,
                faded: false,
            })).toEqual({
                shimmerTitle: false,
                statusDot: { type: 'dot', color: SESSION_BLOCKED_DOT_COLOR, pulsing: true },
            });
        },
    );

    it('greys a disconnected session that is not yet faded', () => {
        expect(resolveFlatSessionRowPresentation({
            state: 'disconnected',
            hasUnread: false,
            faded: false,
        })).toEqual({
            shimmerTitle: false,
            statusDot: { type: 'dot', color: SESSION_DISCONNECTED_DOT_COLOR, pulsing: false },
        });
    });

    it('hides the dot entirely for faded rows', () => {
        expect(resolveFlatSessionRowPresentation({
            state: 'permission_required',
            hasUnread: true,
            faded: true,
        })).toEqual({
            shimmerTitle: false,
            statusDot: { type: 'none' },
        });
    });
});
