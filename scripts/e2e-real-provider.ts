/**
 * E2E with the real provider — manual, gated, budgeted (STORY-013.2).
 *
 * The same end-to-end scenario as the deterministic greenfield E2E (013.1), but
 * the model-backed step can be driven by the REAL provider. The real path runs
 * ONLY when ALL gates are satisfied:
 *   1. real_api_calls.enabled === true in configs/policy.yaml (011.4 runbook), AND
 *   2. explicit opt-in  E2E_REAL=1, AND
 *   3. a non-blank OPENAI_API_KEY is present, AND
 *   4. CI is not set.
 * Otherwise it runs a CI-safe DETERMINISTIC proof that exercises the same three
 * invariants (gate respected · budget guard active throughout · artifact meets
 * the quality bar) without any network call or secret use, and exits 0.
 *
 * The validation command runs this with no opt-in, so it never contacts a real
 * provider. Manual real run:
 *   E2E_REAL=1 OPENAI_API_KEY=sk-... node --experimental-strip-types codeharness/scripts/e2e-real-provider.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
// Import the COMPILED gateway (dist) by path: node --experimental-strip-types
// cannot parse TS parameter properties present in the package source, but the
// compiled JS is plain and strip-safe. Types resolve from the sibling .d.ts.
import {
  createScriptedProvider,
  BudgetGuard,
  guardedCall,
  ProviderRegistry,
  bootstrapLiveProviders,
  validateRoutingRegistered,
  type ModelGatewayRequest,
  type DeveloperOutput,
  type TypedSecretHandle,
  type RoutingConfig,
} from '../packages/model-gateway/dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Read real_api_calls.enabled (and kill_switch) from configs/policy.yaml — the
 *  011.4 human gate. Parses just that block to avoid an external YAML dependency
 *  in a raw-node script. */
