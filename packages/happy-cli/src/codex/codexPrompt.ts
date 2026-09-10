import type { PermissionMode } from '@/api/types';
import { hashObject } from '@/utils/deterministicJson';

import type { ReasoningEffort } from './codexAppServerTypes';

export interface CodexEnhancedMode {
    permissionMode: PermissionMode;
    model?: string;
    /** Reasoning effort passed through to Codex's sendTurnAndWait. */
    effort?: ReasoningEffort;
}

export function hashCodexEnhancedMode(mode: CodexEnhancedMode): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        effort: mode.effort,
    });
}

/**
 * Historical threads may contain Happy instructions. Keep the reader for
 * fork/backfill so those old instructions do not appear as user-authored text.
 * New Codex turns pass the user's message through without Happy instructions.
 */
export const HAPPY_SYSTEM_BLOCK_OPEN = '<happy-system>';
export const HAPPY_SYSTEM_BLOCK_CLOSE = '</happy-system>';

/**
 * Remove any `<happy-system>…</happy-system>` blocks (and the blank lines that
 * join them to the user's text) from a Codex turn string, leaving only what the
 * user actually wrote. Safe to call on text that has no markers.
 */
export function stripHappySystemBlocks(text: string): string {
    const open = HAPPY_SYSTEM_BLOCK_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const close = HAPPY_SYSTEM_BLOCK_CLOSE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*${open}[\\s\\S]*?${close}\\s*`, 'g');
    return text.replace(re, '\n\n').trim();
}
