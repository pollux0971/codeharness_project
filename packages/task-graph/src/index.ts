/**
 * @codeharness/task-graph
 *
 * Deterministic subtask store + the TaskCreate/TaskUpdate/TaskList/TaskGet operations
 * Developer and Debugger use to break a Story into small, verifiable steps (raises
 * per-step success; bounds context). SAFETY: a subtask inherits the parent
 * StoryContract's write-set and can NEVER widen it; the harness owns this store, the
 * agent only drives decomposition within the contract envelope. Completion of the STORY
 * still goes through the normal Validator → checkpoint chain — subtasks are planning, not
 * a new grant. Schema: codeharness/specs/task.schema.json.
 * Doc: codeharness/docs/architecture/13_TASK_DECOMPOSITION_MODEL.md.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done' | 'abandoned';
export type Role = 'developer' | 'debugger';

export interface Task {
  task_id: string; parent_story_id: string; parent_contract_id: string;
  title?: string; intent: string; status: TaskStatus; sequence: number;
  depends_on: string[]; files_touched: string[]; acceptance_behavior?: string;
  created_by: Role; attempt_count: number; notes?: string; result_ref?: string;
  created_at: string; updated_at: string;
}
export interface ContractScope { allowedWriteSet: string[] }
export interface TaskCreateInput {
  intent: string; title?: string; created_by: Role; depends_on?: string[];
  files_touched?: string[]; acceptance_behavior?: string;
}
export interface TaskUpdateInput { status?: TaskStatus; notes?: string; result_ref?: string; attempt_count?: number }

const LEGAL: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'abandoned'],
  in_progress: ['done', 'blocked', 'abandoned'],
  blocked: ['in_progress', 'abandoned'],
  done: [], abandoned: [],
};
export function legalTransition(from: TaskStatus, to: TaskStatus): boolean {
  return from === to || LEGAL[from].includes(to);
}
function covered(p: string, writeSet: string[]): boolean {
  return writeSet.some(g => new RegExp('^' +
    g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$').test(p));
}
/** Every file a subtask touches must be inside the parent contract write-set. */
export function validateFilesWithinScope(files: string[], scope: ContractScope): string[] {
  return files.filter(f => !covered(f, scope.allowedWriteSet)).map(f => `subtask file outside contract write-set: ${f}`);
}

export class TaskGraph {
  private tasks: Task[] = [];
  private seq = 0;
  constructor(public parentStoryId: string, public parentContractId: string, private scope: ContractScope) {}

  /** TaskCreate — append a subtask; rejects files outside the parent write-set. */
  create(input: TaskCreateInput): Task {
    const files = input.files_touched ?? [];
    const bad = validateFilesWithinScope(files, this.scope);
    if (bad.length) throw new Error(bad.join('; '));
    for (const d of input.depends_on ?? [])
      if (!this.tasks.some(t => t.task_id === d)) throw new Error(`depends_on references unknown task: ${d}`);
    const now = new Date().toISOString();
    const t: Task = {
      task_id: `task_${this.parentStoryId}_${this.seq}`, parent_story_id: this.parentStoryId,
      parent_contract_id: this.parentContractId, title: input.title, intent: input.intent,
      status: 'pending', sequence: this.seq, depends_on: input.depends_on ?? [], files_touched: files,
      acceptance_behavior: input.acceptance_behavior, created_by: input.created_by, attempt_count: 0,
      created_at: now, updated_at: now,
    };
    this.seq += 1; this.tasks.push(t); return t;
  }

  /** TaskUpdate — constrained transition; enforces at most one in_progress (single-thread v0). */
  update(taskId: string, patch: TaskUpdateInput): Task {
    const t = this.get(taskId);
    if (patch.status && !legalTransition(t.status, patch.status))
      throw new Error(`illegal transition ${t.status} -> ${patch.status}`);
    if (patch.status === 'in_progress' && this.tasks.some(x => x.task_id !== taskId && x.status === 'in_progress'))
      throw new Error('another task is already in_progress (single-thread v0)');
    if (patch.status) t.status = patch.status;
    if (patch.notes !== undefined) t.notes = patch.notes;
    if (patch.result_ref !== undefined) t.result_ref = patch.result_ref;
    if (patch.attempt_count !== undefined) t.attempt_count = patch.attempt_count;
    t.updated_at = new Date().toISOString();
    return t;
  }

  /** TaskList — ordered by sequence, optionally filtered by status. */
  list(filter?: { status?: TaskStatus }): Task[] {
    const all = [...this.tasks].sort((a, b) => a.sequence - b.sequence);
    return filter?.status ? all.filter(t => t.status === filter.status) : all;
  }

  /** TaskGet — full task by id (throws if missing). */
  get(taskId: string): Task {
    const t = this.tasks.find(x => x.task_id === taskId);
    if (!t) throw new Error(`unknown task: ${taskId}`);
    return t;
  }

  /** The next runnable subtask: lowest-sequence pending task whose deps are all done. */
  next(): Task | undefined {
    const done = new Set(this.tasks.filter(t => t.status === 'done').map(t => t.task_id));
    return this.list({ status: 'pending' }).find(t => t.depends_on.every(d => done.has(d)));
  }
}

// Tool surface (thin wrappers so the agent-facing tools are TaskCreate/Update/List/Get).
export const TaskCreate = (g: TaskGraph, i: TaskCreateInput) => g.create(i);
export const TaskUpdate = (g: TaskGraph, id: string, p: TaskUpdateInput) => g.update(id, p);
export const TaskList = (g: TaskGraph, f?: { status?: TaskStatus }) => g.list(f);
export const TaskGet = (g: TaskGraph, id: string) => g.get(id);

// ── STORY-017.4: Competitive debug flag predicate ────────────────────────────

/** Returns true iff competitive debug mode is explicitly enabled for this story. */
export function isCompetitiveDebugEnabled(story: { competitive_debug?: boolean }): boolean {
  return story.competitive_debug === true;
}

// ── STORY-020.3: Hot-file detection ──────────────────────────────────────────

/** Returns file paths that appear in 2+ stories' write-sets. */
export function detectHotFiles(stories: { allowed_write_set?: string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const story of stories) {
    for (const file of story.allowed_write_set ?? []) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).filter(([, n]) => n >= 2).map(([f]) => f);
}

// ── STORY-022.7: Direction safety gate ───────────────────────────────────────

/** Returns false when the direction is a scope-expansion (widen_write_set), true otherwise. */
export function isDirectionSafe(direction: { direction_type: string } | null): boolean {
  return direction?.direction_type !== 'widen_write_set';
}

export type { SchedulerResult, SchedulerRunOptions, ParallelSchedulerOptions, IsolationPool } from './scheduler.js';
export { runSequentialScheduler, runParallelScheduler } from './scheduler.js';
export type { SpawnCandidate, SpawnPlan } from './spawn-plan.js';
export { computeSpawnPlan, recordSpawnPlan } from './spawn-plan.js';
