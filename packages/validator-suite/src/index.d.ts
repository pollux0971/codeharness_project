import type { HarnessSettings } from '@codeharness/settings';
export interface ValidationResult {
    ok: boolean;
    errors: string[];
}
export declare function requiredPlanningBundleFiles(): string[];
/** Check that a planning bundle contains every required file; reports ALL missing files, not just first. */
export declare function validatePlanningBundle(presentFiles: string[]): ValidationResult;
/** A contract is development-ready only with these — and arrays must be NON-EMPTY,
 *  rollback_notes non-trivial, and acceptance_criteria machine-checkable (Codex #6). */
export declare function validateStoryContract(c: Record<string, unknown>): ValidationResult;
/** Machine-checkable acceptance criteria must carry at least one concrete check list. */
export declare function validateAcceptanceCriteria(ac: unknown): ValidationResult;
/** forbidden_actions must forbid reading secrets, sudo, and real API calls. */
export declare function validateForbiddenActions(forbidden: string[]): ValidationResult;
export declare function validateTaskPacket(p: Record<string, unknown>): ValidationResult;
export declare function validatePatchProposal(p: Record<string, unknown>): ValidationResult;
export declare function validateWriteSet(changedFiles: string[], allowedWriteSet: string[]): ValidationResult;
export declare function validateTraceSchema(e: Record<string, unknown>): ValidationResult;
export declare function validateNoSecretLeak(text: string): ValidationResult;
export declare function validatePromotionGate(g: {
    validationPassed: boolean;
    rollbackPlanPresent: boolean;
    tracePresent: boolean;
    secretHygienePassed: boolean;
    promotionAllowed: boolean;
    humanApproved: boolean;
}): ValidationResult;
export type QualityBarCheck = 'build' | 'test' | 'typecheck' | 'coverage';
export interface QualityBarConfig {
    required_checks: QualityBarCheck[];
    coverage_threshold?: number;
}
export declare const DEFAULT_QUALITY_BAR: QualityBarConfig;
export declare function qualityBarConfigFromSettings(settings: HarnessSettings): QualityBarConfig;
export interface QualityBarCheckResult {
    check: QualityBarCheck;
    passed: boolean;
    output: string;
}
export interface QualityBarResult {
    ok: boolean;
    config: QualityBarConfig;
    results: QualityBarCheckResult[];
    errors: string[];
}
export interface QualityBarRunner {
    build(): Promise<{
        passed: boolean;
        output: string;
    }>;
    test(): Promise<{
        passed: boolean;
        output: string;
    }>;
    typecheck(): Promise<{
        passed: boolean;
        output: string;
    }>;
    coverage?(): Promise<{
        passed: boolean;
        output: string;
        percent?: number;
    }>;
}
export declare function runQualityBar(config: QualityBarConfig, runner: QualityBarRunner): Promise<QualityBarResult>;
export declare function validateQualityBar(result: QualityBarResult): ValidationResult;
export interface StubRef {
    symbol: string;
    file: string;
}
export interface StubRegistryEntry {
    symbol: string;
    file: string;
    owner: string;
}
/** Every documented `not implemented` stub MUST be registered with an owner that is a
 *  known builder story or roadmap id (Codex: no stub without a story). */
export declare function validateDocumentedStubsHaveStory(found: StubRef[], registry: StubRegistryEntry[], knownOwners: Set<string>): ValidationResult;
/**
 * HARD gate the Developer must pass BEFORE submitting a proposal to the Validator:
 * proposal schema + changed_files ⊆ write-set + contract acceptance machine-checkable +
 * rollback present. If it fails, the Developer fixes the proposal or escalates — it must
 * NOT reach the Validator malformed.
 */
export declare function specConformanceGate(input: {
    proposal: Record<string, unknown>;
    contract: {
        allowed_write_set?: string[];
        acceptance_criteria?: unknown;
    };
}): ValidationResult;
export interface IntegrationValidationResult {
    ok: boolean;
    errors: string[];
    command_run: string;
}
export declare function runIntegrationValidation(command: string, cwd: string, runner?: (cmd: string, cwd: string) => Promise<{
    ok: boolean;
    output: string;
}>): Promise<IntegrationValidationResult>;
export interface TaskClassValidationResult {
    ok: boolean;
    errors: string[];
}
interface BrownfieldDeltaLike {
    file: string;
    affected_symbols: string[];
    change_intent: string;
}
interface PublicApiConstraintLike {
    frozen_paths: string[];
    reason: string;
}
interface TaskClassBundleInput {
    story_id: string;
    depends_on: string[];
    allowed_write_set: string[];
    parallelism_class?: string;
    task_class?: string;
    brownfield_deltas?: BrownfieldDeltaLike[];
    public_api_constraint?: PublicApiConstraintLike;
}
export declare function validateTaskClassBundle(story: TaskClassBundleInput): TaskClassValidationResult;
export interface TestResult {
    name: string;
    passed: boolean;
    output?: string;
}
export interface TestBaseline {
    captured_at: string;
    passing: string[];
    failing: string[];
    total: number;
}
export interface BaselineRunner {
    runTests(): Promise<TestResult[]>;
}
export interface BrownfieldValidationResult {
    ok: boolean;
    new_failures: string[];
    flaky_candidates: string[];
    baseline_failures: string[];
    errors: string[];
}
export declare function captureBaseline(runner: BaselineRunner): Promise<TestBaseline>;
export declare function validateBrownfieldChange(baseline: TestBaseline, runner: BaselineRunner): Promise<BrownfieldValidationResult>;
export type FailureClassification = 'test_assertion_mismatch' | 'type_error' | 'build_error' | 'runtime_exception' | 'spec_conformance_failure' | 'scope_error' | 'flaky_test' | 'environment_issue' | 'unknown';
export type DirectionType = 'change_implementation' | 'tighten_test' | 'widen_write_set' | 'clarify_spec' | 'add_prereq_check';
export interface RootCauseHypothesis {
    hypothesis: string;
    confidence: number;
    evidence_lines: string[];
}
export interface ImprovementDirection {
    direction_type: DirectionType;
    rationale: string;
    affected_files: string[];
}
export interface DiagnosisReport {
    report_id: string;
    story_id: string;
    failure_classification: FailureClassification;
    root_cause_hypotheses: RootCauseHypothesis[];
    improvement_directions: ImprovementDirection[];
    do_not_touch: string[];
    referenced_gene_signals: string[];
    reviewer_model: string;
    reviewed_at: string;
}
export declare function validateDiagnosisReport(report: unknown): ValidationResult;
/**
 * STORY-009.3: Gate that validates a PlanningBundle object before backlog emission.
 * Deterministically rejects:
 *   - malformed bundles (missing required fields or invalid structure)
 *   - prose-only acceptance criteria (prd must have goals or non_goals, same rule as STORY-006.1)
 *   - bundles with unresolved open decisions (ambiguity blocks backlog emission)
 * No LLM, no external API, no side effects. Error ordering is deterministic.
 */
export declare function planningBundleValidationGate(bundle: unknown): ValidationResult;
export {};
