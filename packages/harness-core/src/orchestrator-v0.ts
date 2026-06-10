/**
 * Orchestrator v0 — deterministic, single-threaded, no-LLM.
 *
 * Pure functions only: decideNextAction + advanceTrackerState.
 * Exactly one action per tick; intermediate states are never skipped.
 * The full story lifecycle: select → contract → develop → validate → checkpoint → done.
 *
 * Constraints (STORY-001):
 *  - No real LLM, no external API, no secrets, no sudo.
 *  - One action per tick; never skip intermediate states.
 *  - validation_passed is derived from ActionResult, never hardcoded.
 *  - done is only reachable via validation → checkpoint → mark_story_done chain.
 *  - decision_log is append-only (enforced by spread in advanceTrackerState).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** High-level orchestrator phase — mirrors configs/decision_matrix.yaml states. */
export type OrchestratorV0State =
  | 'idle'        // initial; treated identically to 'select'
  | 'select'      // choosing the next story from the DAG
  | 'contract'    // Supervisor issues story contract
  | 'develop'     // Developer produces patch
  | 'validate'    // Validator runs; last_validation_passed reflects result
  | 'debug'       // Debugger diagnoses failure
  | 'checkpoint'  // validation passed; write checkpoint before marking done
  | 'gate'        // human gate entered; auto-progress paused
  | 'stopped';    // run halted (budget, complete, or gate)

export type RuntimeStoryStatus =
  | 'todo'
  | 'ready'
  | 'in_progress'
  | 'validating'
  | 'debugging'
  | 'passed'
  | 'checkpointed'
  | 'blocked'
  | 'escalated'
  | 'done';

export interface RuntimeStory {
  story_id: string;
  epic_id: string;
  depends_on: string[];         // story_ids that must reach 'done' first
  status: RuntimeStoryStatus;
  priority: number;             // lower value = higher priority
  order_index: number;          // secondary tie-break within same priority
  attempts: number;             // number of develop_patch calls executed so far
  attempt_budget: number;       // max develop_patch calls allowed
  allowed_write_set: string[];
  validation_commands: string[];
  rollback_notes: string;
  blocked_reason: string | null;
}

export type OrchestratorV0Action =
  | 'select_next_story'  // pick next story from DAG
  | 'issue_contract'     // Supervisor issues story contract
  | 'develop_patch'      // Developer turn
  | 'run_validation'     // Validator runs validation_commands
  | 'write_checkpoint'   // validation passed; save checkpoint
  | 'mark_story_done'    // checkpoint written; story is done
  | 'route_debugger'     // validation failed; hand off to Debugger
  | 'retry_develop'      // after debug; back to Developer
  | 'escalate_human'     // human gate; auto progress stops
  | 'stop_run';          // run budget exhausted or all stories complete

export interface RuntimeDecision {
  action: OrchestratorV0Action;
  story_id?: string;
  reason?: string;
  tick: number;   // value of iterations_used when this decision was made
}

export interface TrackerState {
  run_id: string;
  state: OrchestratorV0State;
  run_iteration_budget: number;
  iterations_used: number;
  stories: RuntimeStory[];
  active_story_id: string | null;
  last_validation_passed: boolean | null;   // null = not yet run this cycle
  human_gate_cleared: boolean;
  stop_reason: string | null;
  decision_log: RuntimeDecision[];          // append-only audit trail
}

/** Result passed back to advanceTrackerState after executing a decision. */
export interface ActionResult {
  success: boolean;
  /** Only meaningful for 'run_validation' — the actual pass/fail verdict. */
  validation_passed?: boolean;
  error?: string;
}

// ── Story selection (DAG-aware) ────────────────────────────────────────────────

/**
 * Return story_id of the next selectable story, or null if none.
 * Rules (12_RUNTIME_ALGORITHM_RULES.md §2):
 *  - Selectable: status 'todo' or 'ready', AND every dependency is 'done'.
 *  - Tie-break: ascending priority → ascending order_index → ascending story_id.
 */
export function selectNextRuntimeStory(stories: RuntimeStory[]): string | null {
  const doneIds = new Set(stories.filter(s => s.status === 'done').map(s => s.story_id));
  const candidates = stories.filter(s =>
    (s.status === 'todo' || s.status === 'ready') &&
    s.depends_on.every(dep => doneIds.has(dep))
  );
  if (candidates.length === 0) return null;
  candidates.sort((a, b) =>
    (a.priority - b.priority) ||
    (a.order_index - b.order_index) ||
    a.story_id.localeCompare(b.story_id)
  );
  return candidates[0].story_id;
}

/**
 * True if at least one story has a dependency that is 'blocked' or 'escalated',
 * which prevents that story from becoming selectable.
 */
export function hasBlockedOrEscalatedDependency(stories: RuntimeStory[]): boolean {
  const statusById = new Map(stories.map(s => [s.story_id, s.status]));
  return stories.some(s =>
    (s.status === 'todo' || s.status === 'ready') &&
    s.depends_on.some(dep => {
      const depStatus = statusById.get(dep);
      return depStatus === 'blocked' || depStatus === 'escalated';
    })
  );
}

