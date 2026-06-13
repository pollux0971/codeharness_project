export interface SkillPackageManifest {
  skill_id: string;
  agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger' | 'reviewer';
  path: string;
}

export function isSkillForRole(skill: SkillPackageManifest, role: SkillPackageManifest['agent_role']): boolean {
  return skill.agent_role === role;
}

import fs from 'node:fs';
import path from 'node:path';

export interface FullSkillManifest {
  skill_id: string;
  agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger' | 'reviewer';
  path: string;
  description?: string;
  version?: number;
  status?: 'draft' | 'needs_tests' | 'registered' | 'quarantined';
  tests?: string[];
  depends_on?: string[];
}
export interface ValidationResult { ok: boolean; errors: string[] }

/** Load and parse a skill's skill.json manifest from its package directory. */
export function loadSkillManifest(skillDir: string): FullSkillManifest {
  const p = path.join(skillDir, 'skill.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')) as FullSkillManifest;
}

/** A skill package is structurally valid only with these fields + a non-empty tests list. */
export function validateSkillPackage(m: FullSkillManifest): ValidationResult {
  const errors: string[] = [];
  for (const k of ['skill_id', 'agent_role'] as const) if (!m[k]) errors.push(`missing: ${k}`);
  if (!m.tests || m.tests.length === 0) errors.push('skill has no tests/ — cannot be registered');
  return { ok: errors.length === 0, errors };
}

/** The hard gate: a skill without tests is never registerable (returns true = reject). */
export function rejectSkillWithoutTests(m: FullSkillManifest): boolean {
  return !m.tests || m.tests.length === 0;
}

// ── STORY-014.6: role-scoped skill loading ────────────────────────────────────

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
export function selectSkillsForRole(
  manifests: FullSkillManifest[],
  role: FullSkillManifest['agent_role'],
): FullSkillManifest[] {
  return manifests.filter(m => m.agent_role === role && m.status === 'registered');
}

/**
 * Topological sort: return skills in dependency order (deps before dependents).
 * Throws if a cycle is detected.
 */
export function sortByDependencyOrder(skills: FullSkillManifest[]): FullSkillManifest[] {
  const byId = new Map(skills.map(s => [s.skill_id, s]));
  const result: FullSkillManifest[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (inStack.has(id)) throw new Error(`Dependency cycle detected involving skill: ${id}`);
    const skill = byId.get(id);
    if (!skill) return;
    inStack.add(id);
    for (const dep of skill.depends_on ?? []) visit(dep);
    inStack.delete(id);
    visited.add(id);
    result.push(skill);
  }

  for (const s of skills) visit(s.skill_id);
  return result;
}

/**
 * Read SKILL.md and AVOID lines from .memory.md for a skill at skillsRoot/skill.path.
 */
export function readSkillContent(skill: FullSkillManifest, skillsRoot: string): SkillContent {
  const skillDir = path.join(skillsRoot, skill.path);
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const memoryMdPath = path.join(skillDir, '.memory.md');

  const skill_md = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf8') : '';

  let avoid_lines: string[] = [];
  if (fs.existsSync(memoryMdPath)) {
    avoid_lines = fs.readFileSync(memoryMdPath, 'utf8')
      .split('\n')
      .filter(line => line.startsWith('AVOID:'));
  }

  return {
    skill_id: skill.skill_id,
    skill_md,
    avoid_lines,
    token_estimate: Math.ceil((skill_md.length + avoid_lines.join('\n').length) / 4),
  };
}
