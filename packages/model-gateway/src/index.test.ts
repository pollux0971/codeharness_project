import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  BudgetGuard,
  callFirstValid,
  callProvider,
  createDisabledRemoteProvider,
  createFixtureProvider,
  createManualProvider,
  createRealProvider,
  createScriptedProvider,
  guardedCall,
  ProviderRegistry,
  resolveProviderIdsFromConfig,
  validateStructuredOutput,
  type DeveloperOutput,
  type RealProviderHttpClient,
  type RoutingConfig,
} from './index';

const goodDeveloperOutput: DeveloperOutput = {
  kind: 'patch_proposal', proposal_id: 'p1', story_id: 'STORY-X', changed_files: ['src/a.ts'],
  contract_id: 'C1', change_type: 'MODIFY', rollback_notes: 'revert src/a.ts',
};

const req = { request_id: 'r1', target_agent: 'developer' as const, task_class: 'patch_generation' as const, story_id: 'STORY-X' };

describe('model-gateway provider interface', () => {
  it('scripted_provider_returns_registered_developer_output', async () => {
    const p = createScriptedProvider('scripted-demo', [{ case_id: 'c1', match: { story_id: 'STORY-X' }, output: goodDeveloperOutput }]);
    const r = await callProvider(p, req);
    expect(r.ok).toBe(true);
    expect(r.output?.kind).toBe('patch_proposal');
  });

  it('scripted_provider_unmatched_case_returns_structured_blocked_report', async () => {
    const p = createScriptedProvider('scripted-demo', [{ case_id: 'c1', match: { story_id: 'OTHER' }, output: goodDeveloperOutput }]);
    const r = await callProvider(p, req);
    expect(r.ok).toBe(true);
    expect(r.output?.kind).toBe('blocked_report');
  });

  it('fixture_provider_reads_agent_output_json', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-fixture-'));
    fs.writeFileSync(path.join(root, 'demo.json'), JSON.stringify(goodDeveloperOutput));
    const r = await callProvider(createFixtureProvider('fixture', root), { ...req, fixture_id: 'demo' });
    expect(r.ok).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('fixture_provider_rejects_path_escape', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-fixture-'));
    const r = await callProvider(createFixtureProvider('fixture', root), { ...req, fixture_id: '../escape' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/escapes|ENOENT/);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('manual_provider_returns_escalation_placeholder', async () => {
    const r = await callProvider(createManualProvider(), req);
    expect(r.ok).toBe(true);
    expect(r.output?.kind).toBe('clarification_request');
  });

  it('llm_remote_provider_is_not_enabled_without_secret_handle', async () => {
    const r = await callProvider(createDisabledRemoteProvider(), req);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/disabled/);
  });

  it('provider_output_must_pass_agent_output_validation', () => {
    expect(validateStructuredOutput('developer', goodDeveloperOutput).ok).toBe(true);
  });

  it('invalid_provider_output_is_rejected', async () => {
    const p = createScriptedProvider('bad', [{ case_id: 'bad', match: {}, output: { kind: 'patch_proposal' } as DeveloperOutput }]);
    const r = await callProvider(p, req);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/proposal_id/);
  });

  it('unknown_provider_kind_is_rejected_by_registry_lookup', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.get('missing')).toThrow(/unknown provider/);
  });

  it('call_first_valid_falls_back_to_second_provider', async () => {
    const registry = new ProviderRegistry();
    registry.register(createDisabledRemoteProvider('disabled'));
    registry.register(createScriptedProvider('scripted', [{ case_id: 'c1', match: {}, output: goodDeveloperOutput }]));
    const r = await callFirstValid(registry, ['disabled', 'scripted'], req);
    expect(r.ok).toBe(true);
    expect(r.provider_id).toBe('scripted');
  });
});

