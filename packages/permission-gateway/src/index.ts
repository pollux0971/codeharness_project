/**
 * @codeharness/permission-gateway
 *
 * Decides allow / ask / deny for a tool action BEFORE it runs. The primary safety
 * gate. It trusts the StoryContract (write-set/forbidden) and an injected
 * WorkspaceOracle — NEVER the caller's self-report (especially disposability).
 *
 * Spec: codeharness/docs/policies/PERMISSION_POLICY.md
 * Rules: codeharness/docs/architecture/12_RUNTIME_ALGORITHM_RULES.md §4
 */

export type PermissionMode =
  | 'plan' | 'ask' | 'accept_edits' | 'bypass_workspace' | 'deny_unlisted';
export type Decision = 'allow' | 'ask' | 'deny';

export interface ToolRequest {
  mode: PermissionMode;
  tool: string;                 // e.g. read_file | write_file | shell | apply_patch
  command?: string;             // for shell
  cwd: string;                  // declared cwd (resolved + checked by the oracle, not trusted)
  targetPaths?: string[];       // paths the action will touch
  isWrite?: boolean;            // does it mutate?
  usesSecretHandle?: boolean;   // legitimate scoped-handle use (ask), not a raw secret read
  opensNetwork?: boolean;
  /** NOTE: any self-reported disposability flag is intentionally absent — disposability
   *  is decided by the WorkspaceOracle, never by the request. */
}

export interface StoryContractView {
  allowedWriteSet: string[];    // globs
  forbiddenActions: string[];   // e.g. "read .env", "sudo", "real_api"
  allowedTools?: string[];
  networkGranted?: boolean;
  promotionAllowed?: boolean;
}

/** Injected by the harness; the gateway asks it instead of trusting the request. */
export interface WorkspaceOracle {
  /** realpath() the path (follow symlinks) and return the absolute resolved path. */
  resolveRealPath(p: string): string;
  /** True only if the resolved path is inside a harness-created disposable workspace
   *  (decided from the workspace registry/manifest — never self-reported). */
  isDisposableWorkspace(resolvedPath: string): boolean;
  /** True if the resolved path escapes the workspace (symlink-escape / outside root). */
  escapesWorkspace(resolvedPath: string): boolean;
}

export interface PolicyDecision { decision: Decision; reasons: string[] }
export interface ValidationResult { ok: boolean; errors: string[] }

export interface ToolRegistryEntry {
  allowed_tools: string[];
  description?: string;
}
export interface ToolRegistry {
  version: number;
  roles: Record<string, ToolRegistryEntry>;
}

