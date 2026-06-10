export interface SkillPackageManifest {
  skill_id: string;
  agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
  path: string;
}

export function isSkillForRole(skill: SkillPackageManifest, role: SkillPackageManifest['agent_role']): boolean {
  return skill.agent_role === role;
}

import fs from 'node:fs';
import path from 'node:path';

export interface FullSkillManifest {
  skill_id: string;
  agent_role: 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
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
