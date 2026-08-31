import { beforeEach, describe, expect, it, vi } from 'vitest';

// react-native-mmkv needs a native backend; back it with an in-memory map.
const mmkvStore = new Map<string, string>();
vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string) { return mmkvStore.get(key); }
        set(key: string, value: string) { mmkvStore.set(key, value); }
        delete(key: string) { mmkvStore.delete(key); }
        getNumber(key: string) { const v = mmkvStore.get(key); return v === undefined ? undefined : Number(v); }
        clearAll() { mmkvStore.clear(); }
    },
}));

const kvGetByPrefix = vi.fn();
const kvMutate = vi.fn();
vi.mock('./apiKv', () => ({
    kvGetByPrefix: (...args: unknown[]) => kvGetByPrefix(...args),
    kvMutate: (...args: unknown[]) => kvMutate(...args),
}));

const applyRemoteUnreadStates = vi.fn();
vi.mock('./storage', () => ({
    storage: { getState: () => ({ applyRemoteUnreadStates }) },
}));

const {
    initReadStateSync,
    fetchAndApplyUnreadStates,
    applyRemoteReadStateChanges,
    pushSessionRead,
    pushSessionUnread,
    resetReadStateSyncForTests,
} = await import('./readStateSync');
const { saveSessionReadTombstones } = await import('./persistence');

const credentials: any = { token: 'test-token' };

// Matches readStateSync's ASCII-only base64 encoding of the timestamp.
function encodeCompletedAt(completedAt: number): string {
    const text = String(completedAt);
    return Buffer.from(text, 'utf8').toString('base64');
}

async function flushWrites(): Promise<void> {
    // push* fire-and-forget; let the mutation chain settle.
    for (let i = 0; i < 10; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

beforeEach(() => {
    mmkvStore.clear();
    kvGetByPrefix.mockReset();
    kvMutate.mockReset();
    applyRemoteUnreadStates.mockReset();
    resetReadStateSyncForTests();
    initReadStateSync(credentials);
});

describe('fetchAndApplyUnreadStates', () => {
    it('applies every server-side unread marker', async () => {
        kvGetByPrefix.mockResolvedValue([
            { key: 'session-read.a', value: encodeCompletedAt(1000), version: 0 },
            { key: 'session-read.b', value: encodeCompletedAt(2000), version: 3 },
        ]);

        await fetchAndApplyUnreadStates();

        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: ['a', 'b'], remove: [] });
    });

    it('keeps a newer local read over a stale server marker and retries the delete', async () => {
        // Read at 3000, but the server still has a marker from 2000 (the delete lost).
        saveSessionReadTombstones({ a: 3000 });
        kvGetByPrefix.mockResolvedValue([
            { key: 'session-read.a', value: encodeCompletedAt(2000), version: 1 },
        ]);
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 2 }] });

        await fetchAndApplyUnreadStates();
        await flushWrites();

        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: [], remove: [] });
        expect(kvMutate).toHaveBeenCalledWith(credentials, [{ key: 'session-read.a', value: null, version: 1 }]);
    });

    it('lets a newer completion win over an older read', async () => {
        saveSessionReadTombstones({ a: 1000 });
        kvGetByPrefix.mockResolvedValue([
            { key: 'session-read.a', value: encodeCompletedAt(2000), version: 1 },
        ]);

        await fetchAndApplyUnreadStates();

        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: ['a'], remove: [] });
    });
});

