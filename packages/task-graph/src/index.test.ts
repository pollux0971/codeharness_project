import { describe, it, expect } from 'vitest';
import { TaskGraph, legalTransition, validateFilesWithinScope, runSequentialScheduler, runParallelScheduler, computeSpawnPlan, recordSpawnPlan, isCompetitiveDebugEnabled, detectHotFiles, isDirectionSafe } from './index';
import type { IsolationPool, SpawnCandidate } from './index';
import type { StoryRecord } from '@codeharness/harness-core';
import { readJsonl } from '@codeharness/event-log';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const scope = { allowedWriteSet: ['codeharness/packages/foo/src/**'] };
const g = () => new TaskGraph('STORY-X', 'C-X', scope);
const mk = (gr: TaskGraph, over: any = {}) => gr.create({ intent: 'do a thing', created_by: 'developer', ...over });

describe('task-graph', () => {
  it('task_create_within_scope_succeeds', () => {
    const t = mk(g(), { files_touched: ['codeharness/packages/foo/src/a.ts'] });
    expect(t.status).toBe('pending'); expect(t.task_id).toContain('STORY-X');
  });
  it('task_create_outside_write_set_rejected', () => {
    expect(() => mk(g(), { files_touched: ['codeharness/packages/bar/src/x.ts'] })).toThrow(/outside contract write-set/);
  });
  it('task_create_assigns_incrementing_sequence', () => {
    const gr = g(); const a = mk(gr); const b = mk(gr);
    expect(a.sequence).toBe(0); expect(b.sequence).toBe(1);
  });
  it('task_create_unknown_dependency_rejected', () => {
    expect(() => mk(g(), { depends_on: ['task_nope'] })).toThrow(/unknown task/);
  });
  it('task_get_returns_created_task', () => {
    const gr = g(); const a = mk(gr); expect(gr.get(a.task_id).intent).toBe('do a thing');
  });
  it('task_list_orders_by_sequence', () => {
    const gr = g(); mk(gr); mk(gr); expect(gr.list().map(t => t.sequence)).toEqual([0, 1]);
  });
  it('task_list_filters_by_status', () => {
    const gr = g(); const a = mk(gr); mk(gr); gr.update(a.task_id, { status: 'in_progress' });
    expect(gr.list({ status: 'in_progress' }).length).toBe(1);
  });
  it('task_update_legal_transition_succeeds', () => {
    const gr = g(); const a = mk(gr); expect(gr.update(a.task_id, { status: 'in_progress' }).status).toBe('in_progress');
  });
  it('task_update_illegal_transition_rejected', () => {
    const gr = g(); const a = mk(gr); gr.update(a.task_id, { status: 'in_progress' }); gr.update(a.task_id, { status: 'done' });
    expect(() => gr.update(a.task_id, { status: 'in_progress' })).toThrow(/illegal transition/);
  });
  it('task_update_second_in_progress_rejected', () => {
    const gr = g(); const a = mk(gr); const b = mk(gr);
    gr.update(a.task_id, { status: 'in_progress' });
    expect(() => gr.update(b.task_id, { status: 'in_progress' })).toThrow(/already in_progress/);
  });
  it('task_next_returns_pending_with_deps_done', () => {
    const gr = g(); const a = mk(gr); const b = mk(gr, { depends_on: [] });
    expect(gr.next()?.task_id).toBe(a.task_id);
  });
  it('task_next_returns_dependent_task_after_deps_done', () => {
    const gr = g(); const a = mk(gr); const b = mk(gr, { depends_on: [a.task_id] });
    gr.update(a.task_id, { status: 'in_progress' }); gr.update(a.task_id, { status: 'done' });
    expect(gr.next()?.task_id).toBe(b.task_id);
  });
  it('task_next_skips_task_with_unmet_deps', () => {
    const gr = g(); const a = mk(gr); const b = mk(gr, { depends_on: [a.task_id] });
    // a is still pending → b's dep is unmet → next() must skip b and return a
    expect(gr.next()?.task_id).not.toBe(b.task_id);
    expect(gr.next()?.task_id).toBe(a.task_id);
  });
  it('legal_transition_table_blocks_done_to_pending', () => expect(legalTransition('done', 'pending')).toBe(false));
  it('validate_files_within_scope_flags_outside', () => expect(validateFilesWithinScope(['x/y.ts'], scope).length).toBe(1));
});

// ── Story-scheduler tests ─────────────────────────────────────────────────────

function makeStory(id: string, deps: string[] = []): StoryRecord {
  return {
    story_id: id, epic_id: 'EPIC-000', depends_on: deps,
    parallelism_class: 'sequential', status: 'todo',
    attempts: 0, attempt_budget: 3,
    branch: null, last_action: null, last_result: null,
    last_validation: null, blocked_reason: null,
  };
}
const alwaysPass  = async (_s: StoryRecord) => true;
const alwaysFail  = async (_s: StoryRecord) => false;
const fakeCheckpoint = async (s: StoryRecord) => ({
  story_id: s.story_id, branch: 'test', commit_sha: 'abc', checkpointed_at: new Date().toISOString(),
});