// ── Core decision (pure) ──────────────────────────────────────────────────────

/**
 * Given the current TrackerState, return exactly one RuntimeDecision.
 * Never produces side effects. Never skips intermediate states.
 * Never self-declares done — done is only reachable via the validation chain.
 */
export function decideNextAction(state: TrackerState): RuntimeDecision {
  const tick = state.iterations_used;

  // Budget check is always first (rule: run budget → stop_run).
  if (state.iterations_used >= state.run_iteration_budget) {
    return { action: 'stop_run', reason: 'run_budget_exhausted', tick };
  }

  const activeStory = state.active_story_id
    ? (state.stories.find(s => s.story_id === state.active_story_id) ?? null)
    : null;

  switch (state.state) {
    case 'idle':
    case 'select': {
      const allDone =
        state.stories.length === 0 ||
        state.stories.every(s => s.status === 'done');
      if (allDone) return { action: 'stop_run', reason: 'all_stories_complete', tick };

      const nextId = selectNextRuntimeStory(state.stories);
      if (nextId) return { action: 'select_next_story', story_id: nextId, tick };

      // Nothing selectable: blocked dependency → escalate; otherwise complete.
      if (hasBlockedOrEscalatedDependency(state.stories)) {
        return { action: 'escalate_human', reason: 'blocked_dependency', tick };
      }
      return { action: 'stop_run', reason: 'all_stories_complete', tick };
    }

    case 'contract':
      // v0: always issue a contract for the active story.
      return { action: 'issue_contract', story_id: activeStory?.story_id, tick };

    case 'develop': {
      if (!activeStory) return { action: 'stop_run', reason: 'no_active_story', tick };
      // Guard: within budget → develop; at/over budget → escalate.
      if (activeStory.attempts < activeStory.attempt_budget) {
        return { action: 'develop_patch', story_id: activeStory.story_id, tick };
      }
      return {
        action: 'escalate_human',
        reason: 'attempt_budget_exceeded',
        story_id: activeStory.story_id,
        tick,
      };
    }

    case 'validate': {
      if (!activeStory) return { action: 'stop_run', reason: 'no_active_story', tick };
      if (state.last_validation_passed === null) {
        return { action: 'run_validation', story_id: activeStory.story_id, tick };
      }
      if (state.last_validation_passed === true) {
        return { action: 'write_checkpoint', story_id: activeStory.story_id, tick };
      }
      // Validation failed — check attempt budget before routing to debugger.
      if (activeStory.attempts < activeStory.attempt_budget) {
        return { action: 'route_debugger', story_id: activeStory.story_id, tick };
      }
      return {
        action: 'escalate_human',
        reason: 'attempt_budget_exceeded',
        story_id: activeStory.story_id,
        tick,
      };
    }

    case 'debug': {
      if (!activeStory) return { action: 'stop_run', reason: 'no_active_story', tick };
      return { action: 'retry_develop', story_id: activeStory.story_id, tick };
    }

    case 'checkpoint': {
      if (!activeStory) return { action: 'stop_run', reason: 'no_active_story', tick };
      return { action: 'mark_story_done', story_id: activeStory.story_id, tick };
    }

    case 'gate':
      if (state.human_gate_cleared) {
        return { action: 'select_next_story', tick };
      }
      return { action: 'stop_run', reason: 'awaiting_human_gate', tick };

    case 'stopped':
      return { action: 'stop_run', reason: state.stop_reason ?? 'already_stopped', tick };

    default:
      return { action: 'stop_run', reason: 'unknown_state', tick };
  }
}

// ── State advancement (pure) ──────────────────────────────────────────────────

/**
 * Given the current state, a decision, and the result of executing it, produce
 * the next TrackerState. Immutable: always returns a NEW object; never mutates input.
 *
 * Key rules:
 *  - decision_log is append-only (never reordered/trimmed).
 *  - iterations_used increments on every tick.
 *  - attempts increments only when develop_patch executes (per decision_matrix rule 8).
 *  - validation_passed is taken from ActionResult.validation_passed, never hardcoded.
 *  - mark_story_done is the only path to story status 'done'.
 */
