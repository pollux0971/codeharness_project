/**
 * @codeharness/shared — shared TypeScript types and basic validation helpers.
 * Owner: STORY-001.2.
 * These types are the canonical source of truth; downstream packages import from here.
 */
export type AgentRole = 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';
export type TaskClass = IdeaMode;
export type PermissionDecision = 'allow' | 'ask' | 'deny';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type StoryStatus = 'todo' | 'in_progress' | 'validating' | 'debugging' | 'passed' | 'checkpointed' | 'blocked' | 'escalated' | 'done';
export type ParallelismClass = 'parallel_safe' | 'parallel_with_barrier' | 'sequential' | 'exclusive';
export interface ValidationIssue {
    code: string;
    message: string;
    path?: string;
}
export interface SharedValidationResult {
    ok: boolean;
    issues: ValidationIssue[];
}
export declare function ok(): SharedValidationResult;
export declare function fail(issues: ValidationIssue[]): SharedValidationResult;
export declare function isValidStoryId(id: string): boolean;
export declare function isValidEpicId(id: string): boolean;
export declare function validateStoryId(id: string): SharedValidationResult;
export declare function validateEpicId(id: string): SharedValidationResult;
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
export declare function validateStoryContract(c: Partial<StoryContract>): SharedValidationResult;
