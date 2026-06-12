import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import {
  runSkillTests, robustnessCheck, leakageAudit, registerSkill,
  decideStatus, DEFAULT_LIFECYCLE, type SkillExecutor,
} from './index';

function makeTmpSkill(scripts: Record<string, string> = {}, memoryContent = ''): string {
  const root = join(tmpdir(), `skill-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'tests'), { recursive: true });
  writeFileSync(join(root, 'skill.json'), JSON.stringify({
    skill_id: 'test.skill', tests: ['tests/test_skill.py'], validation: ['pytest -q tests/'],
  }));
  writeFileSync(join(root, '.memory.md'), memoryContent);
  for (const [name, content] of Object.entries(scripts)) {
    writeFileSync(join(root, 'scripts', name), content);
  }
  return root;
}

const alwaysPass = (n = 2): SkillExecutor => ({ runTests: async () => ({ passed: n, total: n }) });
const alwaysFail = (): SkillExecutor => ({ runTests: async () => ({ passed: 0, total: 2 }) });
const noTests    = (): SkillExecutor => ({ runTests: async () => ({ passed: 0, total: 0 }) });

let tmpDirs: string[] = [];
afterEach(() => {
  tmpDirs.forEach(d => { try { rmSync(d, { recursive: true, force: true }); } catch {} });
  tmpDirs = [];
});

describe('skill-tester', () => {
  it('skill_without_tests_rejected', async () => {
    const root = makeTmpSkill(); tmpDirs.push(root);
    const result = await runSkillTests(root, noTests());
    expect(result.total).toBe(0);
    expect(decideStatus(result, { freshRuns: 5, passRate: 1.0 }, 'pass').startsWith('draft')).toBe(true);
  });

  it('robustness_reruns_from_clean_state', async () => {
    const root = makeTmpSkill(); tmpDirs.push(root);
    const r = await robustnessCheck(root, 3, alwaysPass());
    expect(r.freshRuns).toBe(3);
    expect(r.passRate).toBe(1.0);
  });

  it('leakage_audit_catches_secret_and_path_leaks', async () => {
    const root = makeTmpSkill({ 'run.py': 'import os\nval = os.environ["SECRET_KEY"]' }); tmpDirs.push(root);
    expect(await leakageAudit(root)).toBe('fail');
  });

  it('leakage_audit_catches_hardcoded_story_id', async () => {
    const root = makeTmpSkill({ 'run.py': '# only works for STORY-001.1\npass' }); tmpDirs.push(root);
    expect(await leakageAudit(root)).toBe('fail');
  });

  it('leakage_audit_passes_clean_script', async () => {
    const root = makeTmpSkill({ 'run.py': 'def evaluate(c):\n    return len(c) > 0, []\n' }); tmpDirs.push(root);
    expect(await leakageAudit(root)).toBe('pass');
  });

  it('registration_requires_all_gates_passed', async () => {
    const root = makeTmpSkill(); tmpDirs.push(root);
    const status = await registerSkill(root, DEFAULT_LIFECYCLE, alwaysPass());
    expect(status).toBe('registered');
  });

  it('quarantine_appends_avoid_memory', async () => {
    const root = makeTmpSkill(); tmpDirs.push(root);
    const status = await registerSkill(root, DEFAULT_LIFECYCLE, alwaysFail());
    expect(status).toBe('quarantined');
    const mem = readFileSync(join(root, '.memory.md'), 'utf8');
    expect(mem).toContain('AVOID:');
  });

  it('leakage_fail_quarantines_regardless_of_tests', async () => {
    const root = makeTmpSkill({ 'run.py': 'import os\nx = process.env["KEY"]' }); tmpDirs.push(root);
    const status = await registerSkill(root, DEFAULT_LIFECYCLE, alwaysPass());
    expect(status).toBe('quarantined');
  });
});