describe('applyRemoteReadStateChanges', () => {
    it('ignores keys outside the session-read prefix', () => {
        applyRemoteReadStateChanges([{ key: 'settings', value: 'x', version: 1 }]);
        expect(applyRemoteUnreadStates).not.toHaveBeenCalled();
    });

    it('removes the marker when another device read the session', () => {
        applyRemoteReadStateChanges([{ key: 'session-read.a', value: null, version: 2 }]);
        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: [], remove: ['a'] });
    });

    it('adds the marker when another device observed a completion', () => {
        applyRemoteReadStateChanges([{ key: 'session-read.a', value: encodeCompletedAt(2000), version: 0 }]);
        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: ['a'], remove: [] });
    });

    it('ignores the echo of a locally-pushed completion', async () => {
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 1 }] });
        pushSessionUnread('a', 2000);
        await flushWrites();

        applyRemoteReadStateChanges([{ key: 'session-read.a', value: encodeCompletedAt(2000), version: 1 }]);

        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: [], remove: [] });
    });

    it('applies a newer completion even while the session is already unread', () => {
        applyRemoteReadStateChanges([{ key: 'session-read.a', value: encodeCompletedAt(2000), version: 1 }]);
        applyRemoteReadStateChanges([{ key: 'session-read.a', value: encodeCompletedAt(3000), version: 2 }]);

        expect(applyRemoteUnreadStates).toHaveBeenNthCalledWith(1, { add: ['a'], remove: [] });
        expect(applyRemoteUnreadStates).toHaveBeenNthCalledWith(2, { add: ['a'], remove: [] });
    });

    it('ignores a stale marker that a local read already superseded', async () => {
        saveSessionReadTombstones({ a: 3000 });
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 2 }] });

        applyRemoteReadStateChanges([{ key: 'session-read.a', value: encodeCompletedAt(2000), version: 1 }]);
        await flushWrites();

        expect(applyRemoteUnreadStates).toHaveBeenCalledWith({ add: [], remove: [] });
        // And the stale marker gets repaired server-side.
        expect(kvMutate).toHaveBeenCalledWith(credentials, [{ key: 'session-read.a', value: null, version: 1 }]);
    });
});

describe('pushSessionRead', () => {
    it('records a tombstone and skips the server write when the key is unknown', async () => {
        pushSessionRead('a');
        await flushWrites();

        expect(kvMutate).not.toHaveBeenCalled();
        const { loadSessionReadTombstones } = await import('./persistence');
        expect(loadSessionReadTombstones().a).toBeGreaterThan(0);
    });

    it('deletes the server key with its known version after a fetch', async () => {
        kvGetByPrefix.mockResolvedValue([
            { key: 'session-read.a', value: encodeCompletedAt(1000), version: 4 },
        ]);
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 5 }] });
        await fetchAndApplyUnreadStates();

        pushSessionRead('a');
        await flushWrites();

        expect(kvMutate).toHaveBeenCalledWith(credentials, [{ key: 'session-read.a', value: null, version: 4 }]);
    });
});

describe('pushSessionUnread', () => {
    it('creates the key and retries with the server version on conflict', async () => {
        kvMutate
            .mockResolvedValueOnce({
                success: false,
                errors: [{ key: 'session-read.a', error: 'version-mismatch', version: 7, value: encodeCompletedAt(500) }],
            })
            .mockResolvedValueOnce({ success: true, results: [{ key: 'session-read.a', version: 8 }] });

        pushSessionUnread('a', 1000);
        await flushWrites();

        expect(kvMutate).toHaveBeenNthCalledWith(1, credentials, [
            { key: 'session-read.a', value: encodeCompletedAt(1000), version: -1 },
        ]);
        expect(kvMutate).toHaveBeenNthCalledWith(2, credentials, [
            { key: 'session-read.a', value: encodeCompletedAt(1000), version: 7 },
        ]);
    });

    it('clears a tombstone when the completion is newer than the read', async () => {
        saveSessionReadTombstones({ a: 1000 });
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 0 }] });

        pushSessionUnread('a', 2000);
        await flushWrites();

        const { loadSessionReadTombstones } = await import('./persistence');
        expect(loadSessionReadTombstones().a).toBeUndefined();
    });

    it('gives consecutive completions a monotonic revision', async () => {
        kvMutate.mockResolvedValue({ success: true, results: [{ key: 'session-read.a', version: 1 }] });

        pushSessionUnread('a', 2000);
        pushSessionUnread('a', 2000);
        await flushWrites();

        expect(kvMutate).toHaveBeenNthCalledWith(1, credentials, [
            { key: 'session-read.a', value: encodeCompletedAt(2000), version: -1 },
        ]);
        expect(kvMutate).toHaveBeenNthCalledWith(2, credentials, [
            { key: 'session-read.a', value: encodeCompletedAt(2001), version: -1 },
        ]);
    });
});
