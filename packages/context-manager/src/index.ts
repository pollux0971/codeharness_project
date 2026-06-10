// Context Manager (skeleton).
// Implements 2-level adaptive compression (MUSE), sliding window + periodic
// re-injection (ReCAP), and state-dependent strategy routing (AgentSwing).
// Parameters come from configs/context_manager.yaml; load them at runtime.

import type { AgentRole } from '@codeharness/shared';

export type CompressionStrategy = 'keep_last_n' | 'summarize_node' | 'summarize_chain' | 'aggressive_discard';
export type TrajectoryPhase = 'search' | 'terminal' | 'stuck';

export interface Turn { role: string; content: string; tokenCount: number; pinned?: boolean }
export interface ContextWindow { turns: Turn[]; totalTokens: number }

export interface ContextManagerConfig {
  level1NodeTokenThreshold: number;   // default 4000
  level2ChainTokenThreshold: number;  // default 60000
  keepFirstTurns: number;             // default 3
  keepLastTurns: number;              // default 5
  compressionRateFloor: number;       // default 0.3
  slidingWindowMaxTurns: number;      // default 20
  reInjectContractEveryNCalls: number;// default 10
  reInjectRulesEveryNCalls: number;   // default 20
  budgets: Record<AgentRole, number>;
}

export const DEFAULT_CONFIG: ContextManagerConfig = {
  level1NodeTokenThreshold: 4000,
  level2ChainTokenThreshold: 60000,
  keepFirstTurns: 3,
  keepLastTurns: 5,
  compressionRateFloor: 0.3,
  slidingWindowMaxTurns: 20,
  reInjectContractEveryNCalls: 10,
  reInjectRulesEveryNCalls: 20,
  budgets: { planning_steward: 32000, supervisor: 16000, developer: 128000, debugger: 32000 },
};

// ── Compression ───────────────────────────────────────────────────────────────

