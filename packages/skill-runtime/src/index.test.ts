import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isSkillForRole, validateSkillPackage, rejectSkillWithoutTests, loadSkillManifest,
  selectSkillsForRole, sortByDependencyOrder, readSkillContent,
  type FullSkillManifest,
} from './index';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chsk-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} });

describe('skill-runtime', () => {
  it('is_skill_for_role_true', () => expect(isSkillForRole({ skill_id: 's', agent_role: 'developer', path: 'p' }, 'developer')).toBe(true));
  it('validate_skill_package_requires_tests', () => expect(validateSkillPackage({ skill_id: 's', agent_role: 'developer', tests: [] }).ok).toBe(false));
  it('valid_skill_package_passes', () => expect(validateSkillPackage({ skill_id: 's', agent_role: 'developer', tests: ['t.test.ts'] }).ok).toBe(true));
  it('reject_skill_without_tests_true', () => expect(rejectSkillWithoutTests({ skill_id: 's', agent_role: 'developer' })).toBe(true));
  it('reject_skill_with_tests_false', () => expect(rejectSkillWithoutTests({ skill_id: 's', agent_role: 'developer', tests: ['t'] })).toBe(false));
  it('load_skill_manifest_parses_json', () => {
    fs.writeFileSync(path.join(dir, 'skill.json'), JSON.stringify({ skill_id: 'x', agent_role: 'debugger' }));
    expect(loadSkillManifest(dir).skill_id).toBe('x');
  });
});

function makeManifest(
  id: string,
  role: FullSkillManifest['agent_role'],
  status: string,
  deps: string[] = [],
): FullSkillManifest {
  // Strip role prefix (e.g. "developer.test-skill" → "test-skill") for the dir path
  const dirName = id.includes('.') ? id.split('.').slice(1).join('.') : id;
  return {
    skill_id: id,
    agent_role: role,
    status: status as FullSkillManifest['status'],
    path: `skills/${role}/${dirName}`,
    tests: ['tests/test_skill.py'],
    depends_on: deps,
  };
}

describe('skill-selection', () => {
  it('skills_selected_by_role_and_phase', () => {
    const m = [makeManifest('a', 'developer', 'registered'), makeManifest('b', 'supervisor', 'registered')];
    expect(selectSkillsForRole(m, 'developer').map(s => s.skill_id)).toEqual(['a']);
  });

  it('quarantined_skills_never_loaded', () => {
    const m = [makeManifest('a', 'developer', 'registered'), makeManifest('b', 'developer', 'quarantined')];
    expect(selectSkillsForRole(m, 'developer').map(s => s.skill_id)).toEqual(['a']);
  });

  it('dependency_ordered_loading', () => {
    const A = makeManifest('skill-a', 'developer', 'registered', []);
    const B = makeManifest('skill-b', 'developer', 'registered', ['skill-a']);
    const sorted = sortByDependencyOrder([B, A]);
    expect(sorted.map(s => s.skill_id)).toEqual(['skill-a', 'skill-b']);
  });

  it('cycle_detection_throws', () => {
    const A = makeManifest('skill-a', 'developer', 'registered', ['skill-b']);
    const B = makeManifest('skill-b', 'developer', 'registered', ['skill-a']);
    expect(() => sortByDependencyOrder([A, B])).toThrow(/cycle/i);
  });

  it('skill_memory_avoid_lines_included', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skrt-'));
    try {
      const skillDir = path.join(root, 'skills', 'developer', 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill\n\nDo the thing.');
      fs.writeFileSync(path.join(skillDir, '.memory.md'), 'Some notes\nAVOID: never do X\nAVOID: always do Y\n');
      fs.writeFileSync(path.join(skillDir, 'skill.json'), JSON.stringify({
        skill_id: 'developer.test-skill', agent_role: 'developer',
        path: 'skills/developer/test-skill', tests: ['tests/t.py'],
      }));
      const skill = makeManifest('developer.test-skill', 'developer', 'registered');
      const content = readSkillContent(skill, root);
      expect(content.avoid_lines.length).toBe(2);
      expect(content.skill_md).toContain('Do the thing');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
