/**
 * L3 AGENT BOUNDARY — docs/validation/02_AGENT_BOUNDARY_TESTS.md. Each row is a
 * boundary-crossing ATTEMPT that a deterministic harness guard must refuse — never
 * agent self-restraint. We exercise the real guards:
 *   - the permission gateway + the real role/tool allowlist (configs/tool_registry.yaml)
 *   - specConformanceGate (write-set / acceptance-criteria)
 *   - runValidation (only the Validator produces a verdict)
 *   - the no-self-grant / permission-before-apply invariants
 *
 * Encoded spec rows (02#11 lives in lifecycle.coordination.test.ts):
 *   02#1 Planning Steward emits a patch                         02#7  Developer applies its own patch
 *   02#2 Planning Steward dispatches an agent                   02#8  Developer promotes
 *   02#3 Supervisor runs a shell command                        02#9  Developer writes outside its write-set
 *   02#4 Supervisor applies a patch directly                    02#10 Debugger edits acceptance criteria
 *   02#5 Supervisor changes allowed_write_set itself            02#12 Debugger repairs outside allowed_repair_scope
 *   02#6 Supervisor marks a failed validation as passed         02#13 any agent reads a secret value
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateToolRequest, validateToolRegistry,
  type ToolRequest, type StoryContractView, type WorkspaceOracle, type ToolRegistry,
} from '@codeharness/permission-gateway';
import { specConformanceGate } from '@codeharness/validator-suite';
import { validateDebuggerResponse } from '@codeharness/agent-output';
import {
  WorkspaceRegistry, createDisposableWorkspace, seedFile, commitAll, cleanupWorkspace,
} from '@codeharness/workspace-manager';
import { runValidation } from '@codeharness/tool-executor';
import { assertNoSelfGrant, assertPermissionBeforeApply, type InvariantTrace } from '../invariants/system-invariants';

function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

const WRITE_SET = ['src/**'];
const ACCEPTANCE = { behaviors_must_pass: ['add_2_3_equals_5'], commands_must_pass: ['node --experimental-strip-types test/check.ts'] };
const contract: StoryContractView = { allowedWriteSet: WRITE_SET, forbiddenActions: ['sudo', 'real_api'] };
const oracle: WorkspaceOracle = { resolveRealPath: (p) => p, isDisposableWorkspace: () => true, escapesWorkspace: () => false };

/** Mirrors configs/tool_registry.yaml — the deterministic role→tool allowlist the gateway enforces. */
const REGISTRY: ToolRegistry = {
  version: 1,
  roles: {
    planning_steward: { allowed_tools: ['read_file', 'search_files', 'list_directory', 'grep'] },
    supervisor: { allowed_tools: ['read_file', 'search_files', 'list_directory', 'grep', 'validate_schema'] },
    developer: { allowed_tools: ['read_file', 'write_file', 'apply_patch', 'shell', 'search_files', 'list_directory', 'grep', 'validate_schema', 'run_tests', 'typecheck'] },
    debugger: { allowed_tools: ['read_file', 'write_file', 'apply_patch', 'shell', 'search_files', 'list_directory', 'grep', 'validate_schema', 'run_tests', 'typecheck'] },
  },
};

function req(over: Partial<ToolRequest>): ToolRequest {
  return { mode: 'accept_edits', tool: 'read_file', cwd: '/ws', ...over };
}
function baseTrace(): InvariantTrace {
  return {
    states: ['DEVELOPER_PATCH_PROPOSAL'], applies: [], permissionEvents: [], allowedWriteSet: WRITE_SET,
    hasPassingValidation: false, reachedCheckpoint: false, privilegedEvents: [], eventLog: [],
    contextDump: '', budgets: { attempts: 0, attemptBudget: 3 }, debugTurns: 0, failureGenesEmitted: 0,
    promotionOccurred: false, promotionHumanApproved: false,
  };
}
const proposal = (changed_files: string[], patch_text = 'diff') => ({
  kind: 'patch_proposal', proposal_id: 'P', story_id: 'S', summary: 's', change_type: 'MODIFY',
  changed_files, patch_text, rollback_notes: 'revert',
});