describe('story-scheduler', () => {
  it('stories_execute_in_dependency_order', async () => {
    const order: string[] = [];
    const A = makeStory('STORY-A');
    const B = makeStory('STORY-B', ['STORY-A']);
    const run = async (s: StoryRecord) => { order.push(s.story_id); return true; };
    await runSequentialScheduler({ stories: [B, A], runInnerLoop: run, onCheckpoint: fakeCheckpoint });
    expect(order).toEqual(['STORY-A', 'STORY-B']);
  });

  it('per_story_budgets_enforced', async () => {
    const A = makeStory('STORY-A');
    const B = makeStory('STORY-B', ['STORY-A']);
    const result = await runSequentialScheduler({
      stories: [A, B], runInnerLoop: alwaysFail, onCheckpoint: fakeCheckpoint,
    });
    expect(result.outcome).toBe('escalated');
    expect((result as { escalated_story: string }).escalated_story).toBe('STORY-A');
    expect(B.status).toBe('todo');
  });

  it('scheduler_halts_on_escalation', async () => {
    const A = makeStory('STORY-A');
    const B = makeStory('STORY-B');
    let bRan = false;
    const run = async (s: StoryRecord) => {
      if (s.story_id === 'STORY-B') bRan = true;
      return false;
    };
    const result = await runSequentialScheduler({
      stories: [A, B], runInnerLoop: run, onCheckpoint: fakeCheckpoint,
    });
    expect(result.outcome).toBe('escalated');
    expect(bRan).toBe(false);
  });

  it('checkpoint_per_story_commit', async () => {
    const checkpoints: string[] = [];
    const A = makeStory('STORY-A');
    const B = makeStory('STORY-B', ['STORY-A']);
    const checkpoint = async (s: StoryRecord) => {
      checkpoints.push(s.story_id);
      return fakeCheckpoint(s);
    };
    await runSequentialScheduler({ stories: [A, B], runInnerLoop: alwaysPass, onCheckpoint: checkpoint });
    expect(checkpoints).toEqual(['STORY-A', 'STORY-B']);
  });

  it('all_done_when_backlog_completes', async () => {
    const stories = [makeStory('STORY-A'), makeStory('STORY-B', ['STORY-A'])];
    const result = await runSequentialScheduler({
      stories, runInnerLoop: alwaysPass, onCheckpoint: fakeCheckpoint,
    });
    expect(result.outcome).toBe('all_done');
    expect(result.completed).toEqual(['STORY-A', 'STORY-B']);
  });
});

// ── Parallel-scheduler tests ──────────────────────────────────────────────────

function makeFakePool(): IsolationPool {
  return {
    runBatch: async (stories, runFn) =>
      Promise.all(stories.map(async s => ({
        story_id: s.story_id,
        workspace: { workspace_id: s.story_id, root: '/fake', disposable: true, created_at: '' } as any,
        result: ((await runFn(s.story_id, {} as any)) ? 'passed' : 'escalated') as 'passed' | 'escalated',
        checkpoint_sha: null,
      }))),
    mergeInOrder: async (runs, _root) =>
      runs
        .filter(r => r.result === 'passed')
        .sort((a, b) => a.story_id.localeCompare(b.story_id))
        .map(r => r.story_id),
  };
}

// ── Spawn-plan tests ──────────────────────────────────────────────────────────

const cand = (id: string, ws: string[], cls = 'parallel_safe'): SpawnCandidate =>
  ({ story_id: id, parallelism_class: cls, allowed_write_set: ws });

describe('spawn-plan', () => {
  it('write_set_overlap_blocks_parallel_spawn', () => {
    const plan = computeSpawnPlan([cand('A', ['src/a/**']), cand('B', ['src/**'])]);
    expect(plan.overlap_pairs.length).toBeGreaterThan(0);
    const inQueue = (id: string) => plan.sequential_queue.includes(id);
    expect(inQueue('A') || inQueue('B')).toBe(true);
  });

  it('non_overlapping_write_sets_spawn_in_parallel', () => {
    const plan = computeSpawnPlan([cand('A', ['src/a/**']), cand('B', ['test/**'])]);
    expect(plan.parallel_batch).toContain('A');
    expect(plan.parallel_batch).toContain('B');
    expect(plan.sequential_queue).toHaveLength(0);
  });

  it('exclusive_class_runs_alone', () => {
    const plan = computeSpawnPlan([cand('X', ['src/**'], 'exclusive'), cand('Y', ['test/**'])]);
    expect(plan.sequential_queue).toContain('X');
    expect(plan.parallel_batch).toContain('Y');
  });

  it('spawn_plan_recorded_in_trace', async () => {
    const trace = join(tmpdir(), `spawn-trace-test.jsonl`);
    if (existsSync(trace)) unlinkSync(trace);
    const plan = computeSpawnPlan([cand('A', ['src/**']), cand('B', ['test/**'])]);
    await recordSpawnPlan(plan, trace);
    const events = readJsonl(trace);
    expect(events[0].type).toBe('spawn_plan');
    if (existsSync(trace)) unlinkSync(trace);
  });

  it('three_way_overlap_all_downgraded', () => {
    const plan = computeSpawnPlan([cand('A', ['src/**']), cand('B', ['src/**']), cand('C', ['src/**'])]);
    expect(plan.parallel_batch.length).toBeLessThanOrEqual(1);
    expect(plan.sequential_queue.length).toBeGreaterThanOrEqual(2);
  });

  it('no_overlap_empty_candidates', () => {
    const plan = computeSpawnPlan([]);
    expect(plan.parallel_batch).toHaveLength(0);
    expect(plan.sequential_queue).toHaveLength(0);
  });
});

