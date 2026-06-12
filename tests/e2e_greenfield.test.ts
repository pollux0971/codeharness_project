import { describe, it, expect } from 'vitest';
import { runE2EGreenfield } from '../scripts/e2e-greenfield.ts';
import { validatePlanningBundle } from '@codeharness/planning-steward';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, 'fixtures', 'e2e-cli-tool');

describe('e2e-greenfield', () => {
  it('e2e_reaches_promoted_artifact', async () => {
    const result = await runE2EGreenfield({ print: false });
    expect(result.ok).toBe(true);
    expect(result.promotionRecord).not.toBeNull();
    expect(fs.existsSync(result.promotionRecord!.target_path)).toBe(true);
  }, 30_000);

  it('generated_project_tests_pass_in_sandbox', async () => {
    const result = await runE2EGreenfield({ print: false });
    expect(result.ok).toBe(true);
    const targetPath = result.promotionRecord!.target_path;
    const { execFileSync } = await import('node:child_process');
    expect(() =>
      execFileSync('node', ['--experimental-strip-types', 'test/calc.test.ts'],
        { cwd: targetPath, stdio: 'pipe' })
    ).not.toThrow();
  }, 30_000);

  it('run_is_deterministic_and_ci_safe', async () => {
    const r1 = await runE2EGreenfield({ print: false });
    const r2 = await runE2EGreenfield({ print: false });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.promotionRecord!.story_ids_promoted)
      .toEqual(r2.promotionRecord!.story_ids_promoted);
  }, 60_000);

  it('planning_bundle_validates_before_run', () => {
    const allFiles = fs.readdirSync(path.join(fixtureRoot, 'planning-bundle'));
    const withoutChecklist = allFiles.filter(f => f !== '09_acceptance_checklist.md');
    const result = validatePlanningBundle(withoutChecklist);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/09_acceptance_checklist/);
  });
});
