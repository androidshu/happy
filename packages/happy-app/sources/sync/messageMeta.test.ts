import { describe, expect, it } from 'vitest';
import { CLAUDE_FABLE_5_MODEL } from './agentDefaults';
import { resolveMessageModeMeta, UnsupportedPermissionModeError } from './messageMeta';
import { rigMetadataFixture } from './__testdata__/rigMetadata';

describe('resolveMessageModeMeta', () => {
    it('reasserts the displayed codex defaults after abort clears session overrides', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'yolo',
            model: 'gpt-5.6-sol',
            effort: 'high',
        });
    });

    it('keeps the Codex YOLO code default on an old CLI', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex', version: '1.2.0' },
        } as any);

        expect(meta.permissionMode).toBe('yolo');
    });

    it('keeps the Codex YOLO code default on a new CLI', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex', version: '1.2.1-beta.2' },
        } as any);

        expect(meta.permissionMode).toBe('yolo');
    });

    it('keeps an explicit Codex YOLO override on an old CLI', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex', version: '1.2.0' },
        } as any, {
            agentDefaultOverrides: { codex: { permissionMode: 'yolo' } },
        } as any);

        expect(meta.permissionMode).toBe('yolo');
    });

    // The composer resolves a saved `dontAsk` to Auto because the key is gone
    // from the catalog. Without retiring it at the read path the wire kept
    // sending `dontAsk`, which the CLI's message schema rejects outright.
    it('retires a dontAsk left on an existing session instead of sending it', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'dontAsk',
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any);

        expect(meta.permissionMode).toBe('acceptEdits');
    });

    it('retires a saved dontAsk default instead of sending it', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any, {
            agentDefaultOverrides: { claude: { permissionMode: 'dontAsk' } },
        } as any);

        expect(meta.permissionMode).toBe('acceptEdits');
    });

    // A session on an old CLI can still carry `auto` — saved before the gate
    // existed, or persisted as an explicit default — and CLIs before 1.2.1-beta.2
    // reject the whole message envelope on it. The resolver refuses loudly:
    // substituting the code default would silently change permissions (for
    // Claude it could change a previously selected mode without consent.
    it('refuses a saved auto for a claude session on an old CLI', () => {
        expect(() => resolveMessageModeMeta({
            permissionMode: 'auto',
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude', version: '1.2.1-beta.1' },
        } as any)).toThrow(UnsupportedPermissionModeError);
    });

    it('refuses an auto default override for a codex session on an old CLI', () => {
        expect(() => resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex', version: '1.2.0' },
        } as any, {
            agentDefaultOverrides: { codex: { permissionMode: 'auto' } },
        } as any)).toThrow(UnsupportedPermissionModeError);
    });

    it('refuses an auto default override for a claude session on an old CLI', () => {
        expect(() => resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude', version: '1.2.0' },
        } as any, {
            agentDefaultOverrides: { claude: { permissionMode: 'auto' } },
        } as any)).toThrow(UnsupportedPermissionModeError);
    });

    it('names the mode and CLI version in the refusal', () => {
        try {
            resolveMessageModeMeta({
                permissionMode: 'auto',
                modelMode: null,
                effortLevel: null,
                metadata: { flavor: 'claude', version: '1.2.0' },
            } as any);
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(UnsupportedPermissionModeError);
            expect((error as Error).message).toContain("'auto'");
            expect((error as Error).message).toContain('1.2.0');
        }
    });

    it('sends auto untouched when the session CLI is new enough', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto',
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude', version: '1.2.1-beta.2' },
        } as any);

        expect(meta.permissionMode).toBe('auto');
    });

    it('sends auto when the session reports no CLI version at all', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto',
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any);

        expect(meta.permissionMode).toBe('auto');
    });

    it('sends explicit per-session overrides', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'read-only',
            modelMode: 'gpt-5.6-terra',
            effortLevel: 'high',
            metadata: { flavor: 'codex' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'read-only',
            model: 'gpt-5.6-terra',
            effort: 'high',
        });
    });

    it('sends settings-level overrides when session has no override', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any, {
            agentDefaultOverrides: {
                claude: {
                    permissionMode: 'bypassPermissions',
                    modelMode: 'claude-sonnet-4-6',
                    effortLevel: 'medium',
                },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: 'claude-sonnet-4-6',
            effort: 'medium',
        });
    });

    it('sends the Claude Fable 5 code default when no model override is selected', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: CLAUDE_FABLE_5_MODEL,
            effort: 'high',
        });
    });

    it('ignores stale Claude model default overrides instead of sending old aliases', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any, {
            agentDefaultOverrides: {
                claude: {
                    modelMode: 'opus',
                },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: CLAUDE_FABLE_5_MODEL,
            effort: 'high',
        });
    });

    it('lets session overrides beat settings-level overrides', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'default',
            modelMode: 'gpt-5.6-terra',
            effortLevel: 'xhigh',
            metadata: { flavor: 'codex' },
        } as any, {
            agentDefaultOverrides: {
                codex: {
                    permissionMode: 'yolo',
                    modelMode: 'gpt-5.6-luna',
                    effortLevel: 'medium',
                },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'default',
            model: 'gpt-5.6-terra',
            effort: 'xhigh',
        });
    });

    it('uses the latest advertised Codex model from metadata', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: {
                flavor: 'codex',
                models: [
                    { code: 'gpt-6', value: 'gpt-6' },
                    { code: 'gpt-5.5', value: 'gpt-5.5' },
                ],
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'yolo',
            model: 'gpt-6',
            effort: 'high',
        });
    });

    it('passes a custom codex model through unchanged', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: 'my-workspace-model',
            effortLevel: null,
            metadata: { flavor: 'codex' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'yolo',
            model: 'my-workspace-model',
            effort: 'high',
        });
    });

    it('uses a custom codex model saved in agent settings', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex' },
        } as any, {
            agentDefaultOverrides: {
                codex: { modelMode: 'my-workspace-model' },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'yolo',
            model: 'my-workspace-model',
            effort: 'high',
        });
    });

    it('fills unset codex fields from settings while preserving session picks', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'read-only',
            modelMode: null,
            effortLevel: null,
            metadata: { flavor: 'codex' },
        } as any, {
            agentDefaultOverrides: {
                codex: {
                    permissionMode: 'auto',
                    modelMode: 'gpt-5.6-terra',
                    effortLevel: 'high',
                },
            },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'read-only',
            model: 'gpt-5.6-terra',
            effort: 'high',
        });
    });

    it('treats an explicit claude default model as a reset override', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: 'default',
            effortLevel: null,
            metadata: { flavor: 'claude' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: null,
            effort: 'high',
        });
    });

    it('treats explicit default Claude effort as a reset override', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: null,
            effortLevel: 'default',
            metadata: { flavor: 'claude' },
        } as any);

        expect(meta).toEqual({
            permissionMode: 'bypassPermissions',
            model: CLAUDE_FABLE_5_MODEL,
            effort: null,
        });
    });

    it('sends canonical Rig selection metadata using mode code rather than semantic kind', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: 'auto',
            modelMode: 'claude:shared-model',
            effortLevel: 'max',
            metadata: rigMetadataFixture,
        } as any);

        expect(meta).toEqual({
            permissionMode: 'auto',
            model: 'shared-model',
            modelProviderId: 'claude',
            effort: 'max',
        });
        expect(meta.permissionMode).not.toBe('safe-yolo');
    });

    it('does not carry an unsupported reasoning value across a Rig model change', () => {
        const meta = resolveMessageModeMeta({
            permissionMode: null,
            modelMode: 'claude:shared-model',
            effortLevel: 'medium',
            metadata: rigMetadataFixture,
        } as any);

        expect(meta.effort).toBe('high');
    });
});
