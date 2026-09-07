import { describe, expect, it } from 'vitest';
import { appendDaemonSpawnModeArgs, shouldForwardDaemonPermissionMode } from './spawnModeArgs';

describe('daemon spawn mode arguments', () => {
  it('forwards Codex default because it is a concrete ask-first policy', () => {
    const args: string[] = [];

    appendDaemonSpawnModeArgs(args, { directory: '/repo', permissionMode: 'default' }, 'codex');

    expect(args).toEqual(['--permission-mode', 'default']);
  });

  it('leaves Claude default ambient', () => {
    const args: string[] = [];

    appendDaemonSpawnModeArgs(args, { directory: '/repo', permissionMode: 'default' }, 'claude');

    expect(args).toEqual([]);
  });

  it('forwards explicit Codex permission, model, and effort selections', () => {
    const args: string[] = [];

    appendDaemonSpawnModeArgs(args, {
      directory: '/repo',
      permissionMode: 'yolo',
      modelMode: 'gpt-5.6-sol',
      effortLevel: 'medium',
    }, 'codex');

    expect(args).toEqual([
      '--permission-mode', 'yolo',
      '--model', 'gpt-5.6-sol',
      '--effort', 'medium',
    ]);
  });

  it('forwards Qoder permission without leaking native-only model flags', () => {
    const args: string[] = [];

    appendDaemonSpawnModeArgs(args, {
      directory: '/repo',
      permissionMode: 'bypassPermissions',
      modelMode: 'qmodel_latest',
      effortLevel: 'high',
    }, 'qoder');

    expect(args).toEqual(['--permission-mode', 'bypassPermissions']);
  });

  it('uses the same Codex default rule for resume launches', () => {
    expect(shouldForwardDaemonPermissionMode('codex', 'default')).toBe(true);
    expect(shouldForwardDaemonPermissionMode('claude', 'default')).toBe(false);
  });
});
