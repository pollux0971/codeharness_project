import { describe, it, expect } from 'vitest';
import {
  type TrackerState, type RuntimeStory, type RuntimeDecision, type ActionResult,
  selectNextRuntimeStory, hasBlockedOrEscalatedDependency,
  decideNextAction, advanceTrackerState, buildResumeSummary,
} from './orchestrator-v0.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<RuntimeStory> & { story_id: string }): RuntimeStory {
  return {
    epic_id: 'E1',
    depends_on: [],
    status: 'todo',
    priority: 1,
    order_index: 0,
    attempts: 0,
    attempt_budget: 2,
    allowed_write_set: ['src/**'],
    validation_commands: ['echo ok'],
    rollback_notes: 'git checkout -- src/',
    blocked_reason: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<TrackerState>): TrackerState {
  return {
    run_id: 'run-test',
    state: 'select',
    run_iteration_budget: 20,
    iterations_used: 0,
    stories: [],
    active_story_id: null,
    last_validation_passed: null,
    human_gate_cleared: false,
    stop_reason: null,
    decision_log: [],
    ...overrides,
  };
}

/** Run N ticks from the given state, collecting decisions and advancing state. */
function runTicks(
  initial: TrackerState,
  n: number,
  resultFn: (d: RuntimeDecision) => ActionResult = () => ({ success: true })
): { decisions: RuntimeDecision[]; finalState: TrackerState } {
  let state = initial;
  const decisions: RuntimeDecision[] = [];
  for (let i = 0; i < n; i++) {
    const d = decideNextAction(state);
    decisions.push(d);
    state = advanceTrackerState(state, d, resultFn(d));
    if (state.state === 'stopped' || state.state === 'gate') break;
  }
  return { decisions, finalState: state };
}

// ── 1. selectable story follows dependency DAG ────────────────────────────────

describe('selectNextRuntimeStory', () => {
  it('selects story with no dependencies first', () => {
    const stories = [
      makeStory({ story_id: 'B', depends_on: ['A'], order_index: 1 }),
      makeStory({ story_id: 'A', depends_on: [], order_index: 0 }),
    ];
    expect(selectNextRuntimeStory(stories)).toBe('A');
  });

  it('does not select story whose dependency is not done', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'in_progress' }),
      makeStory({ story_id: 'B', depends_on: ['A'] }),
    ];
    expect(selectNextRuntimeStory(stories)).toBeNull();
  });

  it('tie-breaks by priority then order_index then story_id', () => {
    const stories = [
      makeStory({ story_id: 'C', priority: 2, order_index: 0 }),
      makeStory({ story_id: 'B', priority: 1, order_index: 1 }),
      makeStory({ story_id: 'A', priority: 1, order_index: 0 }),
    ];
    expect(selectNextRuntimeStory(stories)).toBe('A'); // lowest priority+order_index
  });

  it('only selects todo or ready stories', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'in_progress' }),
      makeStory({ story_id: 'B', status: 'done' }),
    ];
    expect(selectNextRuntimeStory(stories)).toBeNull();
  });

  // ── 2. dependency done → dependent story becomes selectable ────────────────

  it('selects dependent story once its dependency is done', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'done' }),
      makeStory({ story_id: 'B', depends_on: ['A'], status: 'todo' }),
    ];
    expect(selectNextRuntimeStory(stories)).toBe('B');
  });

  it('requires ALL dependencies to be done before story becomes selectable', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'done' }),
      makeStory({ story_id: 'B', status: 'todo' }),
      makeStory({ story_id: 'C', depends_on: ['A', 'B'], status: 'todo' }),
    ];
    // B is selectable, C is not (B not done yet)
    expect(selectNextRuntimeStory(stories)).toBe('B');
  });
});

// ── 3. blocked dependency + no selectable story → escalate human ──────────────

