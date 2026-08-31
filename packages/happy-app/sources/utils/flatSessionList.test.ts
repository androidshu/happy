import { describe, expect, it } from 'vitest';
import { buildFlatSessionRows, groupFlatSessionRowsByMachine, type FlatSessionRowData } from './flatSessionList';
import type { SessionListViewItem, SessionRowData } from '@/sync/storage';

function row(overrides: Partial<SessionRowData> & { id: string }): SessionRowData {
    return {
        name: overrides.id,
        subtitle: '',
        avatarId: overrides.id,
        flavor: null,
        clientId: null,
        identityLine: null,
        providerKind: null,
        modelName: null,
        activitySummary: null,
        gitChangedFiles: null,
        gitCountsExact: true,
        gitDeletions: null,
        gitInsertions: null,
        state: 'waiting',
        createdAt: 0,
        lastActivityAt: 0,
        hasDraft: false,
        active: true,
        archived: false,
        machineId: 'machine',
        machineOffline: false,
        path: null,
        homeDir: null,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnread: false,
        projectId: null,
        projectName: null,
        workspaceId: null,
        workspaceName: null,
        ...overrides,
    };
}

function project(
    name: string,
    workspaces: { id: string; name: string | null; sessions: SessionRowData[] }[],
): SessionListViewItem {
    return {
        type: 'project',
        source: 'happy',
        project: {
            id: name,
            name,
            machineId: 'machine',
            workspaces,
            sessionCount: workspaces.reduce((total, w) => total + w.sessions.length, 0),
            activeCount: 0,
        },
    };
}

function flatRow(session: SessionRowData): FlatSessionRowData {
    return { session, directoryName: 'proj', workspaceName: null };
}

describe('buildFlatSessionRows', () => {
    it('uses the checkout directory name and keeps the worktree label', () => {
        const rows = buildFlatSessionRows([
            project('happy', [
                { id: '', name: null, sessions: [row({ id: 'primary' })] },
                { id: '/wt/innsbruck', name: 'innsbruck', sessions: [row({ id: 'worktree', path: '/wt/innsbruck' })] },
            ]),
        ]);

        expect(rows.map((r) => [r.session.id, r.directoryName, r.workspaceName])).toEqual([
            ['primary', 'happy', null],
            ['worktree', 'innsbruck', 'innsbruck'],
        ]);
    });

    it('falls back to the worktree path when the group has no name', () => {
        const rows = buildFlatSessionRows([
            project('happy', [{ id: '/wt/innsbruck', name: null, sessions: [row({ id: 'a' })] }]),
        ]);

        expect(rows[0].workspaceName).toBe('/wt/innsbruck');
    });

    it('keeps directory order when activity and connection state change', () => {
        const rows = buildFlatSessionRows([
            project('alpha', [{
                id: '',
                name: null,
                sessions: [
                    row({ id: 'alpha-new', lastActivityAt: 300 }),
                    row({ id: 'alpha-old', lastActivityAt: 100 }),
                ],
            }]),
            project('beta', [{
                id: '',
                name: null,
                sessions: [
                    row({ id: 'beta-mid', lastActivityAt: 200 }),
                    row({ id: 'beta-dead', lastActivityAt: 400, active: false }),
                ],
            }]),
        ]);

        expect(rows.map((r) => r.session.id)).toEqual([
            'alpha-new',
            'alpha-old',
            'beta-dead',
            'beta-mid',
        ]);
    });

    it('uses the stable session id when multiple sessions share a directory', () => {
        const rows = buildFlatSessionRows([
            project('alpha', [{
                id: '',
                name: null,
                sessions: [
                    row({ id: 'z-session', name: 'A generated title', path: '/work/shared', lastActivityAt: 900 }),
                    row({ id: 'a-session', name: 'Z generated title', path: '/work/shared', lastActivityAt: 5 }),
                ],
            }]),
        ]);

        expect(rows.map((r) => r.session.id)).toEqual(['a-session', 'z-session']);
    });

    it('ignores archived rows and headings, which stay a separate tail', () => {
        const rows = buildFlatSessionRows([
            { type: 'header', title: 'Today' },
            { type: 'session', session: row({ id: 'archived', archived: true }) },
            { type: 'projects-header', source: 'happy' },
            project('alpha', [{ id: '', name: null, sessions: [row({ id: 'live' })] }]),
        ]);

        expect(rows.map((r) => r.session.id)).toEqual(['live']);
    });
});

