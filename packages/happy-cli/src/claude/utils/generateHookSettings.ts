/**
 * Generate temporary settings file with Claude hooks for session tracking
 *
 * Creates a settings.json file that configures Claude's SessionStart hook
 * to notify our HTTP server when sessions change (new session, resume, compact, etc.)
 */

import { join, resolve } from 'node:path';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { configuration } from '@/configuration';
import { logger } from '@/ui/logger';
import { projectPath } from '@/projectPath';

type ClaudeStatusLineSettings = {
    type?: string;
    command?: string;
    padding?: number;
    refreshInterval?: number;
    hideVimModeIndicator?: boolean;
    [key: string]: unknown;
};

type ClaudeHookSettings = Record<string, unknown>;

type ClaudeSettings = {
    statusLine?: ClaudeStatusLineSettings;
    hooks?: ClaudeHookSettings;
    [key: string]: unknown;
};

function toShellPath(path: string): string {
    return path.replace(/\\/g, '/');
}

function quoteCommandPath(path: string): string {
    return JSON.stringify(toShellPath(path));
}

function readUserClaudeSettings(): ClaudeSettings | undefined {
    const settingsPath = join(os.homedir(), '.claude', 'settings.json');
    if (!existsSync(settingsPath)) {
        return undefined;
    }

    try {
        const raw = JSON.parse(readFileSync(settingsPath, 'utf-8')) as unknown;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return undefined;
        }
        return raw as ClaudeSettings;
    } catch (error) {
        logger.debug(`[generateHookSettings] Failed to read user Claude settings: ${error}`);
        return undefined;
    }
}

function statusLineSettings(settings: ClaudeSettings | undefined): ClaudeStatusLineSettings | undefined {
    const statusLine = settings?.statusLine;
    return statusLine && typeof statusLine === 'object' && !Array.isArray(statusLine)
        ? statusLine
        : undefined;
}

function encodeOriginalStatusLineCommand(command: string | undefined, forwarderScript: string): string | undefined {
    if (!command || command.includes('statusline_forwarder.cjs') || command.includes(forwarderScript)) {
        return undefined;
    }
    return Buffer.from(command, 'utf-8').toString('base64url');
}

export function buildHookSettings(port: number, userSettings: ClaudeSettings | undefined = readUserClaudeSettings()): ClaudeSettings {
    const forwarderScript = toShellPath(resolve(projectPath(), 'scripts', 'session_hook_forwarder.cjs'));
    const hookCommand = `node ${quoteCommandPath(forwarderScript)} ${port}`;
    const statusLineForwarderScript = toShellPath(resolve(projectPath(), 'scripts', 'statusline_forwarder.cjs'));
    const userStatusLine = statusLineSettings(userSettings);
    const originalStatusLineCommand = encodeOriginalStatusLineCommand(userStatusLine?.command, statusLineForwarderScript);
    const statusLineCommand = [
        'node',
        quoteCommandPath(statusLineForwarderScript),
        String(port),
        originalStatusLineCommand,
    ].filter(Boolean).join(' ');

    const userHooks = userSettings?.hooks && typeof userSettings.hooks === 'object' && !Array.isArray(userSettings.hooks)
        ? userSettings.hooks
        : {};
    const existingSessionStart = Array.isArray(userHooks.SessionStart) ? userHooks.SessionStart : [];

    return {
        ...(userSettings ?? {}),
        statusLine: {
            ...(userStatusLine ?? {}),
            type: "command",
            command: statusLineCommand,
        },
        hooks: {
            ...userHooks,
            SessionStart: [
                ...existingSessionStart,
                {
                    matcher: "*",
                    hooks: [
                        {
                            type: "command",
                            command: hookCommand
                        }
                    ]
                }
            ]
        }
    };
}

/**
 * Generate a temporary settings file with SessionStart hook configuration
 *
 * @param port - The port where Happy server is listening
 * @returns Path to the generated settings file
 */
export function generateHookSettingsFile(port: number): string {
    const hooksDir = join(configuration.happyHomeDir, 'tmp', 'hooks');
    mkdirSync(hooksDir, { recursive: true });

    // Unique filename per process to avoid conflicts
    const filename = `session-hook-${process.pid}.json`;
    const filepath = join(hooksDir, filename);

    writeFileSync(filepath, JSON.stringify(buildHookSettings(port), null, 2));
    logger.debug(`[generateHookSettings] Created hook settings file: ${filepath}`);

    return filepath;
}

/**
 * Clean up the temporary hook settings file
 * 
 * @param filepath - Path to the settings file to remove
 */
export function cleanupHookSettingsFile(filepath: string): void {
    try {
        if (existsSync(filepath)) {
            unlinkSync(filepath);
            logger.debug(`[generateHookSettings] Cleaned up hook settings file: ${filepath}`);
        }
    } catch (error) {
        logger.debug(`[generateHookSettings] Failed to cleanup hook settings file: ${error}`);
    }
}