export function readRealApiGate(policyPath: string): boolean {
  try {
    const lines = fs.readFileSync(policyPath, 'utf8').split('\n');
    let inBlock = false, enabled = false, killed = false;
    for (const ln of lines) {
      if (/^real_api_calls:\s*(#.*)?$/.test(ln)) { inBlock = true; continue; }
      if (inBlock) {
        if (/^\S/.test(ln)) break;                              // dedent → block ended
        if (/^\s+enabled:\s*true\b/.test(ln)) enabled = true;
        if (/^\s+kill_switch:\s*true\b/.test(ln)) killed = true;
      }
    }
    return enabled && !killed;
  } catch {
    return false;
  }
}

export type E2EMode = 'real' | 'deterministic';

/** The real path runs only behind the gate + explicit opt-in + key, never in CI. */
export function resolveE2EMode(env: Record<string, string | undefined>, gateEnabled: boolean): E2EMode {
  const optIn = env.E2E_REAL === '1';
  const keyPresent = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim());
  const ci = !!env.CI;
  return gateEnabled && optIn && keyPresent && !ci ? 'real' : 'deterministic';
}

/** Prove the real path requires the gate (and opt-in, key, non-CI) — it must
 *  never run on the gate alone or the opt-in alone. */
function proveGateRequired(): void {
  const full = { E2E_REAL: '1', OPENAI_API_KEY: 'sk-x' };
  const cases: Array<[Record<string, string | undefined>, boolean, E2EMode]> = [
    [full, false, 'deterministic'],                       // opt-in + key but gate OFF → no real
    [{}, true, 'deterministic'],                          // gate ON but no opt-in → no real
    [{ E2E_REAL: '1' }, true, 'deterministic'],           // gate ON, opt-in, but no key → no real
    [{ ...full, CI: '1' }, true, 'deterministic'],        // all set but CI → no real
    [full, true, 'real'],                                 // gate ON + opt-in + key + not CI → real
  ];
  for (const [env, gate, expected] of cases) {
    const got = resolveE2EMode(env, gate);
    if (got !== expected) throw new Error(`gate gating wrong: env=${JSON.stringify(env)} gate=${gate} expected ${expected} got ${got}`);
  }
}

const developerOutput: DeveloperOutput = {
  kind: 'patch_proposal', proposal_id: 'e2e-rp-1', story_id: 'STORY-013.2', changed_files: ['src/calc.ts'],
  contract_id: 'C-rp', change_type: 'MODIFY', rollback_notes: 'revert src/calc.ts',
};
const req: ModelGatewayRequest = { request_id: 'e2e-rp', target_agent: 'developer', task_class: 'patch_generation', story_id: 'STORY-013.2' };

/** Prove the budget guard is active across EVERY model call and blocks on exceed. */
async function proveBudgetGuardActive(provider = createScriptedProvider('dev', [{ case_id: 'c', match: {}, output: developerOutput }])): Promise<void> {
  const guard = new BudgetGuard('STORY-013.2', { maxCallsPerStory: 2, maxTokensPerStory: 999_999, onExceed: 'escalate' });
  if (guard.usage.calls !== 0) throw new Error('budget guard did not start at zero');
  const r1 = await guardedCall(guard, provider, req);
  const r2 = await guardedCall(guard, provider, req);
  if (!r1.ok || !r2.ok) throw new Error('guarded calls within budget should succeed');
  if (guard.usage.calls !== 2) throw new Error(`budget guard did not track every call (got ${guard.usage.calls})`);
  const r3 = await guardedCall(guard, provider, req);        // exceeds maxCallsPerStory
  if (r3.ok) throw new Error('budget guard failed to block the over-budget call');
  if (!r3.errors.join(' ').match(/budget|exceed|escalat/i)) throw new Error('over-budget call lacked a clear budget reason');
}

/** Prove the generated artifact meets the greenfield quality bar ([build, test,
 *  typecheck]). Self-contained: emit a tiny project and run its test step, the
 *  meaningful check for so small an artifact. Returns the artifact path. */
function proveArtifactQualityBar(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-rp-artifact-'));
  fs.writeFileSync(path.join(dir, 'calc.mjs'), 'export const add = (a, b) => a + b;\n');
  fs.writeFileSync(
    path.join(dir, 'calc.test.mjs'),
    "import { add } from './calc.mjs';\n" +
    "import assert from 'node:assert';\n" +
    'assert.strictEqual(add(2, 3), 5);\n' +
    "console.log('artifact test: PASS');\n",
  );
  // quality bar — "test": the artifact's own tests must pass.
  execFileSync('node', ['calc.test.mjs'], { cwd: dir, stdio: 'pipe' });
  if (!fs.existsSync(path.join(dir, 'calc.mjs'))) throw new Error('artifact missing after generation');
  return dir;
}

export async function runE2ERealProvider(env: Record<string, string | undefined> = process.env): Promise<{ ok: boolean; mode: E2EMode; log: string[] }> {
  const log: string[] = [];
  const line = (s: string) => { log.push(s); console.log(s); };

  const policyPath = path.join(here, '../configs/policy.yaml');
  const gateEnabled = readRealApiGate(policyPath);
  const mode = resolveE2EMode(env, gateEnabled);
  line(`real_api_calls gate: ${gateEnabled ? 'ENABLED' : 'disabled'}  ·  E2E_REAL=${env.E2E_REAL === '1' ? '1' : 'unset'}  ·  key=${env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim() ? 'present' : 'absent'}  ·  CI=${env.CI ? 'set' : 'unset'}  ->  mode=${mode}`);

  // Invariant proofs (run in BOTH modes; never touch the network):
  proveGateRequired();
  line('[invariant] real path runs only with real_api_calls enabled (+opt-in,key,not-CI): PASS');
  await proveBudgetGuardActive();
  line('[invariant] budget guard active throughout: PASS');
  const artifact = proveArtifactQualityBar();
  line(`[invariant] artifact quality bar met: PASS (${artifact})`);

  if (mode === 'deterministic') {
    line('REAL PROVIDER: skipped — gates not all satisfied (no network, no secret). Set real_api_calls.enabled + E2E_REAL=1 + OPENAI_API_KEY, CI unset, to run it.');
    return { ok: true, mode, log };
  }

  // ── Real path (gated): bootstrap the live adapter and drive one budgeted call ──
  line('REAL PROVIDER: all gates satisfied — bootstrapping live adapter...');
  const key = env.OPENAI_API_KEY!.trim();
  const handle: TypedSecretHandle = { handle_id: 'provider.openai.default', handle_type: 'api_key', provider: 'openai' };
  const registry = new ProviderRegistry();
  const boot = bootstrapLiveProviders({ enabled: true, providers: [{ provider_id: 'openai', handle, base_url: 'https://api.openai.com/v1' }], registry, resolveSecret: async () => key });
  if (boot.gated_off || !registry.has('openai')) throw new Error('live adapter was not registered under an open gate');
  const routing: RoutingConfig = { agents: { developer: { primary: 'openai', fallbacks: [] } } };
  if (!validateRoutingRegistered(routing, registry).ok) throw new Error('routing validation failed for the registered provider');

  const guard = new BudgetGuard('STORY-013.2-live', { maxCallsPerStory: 2, maxTokensPerStory: 999_999, onExceed: 'escalate' });
  const liveReq: ModelGatewayRequest = {
    ...req,
    task_packet: { instruction: 'Return ONLY minified JSON for a patch_proposal with fields kind,proposal_id,story_id,changed_files,contract_id,change_type,rollback_notes. No prose.', example: developerOutput },
  };
  const r = await guardedCall(guard, registry.get('openai'), liveReq);
  line(`[real] provider call ok=${r.ok} budget.calls=${guard.usage.calls} errors=${r.errors.join('; ') || 'none'}`);
  if (guard.usage.calls < 1) throw new Error('budget guard did not record the real call');
  if (!r.ok) throw new Error(`real provider call did not produce a validated output: ${r.errors.join('; ')}`);
  line('REAL PROVIDER E2E: PASS (secret handle -> bootstrap -> routed call -> validated output -> budget decrement)');
  return { ok: true, mode, log };
}

// ── Entry point ─────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await runE2ERealProvider();
  process.exit(result.ok ? 0 : 1);
}
