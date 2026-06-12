import { describe, it, expect } from 'vitest';
import { TaskGraph, legalTransition, validateFilesWithinScope, runSequentialScheduler } from './index';
import type { StoryRecord } from '@codeharness/harness-core';

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
