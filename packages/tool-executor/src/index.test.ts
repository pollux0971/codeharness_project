import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, mkdtempSync } from 'fs';
import { promoteWorkspace, type PromoteOptions } from './index';
import type { ProjectRunState } from '@codeharness/harness-core';
import type { WorkspaceManifest } from '@codeharness/workspace-manager';
import { isPathInsideRoot } from '@codeharness/workspace-manager';
import { readJsonl } from '@codeharness/event-log';

const tmpRoot = join(tmpdir(), `promo-test-${process.pid}`);

beforeEach(() => { mkdirSync(tmpRoot, { recursive: true }); });
afterEach(() => { try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {} });

function makeFullyCheckpointedRunState(): ProjectRunState {
  return {
    schema_version: 1, project_id: 'proj-test', run_id: 'run-1',
    created_at: '', updated_at: '', current_story: null, last_decision: null,
    iterations_used: 2, run_iteration_budget: 10,
    stories: [
      { story_id: 'STORY-A', status: 'done', attempts: 1, attempt_budget: 3,
        checkpoint_sha: 'abc123', last_action: null, last_result: null, blocked_reason: null },
      { story_id: 'STORY-B', status: 'done', attempts: 1, attempt_budget: 3,
        checkpoint_sha: 'def456', last_action: null, last_result: null, blocked_reason: null },
    ],
  };
}

function makeWorkspace(root: string): WorkspaceManifest {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'output.ts'), 'export const x = 1;');
  return { workspace_id: 'ws-1', root, disposable: true, created_at: new Date().toISOString() };
}

function makeOpts(wsRoot: string, targetPath: string, traceLog: string): PromoteOptions {
  return {
    runState: makeFullyCheckpointedRunState(),
    sourceWorkspace: makeWorkspace(wsRoot),
    targetPath,
    traceLogPath: traceLog,
    runId: 'run-1',
  };
}

describe('promotion-executor', () => {
  it('only_checkpointed_runs_promotable', async () => {
    const wsRoot = mkdtempSync(join(tmpRoot, 'ws-'));
    const target = join(tmpRoot, 'stable-ok');
    const trace  = join(tmpRoot, 'trace.jsonl');
    const record = await promoteWorkspace(makeOpts(wsRoot, target, trace));
    expect(existsSync(join(target, 'output.ts'))).toBe(true);
    expect(record.story_ids_promoted).toEqual(['STORY-A', 'STORY-B']);
  });

  it('export_writes_outside_sandbox_only_via_promotion_path', async () => {
    const wsRoot = mkdtempSync(join(tmpRoot, 'ws-'));
    const target = join(tmpRoot, 'stable-outside');
    const trace  = join(tmpRoot, 'trace.jsonl');
    await promoteWorkspace(makeOpts(wsRoot, target, trace));
    expect(isPathInsideRoot(wsRoot, target)).toBe(false);
  });

  it('promotion_recorded_in_trace', async () => {
    const wsRoot = mkdtempSync(join(tmpRoot, 'ws-'));
    const target = join(tmpRoot, 'stable-trace');
    const trace  = join(tmpRoot, 'trace2.jsonl');
    const record = await promoteWorkspace(makeOpts(wsRoot, target, trace));
    const events = readJsonl(trace);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('promotion');
    expect(events[0].event_id).toBe(record.trace_event_id);
  });

  it('rejects_uncheckpointed_run', async () => {
    const wsRoot = mkdtempSync(join(tmpRoot, 'ws-'));
    const target = join(tmpRoot, 'stable-reject');
    const trace  = join(tmpRoot, 'trace3.jsonl');
    const partial = makeFullyCheckpointedRunState();
    partial.stories[0].checkpoint_sha = null;
    await expect(promoteWorkspace({ ...makeOpts(wsRoot, target, trace), runState: partial }))
      .rejects.toThrow(/not fully checkpointed/);
  });
});