/** Level-1: compress any single oversized node. Run first. */
export function compressLargeNodes(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow {
  // Pin first N and last N turns; compress oversized middle turns individually.
  const turns = window.turns.map((t, i) => {
    if (t.pinned) return t;
    const isFirst = i < cfg.keepFirstTurns;
    const isLast = i >= window.turns.length - cfg.keepLastTurns;
    if (isFirst || isLast) return { ...t, pinned: true };
    if (t.tokenCount > cfg.level1NodeTokenThreshold) {
      return summarizeTurn(t, cfg.compressionRateFloor);
    }
    return t;
  });
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

/** Level-2: chain-compress the middle section when total still exceeds threshold. */
export function compressChain(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow {
  if (window.totalTokens <= cfg.level2ChainTokenThreshold) return window;
  const pinned = window.turns.filter(t => t.pinned);
  const unpinned = window.turns.filter(t => !t.pinned);
  const compressed = mergeAndSummarize(unpinned, cfg.compressionRateFloor);
  const turns = reorder(pinned, compressed, window.turns.length, cfg.keepFirstTurns, cfg.keepLastTurns);
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

/** Main entry point: run Level-1 then Level-2 if still needed. */
export function adaptiveCompress(window: ContextWindow, cfg: ContextManagerConfig = DEFAULT_CONFIG): ContextWindow {
  let w = compressLargeNodes(window, cfg);
  if (w.totalTokens > cfg.level2ChainTokenThreshold) w = compressChain(w, cfg);
  return applySlidingWindow(w, cfg);
}

/** Sliding window: drop oldest non-pinned turns beyond the max. */
export function applySlidingWindow(window: ContextWindow, cfg: ContextManagerConfig): ContextWindow {
  const nonPinned = window.turns.filter(t => !t.pinned);
  const excess = nonPinned.length - cfg.slidingWindowMaxTurns;
  if (excess <= 0) return window;
  const toRemove = new Set(nonPinned.slice(0, excess).map((_, i) => i));
  let idx = 0;
  const turns = window.turns.filter(t => {
    if (t.pinned) return true;
    return !toRemove.has(idx++);
  });
  return { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
}

// ── Strategy routing (AgentSwing) ─────────────────────────────────────────────

export function pickStrategy(phase: TrajectoryPhase): CompressionStrategy {
  const m: Record<TrajectoryPhase, CompressionStrategy> = { search: 'keep_last_n', terminal: 'summarize_chain', stuck: 'aggressive_discard' };
  return m[phase];
}

export function detectPhase(window: ContextWindow): TrajectoryPhase {
  // Stub: detect if the agent is stuck (same error N times), converging, or still exploring.
  throw new Error('not implemented: trajectory phase detection');
}

// ── Re-injection (ReCAP anti rule-amnesia) ───────────────────────────────────

/** Inject the story contract + AVOID genes + hard rules on the Nth call. */
export function shouldReinject(callCount: number, cfg: ContextManagerConfig): {
  contract: boolean; failureGenes: boolean; hardRules: boolean
} {
  return {
    contract:     callCount % cfg.reInjectContractEveryNCalls === 0,
    failureGenes: callCount % cfg.reInjectContractEveryNCalls === 0,
    hardRules:    callCount % cfg.reInjectRulesEveryNCalls === 0,
  };
}

// ── Required sections per role (unchanged) ───────────────────────────────────

export function requiredContextSections(role: AgentRole): string[] {
  switch (role) {
    case 'planning_steward': return ['raw_idea','known_constraints','source_type'];
    case 'supervisor':       return ['project_status','story_goal','codegraph_summary','invariants'];
    case 'developer':        return ['story_contract','relevant_files','allowed_write_set','validation_commands','failure_genes'];
    case 'debugger':         return ['failed_logs','current_patch','affected_codegraph','debug_attempts','matching_failure_genes'];
  }
}

// ── Stubs ─────────────────────────────────────────────────────────────────────
function summarizeTurn(t: Turn, _floor: number): Turn { throw new Error('not implemented: LLM-backed turn summarization'); }
function mergeAndSummarize(_turns: Turn[], _floor: number): Turn[] { throw new Error('not implemented: chain summarization'); }
function reorder(_pinned: Turn[], _compressed: Turn[], _total: number, _first: number, _last: number): Turn[] { throw new Error('not implemented'); }
export interface ContextPacketRequest { role: AgentRole; storyId: string }

// ── v0 role-scoped packet assembly (deterministic; no LLM) ───────────────────
export interface ArtifactRef { name: string; ref: string; tokenCount?: number; priority?: number; text?: string }
export interface RoleContextPacket { role: AgentRole; sections: ArtifactRef[]; excluded: string[] }
export interface ContextValidationResult { ok: boolean; errors: string[] }

/** Select ONLY the sections this role requires, by reference; everything else is excluded.
 *  This is how secrets/unrelated logs/full repo stay out — by not selecting them. */
export function buildRoleContextPacket(role: AgentRole, available: ArtifactRef[]): RoleContextPacket {
  const required = requiredContextSections(role);
  const sections = available.filter(a => required.includes(a.name));
  const excluded = available.filter(a => !required.includes(a.name)).map(a => a.name);
  return { role, sections, excluded };
}

const SECRET_IN_CONTEXT = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\.ssh\/id_rsa|auth\.json)/i;
/** A packet is valid only if it carries no secret material and every section has a source ref. */
export function validateContextPacket(packet: RoleContextPacket): ContextValidationResult {
  const errors: string[] = [];
  for (const s of packet.sections) {
    if (!s.ref) errors.push(`section ${s.name} missing source_ref`);
    if (s.text && SECRET_IN_CONTEXT.test(s.text)) errors.push(`secret material in section ${s.name}`);
  }
  return { ok: errors.length === 0, errors };
}

/** Keep context within budget by DROPPING low-priority artifact refs (never the raw trace).
 *  Returns the kept sections and the names deferred to on-demand fetch. */
export function enforceTokenBudgetByArtifactSelection(
  sections: ArtifactRef[], budgetTokens: number
): { kept: ArtifactRef[]; deferred: string[] } {
  const ordered = [...sections].sort((a, b) => (a.priority ?? 5) - (b.priority ?? 5)); // lower priority number = keep first
  const kept: ArtifactRef[] = []; const deferred: string[] = []; let used = 0;
  for (const s of ordered) {
    const t = s.tokenCount ?? 0;
    if (used + t <= budgetTokens) { kept.push(s); used += t; } else { deferred.push(s.name); }
  }
  return { kept, deferred };
}
