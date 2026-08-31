import { describe, expect, it } from 'vitest';
import { buildHookSettings } from './generateHookSettings';

describe('buildHookSettings', () => {
    it('preserves user Claude settings while wrapping statusLine and appending SessionStart hook', () => {
        const settings = buildHookSettings(12345, {
            effortLevel: 'high',
            skipDangerousModePermissionPrompt: true,
            statusLine: {
                type: 'command',
                command: 'bash /Users/bevis/.claude/statusline-command.sh',
                padding: 0,
            },
            hooks: {
                Stop: [
                    {
                        hooks: [
                            {
                                type: 'command',
                                command: 'echo stop',
                            },
                        ],
                    },
                ],
                SessionStart: [
                    {
                        hooks: [
                            {
                                type: 'command',
                                command: 'echo session-start',
                            },
                        ],
                    },
                ],
            },
        });

        expect(settings.effortLevel).toBe('high');
        expect(settings.skipDangerousModePermissionPrompt).toBe(true);
        expect(settings.statusLine?.padding).toBe(0);
        expect(settings.statusLine?.type).toBe('command');
        expect(settings.statusLine?.command).toContain('statusline_forwarder.cjs');
        expect(settings.statusLine?.command).toContain('12345');
        expect(settings.statusLine?.command).toContain(
            Buffer.from('bash /Users/bevis/.claude/statusline-command.sh', 'utf-8').toString('base64url'),
        );
        expect(settings.hooks?.Stop).toEqual([
            {
                hooks: [
                    {
                        type: 'command',
                        command: 'echo stop',
                    },
                ],
            },
        ]);
        expect(settings.hooks?.SessionStart).toHaveLength(2);
        expect(settings.hooks?.SessionStart).toEqual([
            {
                hooks: [
                    {
                        type: 'command',
                        command: 'echo session-start',
                    },
                ],
            },
            {
                matcher: '*',
                hooks: [
                    {
                        type: 'command',
                        command: expect.stringContaining('session_hook_forwarder.cjs'),
                    },
                ],
            },
        ]);
    });
});
