import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createPaginationHarness } = require('../../scripts/sync-pagination-harness.cjs');
afterEach(() => vi.useRealTimers());

describe('Sync history pagination', () => {
    it('opens the latest page without fetching history in the background', async () => {
        vi.useFakeTimers();
        const h = createPaginationHarness();
        await h.sync.fetchMessages('chat');
        await vi.advanceTimersByTimeAsync(3000);
        expect(h.entry.isLoaded).toBe(true);
        expect(h.entry.hasMoreOlder).toBe(true);
        expect(h.requests).toHaveLength(1);
        expect(h.pages[0]).toHaveLength(100);
        expect(h.sync.sessionOldestSeq.get('chat')).toBe(901);
    });

    it('loads exactly one older page on an explicit request, then stops', async () => {
        vi.useFakeTimers();
        const h = createPaginationHarness();
        await h.sync.fetchMessages('chat');
        await h.sync.loadOlderMessages('chat');
        await vi.advanceTimersByTimeAsync(3000);
        expect(h.requests).toHaveLength(2);
        expect(h.requests[1]).toContain('before_seq=901&limit=100');
        expect(h.sync.sessionOldestSeq.get('chat')).toBe(801);
        expect(h.entry.isLoadingOlder).toBe(false);
    });

    it('revisits only forward-sync new messages and retain the older cursor', async () => {
        vi.useFakeTimers();
        const h = createPaginationHarness();
        await h.sync.fetchMessages('chat');
        await h.sync.fetchMessages('chat');
        await vi.advanceTimersByTimeAsync(3000);
        expect(h.requests).toHaveLength(2);
        expect(h.requests[1]).toContain('after_seq=1000&limit=100');
        expect(h.sync.sessionLastSeq.get('chat')).toBe(1002);
        expect(h.sync.sessionOldestSeq.get('chat')).toBe(901);
    });

    it('releases the history loading state after failure so the user can retry', async () => {
        vi.useFakeTimers();
        const h = createPaginationHarness();
        await h.sync.fetchMessages('chat');
        h.failNext();
        await expect(h.sync.loadOlderMessages('chat')).rejects.toThrow('503');
        expect(h.entry.isLoadingOlder).toBe(false);
        await h.sync.loadOlderMessages('chat');
        expect(h.sync.sessionOldestSeq.get('chat')).toBe(801);
    });
});
