import type { SessionListViewItem, SessionRowData } from '@/sync/storage';
import { compareInDictionaryOrder } from '@/utils/sessionDisplayOrder';
import { getRepoPath, getWorktreeName, isWorktreePath } from '@/utils/worktreePaths';

/**
 * One session as the flat home list shows it: the session's own title, and the
 * project/worktree it belongs to spelled out on the row instead of being
 * implied by a card it sits inside.
 */
export interface FlatSessionRowData {
    session: SessionRowData;
    projectName: string;
    /** Null in a project's primary checkout, which needs no second name. */
    workspaceName: string | null;
}

/**
 * Flattens the project cards into one chronological list.
 *
 * Grouping by project is what loses the global ordering: sessions are sorted
 * once, then dealt into projects, so a project's older sessions end up directly
 * under its newest one. The flat list wants what the user last touched at the
 * top regardless of project, so it re-sorts the rows here.
 *
 * Archived rows (`type: 'session'`) and the headings above them are left alone
 * — they are already a flat, date-grouped tail that the caller appends.
 */
export function buildFlatSessionRows(
    items: readonly SessionListViewItem[],
    options: { sortByActivity: boolean },
): FlatSessionRowData[] {
    const rows: FlatSessionRowData[] = [];

    for (const item of items) {
        if (item.type === 'active-sessions') {
            for (const session of item.sessions) {
                rows.push(toFlatSessionRow(session));
            }
            continue;
        }
        if (item.type !== 'project') continue;
        for (const workspace of item.project.workspaces) {
            for (const session of workspace.sessions) {
                rows.push({
                    session,
                    projectName: item.project.name,
                    workspaceName: workspace.name ?? (workspace.id || null),
                });
            }
        }
    }

    const sortKey = options.sortByActivity
        ? (row: FlatSessionRowData) => row.session.lastActivityAt
        : (row: FlatSessionRowData) => row.session.createdAt;

    return rows.sort((a, b) => {
        const activeDelta = Number(b.session.active) - Number(a.session.active);
        return activeDelta !== 0 ? activeDelta : sortKey(b) - sortKey(a);
    });
}

/**
 * What the flat list needs to know about a machine to head its section.
 * Structural on purpose: callers can pass their Machine type as-is.
 */
export interface FlatSessionListMachine {
    id: string;
    active?: boolean;
    metadata?: {
        displayName?: string | null;
        host?: string | null;
    } | null;
}

/** The flat list with machine sections restored: a small heading per computer,
 * then that computer's rows in the order the sort already chose. */
export type FlatSessionListItem =
    | {
        type: 'machine-header';
        machineId: string | null;
        machineName: string;
        online: boolean;
        first: boolean;
    }
    | { type: 'session'; row: FlatSessionRowData; last: boolean };

/**
 * Groups the flat rows under their machine.
 *
 * Sections hold a fixed dictionary order of machine names — the same one on
 * every device — instead of riding the row sort. Ordering by recency made a
 * section jump to the top every time another computer's session moved, which
 * reads as the list reshuffling mid-use; within a section the rows keep the
 * order the sort already chose. Rows with no machine trail at the end under an
 * unknown heading, the same place the project grouping puts them.
 */
export function groupFlatSessionRowsByMachine(
    rows: readonly FlatSessionRowData[],
    machines: readonly FlatSessionListMachine[],
    unknownText: string,
): FlatSessionListItem[] {
    const machinesMap = new Map(machines.map((machine) => [machine.id, machine]));
    const byMachine = new Map<string, FlatSessionRowData[]>();
    const unknownRows: FlatSessionRowData[] = [];

    const machineNameOf = (machineId: string) => {
        const machine = machinesMap.get(machineId);
        return machine?.metadata?.displayName
            || machine?.metadata?.host
            || machineId;
    };

    for (const row of rows) {
        const machineId = row.session.machineId;
        if (!machineId) {
            unknownRows.push(row);
            continue;
        }
        let machineRows = byMachine.get(machineId);
        if (!machineRows) {
            machineRows = [];
            byMachine.set(machineId, machineRows);
        }
        machineRows.push(row);
    }

    const sectionOrder = Array.from(byMachine.keys())
        .sort((a, b) => compareInDictionaryOrder(machineNameOf(a), machineNameOf(b)));

    const items: FlatSessionListItem[] = [];
    const appendSection = (machineId: string | null, sectionRows: readonly FlatSessionRowData[]) => {
        if (sectionRows.length === 0) return;
        const machine = machineId ? machinesMap.get(machineId) : undefined;
        items.push({
            type: 'machine-header',
            machineId,
            machineName: machineId ? machineNameOf(machineId) : `<${unknownText}>`,
            online: machine?.active ?? false,
            first: items.length === 0,
        });
        sectionRows.forEach((row, index) => {
            items.push({ type: 'session', row, last: index === sectionRows.length - 1 });
        });
    };

    sectionOrder.forEach((machineId) => appendSection(machineId, byMachine.get(machineId)!));
    appendSection(null, unknownRows);
    return items;
}

/**
 * Places a session that reached the list without a project card around it —
 * an archived row, or one of the active-sessions rows — using the same rule the
 * card grouping uses: a worktree names its repository as the project and itself
 * as the workspace.
 */
export function toFlatSessionRow(session: SessionRowData): FlatSessionRowData {
    const path = session.path?.trim() || '';
    const worktree = isWorktreePath(path);
    const projectPath = worktree ? getRepoPath(path) : path;
    return {
        session,
        projectName: session.projectName
            ?? projectPath.split(/[\\/]/).filter(Boolean).at(-1)
            ?? '',
        workspaceName: session.workspaceName ?? (worktree ? getWorktreeName(path) : null),
    };
}