export function advanceTrackerState(
  state: TrackerState,
  decision: RuntimeDecision,
  result: ActionResult
): TrackerState {
  // Append-only: always extend, never replace.
  const decision_log = [...state.decision_log, decision];
  const iterations_used = state.iterations_used + 1;

  /** Return a new stories array with one story patched. */
  const patchStory = (id: string, patch: Partial<RuntimeStory>): RuntimeStory[] =>
    state.stories.map(s => s.story_id === id ? { ...s, ...patch } : s);

  const activeId = decision.story_id ?? state.active_story_id ?? '';
  const activeStory = state.stories.find(s => s.story_id === activeId);

  switch (decision.action) {
    case 'select_next_story': {
      const selectedId = decision.story_id ?? null;
      if (!selectedId || !result.success) {
        return {
          ...state, state: 'stopped',
          stop_reason: result.error ?? 'select_failed',
          decision_log, iterations_used,
        };
      }
      return {
        ...state,
        state: 'contract',
        active_story_id: selectedId,
        last_validation_passed: null,
        stories: patchStory(selectedId, { status: 'in_progress' }),
        decision_log,
        iterations_used,
      };
    }

    case 'issue_contract':
      return {
        ...state,
        state: 'develop',
        stories: activeId ? patchStory(activeId, { status: 'in_progress' }) : state.stories,
        decision_log,
        iterations_used,
      };

    case 'develop_patch':
      // Incrementing attempts here is the single authoritative source for the counter.
      return {
        ...state,
        state: 'validate',
        last_validation_passed: null,
        stories: activeId && activeStory
          ? patchStory(activeId, { attempts: activeStory.attempts + 1 })
          : state.stories,
        decision_log,
        iterations_used,
      };

    case 'run_validation': {
      // validation_passed comes from ActionResult — never hardcoded.
      const passed = result.validation_passed ?? null;
      return {
        ...state,
        last_validation_passed: passed,
        stories: activeId
          ? patchStory(activeId, { status: passed === true ? 'passed' : 'in_progress' })
          : state.stories,
        decision_log,
        iterations_used,
      };
    }

    case 'write_checkpoint':
      return {
        ...state,
        state: 'checkpoint',
        stories: activeId ? patchStory(activeId, { status: 'checkpointed' }) : state.stories,
        decision_log,
        iterations_used,
      };

    case 'route_debugger':
      return {
        ...state,
        state: 'debug',
        stories: activeId ? patchStory(activeId, { status: 'debugging' }) : state.stories,
        decision_log,
        iterations_used,
      };

    case 'retry_develop':
      // Back to develop; state resets validation for the new cycle.
      return {
        ...state,
        state: 'develop',
        last_validation_passed: null,
        decision_log,
        iterations_used,
      };

    case 'mark_story_done':
      // Only path to 'done'; clears active_story_id and returns to select.
      return {
        ...state,
        state: 'select',
        active_story_id: null,
        last_validation_passed: null,
        stories: activeId ? patchStory(activeId, { status: 'done' }) : state.stories,
        decision_log,
        iterations_used,
      };

    case 'escalate_human':
      return {
        ...state,
        state: 'gate',
        stop_reason: decision.reason ?? 'escalated',
        stories: activeId
          ? patchStory(activeId, {
              status: 'escalated',
              blocked_reason: decision.reason ?? null,
            })
          : state.stories,
        decision_log,
        iterations_used,
      };

    case 'stop_run':
      return {
        ...state,
        state: 'stopped',
        stop_reason: decision.reason ?? 'stopped',
        decision_log,
        iterations_used,
      };

    default:
      return { ...state, decision_log, iterations_used };
  }
}

// ── Resume summary (pure) ─────────────────────────────────────────────────────

/**
 * Return a markdown string suitable for displaying at run-stop or /goal resume.
 * Pure function: no file writes, no side effects.
 */
export function buildResumeSummary(state: TrackerState): string {
  const lines: string[] = [];

  lines.push('# Run Resume Summary');
  lines.push('');
  lines.push(`**run_id**: ${state.run_id}`);
  lines.push(`**state**: ${state.state}`);
  lines.push(`**stop_reason**: ${state.stop_reason ?? '—'}`);
  lines.push(`**active_story_id**: ${state.active_story_id ?? '—'}`);
  lines.push(`**iterations**: ${state.iterations_used} / ${state.run_iteration_budget}`);
  lines.push('');

  // Stories table
  lines.push('## Stories');
  lines.push('| story_id | status | attempts / budget | depends_on |');
  lines.push('|---|---|---|---|');
  for (const s of state.stories) {
    const deps = s.depends_on.length === 0 ? '—' : s.depends_on.join(', ');
    lines.push(`| ${s.story_id} | ${s.status} | ${s.attempts} / ${s.attempt_budget} | ${deps} |`);
  }
  lines.push('');

  // Last 5 decisions
  lines.push('## Last 5 Decisions');
  const recent = state.decision_log.slice(-5);
  if (recent.length === 0) {
    lines.push('_none_');
  } else {
    recent.forEach((d, i) => {
      const storyPart = d.story_id ? ` (${d.story_id})` : '';
      const reasonPart = d.reason ? ` — ${d.reason}` : '';
      lines.push(`${i + 1}. [tick ${d.tick}] **${d.action}**${storyPart}${reasonPart}`);
    });
  }
  lines.push('');

  // Next recommended action
  lines.push('## Next Recommended Action');
  const next = decideNextAction(state);
  const nextStory = next.story_id ? ` (${next.story_id})` : '';
  const nextReason = next.reason ? ` — ${next.reason}` : '';
  lines.push(`\`${next.action}\`${nextStory}${nextReason}`);

  return lines.join('\n');
}
