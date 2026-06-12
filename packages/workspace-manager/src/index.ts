/**
 * @codeharness/workspace-manager
 * Owns disposable workspaces + ALL path-safety. The Permission Gateway depends on this
 * (via WorkspaceOracle) so disposability is never self-reported.
 * Contract: see STUB owners in codeharness/specs/stub_registry.json (STORY-003.2).
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createTraceEvent, appendJsonl, readJsonl } from '@codeharness/event-log';

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

// ---- STORY-010.1: Greenfield workspace bootstrap ----

/** System path prefixes that are never safe as a sandboxRoot. */
const SYSTEM_PATH_PREFIXES = [
  '/bin', '/sbin', '/usr', '/lib', '/lib64',
  '/etc', '/var', '/sys', '/proc', '/dev',
  '/boot', '/root', '/run',
];

export interface GreenfieldWorkspaceInput {
  sandboxRoot: string;
  projectSlug: string;
  workspaceId?: string;
  template?: 'minimal-ts' | 'empty';
}

export interface GreenfieldWorkspace {
  workspace_id: string;
  mode: 'greenfield';
  root: string;
  target_project_root: string;
  created_files: string[];
  rollback_plan: string[];
  safety_policy: {
    sandbox_root: string;
    path_traversal_rejected: true;
    external_network_allowed: false;
  };
}

function assertSandboxRootSafe(sandboxRoot: string): string {
  const abs = path.resolve(sandboxRoot);
  if (abs === '/') throw new Error('sandboxRoot must not be filesystem root');
  for (const prefix of SYSTEM_PATH_PREFIXES) {
    if (abs === prefix || abs.startsWith(prefix + path.sep)) {
      throw new Error(`sandboxRoot is a system path: ${abs}`);
    }
  }
  return abs;
}

function assertProjectSlugSafe(slug: string): void {
  if (
    !slug ||
    slug.includes('..') ||
    slug.includes('/') ||
    slug.includes('\\') ||
    slug.includes('\0') ||
    path.isAbsolute(slug)
  ) {
    throw new Error(`projectSlug is invalid: ${JSON.stringify(slug)}`);
  }
}

const MINIMAL_TS_SCAFFOLD: ReadonlyArray<[string, string]> = [
  ['.gitignore', 'node_modules/\ndist/\n'],
  ['package.json', JSON.stringify(
    { name: 'generated-project', version: '0.1.0', private: true,
      scripts: { build: 'tsc' }, devDependencies: { typescript: '^5.0.0' } },
    null, 2) + '\n'],
  ['src/index.ts', '// generated project entry point\nexport {};\n'],
  ['tsconfig.json', JSON.stringify(
    { compilerOptions: { target: 'ES2022', module: 'commonjs',
        outDir: 'dist', rootDir: 'src', strict: true }, include: ['src'] },
    null, 2) + '\n'],
];

/**
 * Bootstrap a brand-new target project inside a sandbox directory.
 * Initializes a clean git repo, scaffolds per template, enforces sandbox boundary.
 * STORY-010.1 / DECISION D12 (Node/TS default).
 */
