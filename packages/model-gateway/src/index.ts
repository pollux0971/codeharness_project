/**
 * @codeharness/model-gateway
 *
 * Provider boundary for agent outputs. v20 deliberately supports only no-key
 * providers in the executable path: scripted, fixture, and manual placeholder.
 * Remote LLM providers are represented as explicit disabled providers until the
 * Secret Broker + network policy are wired. Model output is never free-form
 * prose here: it must validate as DeveloperOutput or DebuggerOutput.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  validateDeveloperResponse,
  validateDebuggerResponse,
  buildEscalation,
  type DeveloperOutput,
  type DebuggerOutput,
  type Escalation,
  type ValidationResult,
} from '@codeharness/agent-output';
import type { HarnessSettings } from '@codeharness/settings';

export type ProviderKind = 'scripted' | 'fixture' | 'manual' | 'llm_remote';
export type AgentRole = 'planning_steward' | 'supervisor' | 'developer' | 'debugger';
export type TaskClass = 'patch_generation' | 'debug_repair' | 'clarification' | 'planning' | 'generic';

export type AgentStructuredOutput = DeveloperOutput | DebuggerOutput;

export interface ModelGatewayRequest {
  request_id: string;
  target_agent: AgentRole;
  task_class: TaskClass;
  story_id?: string;
  task_packet?: Record<string, unknown>;
  fixture_id?: string;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  ok: boolean;
  provider_id: string;
  provider_kind: ProviderKind;
  output?: AgentStructuredOutput;
  errors: string[];
  usage: ProviderUsage;
}

export interface ModelProvider {
  id: string;
  kind: ProviderKind;
  call(req: ModelGatewayRequest): Promise<unknown>;
}

export interface ScriptedCase {
  case_id: string;
  match: Partial<Pick<ModelGatewayRequest, 'target_agent' | 'task_class' | 'story_id'>>;
  output: AgentStructuredOutput;
}

function matchesCase(c: ScriptedCase, req: ModelGatewayRequest): boolean {
  const m = c.match;
  return (m.target_agent === undefined || m.target_agent === req.target_agent)
    && (m.task_class === undefined || m.task_class === req.task_class)
    && (m.story_id === undefined || m.story_id === req.story_id);
}

function usageFromPayload(payload: unknown): ProviderUsage {
  const text = JSON.stringify(payload ?? null);
  return { inputTokens: 0, outputTokens: Math.max(1, Math.ceil(text.length / 4)) };
}

export function validateStructuredOutput(target: AgentRole, output: unknown): ValidationResult {
  if (!output || typeof output !== 'object') return { ok: false, errors: ['provider output must be an object'] };
  if (target === 'developer') return validateDeveloperResponse(output as { kind?: string } & Record<string, unknown>);
  if (target === 'debugger') return validateDebuggerResponse(output as { kind?: string } & Record<string, unknown>);
  return { ok: false, errors: [`target agent ${target} does not accept patch/debug structured output in v20`] };
}

export function createScriptedProvider(id: string, cases: ScriptedCase[]): ModelProvider {
  if (!id.trim()) throw new Error('scripted provider id required');
  if (cases.length === 0) throw new Error('scripted provider requires at least one case');
  return {
    id,
    kind: 'scripted',
    async call(req) {
      const c = cases.find(x => matchesCase(x, req));
      if (!c) {
        const esc: DeveloperOutput = {
          kind: 'blocked_report',
          ...buildEscalation({
            type: 'blocked_by_missing_context',
            reason: `scripted provider ${id} has no case for ${req.target_agent}/${req.task_class}/${req.story_id ?? 'no-story'}`,
            requested_decision: 'ask_human_or_add_fixture_case',
            raised_by: req.target_agent === 'debugger' ? 'debugger' : 'developer',
            story_id: req.story_id,
          }),
        };
        return esc;
      }
      return c.output;
    },
  };
}

export function createFixtureProvider(id: string, fixtureRoot: string): ModelProvider {
  const root = path.resolve(fixtureRoot);
  return {
    id,
    kind: 'fixture',
    async call(req) {
      if (!req.fixture_id?.trim()) throw new Error('fixture_id required for fixture provider');
      const file = path.resolve(root, `${req.fixture_id}.json`);
      if (!(file === root || file.startsWith(root + path.sep))) throw new Error('fixture path escapes fixture root');
      return JSON.parse(fs.readFileSync(file, 'utf8')) as AgentStructuredOutput;
    },
  };
}

export function createManualProvider(id = 'manual-placeholder'): ModelProvider {
  return {
    id,
    kind: 'manual',
    async call(req) {
      const e: Escalation = buildEscalation({
        type: 'needs_clarification',
        reason: 'manual provider placeholder: paste a validated AgentOutput JSON or choose a scripted/fixture provider',
        requested_decision: 'provide_manual_agent_output_json',
        raised_by: req.target_agent === 'debugger' ? 'debugger' : 'developer',
        story_id: req.story_id,
      });
      if (req.target_agent === 'debugger') return { kind: 'scope_expansion_request', ...e } satisfies DebuggerOutput;
      return { kind: 'clarification_request', ...e } satisfies DeveloperOutput;
    },
  };
}

export function createDisabledRemoteProvider(id = 'llm-remote-disabled'): ModelProvider {
  return {
    id,
    kind: 'llm_remote',
    async call() {
      throw new Error('llm_remote provider disabled: requires Secret Broker handle, network policy, timeout, retry, redaction, and human approval');
    },
  };
}

export async function callProvider(provider: ModelProvider, req: ModelGatewayRequest): Promise<ProviderResult> {
  try {
    const raw = await provider.call(req);
    const validation = validateStructuredOutput(req.target_agent, raw);
    if (!validation.ok) {
      return { ok: false, provider_id: provider.id, provider_kind: provider.kind, errors: validation.errors, usage: usageFromPayload(raw) };
    }
    return { ok: true, provider_id: provider.id, provider_kind: provider.kind, output: raw as AgentStructuredOutput, errors: [], usage: usageFromPayload(raw) };
  } catch (err) {
    return { ok: false, provider_id: provider.id, provider_kind: provider.kind, errors: [err instanceof Error ? err.message : String(err)], usage: { inputTokens: 0, outputTokens: 0 } };
  }
}

export class ProviderRegistry {
  private providers = new Map<string, ModelProvider>();
  register(p: ModelProvider): void {
    if (this.providers.has(p.id)) throw new Error(`provider already registered: ${p.id}`);
    this.providers.set(p.id, p);
  }
  get(id: string): ModelProvider {
    const p = this.providers.get(id);
    if (!p) throw new Error(`unknown provider: ${id}`);
    return p;
  }
  list(): { id: string; kind: ProviderKind }[] {
    return [...this.providers.values()].map(p => ({ id: p.id, kind: p.kind }));
  }
}

export function resolveRoute(registry: ProviderRegistry, candidates: string[]): ModelProvider[] {
  if (candidates.length === 0) throw new Error('route requires at least one provider id');
  return candidates.map(id => registry.get(id));
}

export async function callFirstValid(registry: ProviderRegistry, providerIds: string[], req: ModelGatewayRequest): Promise<ProviderResult> {
  const providers = resolveRoute(registry, providerIds);
  const errors: string[] = [];
  for (const p of providers) {
    const r = await callProvider(p, req);
    if (r.ok) return r;
    errors.push(`${p.id}: ${r.errors.join('; ')}`);
  }
  return { ok: false, provider_id: providerIds.join(','), provider_kind: 'scripted', errors, usage: { inputTokens: 0, outputTokens: 0 } };
}

export type RealProviderHttpClient = (
  url: string,
  init: RequestInit & { headers: Record<string, string> }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface RealProviderOptions {
  id?: string;
  getAccessToken: () => Promise<string>;
  endpoint?: string;
  httpClient?: RealProviderHttpClient;
  enabled: boolean;
}

export function createRealProvider(opts: RealProviderOptions): ModelProvider {
  if (!opts.enabled) {
    return createDisabledRemoteProvider(opts.id ?? 'llm-remote-disabled');
  }
  const endpoint = opts.endpoint ?? 'https://chatgpt.com/backend-api/codex/responses';
  const httpClient = opts.httpClient ?? (fetch as unknown as RealProviderHttpClient);
  return {
    id: opts.id ?? 'llm-remote',
    kind: 'llm_remote',
    async call(req: ModelGatewayRequest): Promise<unknown> {
      const token = await opts.getAccessToken();
      const res = await httpClient(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: JSON.stringify(req.task_packet ?? req) }] }),
      });
      if (!res.ok) {
        throw new Error(`real provider call failed: HTTP ${res.status}`);
      }
      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('real provider call failed: missing content in response');
      }
      try {
        return JSON.parse(content);
      } catch {
        throw new Error('real provider call failed: response content is not valid JSON');
      }
    },
  };
}

// ── API-key provider auth (STORY-028.1) ─────────────────────────────────────
// A first-class alternative to Codex OAuth (011.1) for OpenAI-compatible
// providers (api_key + base_url). The credential is referenced by a typed
// secret handle and resolved by the Secret Broker only at call time; the raw
// value never enters agent context, a trace event, or persisted config.

export type SecretHandleType = 'api_key' | 'oauth_token' | 'env_var';

/** A typed reference to a brokered credential — never the value itself.
 *  Mirrors specs/secret_handle.schema.json (027.7). */
