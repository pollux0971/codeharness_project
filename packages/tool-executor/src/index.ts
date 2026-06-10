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
import path from 'node:path';
import { evaluateToolRequest, type ToolRequest, type StoryContractView, type WorkspaceOracle, type PolicyDecision } from '@codeharness/permission-gateway';
import { applyPatch, type WorkspaceManifest } from '@codeharness/workspace-manager';
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