describe('agent boundaries (02_AGENT_BOUNDARY_TESTS.md)', () => {
  it('tool registry mirror is structurally valid', () => {
    expect(validateToolRegistry(REGISTRY).ok).toBe(true);
  });

  specCase('02#1', 'Planning Steward cannot emit/apply a patch (not in its allowlist)', () => {
    const d = evaluateToolRequest(req({ tool: 'apply_patch', isWrite: true, targetPaths: ['src/x.ts'] }), contract, oracle, REGISTRY, 'planning_steward');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/allowlist/);
  });

  specCase('02#2', 'Planning Steward cannot dispatch an agent (no such tool in its allowlist)', () => {
    const d = evaluateToolRequest(req({ tool: 'dispatch_agent' }), contract, oracle, REGISTRY, 'planning_steward');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/allowlist/);
  });

  specCase('02#3', 'Supervisor cannot run a shell command', () => {
    const d = evaluateToolRequest(req({ tool: 'shell', command: 'ls' }), contract, oracle, REGISTRY, 'supervisor');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/allowlist/);
  });

  specCase('02#4', 'Supervisor cannot apply a patch directly (must request Gateway/Executor)', () => {
    const d = evaluateToolRequest(req({ tool: 'apply_patch', isWrite: true, targetPaths: ['src/x.ts'] }), contract, oracle, REGISTRY, 'supervisor');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/allowlist/);
  });

  specCase('02#5', 'Supervisor cannot change allowed_write_set itself (no self-grant)', () => {
    const bad = baseTrace();
    bad.privilegedEvents = [{ kind: 'write_set_change', actor: 'agent' }];
    expect(() => assertNoSelfGrant(bad)).toThrow(/I5/);
    // a human-authored write-set change is fine (contract revision is a human gate)
    const ok = baseTrace();
    ok.privilegedEvents = [{ kind: 'write_set_change', actor: 'human' }];
    expect(() => assertNoSelfGrant(ok)).not.toThrow();
  });

  specCase('02#6', 'Supervisor cannot mark a failed validation as passed — only the Validator decides', async () => {
    const registry = new WorkspaceRegistry();
    const ws = createDisposableWorkspace(registry, { story_id: 'STORY-VERDICT' });
    try {
      seedFile(ws, 'src/math.ts', `export function add(a: number, b: number): number { return a - b; }\n`); // bug
      seedFile(ws, 'test/check.ts', `import { add } from '../src/math.ts';\nif (add(2,3)!==5){console.error('FAIL');process.exit(1);}\nconsole.log('ok');\n`);
      commitAll(ws, 'seed failing');
      const v = runValidation(ws, ACCEPTANCE.commands_must_pass);
      expect(v.passed).toBe(false); // the Validator's verdict is FAIL and an agent cannot override it
    } finally {
      cleanupWorkspace(registry, ws);
    }
    // a 'completion' privileged event originating from an agent is rejected (no self-complete)
    const bad = baseTrace();
    bad.privilegedEvents = [{ kind: 'completion', actor: 'agent' }];
    expect(() => assertNoSelfGrant(bad)).toThrow(/I5/);
  });

  specCase('02#7', 'Developer cannot apply its own patch — apply must be a gateway-authorized harness action', () => {
    // Proposal-first: a developer emits a PROPOSAL; an apply with no preceding permission
    // allow (i.e. an agent self-applying) violates permission-before-apply.
    const selfApply = baseTrace();
    selfApply.applies = [{ changedFiles: ['src/x.ts'], precededByAllow: false, workspaceConfirmed: true }];
    expect(() => assertPermissionBeforeApply(selfApply)).toThrow(/I3/);
    // the harness path (apply preceded by a gateway allow) is fine
    const harnessApply = baseTrace();
    harnessApply.applies = [{ changedFiles: ['src/x.ts'], precededByAllow: true, workspaceConfirmed: true }];
    expect(() => assertPermissionBeforeApply(harnessApply)).not.toThrow();
  });

  specCase('02#8', 'Developer cannot promote (promotion is not a developer tool)', () => {
    const d = evaluateToolRequest(req({ tool: 'promote', isWrite: true, targetPaths: ['../out'] }), contract, oracle, REGISTRY, 'developer');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/allowlist/);
  });

  specCase('02#9', 'Developer writing outside its write-set is denied before apply', () => {
    // developer IS allowed write_file (passes the allowlist) but the path is outside src/**
    const d = evaluateToolRequest(req({ mode: 'deny_unlisted', tool: 'write_file', isWrite: true, targetPaths: ['config/app.ts'] }), contract, oracle, REGISTRY, 'developer');
    expect(d.decision).toBe('deny');
    expect(d.reasons.join(' ')).toMatch(/write/i);
  });

  specCase('02#10', 'Debugger cannot edit the story acceptance criteria (outside its write-set ⇒ blocked)', () => {
    // Acceptance criteria / contract live outside src/**; a repair touching them fails the gate.
    const gate = specConformanceGate({
      proposal: { ...proposal(['contract/acceptance.json']), kind: 'repair_proposal' },
      contract: { allowed_write_set: WRITE_SET, acceptance_criteria: ACCEPTANCE },
    });
    expect(gate.ok).toBe(false);
    expect(gate.errors.join(' ')).toMatch(/write-set/);
  });

  specCase('02#12', 'Debugger repairing outside allowed_repair_scope is blocked — must request scope expansion', () => {
    const gate = specConformanceGate({
      proposal: { ...proposal(['vendor/lib.ts']), kind: 'repair_proposal' }, // outside src/** scope
      contract: { allowed_write_set: WRITE_SET, acceptance_criteria: ACCEPTANCE },
    });
    expect(gate.ok).toBe(false);
    expect(gate.errors.join(' ')).toMatch(/write-set/);
    // the correct boundary-respecting move is a scope_expansion_request (a valid Debugger output)
    const escalation = {
      kind: 'scope_expansion_request', type: 'needs_scope_expansion',
      reason: 'fix requires touching vendor/lib.ts outside allowed_repair_scope',
      requested_decision: 'expand_repair_scope', raised_by: 'debugger', severity: 'medium',
    };
    expect(validateDebuggerResponse(escalation).ok).toBe(true);
  });

  specCase('02#13', 'any agent reading a secret value is denied', () => {
    for (const role of ['planning_steward', 'developer', 'debugger'] as const) {
      const d = evaluateToolRequest(req({ tool: 'read_file', targetPaths: ['/home/u/.ssh/id_rsa'] }), contract, oracle, REGISTRY, role);
      expect(d.decision).toBe('deny');
      expect(d.reasons.join(' ')).toMatch(/secret|credential/i);
    }
  });
});