export interface TypedSecretHandle {
  handle_id: string;          // e.g. 'provider.openai.default'
  handle_type: SecretHandleType;
  provider: string;           // e.g. 'openai'
}

/** Resolves a typed handle to its raw secret. Supplied by the Secret Broker.
 *  The returned value is used only as a bearer credential and never logged. */
export type SecretResolver = (handle: TypedSecretHandle) => Promise<string>;

export interface ApiKeyProviderOptions {
  id?: string;
  handle: TypedSecretHandle;
  resolveSecret: SecretResolver;
  baseUrl: string;            // OpenAI-compatible base, e.g. https://api.openai.com/v1
  httpClient?: RealProviderHttpClient;
  enabled: boolean;           // mirrors the real_api_calls gate
}

/** Build a live provider authenticated by an API key drawn from a typed handle.
 *  Reuses the createRealProvider call path (and its error redaction), so the key
 *  can never leak through an error body, and is a CI-safe no-op when disabled. */
export function createApiKeyProvider(opts: ApiKeyProviderOptions): ModelProvider {
  if (opts.handle.handle_type !== 'api_key') {
    throw new Error(`createApiKeyProvider requires an api_key handle, got: ${opts.handle.handle_type}`);
  }
  return createRealProvider({
    id: opts.id ?? `${opts.handle.provider}-apikey`,
    enabled: opts.enabled,
    endpoint: `${opts.baseUrl.replace(/\/$/, '')}/chat/completions`,
    httpClient: opts.httpClient,
    // The handle is resolved to the key only at call time; never held in a field.
    getAccessToken: () => opts.resolveSecret(opts.handle),
  });
}

