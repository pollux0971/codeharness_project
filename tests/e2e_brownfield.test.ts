import { describe, it, expect } from 'vitest';
import { runE2EBrownfield } from '../scripts/e2e-brownfield.ts';

describe('e2e-brownfield', () => {
  it('fixture_legacy_repo_imported', async () => {
    const result = await runE2EBrownfield({ print: false });
    expect(result.intake).not.toBeNull();
    expect(result.intake!.layers.length).toBeGreaterThan(0);
  }, 30_000);

  it('change_story_completes_with_zero_new_failures', async () => {
    const result = await runE2EBrownfield({ print: false });
    expect(result.ok).toBe(true);
    expect(result.validationResult!.new_failures).toHaveLength(0);
    expect(result.validationResult!.ok).toBe(true);
  }, 30_000);

  it('e2e_brownfield_deterministic_and_ci_safe', async () => {
    const r1 = await runE2EBrownfield({ print: false });
    const r2 = await runE2EBrownfield({ print: false });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r1.validationResult!.new_failures).toEqual(r2.validationResult!.new_failures);
  }, 60_000);
});