/** Structural validation of the registry config. Call at boot. */
export function validateToolRegistry(registry: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof registry !== 'object' || registry === null) {
    return { ok: false, errors: ['registry must be an object'] };
  }
  const r = registry as Record<string, unknown>;
  if (typeof r['version'] !== 'number' || (r['version'] as number) < 1) {
    errors.push('version must be a number >= 1');
  }
  if (typeof r['roles'] !== 'object' || r['roles'] === null || Array.isArray(r['roles'])) {
    errors.push('roles must be an object');
  } else {
    const roles = r['roles'] as Record<string, unknown>;
    for (const [roleName, entry] of Object.entries(roles)) {
      if (typeof entry !== 'object' || entry === null) {
        errors.push(`role '${roleName}' must be an object`);
        continue;
      }
      const e = entry as Record<string, unknown>;
      if (!Array.isArray(e['allowed_tools'])) {
        errors.push(`role '${roleName}' must have allowed_tools array`);
      } else if (!(e['allowed_tools'] as unknown[]).every((t) => typeof t === 'string')) {
        errors.push(`role '${roleName}' allowed_tools must contain strings`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---- danger classes (deny regardless of mode) ----
const SECRET_PATH = /(^|\/)\.env($|\.|\/)|(^|\/)\.ssh(\/|$)|id_rsa|\.pem$|\.key$|\.codex\/auth\.json|\/\.aws\/|\/\.config\/gcloud\//i;
const SECRET_EXFIL_CMD = /\b(printenv|env)\b|\bset\b\s*$|os\.environ|process\.env|cat\s+[^|]*\.(env|pem|key)|(^|\s)(cat|less|xxd|base64)\s+[^|]*(\.ssh|id_rsa|auth\.json)/i;
const DESTRUCTIVE_CMD = /rm\s+-rf?\s+(\/|~|\$HOME)|find\s+.*-delete|\bmkfs|dd\s+.*of=\/dev\/|chmod\s+-R\s+777|:\(\)\s*\{\s*:\|:&\s*\}|(\bshutdown\b|\breboot\b)/i;
const REMOTE_EXEC_CMD = /(curl|wget)\s+[^|]*\|\s*(sh|bash)|(curl|wget)\s+.*-O-\s*\|\s*(sh|bash)/i;
const SUDO_CMD = /(^|\s)sudo\s|\bdoas\b|\bsu\s+-/i;
const PROTECTED_FRAGMENT = /(^|\/)\.git(\/|$)|(^|\/)stable(\/|$)|(^|\/)reserved_patches(\/|$)|policy\.ya?ml|promotion_policy/i;

function globMatch(globs: string[], p: string): boolean {
  return globs.some(g => {
    const re = new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$');
    return re.test(p);
  });
}

function modeRule(req: ToolRequest, inWriteSet: boolean): PolicyDecision {
  switch (req.mode) {
    case 'plan':
      return ['write_file', 'shell', 'apply_patch'].includes(req.tool) || req.isWrite
        ? { decision: 'deny', reasons: ['plan mode is read-only'] }
        : { decision: 'allow', reasons: [] };
    case 'ask':
      return req.isWrite ? { decision: 'ask', reasons: ['ask mode: confirm mutation'] }
                         : { decision: 'allow', reasons: [] };
    case 'accept_edits':
      return !req.isWrite || inWriteSet ? { decision: 'allow', reasons: [] }
                                        : { decision: 'ask', reasons: ['write outside write-set'] };
    case 'bypass_workspace':
      return { decision: 'allow', reasons: ['workspace-confirmed by oracle'] }; // disposability already checked upstream
    case 'deny_unlisted':
      return inWriteSet || !req.isWrite ? { decision: 'allow', reasons: [] }
                                        : { decision: 'deny', reasons: ['deny_unlisted: not allow-listed'] };
  }
}

/**
 * The ordered pipeline. First decisive step wins. See PERMISSION_POLICY.md.
 */
export function evaluateToolRequest(
  req: ToolRequest,
  contract: StoryContractView,
  oracle: WorkspaceOracle,
  registry?: ToolRegistry,
  role?: string,
): PolicyDecision {
  // 0. tool-registry allowlist check (before all other checks)
  if (registry && role) {
    const entry = registry.roles[role];
    if (entry && !entry.allowed_tools.includes(req.tool)) {
      return { decision: 'deny', reasons: [`tool not in role allowlist: ${req.tool}`] };
    }
  }
  const cmd = req.command ?? '';
  const resolved = (req.targetPaths ?? []).map(p => oracle.resolveRealPath(p));

  // 4. command risk parser (hard denials)
  if (SUDO_CMD.test(cmd)) return { decision: 'deny', reasons: ['sudo / privilege escalation'] };
  if (DESTRUCTIVE_CMD.test(cmd)) return { decision: 'deny', reasons: ['destructive command'] };
  if (REMOTE_EXEC_CMD.test(cmd)) return { decision: 'deny', reasons: ['remote-exec pipe'] };
  if (SECRET_EXFIL_CMD.test(cmd)) return { decision: 'deny', reasons: ['secret exfiltration command'] };

  // 5. protected-path + secret-path detector
  if (resolved.some(p => SECRET_PATH.test(p))) return { decision: 'deny', reasons: ['secret/credential path'] };
  if (req.isWrite && resolved.some(p => PROTECTED_FRAGMENT.test(p)))
    return { decision: 'deny', reasons: ['protected path write'] };

  // 3. symlink-escape: a write must stay inside the workspace
  if (req.isWrite && resolved.some(p => oracle.escapesWorkspace(p)))
    return { decision: 'deny', reasons: ['symlink/path escapes workspace'] };

  // 2. disposability for bypass_workspace is decided by the oracle, not the request
  if (req.mode === 'bypass_workspace') {
    const ok = resolved.length > 0 && resolved.every(p => oracle.isDisposableWorkspace(p));
    if (!ok) return { decision: 'deny', reasons: ['bypass_workspace requires a registry-confirmed disposable workspace'] };
  }

  // network not granted by contract
  if (req.opensNetwork && !contract.networkGranted)
    return { decision: 'ask', reasons: ['network escalation requires approval'] };

  // forbidden actions from the contract
  if (contract.forbiddenActions?.some(f => cmd.toLowerCase().includes(f.toLowerCase())))
    return { decision: 'deny', reasons: ['contract forbidden action'] };

  // 6. write-set detector
  const inWriteSet = !req.isWrite || (req.targetPaths ?? []).every(p => globMatch(contract.allowedWriteSet, p));
  // write-set is enforced here for repo-targeting modes; bypass_workspace is gated by
  // disposable-workspace containment instead (write-set is checked on the patch proposal's
  // changed_files, which are repo-relative — see validateWriteSet).
  if (req.isWrite && !inWriteSet && req.mode !== 'ask' && req.mode !== 'bypass_workspace')
    return { decision: 'deny', reasons: ['write outside allowed_write_set'] };

  // legitimate scoped-secret use → ask
  if (req.usesSecretHandle) return { decision: 'ask', reasons: ['secret use via scoped handle'] };

  // 7. mode rule
  return modeRule(req, inWriteSet);
}