export interface ApiKeyValidationResult {
  ok: boolean;
  gated_off: boolean;          // true when the gate was closed and NO call was made
  status: number | null;
  models_available: number | null;
  error?: string;              // redacted: status only, never the key or a body echo
}

export interface ApiKeyValidationOptions {
  handle: TypedSecretHandle;
  resolveSecret: SecretResolver;
  baseUrl: string;
  enabled: boolean;            // real_api_calls gate
  httpClient?: RealProviderHttpClient;
}

/** Lightweight liveness/auth check via GET {baseUrl}/models. A no-op when the
 *  real_api_calls gate is closed (no network, CI-safe). The key never appears
 *  in the returned result or in any error string. */
export async function validateApiKey(opts: ApiKeyValidationOptions): Promise<ApiKeyValidationResult> {
  if (!opts.enabled) {
    return { ok: false, gated_off: true, status: null, models_available: null, error: 'real_api_calls gate closed: validation skipped' };
  }
  const httpClient = opts.httpClient ?? (fetch as unknown as RealProviderHttpClient);
  const key = await opts.resolveSecret(opts.handle);
  try {
    const res = await httpClient(`${opts.baseUrl.replace(/\/$/, '')}/models`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      // Redact: status only. The response body could echo the credential, so it is never read into the result.
      return { ok: false, gated_off: false, status: res.status, models_available: null, error: `validation failed: HTTP ${res.status}` };
    }
    const data = await res.json() as { data?: unknown[] };
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    return { ok: true, gated_off: false, status: res.status, models_available: count };
  } catch {
    // Redact: never surface an exception message that may have captured the key.
    return { ok: false, gated_off: false, status: null, models_available: null, error: 'validation failed: network or client error' };
  }
}

