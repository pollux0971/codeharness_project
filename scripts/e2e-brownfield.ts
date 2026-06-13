/**
 * E2E brownfield run — deterministic, fixture provider, CI-safe.
 * Flow: import fixture repo → load fixture baseline → post-change static runner →
 *       validateBrownfieldChange → assert zero new failures.
 *
 * No LLM. No external API. No secrets. Fully deterministic.
 * Run: node --experimental-strip-types scripts/e2e-brownfield.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  importBrownfieldRepo,
  type BrownfieldIntake,
} from '@codeharness/planning-steward';
import {
  validateBrownfieldChange,
  type TestBaseline,
  type BrownfieldValidationResult,
  type BaselineRunner,
} from '@codeharness/validator-suite';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, '../tests/fixtures/e2e-legacy-calc');

export interface E2EBrownfieldResult {
  ok: boolean;
  intake: BrownfieldIntake | null;
  baselineResult: TestBaseline | null;
  validationResult: BrownfieldValidationResult | null;
  log: string[];
}

const POST_CHANGE_RESULTS = [
  { name: 'calc.add passes',             passed: true },
  { name: 'calc.subtract passes',        passed: true },
  { name: 'calc.multiply passes',        passed: true },
  { name: 'calc.divide crashes on zero', passed: true },
];

export async function runE2EBrownfield(opts: { print?: boolean } = {}): Promise<E2EBrownfieldResult> {
  const logs: string[] = [];
  const line = (s: string) => { logs.push(s); if (opts.print ?? true) console.log(s); };

  // Step 1: Import brownfield fixture repo into a disposable tmp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-bf-'));
  line(`fixture: ${fixtureRoot}`);

  let intake: BrownfieldIntake;
  try {
    intake = await importBrownfieldRepo({ repoPath: fixtureRoot, outputPath: tmpDir });
  } catch (err) {
    line(`importBrownfieldRepo FAILED: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, intake: null, baselineResult: null, validationResult: null, log: logs };
  }
  line(`intake: ${intake.intake_id} layers=${intake.layers.length}`);

  // Step 2: Load pre-captured fixture baseline
  const baselineFile = path.join(fixtureRoot, 'baseline', 'baseline.json');
  const baseline: TestBaseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  line(`baseline: passing=${baseline.passing.length} failing=${baseline.failing.length}`);

  // Step 3: Post-change runner — static fixture, divide now passes
  const postRunner: BaselineRunner = {
    async runTests() {
      return POST_CHANGE_RESULTS;
    },
  };

  // Step 4: Validate brownfield change (new_failures must be empty)
  const validationResult = await validateBrownfieldChange(baseline, postRunner);
  line(`validation: ok=${validationResult.ok} new_failures=${validationResult.new_failures.length}`);

  if (!validationResult.ok) {
    line(`new_failures: ${validationResult.new_failures.join(', ')}`);
    return { ok: false, intake, baselineResult: baseline, validationResult, log: logs };
  }

  line('e2e-brownfield: PASS');
  return { ok: true, intake, baselineResult: baseline, validationResult, log: logs };
}

// ── Entry point ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await runE2EBrownfield({ print: true });
  process.exit(result.ok ? 0 : 1);
}
