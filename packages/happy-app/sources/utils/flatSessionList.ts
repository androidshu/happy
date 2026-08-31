import type { SessionListViewItem, SessionRowData } from '@/sync/storage';
import { compareInDictionaryOrder } from '@/utils/sessionDisplayOrder';
import { getRepoPath, getWorktreeName, isWorktreePath } from '@/utils/worktreePaths';

/**
 * One session as the flat home list shows it: its directory is the stable
 * identity, while the generated session title is secondary display text.
 */
export interface FlatSessionRowData {
    session: SessionRowData;
    directoryName: string;
    /** Null in a project's primary checkout, which needs no second name. */
    workspaceName: string | null;
}

/**
 * Flattens the project cards into one list ordered by directory name. Directory
 * and session ids break ties without depending on activity or generated title,
 * so neither a running turn nor a title update can move a row.
 *
 * Archived rows (`type: 'session'`) and the headings above them are left alone
 * — they are already a flat, date-grouped tail that the caller appends.
 */
export function buildFlatSessionRows(
    items: readonly SessionListViewItem[],
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
                    directoryName: directoryNameFromPath(
                        session.path,
                        directoryNameFromPath(workspace.id, item.project.name),
                    ),
                    workspaceName: workspace.name ?? (workspace.id || null),
                });
            }
        }
    }

    return rows.sort((a, b) => (
        compareInDictionaryOrder(a.directoryName, b.directoryName)
        || compareInDictionaryOrder(a.session.path?.trim() ?? '', b.session.path?.trim() ?? '')
        || compareInDictionaryOrder(a.session.id, b.session.id)
    ));
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
        directoryName: directoryNameFromPath(path, session.projectName ?? projectPath),
        workspaceName: session.workspaceName ?? (worktree ? getWorktreeName(path) : null),
    };
}

function directoryNameFromPath(path: string | null | undefined, fallback: string): string {
    const directoryName = path?.trim().split(/[\\/]/).filter(Boolean).at(-1);
    return directoryName || fallback.trim();
}