export interface ValidatedProviderMetadata {
  provider: string;
  base_url: string;
  handle_id: string;
  handle_type: SecretHandleType;
  validated_at: string;
  models_available: number | null;
}

/** Produce the ONLY data that may be persisted to config after validation:
 *  non-secret provider metadata. The raw key is not an input here, so it can
 *  never be persisted by construction. */
export function buildValidatedProviderMetadata(
  handle: TypedSecretHandle,
  baseUrl: string,
  validation: ApiKeyValidationResult,
  validatedAt: string,
): ValidatedProviderMetadata {
  return {
    provider: handle.provider,
    base_url: baseUrl,
    handle_id: handle.handle_id,
    handle_type: handle.handle_type,
    validated_at: validatedAt,
    models_available: validation.models_available,
  };
}

export interface ModelRef {
  provider_id: string;
  model_name: string;
}

export interface ModelRegistryConfig {
  providers: Record<string, {
    kind: string;
    models: { name: string; tier: string }[];
    gateway_registered?: boolean;
  }>;
  agents: Record<string, {
    primary: string;
    fallbacks?: string[];
  }>;
}

export function parseModelRef(ref: string): ModelRef | null {
  const idx = ref.indexOf('/');
  if (idx === -1 || idx !== ref.lastIndexOf('/')) return null;
  return { provider_id: ref.slice(0, idx), model_name: ref.slice(idx + 1) };
}

