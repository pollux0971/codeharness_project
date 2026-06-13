export interface SkillPackageManifest {
    skill_id: string;
    agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
    path: string;
}
export declare function isSkillForRole(skill: SkillPackageManifest, role: SkillPackageManifest['agent_role']): boolean;
export interface FullSkillManifest {
    skill_id: string;
    agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
    path: string;
    description?: string;
    version?: number;
    status?: 'draft' | 'needs_tests' | 'registered' | 'quarantined';
    tests?: string[];
    depends_on?: string[];
}
export interface ValidationResult {
    ok: boolean;
    errors: string[];
}
/** Load and parse a skill's skill.json manifest from its package directory. */
export declare function loadSkillManifest(skillDir: string): FullSkillManifest;
/** A skill package is structurally valid only with these fields + a non-empty tests list. */
export declare function validateSkillPackage(m: FullSkillManifest): ValidationResult;
/** The hard gate: a skill without tests is never registerable (returns true = reject). */
export declare function rejectSkillWithoutTests(m: FullSkillManifest): boolean;
export interface SkillContent {
    skill_id: string;
    skill_md: string;
    avoid_lines: string[];
    token_estimate: number;
}
/**
 * Return only registered skills for the given role.
 * Quarantined, draft, and needs_tests skills are never returned.
 */
export declare function selectSkillsForRole(manifests: FullSkillManifest[], role: FullSkillManifest['agent_role']): FullSkillManifest[];
/**
 * Topological sort: return skills in dependency order (deps before dependents).
 * Throws if a cycle is detected.
 */
export declare function sortByDependencyOrder(skills: FullSkillManifest[]): FullSkillManifest[];
/**
 * Read SKILL.md and AVOID lines from .memory.md for a skill at skillsRoot/skill.path.
 */
export declare function readSkillContent(skill: FullSkillManifest, skillsRoot: string): SkillContent;
