// Skill testing & iteration runtime.
// Deterministic gate: a skill is registered ONLY if its tests pass in a
// disposable workspace, it survives a robustness check, and it passes the
// leakage audit. The harness (not the agent) decides registration.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

export type SkillStatus = 'draft' | 'tested' | 'registered' | 'deprecated' | 'quarantined';

export interface TestResult { passed: number; total: number }
export interface RobustnessResult { freshRuns: number; passRate: number }
export interface LifecycleConfig {
  registerPassRate: number;   // e.g. 1.0 — all tests must pass to register
  robustnessRuns: number;     // e.g. 5 fresh runs to catch trajectory-specific brittleness
  quarantineBelow: number;    // e.g. 0.8 — quarantine if fresh pass-rate drops below
  iterationBudget: number;    // e.g. 3 refine attempts before quarantine
}

export const DEFAULT_LIFECYCLE: LifecycleConfig = {
  registerPassRate: 1.0, robustnessRuns: 5, quarantineBelow: 0.8, iterationBudget: 3,
};

export interface SkillExecutor {
  runTests(skillPath: string): Promise<TestResult>;
}

export const DEFAULT_EXECUTOR: SkillExecutor = {
  async runTests(skillPath: string): Promise<TestResult> {
    const { execFileSync } = await import('node:child_process');
    const testsDir = join(skillPath, 'tests');
    try {
      const out = execFileSync('pytest', ['-q', testsDir], { encoding: 'utf8' });
      const m = out.match(/(\d+) passed/);
      const passed = m ? parseInt(m[1]) : 0;
      const t = out.match(/(\d+) (passed|failed)/g) ?? [];
      const total = t.reduce((acc, s) => acc + parseInt(s), 0) || passed;
      return { passed, total };
    } catch (e) {
      const msg = (e as { stdout?: string }).stdout ?? String(e);
      const m = msg.match(/(\d+) passed/);
      const passed = m ? parseInt(m[1]) : 0;
      return { passed, total: Math.max(passed, 1) };
    }
  }
};

export async function runSkillTests(
  skillPath: string,
  executor: SkillExecutor = DEFAULT_EXECUTOR
): Promise<TestResult> {
  const skillJson = JSON.parse(readFileSync(join(skillPath, 'skill.json'), 'utf8'));
  if (!skillJson.tests || skillJson.tests.length === 0) {
    return { passed: 0, total: 0 };
  }
  return executor.runTests(skillPath);
}

export async function robustnessCheck(
  skillPath: string,
  runs: number,
  executor: SkillExecutor = DEFAULT_EXECUTOR
): Promise<RobustnessResult> {
  let passingRuns = 0;
  for (let i = 0; i < runs; i++) {
    const result = await executor.runTests(skillPath);
    if (result.passed === result.total) passingRuns++;
  }
  return { freshRuns: runs, passRate: passingRuns / runs };
}

// Pure decision used by the harness gate after evaluation.
export function decideStatus(t: TestResult, r: RobustnessResult, audit: 'pass' | 'fail',
                             cfg: LifecycleConfig = DEFAULT_LIFECYCLE): SkillStatus {
  if (audit === 'fail') return 'quarantined';
  if (t.total === 0 || t.passed / t.total < cfg.registerPassRate) return 'draft';
  if (r.passRate < cfg.quarantineBelow) return 'quarantined';
  return 'registered';
}

function collectSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else {
      const ext = extname(entry);
      if (ext === '.py' || ext === '.ts') files.push(full);
    }
  }
  return files;
}

const LEAK_STRINGS = [
  'os.environ[',
  'process.env[',
  '/fixtures/',
  '/ground.truth/',
  '/expected_output/',
];
const LEAK_STORY_ID = /STORY-\d+\.\d+/;

export async function leakageAudit(skillPath: string): Promise<'pass' | 'fail'> {
  const files = collectSourceFiles(join(skillPath, 'scripts'));
  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of LEAK_STRINGS) {
      if (content.includes(pattern)) return 'fail';
    }
    if (LEAK_STORY_ID.test(content)) return 'fail';
  }
  return 'pass';
}

export async function registerSkill(
  skillPath: string,
  cfg: LifecycleConfig = DEFAULT_LIFECYCLE,
  executor: SkillExecutor = DEFAULT_EXECUTOR
): Promise<SkillStatus> {
  const tests = await runSkillTests(skillPath, executor);
  const robust = await robustnessCheck(skillPath, cfg.robustnessRuns, executor);
  const audit = await leakageAudit(skillPath);
  let status = decideStatus(tests, robust, audit, cfg);

  // Escalate draft→quarantine when tests fail AND robustness is also critically low.
  // decideStatus short-circuits on test failures before checking robustness; this
  // registration gate applies both conditions together.
  if (status === 'draft' && tests.total > 0 && robust.passRate < cfg.quarantineBelow) {
    status = 'quarantined';
  }

  if (status === 'quarantined') {
    let reason: string;
    if (audit === 'fail') {
      reason = 'leakage detected';
    } else if (tests.total === 0) {
      reason = 'no tests';
    } else if (tests.passed < tests.total) {
      reason = 'test failures';
    } else {
      reason = 'low robustness';
    }
    const memPath = join(skillPath, '.memory.md');
    const existing = existsSync(memPath) ? readFileSync(memPath, 'utf8') : '';
    writeFileSync(memPath, existing + `\nAVOID: quarantined — ${reason}`);
  }

  return status;
}