export function validateModelRegistry(cfg: ModelRegistryConfig): ValidationResult {
  const errors: string[] = [];
  for (const [agentName, agentCfg] of Object.entries(cfg.agents)) {
    const refs = [agentCfg.primary, ...(agentCfg.fallbacks ?? [])];
    const seen = new Set<string>();
    for (const ref of refs) {
      const parsed = parseModelRef(ref);
      if (!parsed) {
        errors.push(`invalid ref format: ${ref}`);
        continue;
      }
      const provider = cfg.providers[parsed.provider_id];
      if (!provider) {
        errors.push(`unknown provider: ${parsed.provider_id} (in ref ${ref})`);
      } else {
        const modelNames = provider.models.map(m => m.name);
        if (!modelNames.includes(parsed.model_name)) {
          errors.push(`unknown model: ${ref}`);
        }
      }
      if (seen.has(ref)) {
        errors.push(`cycle in fallback chain for agent ${agentName}: ${ref}`);
      } else {
        seen.add(ref);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export interface RoutingConfig {
  agents: Record<string, { primary: string; fallbacks?: string[] }>;
  task_overrides?: Record<string, Record<string, string>>;
}

export function resolveProviderIdsFromConfig(
  config: RoutingConfig,
  agent: AgentRole,
  taskClass: TaskClass
): string[] {
  const override = config.task_overrides?.[taskClass]?.[agent];
  if (override !== undefined) {
    return [override];
  }
  const agentConfig = config.agents[agent];
  if (!agentConfig) return [];
  return [agentConfig.primary, ...(agentConfig.fallbacks ?? [])];
}

export interface BudgetConfig {
  maxCallsPerStory: number;
  maxTokensPerStory: number;
  onExceed: 'escalate' | 'throw';
}

export type BudgetVerdict =
  | { ok: true }
  | { ok: false; reason: 'call_budget_exceeded' | 'token_budget_exceeded' | 'killed'; detail: string };

export class BudgetGuard {
  private calls = 0;
  private tokens = 0;
  private killed = false;
  private killReason = '';

  constructor(
    private storyId: string,
    private config: BudgetConfig = {
      maxCallsPerStory: 30,
      maxTokensPerStory: 400_000,
      onExceed: 'escalate',
    }
  ) {}

  check(): BudgetVerdict {
    if (this.killed) {
      return { ok: false, reason: 'killed', detail: `story ${this.storyId}: ${this.killReason || 'kill switch engaged'}` };
    }
    if (this.calls >= this.config.maxCallsPerStory) {
      return { ok: false, reason: 'call_budget_exceeded', detail: `story ${this.storyId}: ${this.calls}/${this.config.maxCallsPerStory} calls used` };
    }
    if (this.tokens >= this.config.maxTokensPerStory) {
      return { ok: false, reason: 'token_budget_exceeded', detail: `story ${this.storyId}: ${this.tokens}/${this.config.maxTokensPerStory} tokens used` };
    }
    return { ok: true };
  }

  record(usage: ProviderUsage): void {
    this.calls += 1;
    this.tokens += usage.inputTokens + usage.outputTokens;
  }

  kill(reason: string): void {
    this.killed = true;
    this.killReason = reason;
  }

  get isKilled(): boolean {
    return this.killed;
  }

  get usage(): { calls: number; tokens: number } {
    return { calls: this.calls, tokens: this.tokens };
  }
}

export interface RunBudgetPoolConfig {
  totalCallsBudget: number;
  totalTokensBudget: number;
  perWorkerCallsBudget?: number;
  perWorkerTokensBudget?: number;
  maxWorkers: number;
}

export class RunBudgetPool {
  private workers: Map<string, BudgetGuard> = new Map();
  private _killed = false;

  constructor(private config: RunBudgetPoolConfig) {}

  registerWorker(workerId: string): BudgetGuard {
    if (this.workers.has(workerId)) {
      return this.workers.get(workerId)!;
    }
    const callBudget = this.config.perWorkerCallsBudget ??
      Math.floor(this.config.totalCallsBudget / this.config.maxWorkers);
    const tokenBudget = this.config.perWorkerTokensBudget ??
      Math.floor(this.config.totalTokensBudget / this.config.maxWorkers);
    const guard = new BudgetGuard(workerId, {
      maxCallsPerStory: callBudget,
      maxTokensPerStory: tokenBudget,
      onExceed: 'escalate',
    });
    if (this._killed) {
      guard.kill('pool was killed before worker registered');
    }
    this.workers.set(workerId, guard);
    return guard;
  }

  killAll(reason: string): void {
    this._killed = true;
    for (const guard of this.workers.values()) {
      guard.kill(reason);
    }
  }

  get isKilled(): boolean {
    return this._killed;
  }

  get totalUsage(): { calls: number; tokens: number } {
    let calls = 0;
    let tokens = 0;
    for (const guard of this.workers.values()) {
      calls += guard.usage.calls;
      tokens += guard.usage.tokens;
    }
    return { calls, tokens };
  }
}

export async function workerGuardedCall(
  pool: RunBudgetPool,
  workerId: string,
  provider: ModelProvider,
  req: ModelGatewayRequest
): Promise<ProviderResult> {
  const guard = pool.registerWorker(workerId);
  return guardedCall(guard, provider, req);
}

export async function guardedCall(
  guard: BudgetGuard,
  provider: ModelProvider,
  req: ModelGatewayRequest
): Promise<ProviderResult> {
  const verdict = guard.check();
  if (!verdict.ok) {
    return {
      ok: false,
      provider_id: provider.id,
      provider_kind: provider.kind,
      errors: [`${verdict.reason}: ${verdict.detail}`],
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
  const result = await callProvider(provider, req);
  if (result.ok) {
    guard.record(result.usage);
  }
  return result;
}

// ── Model onboarding gate (STORY-018.3) ──────────────────────────────────

export type ModelStatus = 'candidate' | 'active' | 'deprecated' | 'blocked';

export interface ModelEvalRecord {
  provider_ref: string;
  eval_run_id: string;
  stories_run: number;
  stories_passed: number;
  threshold: number;
  pass_rate: number;
  passed: boolean;
  status_after: ModelStatus;
  evaluated_at: string;
  fixture_names: string[];
}

export interface ModelEvalOptions {
  providerRef: string;
  createProvider: () => ModelProvider;
  fixtureStoryIds?: string[];
  threshold?: number;
  runFixtureStory: (storyId: string, provider: ModelProvider) => Promise<boolean>;
}

export async function runModelEval(opts: ModelEvalOptions): Promise<ModelEvalRecord> {
  const stories = opts.fixtureStoryIds ?? ['STORY-E2E-001', 'STORY-E2E-002', 'STORY-E2E-003'];
  const threshold = opts.threshold ?? 1.0;
  const provider = opts.createProvider();
  const results = await Promise.all(stories.map(id => opts.runFixtureStory(id, provider)));
  const storiesPassed = results.filter(Boolean).length;
  const passRate = stories.length > 0 ? storiesPassed / stories.length : 0;
  const passed = passRate >= threshold;
  return {
    provider_ref: opts.providerRef,
    eval_run_id: `eval-${opts.providerRef.replace('/', '-')}-${stories.length}`,
    stories_run: stories.length,
    stories_passed: storiesPassed,
    threshold,
    pass_rate: passRate,
    passed,
    status_after: passed ? 'active' : 'candidate',
    evaluated_at: new Date().toISOString(),
    fixture_names: stories,
  };
}

// ── STORY-021.3: Settings-derived budget configuration ────────────────────

export function budgetConfigFromSettings(settings: HarnessSettings): BudgetConfig {
  return {
    maxCallsPerStory:  settings.budget?.max_calls_per_story  ?? 30,
    maxTokensPerStory: settings.budget?.max_tokens_per_story ?? 400_000,
    onExceed: 'escalate',
  };
}

// ── Dynamic model-tier ladder (STORY-018.2) ───────────────────────────────

export type ModelTier = 'cheap' | 'mid' | 'strong';

export interface TierLadderEntry {
  tier: ModelTier;
  provider_ref: string;
}

export interface TierLadder {
  agent: string;
  entries: TierLadderEntry[];
}

export interface TierUpgradePolicy {
  upgrade_after_n_failures: number;
  hard_gene_starts_strong: boolean;
}

export interface TierSelectionContext {
  consecutiveValidationFailures: number;
  matchingGenes: { matching_signal: string; failure_type: string }[];
  upgradePolicy: TierUpgradePolicy;
}

const TIER_ORDER: ModelTier[] = ['cheap', 'mid', 'strong'];

function tierIndex(t: ModelTier): number {
  return TIER_ORDER.indexOf(t);
}

export function buildTierLadder(
  agent: string,
  routingAgents: Record<string, { primary: string; fallbacks?: string[] }>,
  providerModels: Record<string, { name: string; tier: ModelTier }[]>,
): TierLadder {
  const agentCfg = routingAgents[agent];
  if (!agentCfg) return { agent, entries: [] };

  const refs = [agentCfg.primary, ...(agentCfg.fallbacks ?? [])];
  const seen = new Set<string>();
  const entries: TierLadderEntry[] = [];

  for (const ref of refs) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    const slash = ref.indexOf('/');
    if (slash === -1) continue;
    const providerId = ref.slice(0, slash);
    const modelName = ref.slice(slash + 1);
    const models = providerModels[providerId];
    const found = models?.find(m => m.name === modelName);
    const tier: ModelTier = found ? found.tier : 'mid';
    entries.push({ tier, provider_ref: ref });
  }

  entries.sort((a, b) => tierIndex(a.tier) - tierIndex(b.tier));
  return { agent, entries };
}

export function selectTierForAttempt(
  ladder: TierLadder,
  ctx: TierSelectionContext,
): TierLadderEntry {
  const entries = ladder.entries;
  if (entries.length === 0) {
    return { tier: 'cheap', provider_ref: '' };
  }

  const strongestEntry = entries[entries.length - 1];
  const cheapestEntry = entries[0];

  if (ctx.matchingGenes.length > 0 && ctx.upgradePolicy.hard_gene_starts_strong) {
    return strongestEntry;
  }

  if (ctx.consecutiveValidationFailures >= ctx.upgradePolicy.upgrade_after_n_failures) {
    // upgrade one tier from cheapest
    const baseTierIdx = tierIndex(cheapestEntry.tier);
    const targetTierIdx = Math.min(baseTierIdx + 1, TIER_ORDER.length - 1);
    const targetTier = TIER_ORDER[targetTierIdx];
    const upgraded = entries.find(e => tierIndex(e.tier) >= targetTierIdx);
    return upgraded ?? strongestEntry;
  }

  return cheapestEntry;
}
