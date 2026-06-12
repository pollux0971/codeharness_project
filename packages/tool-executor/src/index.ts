/**
 * @codeharness/tool-executor
 *
 * The ONLY component that applies a Developer proposal to a workspace — and only after the
 * Permission Gateway approves each write, and only inside a registry-confirmed disposable
 * workspace. It then runs the story's validation commands and returns a deterministic
 * verdict. The agent never applies its own patch: this executor + the gateway are the apply
 * boundary; the validator output is the sole pass/fail.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { evaluateToolRequest, type ToolRequest, type StoryContractView, type WorkspaceOracle, type PolicyDecision } from '@codeharness/permission-gateway';
import { applyPatch, isPathInsideRoot, type WorkspaceManifest } from '@codeharness/workspace-manager';
import { createTraceEvent, appendJsonl, readJsonl } from '@codeharness/event-log';
import { validateWriteSet } from '@codeharness/validator-suite';

export interface ApplyResult { applied: boolean; decision: PolicyDecision; changed_files: string[] }

/** Gate-check (per file) then apply a unified diff. Deny/ask ⇒ NOT applied. */
export function applyProposal(opts: {
  ws: WorkspaceManifest; diffPath: string; changedFiles: string[]; // repo-relative
  contract: StoryContractView; oracle: WorkspaceOracle;
}): ApplyResult {
  // defense-in-depth: repo-relative changed_files must be within the write-set
  const ws = validateWriteSet(opts.changedFiles, opts.contract.allowedWriteSet);
  if (!ws.ok) return { applied: false, decision: { decision: 'deny', reasons: ws.errors }, changed_files: [] };
  // per-file gateway decision: bypass_workspace ⇒ path must be a registry-confirmed disposable ws
  for (const rel of opts.changedFiles) {
    const req: ToolRequest = { mode: 'bypass_workspace', tool: 'apply_patch', isWrite: true, cwd: opts.ws.root, targetPaths: [path.join(opts.ws.root, rel)] };
    const d = evaluateToolRequest(req, opts.contract, opts.oracle);
    if (d.decision !== 'allow') return { applied: false, decision: d, changed_files: [] };
  }
  const changed = applyPatch(opts.ws, opts.diffPath);
  return { applied: true, decision: { decision: 'allow', reasons: ['writes inside disposable workspace + within write-set'] }, changed_files: changed };
}

export interface Verdict { passed: boolean; results: { command: string; ok: boolean; output: string }[] }

/** Run the story's validation commands in the workspace. The SOLE source of pass/fail. */
export function runValidation(ws: WorkspaceManifest, commands: string[]): Verdict {
  const results = commands.map(command => {
    try { const output = execFileSync('bash', ['-lc', command], { cwd: ws.root, encoding: 'utf8' }); return { command, ok: true, output: output.trim() }; }
    catch (e) { const err = e as { stdout?: Buffer; message?: string }; return { command, ok: false, output: String(err.stdout ?? err.message ?? 'error').trim() }; }
  });
  return { passed: results.every(r => r.ok), results };
}

// ---- STORY-012.1: Promotion executor ----

export interface PromotionRecord {
  promotion_id: string;
  run_id: string;
  project_id: string;
  source_workspace_root: string;
  target_path: string;
  promoted_at: string;
  story_ids_promoted: string[];
  validation_evidence: { story_id: string; checkpoint_sha: string }[];
  trace_event_id: string;
}

export interface PromoteOptions {
  /** Structural subset of ProjectRunState — avoids coupling tool-executor to harness-core at the type level. */
  runState: {
    project_id: string;
    stories: Array<{
      story_id: string;
      status: string;
      checkpoint_sha: string | null;
    }>;
  };
  sourceWorkspace: WorkspaceManifest;
  targetPath: string;
  traceLogPath: string;
  runId: string;
}

/**
 * Export a fully-checkpointed workspace to a target path outside the sandbox.
 * This is the ONLY function that writes outside the sandbox; it enforces the
 * containment inversion (target must NOT be inside the source workspace root).
 */
export async function promoteWorkspace(opts: PromoteOptions): Promise<PromotionRecord> {
  const allDone = opts.runState.stories.every(s => s.status === 'done');
  const allCheckpointed = opts.runState.stories.every(s => s.checkpoint_sha !== null);
  if (!allDone || !allCheckpointed) {
    throw new Error('promotion rejected: run not fully checkpointed');
  }

  // Containment inversion: target must be OUTSIDE the sandbox workspace.
  if (isPathInsideRoot(opts.sourceWorkspace.root, opts.targetPath)) {
    throw new Error('promotion rejected: targetPath must be outside the source workspace');
  }

  fs.cpSync(opts.sourceWorkspace.root, opts.targetPath, { recursive: true });

  const promotion_id = crypto.randomUUID();
  const validation_evidence = opts.runState.stories.map(s => ({
    story_id: s.story_id,
    checkpoint_sha: s.checkpoint_sha as string,
  }));

  const existing = readJsonl(opts.traceLogPath);
  const last = existing[existing.length - 1];
  const traceEvent = createTraceEvent({
    run_id: opts.runId,
    seq: last ? last.seq + 1 : 0,
    previous_event_hash: last ? (last.hash ?? null) : null,
    type: 'promotion',
    payload: {
      promotion_id,
      run_id: opts.runId,
      project_id: opts.runState.project_id,
      target_path: opts.targetPath,
      validation_evidence,
    },
  });
  appendJsonl(opts.traceLogPath, traceEvent);

  return {
    promotion_id,
    run_id: opts.runId,
    project_id: opts.runState.project_id,
    source_workspace_root: opts.sourceWorkspace.root,
    target_path: opts.targetPath,
    promoted_at: new Date().toISOString(),
    story_ids_promoted: opts.runState.stories.map(s => s.story_id),
    validation_evidence,
    trace_event_id: traceEvent.event_id,
  };
}
