// Skill testing & iteration runtime (skeleton).
// Deterministic gate: a skill is registered ONLY if its tests pass in a
// disposable workspace, it survives a robustness check, and it passes the
// leakage audit. The harness (not the agent) decides registration.

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

// Run a skill's unit tests inside a disposable workspace (delegated to the
// workspace-manager + tool-executor in the real implementation).
export async function runSkillTests(_skillPath: string): Promise<TestResult> {
  throw new Error('not implemented: run tests/ in a disposable workspace via the harness');
}

// Re-run tests over N fresh workspaces. A skill that passed once but is brittle
// (e.g. carries source-trajectory-specific assumptions) shows a low pass-rate here.
export async function robustnessCheck(_skillPath: string, _runs: number): Promise<RobustnessResult> {
  throw new Error('not implemented: N fresh-run robustness check');
}

// Static audit: reject skills that hardcode expected outputs, branch on task
// ids, or read ground-truth files.
export async function leakageAudit(_skillPath: string): Promise<'pass' | 'fail'> {
  throw new Error('not implemented: leakage / OOD audit');
}

// Pure decision used by the harness gate after evaluation.
export function decideStatus(t: TestResult, r: RobustnessResult, audit: 'pass' | 'fail',
                             cfg: LifecycleConfig = DEFAULT_LIFECYCLE): SkillStatus {
  if (audit === 'fail') return 'quarantined';
  if (t.total === 0 || t.passed / t.total < cfg.registerPassRate) return 'draft';
  if (r.passRate < cfg.quarantineBelow) return 'quarantined';
  return 'registered';
}

// ── registration gate orchestration (ties runSkillTests + robustnessCheck + leakageAudit + decideStatus) ─
/** Full registration gate: tests pass → robustness pass → leakage clean → registered,
 *  else iterate one change at a time, then quarantine (see SKILL_RUNTIME_MODEL.md). */
export async function registerSkill(_skillPath: string, _cfg?: LifecycleConfig): Promise<SkillStatus> {
  throw new Error('not implemented: registration gate orchestration');
}
