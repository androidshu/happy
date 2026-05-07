import type { Machine } from '@/sync/storageTypes';

const RECENT_ACTIVITY_WINDOW_MS = 2 * 60 * 1000;

export function isMachineOnline(machine: Machine): boolean {
    if (machine.active) {
        return true;
    }

    // Daemon runtime state is often fresher than the replicated `active` flag.
    if (machine.metadata?.daemonLastKnownStatus === 'running') {
        return true;
    }

    const daemonState = machine.daemonState as { status?: unknown; state?: unknown } | null;
    if (daemonState?.status === 'running' || daemonState?.state === 'running') {
        return true;
    }

    // Fallback for short-lived sync lag between daemon heartbeat and machine active flag.
    return machine.activeAt > 0 && Date.now() - machine.activeAt < RECENT_ACTIVITY_WINDOW_MS;
}
