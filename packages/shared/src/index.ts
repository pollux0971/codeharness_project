/**
 * @codeharness/shared — shared TypeScript types and basic validation helpers.
 * Owner: STORY-001.2.
 * These types are the canonical source of truth; downstream packages import from here.
 */

// ── agent / idea primitives ───────────────────────────────────────────────────
export type AgentRole = 'planning_steward' | 'supervisor' | 'developer' | 'debugger' | 'reviewer';
export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';
export type TaskClass = IdeaMode;
export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type StoryStatus =
  | 'todo' | 'in_progress' | 'validating' | 'debugging'
  | 'passed' | 'checkpointed' | 'blocked' | 'escalated' | 'done';
export type ParallelismClass =
  | 'parallel_safe' | 'parallel_with_barrier' | 'sequential' | 'exclusive';

// ── validation result ─────────────────────────────────────────────────────────
export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface SharedValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function ok(): SharedValidationResult { return { ok: true, issues: [] }; }
export function fail(issues: ValidationIssue[]): SharedValidationResult {
  return { ok: false, issues: [...issues].sort((a, b) => a.code.localeCompare(b.code)) };
}

// ── ID format validators ──────────────────────────────────────────────────────
const STORY_ID_RE = /^STORY-\d+\.\d+$/;
const EPIC_ID_RE  = /^EPIC-\d+$/;

export function isValidStoryId(id: string): boolean { return STORY_ID_RE.test(id); }
export function isValidEpicId(id: string):  boolean { return EPIC_ID_RE.test(id); }

export function validateStoryId(id: string): SharedValidationResult {
  return isValidStoryId(id)
    ? ok()
    : fail([{ code: 'INVALID_STORY_ID', message: `Story ID must match STORY-NNN.N, got: ${id}` }]);
}
export function validateEpicId(id: string): SharedValidationResult {
  return isValidEpicId(id)
    ? ok()
    : fail([{ code: 'INVALID_EPIC_ID', message: `Epic ID must match EPIC-NNN, got: ${id}` }]);
}

// ── trace event types ─────────────────────────────────────────────────────────
export const KNOWN_TRACE_EVENT_TYPES = [
  'idea_event', 'planning_event', 'context_packet_event', 'agent_output_event',
  'tool_request_event', 'permission_decision_event', 'execution_event',
  'validation_event', 'approval_event', 'promotion_event', 'rollback_event',
  // New in 025.1:
  'reasoning_event', 'tool_call_event', 'dispatch_event',
  'gateway_event', 'validator_event', 'workspace_event', 'story_manager_event',
] as const;

export type TraceEventType = typeof KNOWN_TRACE_EVENT_TYPES[number];

export function isKnownEventType(type: string): type is TraceEventType {
  return KNOWN_TRACE_EVENT_TYPES.includes(type as TraceEventType);
}

export interface UnknownTraceEvent {
  event_id: string;
  type: string;
  raw: unknown;
  flagged: true;
}

// ── harness / story contract types ───────────────────────────────────────────
/** Simplified contract used at runtime (matches harness_contract.schema.json). */
export interface HarnessContract {
  contract_id: string;
  story_id: string;
  objective: string;
  mode: IdeaMode;
  allowed_write_set: string[];
  forbidden_paths: string[];
  validation_commands: string[];
  promotion_allowed: boolean;
}

/**
 * Full story contract issued by the Supervisor (matches story_contract.schema.json).
 * Required fields mirror the JSON Schema's "required" list.
 */
export interface StoryContract {
  contract_id: string;
  contract_version: number;
  story_id: string;
  epic_id: string;
  task_class: TaskClass;
  objective: string;
  pre_conditions: string[];
  allowed_write_set: string[];
  forbidden_actions: string[];
  acceptance_criteria: string[];
  validation_commands: string[];
  attempt_budget: number;
  rollback_notes: string;
  contract_issued_at: string;
  depends_on?: string[];
  parallelism_class?: ParallelismClass;
  promotion_allowed?: boolean;
  human_gate_required_for?: string[];
  failure_gene_ids?: string[];
}

/** Validate a StoryContract object — collects ALL errors, not just first. */
export function validateStoryContract(c: Partial<StoryContract>): SharedValidationResult {
  const issues: ValidationIssue[] = [];
  const req = <K extends keyof StoryContract>(k: K) => {
    if (c[k] === undefined || c[k] === null || c[k] === '')
      issues.push({ code: `MISSING_${String(k).toUpperCase()}`, message: `missing required field: ${String(k)}` });
  };
  req('contract_id'); req('story_id'); req('epic_id'); req('objective');
  req('rollback_notes'); req('contract_issued_at');
  if (c.story_id && !isValidStoryId(c.story_id as string))
    issues.push({ code: 'INVALID_STORY_ID', message: `invalid story_id: ${c.story_id}` });
  if (c.epic_id && !isValidEpicId(c.epic_id as string))
    issues.push({ code: 'INVALID_EPIC_ID', message: `invalid epic_id: ${c.epic_id}` });
  if (!Array.isArray(c.allowed_write_set) || (c.allowed_write_set as string[]).length === 0)
    issues.push({ code: 'EMPTY_ALLOWED_WRITE_SET', message: 'allowed_write_set must be a non-empty array' });
  if (!Array.isArray(c.acceptance_criteria) || (c.acceptance_criteria as string[]).length === 0)
    issues.push({ code: 'EMPTY_ACCEPTANCE_CRITERIA', message: 'acceptance_criteria must be a non-empty array' });
  if (!Array.isArray(c.validation_commands) || (c.validation_commands as string[]).length === 0)
    issues.push({ code: 'EMPTY_VALIDATION_COMMANDS', message: 'validation_commands must be a non-empty array' });
  if (issues.length === 0) return ok();
  return { ok: false, issues: issues.sort((a, b) => a.code.localeCompare(b.code)) };
}
