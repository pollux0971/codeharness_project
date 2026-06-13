/**
 * STORY-028.4 — E2E live activation proof (gated, opt-in, real key)
 *
 * Proves the full live-provider path:
 *   secret handle -> bootstrap -> registered adapter -> routed call
 *   -> validated output -> budget decrement.
 *
 *   - The DETERMINISTIC proof (mock httpClient, no network, no real secret) runs
 *     on every `pnpm test` and is CI-safe.
 *   - The REAL activation against the live provider runs ONLY when opted in via
 *     LIVE_E2E=1, with OPENAI_API_KEY present and CI unset. It never runs in CI
 *     and is skipped (not failed) otherwise.
 *
 * Manual run:
 *   LIVE_E2E=1 OPENAI_API_KEY=sk-... pnpm test e2e_live_activation
 */
import { describe, it, expect } from 'vitest';
import {
  ProviderRegistry,
  bootstrapLiveProviders,
  validateRoutingRegistered,
  BudgetGuard,
  guardedCall,
  type TypedSecretHandle,
  type RealProviderHttpClient,
  type RoutingConfig,
  type ModelGatewayRequest,
  type DeveloperOutput,
} from '../packages/model-gateway/src/index';

/** Opt-in predicate: the real live path runs only with explicit opt-in, a
 *  non-blank key present, and NOT under CI. Pure, for deterministic testing. */
export function shouldRunLiveE2E(env: Record<string, string | undefined>): boolean {
  return env.LIVE_E2E === '1' && !!(env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim()) && !env.CI;
}

const handle: TypedSecretHandle = { handle_id: 'provider.openai.default', handle_type: 'api_key', provider: 'openai' };
const baseUrl = 'https://api.openai.com/v1';

const validOutput: DeveloperOutput = {
  kind: 'patch_proposal', proposal_id: 'e2e-1', story_id: 'STORY-028.4', changed_files: ['src/x.ts'],
  contract_id: 'C-e2e', change_type: 'MODIFY', rollback_notes: 'revert src/x.ts',
};
const req: ModelGatewayRequest = {
  request_id: 'e2e', target_agent: 'developer', task_class: 'patch_generation', story_id: 'STORY-028.4',
};

describe('e2e-live-activation (STORY-028.4)', () => {
  it('skips_without_optin_and_key', () => {
    expect(shouldRunLiveE2E({})).toBe(false);                                       // nothing set
    expect(shouldRunLiveE2E({ LIVE_E2E: '1' })).toBe(false);                        // opted in, no key
    expect(shouldRunLiveE2E({ OPENAI_API_KEY: 'sk-x' })).toBe(false);               // key, not opted in
    expect(shouldRunLiveE2E({ LIVE_E2E: '1', OPENAI_API_KEY: '   ' })).toBe(false); // blank key
    expect(shouldRunLiveE2E({ LIVE_E2E: '1', OPENAI_API_KEY: 'sk-x' })).toBe(true); // fully opted in
  });

  it('never_runs_in_ci', () => {
    expect(shouldRunLiveE2E({ LIVE_E2E: '1', OPENAI_API_KEY: 'sk-x', CI: 'true' })).toBe(false);
    expect(shouldRunLiveE2E({ LIVE_E2E: '1', OPENAI_API_KEY: 'sk-x', CI: '1' })).toBe(false);
  });

  it('full_path_proven_secret_to_budget (deterministic, CI-safe)', async () => {
    const registry = new ProviderRegistry();
    let resolved = false;
    const resolveSecret = async (_h: TypedSecretHandle) => { resolved = true; return 'sk-DETERMINISTIC'; };
    const mockHttp: RealProviderHttpClient = async (_url, init) => {
      // the adapter must present the resolved key as the bearer credential
      expect(init.headers['Authorization']).toBe('Bearer sk-DETERMINISTIC');
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(validOutput) } }], usage: { prompt_tokens: 11, completion_tokens: 13 } }) };
    };
    // secret handle -> bootstrap -> registered adapter
    const boot = bootstrapLiveProviders({ enabled: true, providers: [{ provider_id: 'openai', handle, base_url: baseUrl }], registry, resolveSecret, httpClient: mockHttp });
    expect(boot.registered.map(r => r.provider_id)).toEqual(['openai']);
    expect(registry.has('openai')).toBe(true);
    // routing safety passes for the now-registered provider
    const routing: RoutingConfig = { agents: { developer: { primary: 'openai', fallbacks: [] } } };
    expect(validateRoutingRegistered(routing, registry).ok).toBe(true);
    // routed call -> validated output -> budget decrement
    const guard = new BudgetGuard('STORY-028.4', { maxCallsPerStory: 5, maxTokensPerStory: 999999, onExceed: 'escalate' });
    expect(guard.usage.calls).toBe(0);
    const r = await guardedCall(guard, registry.get('openai'), req);
    expect(resolved).toBe(true);                 // secret resolved via the typed handle
    expect(r.ok).toBe(true);                      // validated output
    expect(r.output?.kind).toBe('patch_proposal');
    expect(guard.usage.calls).toBe(1);            // budget_decrement_verified
    expect(guard.usage.tokens).toBeGreaterThan(0);
  });

  it.runIf(shouldRunLiveE2E(process.env))('full_path_against_real_provider (opt-in, real key)', async () => {
    const key = process.env.OPENAI_API_KEY!.trim();
    const registry = new ProviderRegistry();
    const boot = bootstrapLiveProviders({ enabled: true, providers: [{ provider_id: 'openai', handle, base_url: baseUrl }], registry, resolveSecret: async () => key });
    expect(boot.gated_off).toBe(false);
    expect(registry.has('openai')).toBe(true);
    const routing: RoutingConfig = { agents: { developer: { primary: 'openai', fallbacks: [] } } };
    expect(validateRoutingRegistered(routing, registry).ok).toBe(true);
    const guard = new BudgetGuard('STORY-028.4-live', { maxCallsPerStory: 2, maxTokensPerStory: 999999, onExceed: 'escalate' });
    const liveReq: ModelGatewayRequest = {
      ...req,
      task_packet: {
        instruction: 'Return ONLY minified JSON for a patch_proposal with fields kind,proposal_id,story_id,changed_files,contract_id,change_type,rollback_notes. No prose, no code fence.',
        example: validOutput,
      },
    };
    const r = await guardedCall(guard, registry.get('openai'), liveReq);
    // eslint-disable-next-line no-console
    console.log('[LIVE_E2E] real provider result ok=', r.ok, 'errors=', r.errors);
    expect(r.ok).toBe(true);                      // validated output from the real provider
    expect(guard.usage.calls).toBe(1);            // budget decremented after the live call
  });
});
