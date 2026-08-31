/**
 * Dedicated HTTP server for receiving Claude session hooks
 * 
 * This server receives notifications from Claude when sessions change
 * (new session, resume, compact, fork, etc.) via the SessionStart hook.
 * 
 * Separate from the MCP server to keep concerns isolated.
 * 
 * ## Control Flow
 * 
 * ### Startup
 * ```
 * runClaude.ts                                  
 *     │                                         
 *     ├─► startHookServer() ──► HTTP server on random port (e.g., 52290)
 *     │                                         
 *     ├─► generateHookSettingsFile(port) ──► ~/.happy/tmp/hooks/session-hook-<pid>.json
 *     │   (contains SessionStart hook pointing to our server)
 *     │                                         
 *     └─► loop() ──► claudeLocal/claudeRemote
 *             │
 *             └─► spawn claude --settings <hook-settings-path>
 * ```
 * 
 * ### Session Notification Flow
 * ```
 * Claude CLI (SessionStart event)
 *     │
 *     ├─► Reads hooks from --settings file
 *     │
 *     └─► Executes hook command (session_hook_forwarder.cjs)
 *             │
 *             ├─► Receives session data on stdin
 *             │
 *             └─► HTTP POST to http://127.0.0.1:<port>/hook/session-start
 *                     │
 *                     └─► startHookServer receives it
 *                             │
 *                             └─► onSessionHook(sessionId, data)
 *                                     │
 *                                     ├─► Updates Session.sessionId
 *                                     ├─► Updates API metadata
 *                                     └─► Notifies SessionScanner
 * ```
 * 
 * ### Triggered By
 * - `happy` (fresh start) - new session created
 * - `happy --continue` - continues last session (may fork)
 * - `happy --resume` - interactive picker, then resume
 * - `happy --resume <id>` - resume specific session
 * - `/compact` command - compacts and forks session
 * - Double-escape fork - user forks conversation in CLI
 * 
 * ### Why Not Use File Watching?
 * File watching has race conditions when multiple Happy processes run.
 * With hooks, Claude directly tells THIS specific process about its session,
 * ensuring 1:1 mapping between Happy process and Claude session.
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'node:http';
import { logger } from '@/ui/logger';
import type { ClaudeUsageSnapshot } from '@/api/types';

/**
 * Data received from Claude's SessionStart hook
 */
export interface SessionHookData {
    session_id?: string;
    sessionId?: string;
    transcript_path?: string;
    cwd?: string;
    hook_event_name?: string;
    source?: string;
    [key: string]: unknown;
}

export interface HookServerOptions {
    /** Called when a session hook is received with a valid session ID */
    onSessionHook: (sessionId: string, data: SessionHookData) => void;
    /** Called when Claude Code status line data reports usage fields */
    onStatusLine?: (snapshot: ClaudeUsageSnapshot, data: unknown) => void;
}

export interface HookServer {
    /** The port the server is listening on */
    port: number;
    /** Stop the server */
    stop: () => void;
}

function finiteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function compactObject<T extends Record<string, unknown>>(value: T): T | undefined {
    return Object.values(value).some(v => v !== undefined) ? value : undefined;
}

