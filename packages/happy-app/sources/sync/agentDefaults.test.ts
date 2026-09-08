import { describe, expect, it } from 'vitest';
import {
    getCodeAgentDefaults,
    resolveAgentDefaultConfig,
} from './agentDefaults';

describe('agent defaults', () => {
    it('uses full-access permission defaults for the phone-controlled code agents', () => {
        expect(getCodeAgentDefaults('claude').permissionMode).toBe('bypassPermissions');
        expect(getCodeAgentDefaults('codex').permissionMode).toBe('yolo');
        expect(getCodeAgentDefaults('gemini').permissionMode).toBe('yolo');
        expect(getCodeAgentDefaults('agy').permissionMode).toBe('bypassPermissions');
        expect(getCodeAgentDefaults('qoder').permissionMode).toBe('bypassPermissions');
    });

    it.each([
        ['claude', 'bypassPermissions'],
        ['codex', 'yolo'],
        ['gemini', 'yolo'],
        ['agy', 'bypassPermissions'],
        ['qoder', 'bypassPermissions'],
    ] as const)('keeps the %s full-access default independent of CLI version', (flavor, expected) => {
        expect(getCodeAgentDefaults(flavor, '1.2.0').permissionMode).toBe(expected);
        expect(resolveAgentDefaultConfig({}, flavor, '1.2.1-beta.1').permissionMode).toBe(expected);
        expect(resolveAgentDefaultConfig({}, flavor, 'not-a-version').permissionMode).toBe(expected);
    });

    it('does not rewrite an explicit YOLO override for an old CLI', () => {
        expect(resolveAgentDefaultConfig(
            { claude: { permissionMode: 'bypassPermissions' } },
            'claude',
            '1.2.0',
        ).permissionMode).toBe('bypassPermissions');
        expect(resolveAgentDefaultConfig(
            { codex: { permissionMode: 'yolo' } },
            'codex',
            '1.2.0',
        ).permissionMode).toBe('yolo');
    });

    it('leaves an explicit unsupported Auto override available for the send path to reject', () => {
        expect(resolveAgentDefaultConfig(
            { claude: { permissionMode: 'auto' } },
            'claude',
            '1.2.0',
        ).permissionMode).toBe('auto');
    });

    it('keeps the inert OpenClaw default unchanged', () => {
        expect(resolveAgentDefaultConfig({}, 'openclaw', '1.0.0').permissionMode).toBe('default');
    });
});