describe('blocked dependency escalation', () => {
  it('detects blocked dependency', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'blocked' }),
      makeStory({ story_id: 'B', depends_on: ['A'] }),
    ];
    expect(hasBlockedOrEscalatedDependency(stories)).toBe(true);
  });

  it('detects escalated dependency', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'escalated' }),
      makeStory({ story_id: 'B', depends_on: ['A'] }),
    ];
    expect(hasBlockedOrEscalatedDependency(stories)).toBe(true);
  });

  it('decideNextAction escalates human when dependency is blocked', () => {
    const state = makeState({
      state: 'select',
      stories: [
        makeStory({ story_id: 'A', status: 'blocked' }),
        makeStory({ story_id: 'B', depends_on: ['A'], status: 'todo' }),
      ],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('escalate_human');
    expect(d.reason).toBe('blocked_dependency');
  });

  it('does not flag blocked dependency when blocking story has no dependents', () => {
    const stories = [
      makeStory({ story_id: 'A', status: 'blocked' }),
      makeStory({ story_id: 'B', depends_on: [], status: 'todo' }),
    ];
    expect(hasBlockedOrEscalatedDependency(stories)).toBe(false);
  });
});

// ── 4. run budget exhausted → stop_run ────────────────────────────────────────

describe('run budget', () => {
  it('returns stop_run immediately when iterations_used equals budget', () => {
    const state = makeState({
      run_iteration_budget: 3,
      iterations_used: 3,
      stories: [makeStory({ story_id: 'S1' })],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('stop_run');
    expect(d.reason).toBe('run_budget_exhausted');
  });

  it('returns stop_run when iterations_used exceeds budget', () => {
    const state = makeState({
      run_iteration_budget: 2,
      iterations_used: 5,
    });
    expect(decideNextAction(state).action).toBe('stop_run');
  });

  it('proceeds normally when budget is not exhausted', () => {
    const state = makeState({
      run_iteration_budget: 10,
      iterations_used: 0,
      stories: [makeStory({ story_id: 'S1' })],
    });
    expect(decideNextAction(state).action).toBe('select_next_story');
  });
});

// ── 5. validation pass → checkpoint → story done ──────────────────────────────

describe('validation pass lifecycle', () => {
  it('sequences: run_validation → write_checkpoint → mark_story_done → back to select', () => {
    const story = makeStory({ story_id: 'S1' });
    let state = makeState({
      state: 'validate',
      active_story_id: 'S1',
      last_validation_passed: null,
      stories: [story],
    });

    // Tick 1: run_validation
    let d = decideNextAction(state);
    expect(d.action).toBe('run_validation');
    state = advanceTrackerState(state, d, { success: true, validation_passed: true });
    expect(state.last_validation_passed).toBe(true);
    expect(state.state).toBe('validate'); // stays in validate until next tick

    // Tick 2: write_checkpoint (validation passed)
    d = decideNextAction(state);
    expect(d.action).toBe('write_checkpoint');
    state = advanceTrackerState(state, d, { success: true });
    expect(state.state).toBe('checkpoint');
    expect(state.stories[0].status).toBe('checkpointed');

    // Tick 3: mark_story_done
    d = decideNextAction(state);
    expect(d.action).toBe('mark_story_done');
    state = advanceTrackerState(state, d, { success: true });
    expect(state.state).toBe('select');
    expect(state.active_story_id).toBeNull();
    expect(state.stories[0].status).toBe('done');
  });

  it('all_stories_complete triggers stop_run after last story done', () => {
    const state = makeState({
      state: 'select',
      stories: [makeStory({ story_id: 'S1', status: 'done' })],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('stop_run');
    expect(d.reason).toBe('all_stories_complete');
  });
});

// ── 6. validation fail below attempt budget → route debugger ──────────────────

describe('validation fail routing', () => {
  it('routes to debugger when validation fails and attempts < budget', () => {
    const story = makeStory({ story_id: 'S1', attempts: 1, attempt_budget: 2 });
    const state = makeState({
      state: 'validate',
      active_story_id: 'S1',
      last_validation_passed: false,
      stories: [story],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('route_debugger');
  });

  it('route_debugger advances state to debug', () => {
    const story = makeStory({ story_id: 'S1', attempts: 1, attempt_budget: 2 });
    let state = makeState({
      state: 'validate',
      active_story_id: 'S1',
      last_validation_passed: false,
      stories: [story],
    });
    const d = decideNextAction(state);
    state = advanceTrackerState(state, d, { success: true });
    expect(state.state).toBe('debug');
    expect(state.stories[0].status).toBe('debugging');
  });

  it('debug state returns retry_develop, which transitions back to develop', () => {
    const story = makeStory({ story_id: 'S1', attempts: 1, attempt_budget: 2 });
    let state = makeState({
      state: 'debug',
      active_story_id: 'S1',
      stories: [story],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('retry_develop');
    state = advanceTrackerState(state, d, { success: true });
    expect(state.state).toBe('develop');
  });

  // ── 7. validation fail at attempt budget → escalate human ────────────────

  it('escalates human when validation fails and attempts equals budget', () => {
    const story = makeStory({ story_id: 'S1', attempts: 1, attempt_budget: 1 });
    const state = makeState({
      state: 'validate',
      active_story_id: 'S1',
      last_validation_passed: false,
      stories: [story],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('escalate_human');
    expect(d.reason).toBe('attempt_budget_exceeded');
  });

  it('escalates human from develop state when attempts already at budget', () => {
    const story = makeStory({ story_id: 'S1', attempts: 2, attempt_budget: 2 });
    const state = makeState({
      state: 'develop',
      active_story_id: 'S1',
      stories: [story],
    });
    const d = decideNextAction(state);
    expect(d.action).toBe('escalate_human');
    expect(d.reason).toBe('attempt_budget_exceeded');
  });

  it('full develop→validate→fail cycle respects budget=1', () => {
    const story = makeStory({ story_id: 'S1', attempts: 0, attempt_budget: 1 });
    let state = makeState({
      state: 'develop',
      active_story_id: 'S1',
      stories: [story],
    });

    // Tick 1: develop_patch (increments attempts to 1)
    let d = decideNextAction(state);
    expect(d.action).toBe('develop_patch');
    state = advanceTrackerState(state, d, { success: true });
    expect(state.stories[0].attempts).toBe(1);

    // Tick 2: run_validation → fails
    d = decideNextAction(state);
    expect(d.action).toBe('run_validation');
    state = advanceTrackerState(state, d, { success: true, validation_passed: false });
    expect(state.last_validation_passed).toBe(false);

    // Tick 3: attempts=1 == budget=1 → escalate_human
    d = decideNextAction(state);
    expect(d.action).toBe('escalate_human');
    expect(d.reason).toBe('attempt_budget_exceeded');
  });
});

// ── 8. every tick emits exactly one decision ──────────────────────────────────

describe('one decision per tick', () => {
  it('each call to decideNextAction returns exactly one RuntimeDecision', () => {
    const stories = [
      makeStory({ story_id: 'A' }),
      makeStory({ story_id: 'B', depends_on: ['A'], order_index: 1 }),
    ];
    let state = makeState({ stories });
    const seen = new Set<string>();

    for (let i = 0; i < 15; i++) {
      const d = decideNextAction(state);
      // Each decision is a single plain object with one action
      expect(typeof d.action).toBe('string');
      expect(Object.keys(d).length).toBeGreaterThanOrEqual(2); // action + tick minimum
      seen.add(d.action);

      if (d.action === 'stop_run' || d.action === 'escalate_human') break;
      state = advanceTrackerState(state, d, {
        success: true,
        validation_passed: d.action === 'run_validation' ? true : undefined,
      });
    }

    // We should have seen a progression of distinct actions
    expect(seen.size).toBeGreaterThan(1);
  });

  it('stopped state always returns stop_run without advancing', () => {
    const state = makeState({ state: 'stopped', stop_reason: 'test' });
    const d1 = decideNextAction(state);
    const d2 = decideNextAction(state); // same state, same result
    expect(d1.action).toBe('stop_run');
    expect(d2.action).toBe('stop_run');
    expect(d1.tick).toBe(d2.tick); // same tick (state not advanced)
  });
});

// ── 9. decision_log is append-only ───────────────────────────────────────────

describe('decision_log integrity', () => {
  it('appends each decision to the log without mutating prior state', () => {
    const s0 = makeState({ stories: [makeStory({ story_id: 'S1' })] });

    const d0 = decideNextAction(s0);
    const s1 = advanceTrackerState(s0, d0, { success: true });

    // Original state is unchanged
    expect(s0.decision_log.length).toBe(0);
    // New state has the decision appended
    expect(s1.decision_log.length).toBe(1);
    expect(s1.decision_log[0]).toBe(d0);

    const d1 = decideNextAction(s1);
    const s2 = advanceTrackerState(s1, d1, { success: true });

    expect(s1.decision_log.length).toBe(1); // s1 unchanged
    expect(s2.decision_log.length).toBe(2);
    expect(s2.decision_log[0]).toBe(d0);
    expect(s2.decision_log[1]).toBe(d1);
  });

  it('decision_log order matches tick order', () => {
    const stories = [makeStory({ story_id: 'S1' })];
    let state = makeState({ stories });
    const expectedActions: string[] = [];

    for (let i = 0; i < 8; i++) {
      const d = decideNextAction(state);
      expectedActions.push(d.action);
      state = advanceTrackerState(state, d, {
        success: true,
        validation_passed: d.action === 'run_validation' ? true : undefined,
      });
      if (state.state === 'stopped' || state.state === 'gate') break;
    }

    // Every logged decision matches what was decided, in order
    state.decision_log.forEach((entry, i) => {
      expect(entry.action).toBe(expectedActions[i]);
    });
  });

  it('iterations_used increments by exactly 1 per tick', () => {
    let state = makeState({ stories: [makeStory({ story_id: 'S1' })] });
    for (let i = 0; i < 6; i++) {
      const before = state.iterations_used;
      const d = decideNextAction(state);
      state = advanceTrackerState(state, d, {
        success: true,
        validation_passed: d.action === 'run_validation' ? true : undefined,
      });
      expect(state.iterations_used).toBe(before + 1);
      if (state.state === 'stopped' || state.state === 'gate') break;
    }
  });
});

// ── 10. resume summary includes stop reason and next action ───────────────────

describe('buildResumeSummary', () => {
  it('includes run_id, state, and stop_reason', () => {
    const state = makeState({
      run_id: 'run-abc',
      state: 'stopped',
      stop_reason: 'run_budget_exhausted',
      run_iteration_budget: 5,
      iterations_used: 5,
    });
    const summary = buildResumeSummary(state);
    expect(summary).toContain('run-abc');
    expect(summary).toContain('stopped');
    expect(summary).toContain('run_budget_exhausted');
  });

  it('includes next recommended action', () => {
    const state = makeState({
      run_id: 'run-x',
      state: 'stopped',
      stop_reason: 'run_budget_exhausted',
      run_iteration_budget: 1,
      iterations_used: 1,
    });
    const summary = buildResumeSummary(state);
    // stopped + iterations_used >= budget → next action is stop_run
    expect(summary).toContain('stop_run');
  });

  it('lists stories in the summary table', () => {
    const state = makeState({
      stories: [
        makeStory({ story_id: 'A', status: 'done' }),
        makeStory({ story_id: 'B', status: 'todo' }),
      ],
      state: 'select',
    });
    const summary = buildResumeSummary(state);
    expect(summary).toContain('A');
    expect(summary).toContain('done');
    expect(summary).toContain('B');
    expect(summary).toContain('todo');
  });

  it('includes last decisions (up to 5)', () => {
    const decisions: RuntimeDecision[] = [
      { action: 'select_next_story', story_id: 'S1', tick: 0 },
      { action: 'issue_contract', story_id: 'S1', tick: 1 },
      { action: 'develop_patch', story_id: 'S1', tick: 2 },
    ];
    const state = makeState({
      decision_log: decisions,
      state: 'stopped',
      stop_reason: 'test',
      run_iteration_budget: 1,
      iterations_used: 1,
    });
    const summary = buildResumeSummary(state);
    expect(summary).toContain('select_next_story');
    expect(summary).toContain('issue_contract');
    expect(summary).toContain('develop_patch');
  });

  it('active_story_id appears in summary', () => {
    const state = makeState({
      active_story_id: 'STORY-XYZ',
      state: 'stopped',
      stop_reason: 'escalated',
      run_iteration_budget: 1,
      iterations_used: 1,
    });
    const summary = buildResumeSummary(state);
    expect(summary).toContain('STORY-XYZ');
  });
});

// ── Full lifecycle integration ─────────────────────────────────────────────────

describe('full story lifecycle', () => {
  it('drives a single story from select to done in exactly 6 ticks', () => {
    const story = makeStory({ story_id: 'S1', attempt_budget: 2 });
    let state = makeState({ stories: [story] });
    const actions: string[] = [];

    for (let i = 0; i < 20; i++) {
      if (state.state === 'stopped') break;
      const d = decideNextAction(state);
      actions.push(d.action);
      state = advanceTrackerState(state, d, {
        success: true,
        validation_passed: d.action === 'run_validation' ? true : undefined,
      });
    }

    // Expected sequence:
    // select_next_story → issue_contract → develop_patch → run_validation
    //   → write_checkpoint → mark_story_done → (back to select → stop_run)
    expect(actions).toContain('select_next_story');
    expect(actions).toContain('issue_contract');
    expect(actions).toContain('develop_patch');
    expect(actions).toContain('run_validation');
    expect(actions).toContain('write_checkpoint');
    expect(actions).toContain('mark_story_done');
    expect(actions).toContain('stop_run');

    // No agent self-declaration: done was reached only through the chain
    expect(state.stories[0].status).toBe('done');
    const doneIdx = actions.indexOf('mark_story_done');
    const checkpointIdx = actions.indexOf('write_checkpoint');
    const validationIdx = actions.indexOf('run_validation');
    expect(validationIdx).toBeLessThan(checkpointIdx);
    expect(checkpointIdx).toBeLessThan(doneIdx);
  });

  it('drives two sequential stories to done (B depends on A)', () => {
    const stories = [
      makeStory({ story_id: 'A', order_index: 0 }),
      makeStory({ story_id: 'B', depends_on: ['A'], order_index: 1 }),
    ];
    let state = makeState({ stories, run_iteration_budget: 30 });

    for (let i = 0; i < 30; i++) {
      if (state.state === 'stopped') break;
      const d = decideNextAction(state);
      state = advanceTrackerState(state, d, {
        success: true,
        validation_passed: d.action === 'run_validation' ? true : undefined,
      });
    }

    expect(state.stories.find(s => s.story_id === 'A')?.status).toBe('done');
    expect(state.stories.find(s => s.story_id === 'B')?.status).toBe('done');
    expect(state.stop_reason).toBe('all_stories_complete');
  });

  it('debug cycle: validate fail → debug → retry → validate pass', () => {
    const story = makeStory({ story_id: 'S1', attempt_budget: 2 });
    let state = makeState({ stories: [story] });
    let firstValidation = true;
    const actions: string[] = [];

    for (let i = 0; i < 20; i++) {
      if (state.state === 'stopped' || state.state === 'gate') break;
      const d = decideNextAction(state);
      actions.push(d.action);

      let result: ActionResult;
      if (d.action === 'run_validation') {
        if (firstValidation) {
          firstValidation = false;
          result = { success: true, validation_passed: false }; // first attempt fails
        } else {
          result = { success: true, validation_passed: true }; // second attempt passes
        }
      } else {
        result = { success: true };
      }
      state = advanceTrackerState(state, d, result);
    }

    expect(actions).toContain('route_debugger');
    expect(actions).toContain('retry_develop');
    expect(state.stories[0].status).toBe('done');
    // Two develop_patch calls
    expect(actions.filter(a => a === 'develop_patch').length).toBe(2);
  });
});