export function parseClaudeUsageSnapshot(data: unknown, updatedAt: number = Date.now()): ClaudeUsageSnapshot | null {
    const root = objectValue(data);
    const contextWindow = objectValue(root.context_window);
    const currentUsage = objectValue(contextWindow.current_usage);
    const rateLimits = objectValue(root.rate_limits);
    const fiveHour = objectValue(rateLimits.five_hour);
    const sevenDay = objectValue(rateLimits.seven_day);

    const currentUsageSnapshot = compactObject({
        inputTokens: finiteNumber(currentUsage.input_tokens),
        outputTokens: finiteNumber(currentUsage.output_tokens),
        cacheCreationInputTokens: finiteNumber(currentUsage.cache_creation_input_tokens),
        cacheReadInputTokens: finiteNumber(currentUsage.cache_read_input_tokens),
    });
    const contextWindowSnapshot = compactObject({
        usedPercentage: finiteNumber(contextWindow.used_percentage),
        remainingPercentage: finiteNumber(contextWindow.remaining_percentage),
        size: finiteNumber(contextWindow.context_window_size),
        totalInputTokens: finiteNumber(contextWindow.total_input_tokens),
        totalOutputTokens: finiteNumber(contextWindow.total_output_tokens),
        currentUsage: currentUsageSnapshot,
    });
    const rateLimitSnapshot = compactObject({
        fiveHour: compactObject({
            usedPercentage: finiteNumber(fiveHour.used_percentage),
            resetsAt: finiteNumber(fiveHour.resets_at),
        }),
        sevenDay: compactObject({
            usedPercentage: finiteNumber(sevenDay.used_percentage),
            resetsAt: finiteNumber(sevenDay.resets_at),
        }),
    });

    if (!contextWindowSnapshot && !rateLimitSnapshot) {
        return null;
    }

    return {
        updatedAt,
        contextWindow: contextWindowSnapshot,
        rateLimits: rateLimitSnapshot,
    };
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Start a dedicated HTTP server for receiving Claude session hooks
 * 
 * @param options - Server options including the session hook callback
 * @returns Promise resolving to the server instance with port info
 */
export async function startHookServer(options: HookServerOptions): Promise<HookServer> {
    const { onSessionHook, onStatusLine } = options;

    return new Promise((resolve, reject) => {
        const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
            if (req.method === 'POST' && req.url === '/hook/session-start') {
                // Set timeout to prevent hanging if Claude doesn't close stdin
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        logger.debug('[hookServer] Request timeout');
                        res.writeHead(408).end('timeout');
                    }
                }, 5000);

                try {
                    const body = await readRequestBody(req);
                    clearTimeout(timeout);
                    logger.debug('[hookServer] Received session hook:', body);

                    let data: SessionHookData = {};
                    try {
                        data = JSON.parse(body);
                    } catch (parseError) {
                        logger.debug('[hookServer] Failed to parse hook data as JSON:', parseError);
                    }

                    // Support both snake_case (from Claude) and camelCase
                    const sessionId = data.session_id || data.sessionId;
                    if (sessionId) {
                        logger.debug(`[hookServer] Session hook received session ID: ${sessionId}`);
                        onSessionHook(sessionId, data);
                    } else {
                        logger.debug('[hookServer] Session hook received but no session_id found in data');
                    }

                    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
                } catch (error) {
                    clearTimeout(timeout);
                    logger.debug('[hookServer] Error handling session hook:', error);
                    if (!res.headersSent) {
                        res.writeHead(500).end('error');
                    }
                }
                return;
            }

            if (req.method === 'POST' && req.url === '/hook/status-line') {
                const timeout = setTimeout(() => {
                    if (!res.headersSent) {
                        logger.debug('[hookServer] Status line request timeout');
                        res.writeHead(408).end('timeout');
                    }
                }, 5000);

                try {
                    const body = await readRequestBody(req);
                    clearTimeout(timeout);
                    logger.debug('[hookServer] Received status line data:', body);

                    let data: unknown = {};
                    try {
                        data = JSON.parse(body);
                    } catch (parseError) {
                        logger.debug('[hookServer] Failed to parse status line data as JSON:', parseError);
                    }

                    const snapshot = parseClaudeUsageSnapshot(data);
                    if (snapshot) {
                        onStatusLine?.(snapshot, data);
                    }

                    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
                } catch (error) {
                    clearTimeout(timeout);
                    logger.debug('[hookServer] Error handling status line data:', error);
                    if (!res.headersSent) {
                        res.writeHead(500).end('error');
                    }
                }
                return;
            }

            // 404 for anything else
            res.writeHead(404).end('not found');
        });

        // Listen on random available port
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (!address || typeof address === 'string') {
                reject(new Error('Failed to get server address'));
                return;
            }

            const port = address.port;
            logger.debug(`[hookServer] Started on port ${port}`);

            resolve({
                port,
                stop: () => {
                    server.close();
                    logger.debug('[hookServer] Stopped');
                }
            });
        });

        server.on('error', (err) => {
            logger.debug('[hookServer] Server error:', err);
            reject(err);
        });
    });
}
