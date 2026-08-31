export type SessionAgentKey = string;

const SESSION_AGENT_LABELS: Readonly<Record<string, string>> = {
    claude: 'Claude',
    codex: 'Codex',
    qoder: 'Qoder',
    agy: 'Antigravity',
    rig: 'Happy',
    gemini: 'Gemini',
    openclaw: 'OpenClaw',
    unknown: 'Unknown',
};

export function resolveSessionAgentKey(
    flavor?: string | null,
    clientId?: string | null,
): SessionAgentKey {
    if (clientId === 'rig') return 'rig';
    return flavor ?? 'unknown';
}

export function getSessionAgentLabel(
    flavor?: string | null,
    clientId?: string | null,
): string {
    const key = resolveSessionAgentKey(flavor, clientId);
    return SESSION_AGENT_LABELS[key] ?? key;
}
