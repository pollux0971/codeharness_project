import type { CodeGraphClient } from '@codeharness/codegraph-adapter';
import type { ProjectProfile } from '@codeharness/context-manager';
export type IdeaMode = 'greenfield' | 'brownfield' | 'patch' | 'checkpoint' | 'research_spike';
export interface IdeaInput {
    title: string;
    description: string;
    source?: 'user' | 'oss_reference' | 'brownfield_repo' | 'bug_report';
    idea_id?: string;
    goals?: string[];
    non_goals?: string[];
    constraints?: string[];
    target_users?: string[];
    source_refs?: string[];
}
export interface InjectionDetectionResult {
    detected: boolean;
    signals: string[];
}
export declare function detectPromptInjection(text: string): InjectionDetectionResult;
export declare function classifyIdea(input: IdeaInput): IdeaMode;
export declare function requiredPlanningFiles(): string[];
export interface ValidationResult {
    ok: boolean;
    errors: string[];
}
/** A planning bundle is complete only if every required file is present. */
export declare function validatePlanningBundle(presentFiles: string[]): ValidationResult;
export type TaskClass = 'greenfield' | 'brownfield' | 'patch';
export interface PublicApiConstraint {
    frozen_paths: string[];
    reason: string;
}
export interface BrownfieldDelta {
    file: string;
    affected_symbols: string[];
    change_intent: string;
}
export interface AmbiguityQuestion {
    id: string;
    text: string;
    type: 'text' | 'choice';
    required: boolean;
}
export interface StoryNode {
    story_id: string;
    depends_on: string[];
    allowed_write_set: string[];
    parallelism_class?: string;
    task_class?: TaskClass;
    public_api_constraint?: PublicApiConstraint;
    brownfield_deltas?: BrownfieldDelta[];
    ambiguity_questions?: AmbiguityQuestion[];
}
/** Two stories conflict for parallel run if their write-sets intersect (glob prefix check). */
export declare function detectParallelismConflict(a: StoryNode, b: StoryNode): boolean;
/** Topological readiness: stories whose deps are all in `done`. */
export declare function selectableStories(stories: StoryNode[], done: Set<string>): StoryNode[];
/**
 * STORY-020.2: Emit structured ambiguity questions for brownfield stories whose
 * deltas affect symbols that already exist in the codebase.
 */
export declare function emitAmbiguityQuestions(story: StoryNode, existingSymbols: string[]): AmbiguityQuestion[];
export interface PlanningBundlePrd {
    title: string;
    problem_statement: string;
    users: string[];
    goals: string[];
    non_goals: string[];
}
export interface PlanningBundleArchitecture {
    summary: string;
    components: string[];
    constraints: string[];
    risks: string[];
}
export interface OpenDecision {
    id: string;
    question: string;
    options: Array<{
        option_id: string;
        tradeoff: string;
    }>;
}
export interface PlanningBundle {
    bundle_id: string;
    idea_id: string;
    prd: PlanningBundlePrd;
    architecture: PlanningBundleArchitecture;
    open_decisions: OpenDecision[];
    source_refs: string[];
}
/**
 * STORY-009.1: Deterministic planning bundle builder.
 * Takes a structured idea input and produces a PRD + architecture sketch.
 * Emits ambiguities as structured open decisions (escalation schema).
 * No LLM, no external API, no secret reads; caller may inject idea_id for full determinism.
 */
export declare function createPlanningBundle(input: IdeaInput): PlanningBundle;
export type GeneratedEpic = {
    epic_id: string;
    title: string;
    objective: string;
    depends_on: string[];
    exit_criteria: string[];
};
export type GeneratedStory = {
    story_id: string;
    epic_id: string;
    title: string;
    objective: string;
    depends_on: string[];
    parallelism_class: 'parallel_safe' | 'parallel_with_barrier' | 'sequential';
    allowed_write_set: string[];
    forbidden_actions: string[];
    acceptance_criteria: Record<string, unknown>;
    validation_commands: string[];
    rollback_notes: string[];
};
export type GeneratedBacklog = {
    source_bundle_id: string;
    epics: GeneratedEpic[];
    stories: GeneratedStory[];
};
/**
 * STORY-009.2: Deterministic backlog generator.
 * Expands a PlanningBundle into schema-valid GeneratedEpic[] and GeneratedStory[].
 * No LLM, no external API, no secret reads. Caller may inject bundle_id for
 * full determinism. Output ordering and IDs are fully deterministic.
 */
export declare function generateBacklogFromPlanningBundle(bundle: PlanningBundle): GeneratedBacklog;
/** Build the story DAG from a planning bundle. Returns StoryNode[] for scheduler use. */
export declare function buildStoryGraph(bundle: PlanningBundle): StoryNode[];
export interface DefectReport {
    report_id: string;
    title: string;
    what_broke: string;
    expected_behaviour: string;
    actual_behaviour: string;
    artifact_version: string;
    reported_at: string;
    story_id?: string | null;
    reproduction_steps?: string | null;
    severity?: 'critical' | 'high' | 'medium' | 'low' | null;
}
export declare function validateDefectReport(report: unknown): ValidationResult;
export declare function sanitizeDefectText(text: string): string;
export type DefectClass = 'regression' | 'environment' | 'user_error' | 'unknown';
export declare function classifyDefect(report: DefectReport): DefectClass;
export type ReproductionStatus = 'confirmed' | 'non_reproducible' | 'error';
export interface ReproductionResult {
    status: ReproductionStatus;
    output: string;
    run_at: string;
}
export interface TestRunner {
    run(command: string): Promise<{
        ok: boolean;
        output: string;
    }>;
}
export declare function attemptReproduction(_report: DefectReport, command: string, runner: TestRunner): Promise<ReproductionResult>;
export interface RepairStoryOptions {
    report: DefectReport;
    defectClass: DefectClass;
    reproduction: ReproductionResult;
    impactedFiles?: string[];
}
export declare function buildRepairStory(opts: RepairStoryOptions): StoryNode;
export interface DefectTriageResult {
    report: DefectReport;
    defect_class: DefectClass;
    reproduction: ReproductionResult;
    repair_story: StoryNode | null;
    triage_blocked: boolean;
    triage_blocked_reason?: string;
}
export declare function triageDefect(report: DefectReport, command: string, runner: TestRunner, impactedFiles?: string[]): Promise<DefectTriageResult>;
export interface BrownfieldLayer {
    name: string;
    paths: string[];
}
export interface BrownfieldIntake {
    intake_id: string;
    repo_path: string;
    intake_at: string;
    entry_points: string[];
    layers: BrownfieldLayer[];
    dependency_map: Record<string, string[]>;
    conventions: Record<string, unknown>;
    recovery_docs_path: string;
}
export interface BrownfieldImportOptions {
    repoPath: string;
    outputPath: string;
    codegraphClient?: CodeGraphClient;
    extractProfile?: (path: string) => ProjectProfile;
}
export declare function importBrownfieldRepo(opts: BrownfieldImportOptions): Promise<BrownfieldIntake>;
export interface BacklogDelta {
    new_stories: StoryNode[];
    epic_list_additions: string[];
    source_message: string;
    validated: boolean;
    validation_errors: string[];
}
export interface ScopeChangeOptions {
    runningStoryId?: string;
    ambiguityRunner?: (questions: AmbiguityQuestion[]) => Promise<Record<string, string>>;
}
export declare function processScopeChange(messageText: string, opts: ScopeChangeOptions): Promise<BacklogDelta>;
export declare function validateBrownfieldIntake(intake: unknown): ValidationResult;
