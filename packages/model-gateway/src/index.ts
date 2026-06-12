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
