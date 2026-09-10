import { describe, expect, it } from 'vitest';

import {
    hashCodexEnhancedMode,
    stripHappySystemBlocks,
    type CodexEnhancedMode,
} from './codexPrompt';

const wrapped = (text: string) => `<happy-system>\n${text}\n</happy-system>`;

describe('stripHappySystemBlocks', () => {
    it('recovers the user message from a fully-scaffolded first turn (fork backfill)', () => {
        const prompt = `${wrapped('legacy options')}\n\nприветик\n\n${wrapped('legacy title')}`;

        expect(stripHappySystemBlocks(prompt)).toBe('приветик');
    });

    it('recovers a multi-line user message wrapped only by the title instruction', () => {
        const prompt = `line one\n\nline two\n\n${wrapped('legacy title')}`;

        expect(stripHappySystemBlocks(prompt)).toBe('line one\n\nline two');
    });

    it('leaves plain text without markers untouched', () => {
        expect(stripHappySystemBlocks('just a normal message')).toBe('just a normal message');
    });
});

describe('hashCodexEnhancedMode', () => {
    it('separates queued Codex messages with different native effort', () => {
        const baseMode: CodexEnhancedMode = {
            permissionMode: 'default',
            model: 'gpt-5.6-sol',
            effort: 'medium',
        };

        expect(hashCodexEnhancedMode({
            ...baseMode,
            effort: 'low',
        })).not.toBe(hashCodexEnhancedMode({
            ...baseMode,
            effort: 'high',
        }));
    });
});