describe('groupFlatSessionRowsByMachine', () => {
    const machines = [
        { id: 'mac-1', active: true, metadata: { displayName: 'MacBook', host: 'mac.local' } },
        { id: 'win-1', active: false, metadata: { displayName: null, host: 'win.local' } },
    ];

    it('orders sections by machine name, not by recent activity', () => {
        // The Windows row is the most recently touched, but sections keep the
        // fixed dictionary order instead of jumping to whoever was last active.
        const rows = [
            flatRow(row({ id: 'b', machineId: 'win-1', lastActivityAt: 30 })),
            flatRow(row({ id: 'a', machineId: 'mac-1', lastActivityAt: 20 })),
            flatRow(row({ id: 'c', machineId: 'mac-1', lastActivityAt: 10 })),
        ];

        const items = groupFlatSessionRowsByMachine(rows, machines, 'Unknown');

        expect(items.map((item) => item.type === 'machine-header' ? item.machineName : item.row.session.id))
            .toEqual(['MacBook', 'a', 'c', 'win.local', 'b']);
    });

    it('prefers the displayName and falls back to host, then the raw id', () => {
        const items = groupFlatSessionRowsByMachine(
            [flatRow(row({ id: 'a', machineId: 'mac-1' }))], machines, 'Unknown');
        expect(items[0]).toMatchObject({ type: 'machine-header', machineName: 'MacBook' });

        const winItems = groupFlatSessionRowsByMachine(
            [flatRow(row({ id: 'a', machineId: 'win-1' }))], machines, 'Unknown');
        expect(winItems[0]).toMatchObject({ type: 'machine-header', machineName: 'win.local' });

        const goneItems = groupFlatSessionRowsByMachine(
            [flatRow(row({ id: 'a', machineId: 'gone-1' }))], machines, 'Unknown');
        expect(goneItems[0]).toMatchObject({ type: 'machine-header', machineName: 'gone-1' });
    });

    it('reports each machine online state and trails rows without a machine', () => {
        const rows = [
            flatRow(row({ id: 'a', machineId: 'mac-1', lastActivityAt: 30 })),
            flatRow(row({ id: 'b', machineId: null, lastActivityAt: 20 })),
            flatRow(row({ id: 'c', machineId: 'win-1', lastActivityAt: 10 })),
        ];

        const items = groupFlatSessionRowsByMachine(rows, machines, 'Unknown');
        const headers = items.flatMap((item) => item.type === 'machine-header' ? [item] : []);

        expect(headers.map((header) => [header.machineName, header.online])).toEqual([
            ['MacBook', true],
            ['win.local', false],
            ['<Unknown>', false],
        ]);
        // The unknown section is last even though its row sorted in the middle.
        expect(items.at(-1)).toMatchObject({ type: 'session', row: { session: { id: 'b' } } });
    });

    it('marks the first heading and the last row of each section', () => {
        const rows = [
            flatRow(row({ id: 'a', machineId: 'mac-1', lastActivityAt: 30 })),
            flatRow(row({ id: 'b', machineId: 'mac-1', lastActivityAt: 20 })),
            flatRow(row({ id: 'c', machineId: 'win-1', lastActivityAt: 10 })),
        ];

        const items = groupFlatSessionRowsByMachine(rows, machines, 'Unknown');

        expect(items[0]).toMatchObject({ type: 'machine-header', first: true });
        expect(items[1]).toMatchObject({ type: 'session', last: false });
        expect(items[2]).toMatchObject({ type: 'session', last: true });
        expect(items[3]).toMatchObject({ type: 'machine-header', first: false });
        expect(items[4]).toMatchObject({ type: 'session', last: true });
    });

    it('keeps working on the rows buildFlatSessionRows produces', () => {
        const macProject: SessionListViewItem = {
            type: 'project',
            source: 'rig',
            project: {
                id: 'p1',
                name: 'proj',
                machineId: 'mac-1',
                workspaces: [{
                    id: null,
                    name: null,
                    sessions: [row({ id: 'a', machineId: 'mac-1', lastActivityAt: 10 })],
                }],
            } as any,
        };
        const activeItem: SessionListViewItem = {
            type: 'active-sessions',
            sessions: [row({ id: 'b', machineId: 'win-1', lastActivityAt: 20 })],
        };

        const flatRows = buildFlatSessionRows([activeItem, macProject]);
        const items = groupFlatSessionRowsByMachine(flatRows, machines, 'Unknown');

        expect(items.map((item) => item.type === 'machine-header' ? item.machineName : item.row.session.id))
            .toEqual(['MacBook', 'a', 'win.local', 'b']);
    });
});
