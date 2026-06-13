import type { AgentRole } from '@codeharness/shared';
import type { FullSkillManifest } from '@codeharness/skill-runtime';
export type CompressionStrategy = 'keep_last_n' | 'summarize_node' | 'summarize_chain' | 'aggressive_discard';
export type TrajectoryPhase = 'search' | 'terminal' | 'stuck';
/** Machine-readable enum of harness lifecycle phases. Returned by detectPhase. */
export type LifecyclePhase = 'planning' | 'developing' | 'validating' | 'debugging' | 'escalating' | 'checkpointing' | 'done' | 'unknown';
/** Input signals used by detectPhase for deterministic lifecycle phase detection. */
export interface PhaseSignals {
    /** Explicit phase hint — highest priority; returned verbatim when present. */
    phase?: LifecyclePhase;
    /** Tracker story status field (todo / in_progress / validating / debugging /
     *  passed / checkpointed / blocked / escalated / done). */
    storyStatus?: string;
    /** Result of the last validation run. */
    validationPassed?: boolean;
    /** Number of consecutive validation failures in this story attempt. */
    failureCount?: number;
    /** Set to true when the harness has decided escalation is required. */
    escalationRequired?: boolean;
    /** Set to true when a checkpoint commit marker is present. */
    checkpointMarker?: boolean;
}
export interface Turn {
    role: string;
    content: string;
    tokenCount: number;
    pinned?: boolean;
}
export interface ContextWindow {
    turns: Turn[];
    totalTokens: number;
}
export interface ContextManagerConfig {
    level1NodeTokenThreshold: number;
    level2ChainTokenThreshold: number;
    keepFirstTurns: number;
    keepLastTurns: number;
    compressionRateFloor: number;
    slidingWindowMaxTurns: number;
    reInjectContractEveryNCalls: number;
    reInjectRulesEveryNCalls: number;
    budgets: Record<AgentRole, number>;
}
export declare const DEFAULT_CONFIG: ContextManagerConfig;
export declare function pickStrategy(phase: TrajectoryPhase): CompressionStrategy;
/** Map a lifecycle phase to a compression trajectory phase for strategy routing. */
export declare function lifecycleToTrajectory(phase: LifecyclePhase): TrajectoryPhase;
/**
 * Detect the current harness lifecycle phase from explicit signals.
 *
 * Priority order (first matching rule wins):
 *   1. Explicit `phase` hint — returned verbatim.
 *   2. Checkpoint marker / checkpointed status → 'checkpointing'.
 *   3. Story done → 'done'.
 *   4. Escalation required / blocked / escalated status → 'escalating'.
 *   5. Failure count > 0 / validation failed / debugging status → 'debugging'.
 *   6. Validation passed / validating / passed status → 'validating'.
 *   7. Story in_progress → 'developing'.
 *   8. Story todo → 'planning'.
 *   9. Fallback → 'unknown' (deterministic; never throws).
 *
 * Deterministic: no LLM, no external API, no Date.now, no randomness.
 */
export declare function detectPhase(signals: PhaseSignals): LifecyclePhase;
export declare function detectPhase(window: ContextWindow, cfg: ContextManagerConfig): TrajectoryPhase;
/** Inject the story contract + AVOID genes + hard rules on the Nth call. */
export declare function shouldReinject(callCount: number, cfg: ContextManagerConfig): {
    contract: boolean;
    failureGenes: boolean;
    hardRules: boolean;
};
export declare function requiredContextSections(role: AgentRole): string[];
export interface ContextPacketRequest {
    role: AgentRole;
    storyId: string;
}
export interface ArtifactRef {
    name: string;
    ref: string;
    tokenCount?: number;
    priority?: number;
    text?: string;
}
export interface RoleContextPacket {
    role: AgentRole;
    sections: ArtifactRef[];
    excluded: string[];
}
export interface ContextValidationResult {
    ok: boolean;
    errors: string[];
}
/** Select ONLY the sections this role requires, by reference; everything else is excluded.
 *  This is how secrets/unrelated logs/full repo stay out — by not selecting them. */
export declare function buildRoleContextPacket(role: AgentRole, available: ArtifactRef[]): RoleContextPacket;
/** A packet is valid only if it carries no secret material and every section has a source ref. */
export declare function validateContextPacket(packet: RoleContextPacket): ContextValidationResult;
/** Keep context within budget by DROPPING low-priority artifact refs (never the raw trace).
 *  Returns the kept sections and the names deferred to on-demand fetch. */