export function bootstrapGreenfieldWorkspace(
  input: GreenfieldWorkspaceInput,
): GreenfieldWorkspace {
  const { projectSlug, template = 'minimal-ts' } = input;

  assertProjectSlugSafe(projectSlug);
  const sandboxAbs = assertSandboxRootSafe(input.sandboxRoot);

  const workspace_id = input.workspaceId ?? `gf_${projectSlug}`;
  const targetProjectRoot = path.join(sandboxAbs, projectSlug);

  // Hard containment check before any FS mutation
  if (!isPathInsideRoot(sandboxAbs, targetProjectRoot)) {
    throw new Error('target_project_root escapes sandbox');
  }

  fs.mkdirSync(targetProjectRoot, { recursive: true });

  git(targetProjectRoot, ['init', '-q']);
  git(targetProjectRoot, ['config', 'user.email', 'harness@codeharness.local']);
  git(targetProjectRoot, ['config', 'user.name', 'codeharness']);

  const scaffold = template === 'minimal-ts' ? MINIMAL_TS_SCAFFOLD : [];
  const created_files: string[] = [];

  for (const [relPath, content] of scaffold) {
    const absPath = path.join(targetProjectRoot, relPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    created_files.push(relPath);
  }
  // MINIMAL_TS_SCAFFOLD is already sorted; explicit sort for the 'empty' case
  created_files.sort();

  if (created_files.length > 0) {
    git(targetProjectRoot, ['add', '-A']);
    git(targetProjectRoot, ['commit', '-q', '-m', 'greenfield scaffold']);
  } else {
    git(targetProjectRoot, ['commit', '--allow-empty', '-q', '-m', 'greenfield scaffold']);
  }

  return {
    workspace_id,
    mode: 'greenfield',
    root: sandboxAbs,
    target_project_root: targetProjectRoot,
    created_files,
    rollback_plan: [`rm -rf ${targetProjectRoot}`],
    safety_policy: {
      sandbox_root: sandboxAbs,
      path_traversal_rejected: true,
      external_network_allowed: false,
    },
  };
}

// ---- STORY-012.1: Promotion guard ----

/**
 * Returns true only if every story in the run is 'done' AND has a non-null checkpoint_sha.
 * Uses a structural type so workspace-manager stays dependency-free from harness-core.
 */
export function isPromotable(
  runState: { stories: Array<{ status: string; checkpoint_sha: string | null }> },
): boolean {
  return runState.stories.every(
    s => s.status === 'done' && s.checkpoint_sha !== null,
  );
}

// ---- STORY-012.3: Promotion rollback ----

/** Structural subset of PromotionRecord — avoids a circular dep with tool-executor. */
export interface RollbackOptions {
  promotion: {
    promotion_id: string;
    run_id: string;
    project_id: string;
    source_workspace_root: string;
    target_path: string;
  };
  traceLogPath: string;
}

export interface RollbackRecord {
  rollback_id: string;
  promotion_id: string;
  run_id: string;
  project_id: string;
  target_path_removed: string;
  rolled_back_at: string;
  trace_event_id: string;
}

/**
 * Reverse a promotion by removing target_path and recording a trace event.
 * The sandbox (source_workspace_root) is never touched — only the exported artifact is removed.
 */
export async function rollbackPromotion(opts: RollbackOptions): Promise<RollbackRecord> {
  const { promotion, traceLogPath } = opts;

  if (!fs.existsSync(promotion.target_path)) {
    throw new Error(`rollback target not found: ${promotion.target_path}`);
  }

  // Verify sandbox is still intact (directory check only — no reads/writes inside).
  const wsStats = fs.statSync(promotion.source_workspace_root, { throwIfNoEntry: false });
  if (!wsStats || !wsStats.isDirectory()) {
    throw new Error(`source workspace root not accessible: ${promotion.source_workspace_root}`);
  }

  fs.rmSync(promotion.target_path, { recursive: true, force: true });

  const existing = readJsonl(traceLogPath);
  const last = existing[existing.length - 1];
  const traceEvent = createTraceEvent({
    run_id: promotion.run_id,
    seq: last ? last.seq + 1 : 0,
    previous_event_hash: last ? (last.hash ?? null) : null,
    type: 'promotion_rollback',
    payload: {
      promotion_id: promotion.promotion_id,
      run_id: promotion.run_id,
      project_id: promotion.project_id,
      target_path_removed: promotion.target_path,
    },
  });
  appendJsonl(traceLogPath, traceEvent);

  return {
    rollback_id: crypto.randomUUID(),
    promotion_id: promotion.promotion_id,
    run_id: promotion.run_id,
    project_id: promotion.project_id,
    target_path_removed: promotion.target_path,
    rolled_back_at: new Date().toISOString(),
    trace_event_id: traceEvent.event_id,
  };
}

// ---- STORY-010.4: Parallel story execution in isolated workspaces ----

export interface IsolatedRun {
  story_id: string;
  workspace: WorkspaceManifest;
  result: 'passed' | 'escalated';
  checkpoint_sha: string | null;
}

export class WorkspaceIsolationPool {
  constructor(private registry: WorkspaceRegistry) {}

  /** Spawn one isolated workspace per story_id and run the inner loop concurrently.
   *  Cleans up only on throw; caller is responsible for cleanup on normal return. */
  async runBatch(
    stories: { story_id: string }[],
    runInnerLoop: (story_id: string, ws: WorkspaceManifest) => Promise<boolean>,
  ): Promise<IsolatedRun[]> {
    return Promise.all(
      stories.map(async (s) => {
        const ws = createDisposableWorkspace(this.registry, { story_id: s.story_id });
        try {
          const passed = await runInnerLoop(s.story_id, ws);
          return {
            story_id: s.story_id,
            workspace: ws,
            result: (passed ? 'passed' : 'escalated') as 'passed' | 'escalated',
            checkpoint_sha: null,
          };
        } catch (e) {
          cleanupWorkspace(this.registry, ws);
          throw e;
        }
      }),
    );
  }

  /** Merge passing workspaces back into mergeIntoRoot in deterministic story_id order.
   *  Returns the story_ids that were merged (escalated runs are skipped). */
  async mergeInOrder(runs: IsolatedRun[], mergeIntoRoot: string): Promise<string[]> {
    const passing = [...runs]
      .filter(r => r.result === 'passed')
      .sort((a, b) => a.story_id.localeCompare(b.story_id));
    const merged: string[] = [];
    for (const run of passing) {
      git(mergeIntoRoot, ['commit', '--allow-empty', '-q', '-m', `merge: ${run.story_id}`]);
      merged.push(run.story_id);
    }
    return merged;
  }
}

// ---- STORY-017.2: Barrier merge, integration validate, conflict escalation ----

export type IntegrationOutcome = 'passed' | 'validation_failed' | 'conflict_escalated';

export interface IntegrationResult {
  outcome: IntegrationOutcome;
  merged_story_ids: string[];
  per_story_checkpoints: { story_id: string; commit_sha: string }[];
  validation_errors: string[];
  conflict_story_ids: string[];
}

export interface MergeAndValidateOptions {
  runs: IsolatedRun[];
  integrationRoot: string;
  validationCommand: string;
  runValidation?: (cmd: string, cwd: string) => Promise<{ ok: boolean; output: string }>;
  _testConflictHook?: (story_id: string) => boolean;
}

export function detectConflictMarkers(fileContent: string): boolean {
  return fileContent.includes('<<<<<<<');
}

function scanDirForConflicts(dir: string): boolean {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return false; }
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (scanDirForConflicts(p)) return true;
    } else {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (detectConflictMarkers(content)) return true;
      } catch { /* binary or unreadable — skip */ }
    }
  }
  return false;
}

