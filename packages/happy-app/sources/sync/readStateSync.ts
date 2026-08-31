import { AuthCredentials } from '@/auth/tokenStorage';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { log } from '@/log';
import { kvGetByPrefix, kvMutate } from './apiKv';
import { loadSessionReadTombstones, saveSessionReadTombstones } from './persistence';
import { storage } from './storage';

/**
 * Cross-device unread sync over the account-level KV store.
 *
 * One key per unread session: `session-read.<id>` present means unread, absent
 * (or deleted server-side) means read. The value is the completion timestamp
 * (ms), so when a read and an unread race on different devices the later event
 * wins by timestamp comparison rather than by arrival order. Devices that were
 * offline when the session finished still pick the marker up on their next full
 * fetch — the reason this is a KV record at all instead of a purely local
 * observation.
 *
 * The key embeds the session id, which the server already knows belongs to the
 * account; the value is only a timestamp. Neither leaks anything new, so the
 * value is not encrypted.
 */
const UNREAD_KEY_PREFIX = 'session-read.';
const UNREAD_LIST_LIMIT = 1000;
const MAX_WRITE_ATTEMPTS = 3;

let credentials: AuthCredentials | null = null;

// Server-side version of every key we know about, including deleted ones —
// kvMutate is version-locked and a blind create (-1) 409s once the key exists.
const knownVersions = new Map<string, number>();
// Latest completion already handed to local storage. This makes echoed KV
// writes idempotent while still letting a second completion refresh content
// for a session that was already unread.
const knownCompletedAt = new Map<string, number>();

// In-memory mirror of the persisted tombstones; loaded lazily on first use.
let tombstones: Record<string, number> | null = null;

function getTombstones(): Record<string, number> {
    if (tombstones === null) {
        tombstones = loadSessionReadTombstones();
    }
    return tombstones;
}

function setTombstone(sessionId: string, readAt: number): void {
    const current = getTombstones();
    current[sessionId] = readAt;
    saveSessionReadTombstones(current);
}

function clearTombstone(sessionId: string): void {
    const current = getTombstones();
    if (sessionId in current) {
        delete current[sessionId];
        saveSessionReadTombstones(current);
    }
}

// ASCII digits only — no TextEncoder dependency (Hermes).
function encodeCompletedAt(completedAt: number): string {
    const text = String(completedAt);
    const bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) {
        bytes[i] = text.charCodeAt(i);
    }
    return encodeBase64(bytes);
}

