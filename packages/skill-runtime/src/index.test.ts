import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isSkillForRole, validateSkillPackage, rejectSkillWithoutTests, loadSkillManifest } from './index';

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
