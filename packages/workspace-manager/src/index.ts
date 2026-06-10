/**
 * @codeharness/workspace-manager
 * Owns disposable workspaces + ALL path-safety. The Permission Gateway depends on this
 * (via WorkspaceOracle) so disposability is never self-reported.
 * Contract: see STUB owners in codeharness/specs/stub_registry.json (STORY-003.2).
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

export interface WorkspaceManifest {
  workspace_id: string; root: string; disposable: boolean;
  story_id?: string; branch?: string; created_at: string;
}

/** Pure containment test. Both args treated as absolute (target is resolved as-is,
 *  NOT joined to root). Use this for absolute paths; never overload with relatives. */
export function isPathInsideRoot(root: string, targetAbs: string): boolean {
  const rootAbs = path.resolve(root);
  const target = path.resolve(targetAbs);
  return target === rootAbs || target.startsWith(rootAbs + path.sep);
}

/** Resolve a possibly-relative target against the workspace root and assert containment. */
export function resolveInsideWorkspace(root: string, target: string): string {
  const resolved = path.resolve(root, target);
  if (!isPathInsideRoot(root, resolved)) throw new Error('path escapes workspace');
  return resolved;
}

export class WorkspaceRegistry {
  private byRoot = new Map<string, WorkspaceManifest>();
  register(m: WorkspaceManifest) { this.byRoot.set(path.resolve(m.root), m); }
  get(childAbs: string): WorkspaceManifest | undefined {
    const abs = path.resolve(childAbs);
    for (const m of this.byRoot.values()) if (isPathInsideRoot(m.root, abs)) return m;
    return undefined;
  }
  isDisposable(childAbs: string): boolean { return this.get(childAbs)?.disposable === true; }
  unregister(root: string) { this.byRoot.delete(path.resolve(root)); }
}

/** realpath() following symlinks; falls back to resolve() if the path does not exist yet. */
export function resolveRealPath(p: string): string {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}
/** True if the real (symlink-followed) path leaves the workspace root. */
export function detectSymlinkEscape(workspaceRoot: string, target: string): boolean {
  return !isPathInsideRoot(workspaceRoot, resolveRealPath(path.resolve(workspaceRoot, target)));
}

/** Build the WorkspaceOracle the Permission Gateway consumes (disposability from registry). */
export function makeOracle(registry: WorkspaceRegistry) {
  return {
    resolveRealPath,
    isDisposableWorkspace: (p: string) => registry.isDisposable(resolveRealPath(p)),
    escapesWorkspace: (p: string) => {
      const real = resolveRealPath(p);
      const m = registry.get(real);
      return m ? !isPathInsideRoot(m.root, real) : true; // outside any known workspace ⇒ escape
    },
  };
}

// ---- git/fs side-effecting ops (real; git worktree-style disposable workspace) ----
let _wsSeq = 0;
function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

/** Create a disposable git workspace under the OS temp dir and register it as disposable. */
export function createDisposableWorkspace(registry: WorkspaceRegistry, opts: { story_id: string; baseRef?: string }): WorkspaceManifest {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ch-ws-${opts.story_id}-`));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'harness@codeharness.local']);
  git(root, ['config', 'user.name', 'codeharness']);
  git(root, ['commit', '--allow-empty', '-q', '-m', 'workspace base']);
  const m: WorkspaceManifest = {
    workspace_id: `ws_${opts.story_id}_${++_wsSeq}`, root, disposable: true,
    story_id: opts.story_id, branch: opts.baseRef ?? 'HEAD', created_at: new Date().toISOString(),
  };
  registry.register(m);
  return m;
}

/** Write+stage+commit a baseline file (containment-checked) into a workspace. */
export function seedFile(ws: WorkspaceManifest, relPath: string, content: string): void {
  const abs = resolveInsideWorkspace(ws.root, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
export function commitAll(ws: WorkspaceManifest, message: string): void {
  git(ws.root, ['add', '-A']);
  git(ws.root, ['commit', '-q', '-m', message]);
}

/** Apply a unified diff (git patch) inside the workspace; return changed file paths. */
export function applyPatch(ws: WorkspaceManifest, diffPath: string): string[] {
  resolveInsideWorkspace(ws.root, '.'); // assert a real root
  git(ws.root, ['apply', '--whitespace=nowarn', diffPath]);
  return git(ws.root, ['diff', '--name-only']).split('\n').filter(Boolean);
}

/** Working-tree diff (what the patch changed, pre-commit). */
export function collectDiff(ws: WorkspaceManifest): string {
  return git(ws.root, ['diff']);
}

/** Destroy the workspace directory and unregister it. */
export function cleanupWorkspace(registry: WorkspaceRegistry, ws: WorkspaceManifest): void {
  fs.rmSync(ws.root, { recursive: true, force: true });
  registry.unregister(ws.root);
}
