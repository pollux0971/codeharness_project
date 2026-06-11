import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isPathInsideRoot, resolveInsideWorkspace, WorkspaceRegistry, detectSymlinkEscape,
  makeOracle, createDisposableWorkspace, applyPatch, collectDiff, cleanupWorkspace, seedFile, commitAll,
  bootstrapGreenfieldWorkspace,
  type GreenfieldWorkspaceInput,
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
  // ---- STORY-010.1: Greenfield workspace bootstrap ----
  describe('STORY-010.1: bootstrapGreenfieldWorkspace', () => {
    let sandboxDir: string;
    beforeEach(() => { sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-gf-')); });
    afterEach(() => { try { fs.rmSync(sandboxDir, { recursive: true, force: true }); } catch {} });

    it('STORY-010.1_valid_input_creates_workspace_metadata', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'myapp' });
      expect(result.mode).toBe('greenfield');
      expect(result.workspace_id).toBe('gf_myapp');
      expect(result.root).toBe(path.resolve(sandboxDir));
      expect(typeof result.target_project_root).toBe('string');
      expect(Array.isArray(result.created_files)).toBe(true);
      expect(Array.isArray(result.rollback_plan)).toBe(true);
      expect(result.safety_policy.path_traversal_rejected).toBe(true);
      expect(result.safety_policy.external_network_allowed).toBe(false);
    });

    it('STORY-010.1_target_project_root_is_inside_sandbox', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'proj' });
      expect(isPathInsideRoot(result.root, result.target_project_root)).toBe(true);
    });

    it('STORY-010.1_target_project_root_created_deterministically', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'slug1' });
      expect(result.target_project_root).toBe(path.join(path.resolve(sandboxDir), 'slug1'));
      expect(fs.existsSync(result.target_project_root)).toBe(true);
    });

    it('STORY-010.1_git_repo_initialized_in_target_project_root', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'myproj' });
      expect(fs.existsSync(path.join(result.target_project_root, '.git'))).toBe(true);
    });

    it('STORY-010.1_git_history_starts_clean_single_commit', () => {
      const { execFileSync } = require('node:child_process');
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'clean' });
      const log = execFileSync('git', ['log', '--oneline'], { cwd: result.target_project_root, encoding: 'utf8' }) as string;
      const lines = (log as string).trim().split('\n').filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toContain('greenfield scaffold');
    });

    it('STORY-010.1_minimal_ts_scaffold_files_created_inside_target_root', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'tsapp', template: 'minimal-ts' });
      expect(result.created_files).toContain('package.json');
      expect(result.created_files).toContain('tsconfig.json');
      expect(result.created_files).toContain('src/index.ts');
      expect(result.created_files).toContain('.gitignore');
      for (const f of result.created_files) {
        const abs = path.join(result.target_project_root, f);
        expect(fs.existsSync(abs)).toBe(true);
        expect(isPathInsideRoot(result.target_project_root, abs)).toBe(true);
      }
    });

    it('STORY-010.1_created_files_ordering_is_deterministic', () => {
      const sb1 = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-gf-a-'));
      const sb2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-gf-b-'));
      try {
        const r1 = bootstrapGreenfieldWorkspace({ sandboxRoot: sb1, projectSlug: 'det', workspaceId: 'det1' });
        const r2 = bootstrapGreenfieldWorkspace({ sandboxRoot: sb2, projectSlug: 'det', workspaceId: 'det2' });
        expect(r1.created_files).toEqual(r2.created_files);
        expect(r1.created_files).toEqual([...r1.created_files].sort());
      } finally {
        fs.rmSync(sb1, { recursive: true, force: true });
        fs.rmSync(sb2, { recursive: true, force: true });
      }
    });

    it('STORY-010.1_same_input_produces_same_metadata_shape', () => {
      const input: GreenfieldWorkspaceInput = { sandboxRoot: sandboxDir, projectSlug: 'same', workspaceId: 'fixed-id', template: 'minimal-ts' };
      const r1 = bootstrapGreenfieldWorkspace(input);
      fs.rmSync(r1.target_project_root, { recursive: true, force: true });
      const r2 = bootstrapGreenfieldWorkspace(input);
      expect(r1.workspace_id).toBe(r2.workspace_id);
      expect(r1.mode).toBe(r2.mode);
      expect(r1.created_files).toEqual(r2.created_files);
      expect(r1.safety_policy).toEqual(r2.safety_policy);
    });

    it('STORY-010.1_caller_injected_workspaceId_used_verbatim', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'p', workspaceId: 'injected-id' });
      expect(result.workspace_id).toBe('injected-id');
    });

    it('STORY-010.1_path_traversal_in_projectSlug_rejected', () => {
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: '../escape' })).toThrow();
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'a/b' })).toThrow();
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'a\\b' })).toThrow();
    });

    it('STORY-010.1_empty_projectSlug_rejected', () => {
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: '' })).toThrow();
    });

    it('STORY-010.1_system_path_sandboxRoot_rejected', () => {
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: '/etc', projectSlug: 'x' })).toThrow(/system path/);
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: '/usr/bin', projectSlug: 'x' })).toThrow();
      expect(() => bootstrapGreenfieldWorkspace({ sandboxRoot: '/', projectSlug: 'x' })).toThrow(/root/);
    });

    it('STORY-010.1_rollback_plan_present_and_references_target_root', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'rb' });
      expect(result.rollback_plan.length).toBeGreaterThan(0);
      expect(result.rollback_plan.some(step => step.includes(result.target_project_root))).toBe(true);
    });

    it('STORY-010.1_empty_template_creates_no_scaffold_files', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'empty', template: 'empty' });
      expect(result.created_files).toEqual([]);
      expect(fs.existsSync(result.target_project_root)).toBe(true);
      expect(fs.existsSync(path.join(result.target_project_root, '.git'))).toBe(true);
    });

    it('STORY-010.1_no_lmm_no_external_api_no_container_structural', () => {
      // Structural: bootstrapGreenfieldWorkspace is pure fs+git; return type has no LLM or API fields.
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'safe' });
      expect((result as Record<string, unknown>).llm_call).toBeUndefined();
      expect((result as Record<string, unknown>).api_call).toBeUndefined();
      expect((result as Record<string, unknown>).container_id).toBeUndefined();
    });

    it('STORY-010.1_does_not_schedule_stories_or_run_generated_project', () => {
      const result = bootstrapGreenfieldWorkspace({ sandboxRoot: sandboxDir, projectSlug: 'nosched' });
      // No scheduler fields in return; generated project code is not executed
      expect((result as Record<string, unknown>).scheduled_stories).toBeUndefined();
      expect((result as Record<string, unknown>).execution_result).toBeUndefined();
    });
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
