export interface TargetSettings {
    project_type?: 'greenfield' | 'brownfield' | 'patch';
    stack?: 'node-ts' | 'python' | 'go' | 'rust' | 'unknown';
}
export interface ModelSettings {
    real_provider_scope?: 'none' | 'hybrid' | 'all';
}
export interface ParallelismSettings {
    max_parallel_stories?: number;
    enable_competitive_debug?: boolean;
}
export interface QualityBarSettings {
    greenfield?: ('build' | 'test' | 'typecheck' | 'coverage')[];
    brownfield_strictness?: 'zero_new_failures' | 'full_bar';
}
export interface BudgetSettings {
    max_calls_per_story?: number;
    max_tokens_per_story?: number;
    max_calls_per_run?: number;
}
export interface DeliverySettings {
    promotion_target?: 'local_stable' | 'git_remote' | 'artifact_registry';
    human_gate_interface?: 'cli' | 'web' | 'none';
}
export interface FailureBankSettings {
    scope?: 'project' | 'global';
}
export interface BrownfieldSettings {
    recovery_depth?: 'shallow' | 'full';
}
export interface HarnessSettings {
    target?: TargetSettings;
    model?: ModelSettings;
    parallelism?: ParallelismSettings;
    quality_bar?: QualityBarSettings;
    budget?: BudgetSettings;
    delivery?: DeliverySettings;
    failure_bank?: FailureBankSettings;
    brownfield?: BrownfieldSettings;
}
export interface ValidationResult {
    ok: boolean;
    errors: string[];
}
export declare const DEFAULT_SETTINGS: HarnessSettings;
export declare function isGlobalGateKey(key: string): boolean;
export type SettingsOverride = Partial<HarnessSettings>;
/**
 * Resolves effective settings with three-layer precedence:
 * storyOverride > workspaceSettings > defaults
 * All inputs are pre-loaded (no file I/O here).
 * Throws if the resolved result fails validation.
 */
export declare function resolveSettings(defaults: HarnessSettings, workspaceSettings?: SettingsOverride, storyOverride?: SettingsOverride): HarnessSettings;
/**
 * Parse YAML text, validate against schema, and return typed settings.
 * Returns null if text is empty. Throws if the YAML is invalid.
 * Callers handle file I/O; this function only parses and validates.
 */
export declare function loadWorkspaceSettings(yamlText: string): HarnessSettings | null;
/**
 * Returns lines to add to .gitignore to ensure workspace settings.yaml is ignored.
 * Pure function — callers handle writing the file.
 */
export declare function ensureGitignored(existingGitignore: string): string;
export declare function validateSettings(settings: unknown): ValidationResult;