export declare function enforceTokenBudgetByArtifactSelection(sections: ArtifactRef[], budgetTokens: number): {
    kept: ArtifactRef[];
    deferred: string[];
};
/** Level-1: compress any single oversized node. Run first. */
export declare function compressLargeNodes(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow;
/** Level-2: chain-compress the middle section when total still exceeds threshold. */
export declare function compressChain(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow;
/** Main entry point: run Level-1 then Level-2 if still needed. */
export declare function adaptiveCompress(window: ContextWindow, cfg?: ContextManagerConfig): ContextWindow;
/** Sliding window: drop oldest non-pinned turns beyond the max. */
export declare function applySlidingWindow(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow;
export interface PinnedSection {
    name: string;
    text: string;
    pin_reason: 'arch_decision' | 'story_invariant' | 'planning_steward' | 'global_gate_status';
}
export declare const AUTO_PINNED_NAMES: readonly ['arch_decisions', 'story_invariants', 'global_gate_statuses'];
/** Convert PinnedSection[] to ArtifactRef[] with priority: 0 (never evicted). */
export declare function buildPinnedZone(sections: PinnedSection[]): ArtifactRef[];
/** Orchestrate the full compaction pipeline: Level-1 then Level-2 if still needed. */
export declare function compactContextWindow(window: ContextWindow, cfg?: ContextManagerConfig, pinnedSections?: PinnedSection[]): ContextWindow;
export interface ProjectProfile {
    project_root: string;
    extracted_at: string;
    naming: {
        convention: 'camelCase' | 'snake_case' | 'kebab-case' | 'PascalCase' | 'unknown';
        src_dir: string;
        test_dir: string;
    };
    test_layout: {
        framework: string;
        test_pattern: string;
        co_located: boolean;
    };
    toolchain: {
        language: string;
        build_tool: string;
        lint_tool: string;
        formatter: string;
    };
    lint_config_files: string[];
    summary: string;
}
/**
 * Extract project conventions from a target repo directory via static analysis.
 * Reads only file/directory names and package.json devDependencies — never leaks
 * file contents and redacts any secret-looking strings before writing the summary.
 */
export declare function extractProjectProfile(projectRoot: string): ProjectProfile;
/**
 * Inject the project profile as a `project_conventions` ArtifactRef into a
 * developer or debugger context packet. Returns the packet unchanged for all
 * other roles.
 */
export declare function injectProjectProfile(packet: RoleContextPacket, profile: ProjectProfile): RoleContextPacket;
export type DocumentMode = 'greenfield' | 'brownfield' | 'patch';
export interface ModeAwarePacketOptions {
    mode: DocumentMode;
    asIsDocsPath?: string;
    allowedWriteSet?: string[];
    profile?: ProjectProfile;
    impactedFiles?: string[];
}
export declare function buildModeAwarePacket(role: AgentRole, opts: ModeAwarePacketOptions): RoleContextPacket;
export declare function assertDocWriteSafe(outputPath: string, allowedWriteSet: string[]): void;
export declare const REVIEWER_DENIED_SECTIONS: readonly ["implementation_history", "agent_reasoning", "rejected_approach_rationale"];
export type ReviewerDeniedSection = typeof REVIEWER_DENIED_SECTIONS[number];
export interface ReviewerContextInput {
    story_id: string;
    failing_test_output: string;
    acceptance_criteria: string;
    diff_under_review: string;
    matching_genes: {
        matching_signal: string;
        summary: string;
    }[];
    story_objective?: string;
    allowed_write_set?: string[];
}
export declare function buildReviewerContextPacket(input: ReviewerContextInput): RoleContextPacket;
export declare function assertReviewerContextClean(packet: RoleContextPacket): string[];
export interface SkillInjectionOptions {
    role: AgentRole;
    manifests: FullSkillManifest[];
    skillsRoot: string;
    budgetTokens?: number;
}
/**
 * Select registered skills for the role, sort by dependency order, read content,
 * and inject as ArtifactRef sections into the packet — within the token budget.
 * Quarantined skills are excluded from loading but their AVOID lines are still injected.
 */
export declare function injectSkillsIntoPacket(packet: RoleContextPacket, opts: SkillInjectionOptions): Promise<RoleContextPacket>;
export interface PreviousStoryContext {
    story_id: string;
    window: ContextWindow;
}
export interface OwnStorySummaryOptions {
    role: AgentRole;
    previousStory: PreviousStoryContext;
    summaryFloor?: number;
}
export declare function injectOwnPreviousStorySummary(packet: RoleContextPacket, opts: OwnStorySummaryOptions): RoleContextPacket;
