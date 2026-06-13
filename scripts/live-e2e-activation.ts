/**
 * Live activation runner — STORY-028.4 (gated, opt-in, real key).
 *
 * Preflight + launcher for the human-gated end-to-end live-provider proof. This
 * is the ONLY path in EPIC-028 that touches a real provider; it is never run in
 * CI and never by the autonomous loop. A human runs it deliberately.
 *
 * It does NOT read .env or print the key. It only checks env var PRESENCE and,
 * when opted in, hands off to the gated vitest test that performs the actual
 * secret-handle -> bootstrap -> registered adapter -> routed call -> budget path.
 *
 * Run:
 *   LIVE_E2E=1 OPENAI_API_KEY=sk-... node --experimental-strip-types scripts/live-e2e-activation.ts
 *   # or, loading from .env without exposing it to the caller:
 *   node --env-file=../.env --experimental-strip-types scripts/live-e2e-activation.ts   # (set LIVE_E2E=1 too)
 */
import { spawnSync } from 'node:child_process';

function shouldRunLiveE2E(env: NodeJS.ProcessEnv): boolean {
  return env.LIVE_E2E === '1' && !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) && !env.CI;
}

const env = process.env;
const optedIn = env.LIVE_E2E === '1';
const keyPresent = !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim());
const ci = !!env.CI;

console.log('Live activation preflight (no secret value is read or printed):');
console.log(`  LIVE_E2E=1 opt-in : ${optedIn ? 'yes' : 'no'}`);
console.log(`  OPENAI_API_KEY    : ${keyPresent ? 'present' : 'absent'}`);
console.log(`  CI                : ${ci ? 'set (live run blocked)' : 'unset'}`);

if (!shouldRunLiveE2E(env)) {
  console.log('\nSKIP: not all gates satisfied. The live provider will NOT be contacted.');
  console.log('To run the real activation, set LIVE_E2E=1 and OPENAI_API_KEY, with CI unset.');
  process.exit(0);
}

console.log('\nAll gates satisfied — launching the gated E2E test against the real provider...');
const r = spawnSync('pnpm', ['test', 'e2e_live_activation'], { stdio: 'inherit', env });
process.exit(r.status ?? 1);