function decodeCompletedAt(value: string): number | null {
    try {
        const bytes = decodeBase64(value);
        let text = '';
        for (let i = 0; i < bytes.length; i++) {
            text += String.fromCharCode(bytes[i]);
        }
        const parsed = Number(text);
        return Number.isFinite(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export function initReadStateSync(creds: AuthCredentials): void {
    credentials = creds;
}

async function mutateWithRetry(key: string, value: string | null): Promise<boolean> {
    if (!credentials) return false;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
        const version = knownVersions.get(key) ?? -1;
        try {
            const result = await kvMutate(credentials, [{ key, value, version }]);
            if (result.success) {
                knownVersions.set(key, result.results[0].version);
                return true;
            }
            // Version conflict: another device (or our own earlier write) moved
            // the key. Take the server's version and retry with it.
            knownVersions.set(key, result.errors[0].version);
        } catch (e) {
            console.warn(`readStateSync: KV write failed for ${key} (attempt ${attempt + 1})`, e);
            return false;
        }
    }
    return false;
}

/**
 * Push a locally-observed unread marker (session finished while not viewed).
 * Fire-and-forget from the storage layer — local state is already updated.
 */
export function pushSessionUnread(sessionId: string, completedAt: number): void {
    const completionRevision = Math.max(completedAt, (knownCompletedAt.get(sessionId) ?? 0) + 1);
    // A newer completion outdates any local read tombstone for this session.
    if (completionRevision > (getTombstones()[sessionId] ?? 0)) {
        clearTombstone(sessionId);
    }
    knownCompletedAt.set(sessionId, completionRevision);
    void mutateWithRetry(UNREAD_KEY_PREFIX + sessionId, encodeCompletedAt(completionRevision));
}

/**
 * Push a local read (user opened the session). The tombstone is written first,
 * so even if the delete never lands, the next full fetch will not resurrect
 * this unread marker on this device.
 */
export function pushSessionRead(sessionId: string): void {
    setTombstone(sessionId, Date.now());
    const key = UNREAD_KEY_PREFIX + sessionId;
    if (!knownVersions.has(key)) {
        // Nothing on the server to delete.
        return;
    }
    void mutateWithRetry(key, null);
}

/**
 * Startup path: pull every unread marker, drop the ones a local tombstone
 * proves this device already read (and retry their server-side delete), then
 * apply the survivors to storage.
 */
export async function fetchAndApplyUnreadStates(): Promise<void> {
    if (!credentials) return;
    let items;
    try {
        items = await kvGetByPrefix(credentials, UNREAD_KEY_PREFIX, UNREAD_LIST_LIMIT);
    } catch (e) {
        console.warn('readStateSync: failed to fetch unread states', e);
        return;
    }

    const unreadSessionIds: string[] = [];
    const current = getTombstones();
    for (const item of items) {
        knownVersions.set(item.key, item.version);
        const sessionId = item.key.slice(UNREAD_KEY_PREFIX.length);
        const completedAt = decodeCompletedAt(item.value);
        if (completedAt === null) continue;
        const previousCompletedAt = knownCompletedAt.get(sessionId) ?? 0;
        knownCompletedAt.set(sessionId, Math.max(previousCompletedAt, completedAt));
        if ((current[sessionId] ?? 0) >= completedAt) {
            // This device read it after that completion; an earlier delete must
            // have failed. Retry it in the background.
            void mutateWithRetry(item.key, null);
            continue;
        }
        if (completedAt <= previousCompletedAt) continue;
        unreadSessionIds.push(sessionId);
    }
    storage.getState().applyRemoteUnreadStates({ add: unreadSessionIds, remove: [] });
}

/**
 * Realtime path: apply kv-batch-update changes pushed from other devices
 * (and echoed back from our own writes — those are idempotent no-ops).
 */
export function applyRemoteReadStateChanges(
    changes: Array<{ key: string; value: string | null; version: number }>,
): void {
    const relevant = changes.filter((change) => change.key.startsWith(UNREAD_KEY_PREFIX));
    if (relevant.length === 0) return;

    const current = getTombstones();
    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const change of relevant) {
        knownVersions.set(change.key, change.version);
        const sessionId = change.key.slice(UNREAD_KEY_PREFIX.length);
        if (change.value === null) {
            // Read on another device: it has landed server-side, so the local
            // tombstone keeping that read alive is no longer needed.
            clearTombstone(sessionId);
            toRemove.push(sessionId);
            continue;
        }
        const completedAt = decodeCompletedAt(change.value);
        if (completedAt === null) continue;
        const previousCompletedAt = knownCompletedAt.get(sessionId) ?? 0;
        knownCompletedAt.set(sessionId, Math.max(previousCompletedAt, completedAt));
        if ((current[sessionId] ?? 0) >= completedAt) {
            // Stale unread losing to a newer local read — repair the server.
            void mutateWithRetry(change.key, null);
            continue;
        }
        if (completedAt <= previousCompletedAt) continue;
        // Newer completion than any read we know: the tombstone is obsolete.
        clearTombstone(sessionId);
        toAdd.push(sessionId);
    }
    storage.getState().applyRemoteUnreadStates({ add: toAdd, remove: toRemove });
}

/** Test hook: wipe module state between runs. */
export function resetReadStateSyncForTests(): void {
    credentials = null;
    knownVersions.clear();
    knownCompletedAt.clear();
    tombstones = null;
}