describe('competitive-debug-flag', () => {
  it('flag_default_off', () => {
    expect(isCompetitiveDebugEnabled({})).toBe(false);
  });

  it('flag_off_when_explicitly_false', () => {
    expect(isCompetitiveDebugEnabled({ competitive_debug: false })).toBe(false);
  });
});

// ── STORY-020.3: hot-files detection ─────────────────────────────────────────

describe('hot-files', () => {
  it('detect_hot_files_finds_shared_paths', () => {
    const result = detectHotFiles([
      { allowed_write_set: ['src/a.ts', 'src/b.ts'] },
      { allowed_write_set: ['src/a.ts', 'test/x.ts'] },
    ]);
    expect(result).toContain('src/a.ts');
    expect(result).not.toContain('src/b.ts');
  });

  it('detect_hot_files_empty_when_disjoint', () => {
    expect(detectHotFiles([
      { allowed_write_set: ['src/a.ts'] },
      { allowed_write_set: ['src/b.ts'] },
    ])).toHaveLength(0);
  });
});

describe('parallel-scheduler', () => {
  it('parallel_safe_stories_run_concurrently_and_complete', async () => {
    const A = makeStory('STORY-A'); A.parallelism_class = 'parallel_safe';
    const B = makeStory('STORY-B'); B.parallelism_class = 'parallel_safe';
    const ran: string[] = [];
    const result = await runParallelScheduler({
      stories: [A, B],
      runInnerLoopIsolated: async (s, _ws) => { ran.push(s.story_id); return true; },
      runInnerLoopSequential: alwaysPass,
      onCheckpoint: fakeCheckpoint,
      pool: makeFakePool(),
      mergeTargetRoot: '/tmp/fake',
    });
    expect(result.outcome).toBe('all_done');
    expect(ran.sort()).toEqual(['STORY-A', 'STORY-B']);
  });

  it('sequential_story_runs_one_at_a_time', async () => {
    const A = makeStory('STORY-A'); A.parallelism_class = 'sequential';
    const B = makeStory('STORY-B', ['STORY-A']); B.parallelism_class = 'sequential';
    const order: string[] = [];
    await runParallelScheduler({
      stories: [A, B],
      runInnerLoopIsolated: async (_s, _ws) => true,
      runInnerLoopSequential: async (s) => { order.push(s.story_id); return true; },
      onCheckpoint: fakeCheckpoint,
      pool: makeFakePool(),
      mergeTargetRoot: '/tmp/fake',
    });
    expect(order).toEqual(['STORY-A', 'STORY-B']);
  });

  it('escalation_in_parallel_batch_halts_scheduler', async () => {
    const A = makeStory('STORY-A'); A.parallelism_class = 'parallel_safe';
    const B = makeStory('STORY-B'); B.parallelism_class = 'parallel_safe';
    const result = await runParallelScheduler({
      stories: [A, B],
      runInnerLoopIsolated: async (_s, _ws) => false,
      runInnerLoopSequential: alwaysPass,
      onCheckpoint: fakeCheckpoint,
      pool: makeFakePool(),
      mergeTargetRoot: '/tmp/fake',
    });
    expect(result.outcome).toBe('escalated');
  });

  it('scheduler_applies_spawn_plan_before_batch', async () => {
    const A = { ...makeStory('STORY-A'), parallelism_class: 'parallel_safe' as const, allowed_write_set: ['src/**'] };
    const B = { ...makeStory('STORY-B'), parallelism_class: 'parallel_safe' as const, allowed_write_set: ['src/**'] };
    const order: string[] = [];
    await runParallelScheduler({
      stories: [A, B],
      runInnerLoopIsolated: async (s, _ws) => { order.push(s.story_id); return true; },
      runInnerLoopSequential: async (s) => { order.push(s.story_id); return true; },
      onCheckpoint: fakeCheckpoint,
      pool: makeFakePool(),
      mergeTargetRoot: '/tmp/fake',
    });
    // Overlap causes serialization — both stories still run, just not in the same batch
    expect(order.length).toBe(2);
  });
});

// ── STORY-022.7: Direction safety gate ───────────────────────────────────────

describe('direction-safety', () => {
  it('is_direction_safe_blocks_widen', () => {
    expect(isDirectionSafe({ direction_type: 'widen_write_set' })).toBe(false);
  });

  it('is_direction_safe_allows_safe_types', () => {
    expect(isDirectionSafe({ direction_type: 'change_implementation' })).toBe(true);
    expect(isDirectionSafe(null)).toBe(true);
  });
});