describe('real-provider-adapter', () => {
  it('real_provider_behind_gateway_interface', async () => {
    const mockResponse = {
      choices: [{ message: { content: JSON.stringify(goodDeveloperOutput) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    };
    const mockHttp: RealProviderHttpClient = async () => ({
      ok: true, status: 200, json: async () => mockResponse,
    });
    const p = createRealProvider({
      enabled: true,
      getAccessToken: async () => 'fake-token',
      httpClient: mockHttp,
    });
    const r = await callProvider(p, req);
    expect(r.ok).toBe(true);
    expect(r.output?.kind).toBe('patch_proposal');
  });

  it('malformed_output_rejected_same_as_fixtures', async () => {
    const mockHttp: RealProviderHttpClient = async () => ({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '{"kind":"bad_kind"}' } }], usage: {} }),
    });
    const p = createRealProvider({
      enabled: true, getAccessToken: async () => 'tok', httpClient: mockHttp,
    });
    const r = await callProvider(p, req);
    expect(r.ok).toBe(false);
  });

  it('ci_runs_never_call_real_provider', async () => {
    let called = false;
    const mockHttp: RealProviderHttpClient = async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; };
    const p = createRealProvider({ enabled: false, getAccessToken: async () => 'tok', httpClient: mockHttp });
    const r = await callProvider(p, req);
    expect(called).toBe(false);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/disabled/);
  });

  it('provider_selection_via_routing_config', () => {
    const config: RoutingConfig = {
      agents: {
        developer: { primary: 'codex', fallbacks: ['deepseek'] },
        supervisor: { primary: 'scripted', fallbacks: [] },
      },
      task_overrides: { patch: { developer: 'deepseek' } },
    };
    expect(resolveProviderIdsFromConfig(config, 'developer', 'patch_generation')).toEqual(['codex', 'deepseek']);
    expect(resolveProviderIdsFromConfig(config, 'supervisor', 'patch_generation')).toEqual(['scripted']);
  });

  it('non_2xx_response_returns_redacted_error', async () => {
    const mockHttp: RealProviderHttpClient = async () => ({
      ok: false, status: 429, json: async () => ({ error: 'access_token=SECRET_VALUE' }),
    });
    const p = createRealProvider({ enabled: true, getAccessToken: async () => 'tok', httpClient: mockHttp });
    const r = await callProvider(p, req);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).not.toContain('SECRET_VALUE');
    expect(r.errors.join(' ')).toMatch(/429|failed/i);
  });
});

describe('budget-guard', () => {
  it('per_story_call_budget_enforced', async () => {
    const guard = new BudgetGuard('STORY-X', { maxCallsPerStory: 2, maxTokensPerStory: 999999, onExceed: 'escalate' });
    const p = createScriptedProvider('p', [{ case_id: 'c', match: {}, output: goodDeveloperOutput }]);
    const r1 = await guardedCall(guard, p, req); expect(r1.ok).toBe(true);
    const r2 = await guardedCall(guard, p, req); expect(r2.ok).toBe(true);
    const r3 = await guardedCall(guard, p, req);
    expect(r3.ok).toBe(false);
    expect(r3.errors.join(' ')).toMatch(/call_budget|budget/i);
  });

  it('token_budget_enforced', async () => {
    const guard = new BudgetGuard('STORY-X', { maxCallsPerStory: 999, maxTokensPerStory: 1, onExceed: 'escalate' });
    const p = createScriptedProvider('p', [{ case_id: 'c', match: {}, output: goodDeveloperOutput }]);
    await guardedCall(guard, p, req);
    const r2 = await guardedCall(guard, p, req);
    expect(r2.ok).toBe(false);
    expect(r2.errors.join(' ')).toMatch(/token_budget|token|budget/i);
  });

  it('overrun_blocks_and_escalates', async () => {
    const guard = new BudgetGuard('STORY-Y', { maxCallsPerStory: 0, maxTokensPerStory: 999999, onExceed: 'escalate' });
    const p = createScriptedProvider('p', [{ case_id: 'c', match: {}, output: goodDeveloperOutput }]);
    const r = await guardedCall(guard, p, req);
    expect(r.ok).toBe(false);
  });

  it('kill_switch_halts_all_provider_calls', async () => {
    const guard = new BudgetGuard('STORY-Z', { maxCallsPerStory: 100, maxTokensPerStory: 999999, onExceed: 'escalate' });
    const p = createScriptedProvider('p', [{ case_id: 'c', match: {}, output: goodDeveloperOutput }]);
    guard.kill('operator kill switch engaged');
    const r = await guardedCall(guard, p, req);
    expect(r.ok).toBe(false);
    expect(guard.isKilled).toBe(true);
  });

  it('record_accumulates_usage_correctly', () => {
    const guard = new BudgetGuard('STORY-W', { maxCallsPerStory: 10, maxTokensPerStory: 100, onExceed: 'escalate' });
    guard.record({ inputTokens: 40, outputTokens: 40 });
    expect(guard.check().ok).toBe(true);
    guard.record({ inputTokens: 10, outputTokens: 11 });
    expect(guard.check().ok).toBe(false);
  });
});
