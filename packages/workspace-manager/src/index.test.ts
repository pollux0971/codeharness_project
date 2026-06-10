import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isPathInsideRoot, resolveInsideWorkspace, WorkspaceRegistry, detectSymlinkEscape,
  makeOracle, createDisposableWorkspace, applyPatch, collectDiff, cleanupWorkspace, seedFile, commitAll,
} from './index';

let ws: string; let outside: string;
beforeEach(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chws-'));
  ws = path.join(tmp, 'ws'); outside = path.join(tmp, 'outside');
  fs.mkdirSync(ws, { recursive: true }); fs.mkdirSync(outside, { recursive: true });
});
afterEach(() => { try { fs.rmSync(path.dirname(ws), { recursive: true, force: true }); } catch {} });

describe('workspace-manager', () => {
  it('is_path_inside_root_true_for_child', () => expect(isPathInsideRoot(ws, path.join(ws, 'a/b.ts'))).toBe(true));
  it('is_path_inside_root_false_for_sibling', () => expect(isPathInsideRoot(ws, outside)).toBe(false));
  it('is_path_inside_root_false_for_parent', () => expect(isPathInsideRoot(ws, path.dirname(ws))).toBe(false));
  it('resolve_inside_workspace_returns_resolved_for_child', () => expect(resolveInsideWorkspace(ws, 'a/b.ts')).toBe(path.join(ws, 'a/b.ts')));
  it('resolve_inside_workspace_throws_for_escape', () => expect(() => resolveInsideWorkspace(ws, '../outside/x')).toThrow(/escapes/));
  it('registry_get_finds_workspace_for_child', () => {
    const r = new WorkspaceRegistry();
    r.register({ workspace_id: 'w1', root: ws, disposable: true, created_at: '' });
    expect(r.get(path.join(ws, 'deep/file.ts'))?.workspace_id).toBe('w1');
  });
  it('registry_is_disposable_true_for_registered_disposable', () => {
    const r = new WorkspaceRegistry();
    r.register({ workspace_id: 'w1', root: ws, disposable: true, created_at: '' });
    expect(r.isDisposable(path.join(ws, 'x'))).toBe(true);
  });
  it('registry_is_disposable_false_for_unknown_path', () => {
    expect(new WorkspaceRegistry().isDisposable(outside)).toBe(false);
  });
  it('detect_symlink_escape_true_when_symlink_points_outside', () => {
    const link = path.join(ws, 'link');
    try { fs.symlinkSync(outside, link); } catch { return; } // skip if symlinks unsupported
    expect(detectSymlinkEscape(ws, 'link')).toBe(true);
  });
  it('oracle_is_disposable_reflects_registry', () => {
    const r = new WorkspaceRegistry();
    r.register({ workspace_id: 'w1', root: ws, disposable: true, created_at: '' });
    expect(makeOracle(r).isDisposableWorkspace(path.join(ws, 'x'))).toBe(true);
  });
  it('create_disposable_workspace_makes_a_registered_git_root', () => {
    const r = new WorkspaceRegistry();
    const m = createDisposableWorkspace(r, { story_id: 'STORY-X' });
    try {
      expect(require('node:fs').existsSync(require('node:path').join(m.root, '.git'))).toBe(true);
      expect(m.disposable).toBe(true);
      expect(r.isDisposable(m.root)).toBe(true);
    } finally { cleanupWorkspace(r, m); }
  });
  it('apply_patch_changes_tracked_file_and_cleanup_removes_root', () => {
    const fsm = require('node:fs');
    const r = new WorkspaceRegistry();
    const m = createDisposableWorkspace(r, { story_id: 'STORY-Y' });
    seedFile(m, 'a.txt', 'old\n'); commitAll(m, 'seed');
    const diff = [
      'diff --git a/a.txt b/a.txt', 'index 0000000..1111111 100644', '--- a/a.txt', '+++ b/a.txt',
      '@@ -1 +1 @@', '-old', '+new', '',
    ].join('\n');
    const dp = require('node:path').join(m.root, '_patch.diff'); fsm.writeFileSync(dp, diff);
    const changed = applyPatch(m, dp);
    expect(changed).toContain('a.txt');
    expect(fsm.readFileSync(require('node:path').join(m.root, 'a.txt'), 'utf8')).toBe('new\n');
    expect(collectDiff(m)).toContain('+new');
    const root = m.root; cleanupWorkspace(r, m);
    expect(fsm.existsSync(root)).toBe(false);
  });
});