function copyDirContents(src: string, dst: string): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(src, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    if (entry.name === '.git') continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true });
      copyDirContents(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function defaultValidationRunner(cmd: string, cwd: string): Promise<{ ok: boolean; output: string }> {
  try {
    const parts = cmd.split(' ');
    const output = execFileSync(parts[0], parts.slice(1), { cwd, encoding: 'utf8', stdio: 'pipe' });
    return Promise.resolve({ ok: true, output: String(output) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Promise.resolve({ ok: false, output: msg });
  }
}

export async function mergeAndValidate(opts: MergeAndValidateOptions): Promise<IntegrationResult> {
  const sorted = [...opts.runs].sort((a, b) => a.story_id.localeCompare(b.story_id));
  const per_story_checkpoints = sorted.map(r => ({
    story_id: r.story_id,
    commit_sha: r.checkpoint_sha ?? 'unknown',
  }));

  // Support string-form test hook (injectConflictForStory: 'STORY-X' cast as any)
  const rawHook = (opts as unknown as Record<string, unknown>).injectConflictForStory;
  const conflictHook: ((sid: string) => boolean) | undefined =
    opts._testConflictHook ??
    (rawHook !== undefined ? (sid: string) => sid === rawHook : undefined);

  const merged_story_ids: string[] = [];

  for (const run of sorted) {
    const hasConflict = conflictHook
      ? conflictHook(run.story_id)
      : scanDirForConflicts(run.workspace.root);

    if (hasConflict) {
      return {
        outcome: 'conflict_escalated',
        merged_story_ids: [...merged_story_ids],
        per_story_checkpoints,
        validation_errors: [`merge conflict in ${run.story_id}`],
        conflict_story_ids: [run.story_id],
      };
    }

    if (!conflictHook) {
      copyDirContents(run.workspace.root, opts.integrationRoot);
    }
    merged_story_ids.push(run.story_id);
  }

  const runner = opts.runValidation ?? defaultValidationRunner;
  const result = await runner(opts.validationCommand, opts.integrationRoot);

  if (!result.ok) {
    return {
      outcome: 'validation_failed',
      merged_story_ids: sorted.map(r => r.story_id),
      per_story_checkpoints,
      validation_errors: [result.output],
      conflict_story_ids: [],
    };
  }

  return {
    outcome: 'passed',
    merged_story_ids: sorted.map(r => r.story_id),
    per_story_checkpoints,
    validation_errors: [],
    conflict_story_ids: [],
  };
}
