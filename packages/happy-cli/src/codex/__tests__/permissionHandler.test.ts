import { describe, expect, it, vi } from 'vitest';
import { CodexPermissionHandler } from '../utils/permissionHandler';

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}));

function createSessionMock(initialState: Record<string, any> = {}) {
    let state: Record<string, any> = initialState;

    return {
        session: {
            rpcHandlerManager: {
                registerHandler: vi.fn(),
            },
            getAgentState: vi.fn(() => state),
            updateAgentState: vi.fn((updater: (currentState: Record<string, any>) => Record<string, any>) => {
                state = updater(state);
                return state;
            }),
        },
        getState: () => state,
    };
}

describe('CodexPermissionHandler', () => {
    it('auto-approves the safe change_title tool', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'call_change_title_123',
            'change_title',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
        expect(getState().completedRequests.call_change_title_123).toMatchObject({
            tool: 'change_title',
            arguments: { title: 'Greeting' },
            status: 'approved',
            decision: 'approved',
        });
    });

    it('keeps non-safe tools pending for user approval', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_exec_123',
            'Bash',
            { command: 'pwd' },
        );

        expect(getState().requests.call_exec_123).toMatchObject({
            tool: 'Bash',
            arguments: { command: 'pwd' },
        });

        handler.abortAll();

        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('immediately approves an existing request when live mode switches to YOLO', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_exec_live_yolo',
            'Bash',
            { command: 'pwd' },
        );

        handler.setPermissionModeAutoApproval(true);

        await expect(pending).resolves.toEqual({ decision: 'approved' });
        expect(getState().requests).toEqual({});
        expect(getState().completedRequests.call_exec_live_yolo).toMatchObject({
            status: 'approved',
            decision: 'approved',
        });
    });

    it('does NOT auto-approve a crafted tool name containing change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const pending = handler.handleToolCall(
            'call_malicious_1',
            'change_title_and_run_command',
            { title: 'pwn', cmd: 'rm -rf /' },
        );

        // Should remain pending (not auto-approved) — resolve via abort to clean up.
        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('does NOT auto-approve a tool whose ID merely contains change_title as substring', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        // ID like `x_change_title_y` — old substring check would match, new prefix check must not.
        const pending = handler.handleToolCall(
            'x_change_title_y',
            'ExecCommand',
            { command: 'rm -rf /' },
        );

        handler.abortAll();
        await expect(pending).resolves.toEqual({ decision: 'abort' });
    });

    it('auto-approves change_title tool call by Gemini-style ID (change_title-<timestamp>)', async () => {
        const { session } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'change_title-1765385846663',
            'other',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
    });

    it('auto-approves change_title-prefixed IDs after Codex thread scoping', async () => {
        const { session, getState } = createSessionMock();
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'thread-1:change_title-1765385846663',
            'other',
            { title: 'Greeting' },
        );

        expect(result).toEqual({ decision: 'approved' });
        expect(getState().completedRequests['thread-1:change_title-1765385846663']).toMatchObject({
            status: 'approved',
        });
    });

    it('auto-approves later tool calls after approved_for_session is restored from state', async () => {
        const { session, getState } = createSessionMock({
            completedRequests: {
                previous: {
                    tool: 'Bash',
                    arguments: { command: 'pwd' },
                    decision: 'approved_for_session',
                },
            },
        });
        const handler = new CodexPermissionHandler(session as any);

        const result = await handler.handleToolCall(
            'call_exec_after_session_approval',
            'Bash',
            { command: 'pwd' },
        );

        expect(result).toEqual({ decision: 'approved_for_session' });
        expect(getState().completedRequests.call_exec_after_session_approval).toMatchObject({
            tool: 'Bash',
            arguments: { command: 'pwd' },
            status: 'approved',
            decision: 'approved_for_session',
        });
    });
});
