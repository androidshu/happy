import { describe, expect, it } from 'vitest';
import { getSessionAgentLabel } from './sessionAgentIdentity';

describe('getSessionAgentLabel', () => {
    it('names the session agent directly', () => {
        expect(getSessionAgentLabel('claude')).toBe('Claude');
        expect(getSessionAgentLabel('codex')).toBe('Codex');
        expect(getSessionAgentLabel('qoder')).toBe('Qoder');
    });

    it('uses the harness identity instead of a Rig provider', () => {
        expect(getSessionAgentLabel('codex', 'rig')).toBe('Happy');
    });

    it('does not guess when the source has no agent identity', () => {
        expect(getSessionAgentLabel(null)).toBe('Unknown');
    });
});
