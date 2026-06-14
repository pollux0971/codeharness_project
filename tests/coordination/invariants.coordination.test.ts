/**
 * L3 INVARIANT ENCODING — the 8 runtime invariants from docs/validation/01_RUNTIME_INVARIANTS.md,
 * encoded one specCase per row. The reusable assertions live in
 * tests/invariants/system-invariants.ts (and run at the end of every coordination/scenario
 * test); here we pin each one to its spec row and prove it BOTH ways:
 *   - a valid trace passes the assertion, and
 *   - a trace that violates the property is actually caught ("a violated invariant halts the run").
 *
 * Encoded spec rows (docs/validation/01_RUNTIME_INVARIANTS.md):
 *   01#1 Propose-not-apply / writes confined to the write-set
 *   01#2 Workspace-first
 *   01#3 Permission-before-apply
 *   01#4 Validation-before-completion
 *   01#5 No self-grant / no self-complete
 *   01#6 Raw-trace-preserved (append-only log)
 *   01#7 Secret-hygiene
 *   01#8 Budget-bounded
 */
import { describe, it, expect } from 'vitest';
import {
  assertAllInvariants,
  assertWritesInWriteSet,
  assertWorkspaceFirst,
  assertPermissionBeforeApply,
  assertValidationBeforeCompletion,
  assertNoSelfGrant,
  assertAppendOnlyLog,
  assertSecretHygiene,
  assertBudgetBounded,
  type InvariantTrace,
} from '../invariants/system-invariants';

/** Tags a test with the spec row it covers, so scripts/test-all.ts can build the coverage manifest. */
function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

/** A fully invariant-satisfying trace. Each case clones it, then violates exactly one property. */
function validTrace(): InvariantTrace {
  return {
    states: ['DEVELOPER_PATCH_PROPOSAL', 'DEVELOPER_PREFLIGHT', 'SPEC_CONFORMANCE_REVIEW', 'WORKSPACE_APPLY', 'VALIDATION', 'CHECKPOINT'],
    applies: [{ changedFiles: ['src/math.ts'], precededByAllow: true, workspaceConfirmed: true }],
    permissionEvents: [{ action: 'write src/math.ts', decision: 'allow' }],
    allowedWriteSet: ['src/**'],
    hasPassingValidation: true,
    reachedCheckpoint: true,
    privilegedEvents: [{ kind: 'completion', actor: 'human' }],
    eventLog: [
      { seq: 0, previous_event_hash: null, hash: 'h0' },
      { seq: 1, previous_event_hash: 'h0', hash: 'h1' },
    ],
    contextDump: 'clean run: handle ref only, no credentials in context',
    budgets: { attempts: 1, attemptBudget: 3 },
    debugTurns: 0,
    failureGenesEmitted: 0,
    promotionOccurred: false,
    promotionHumanApproved: false,
  };
}

describe('runtime invariants (01_RUNTIME_INVARIANTS.md)', () => {
  specCase('01#1', 'propose-not-apply: applied files stay inside the contract write-set', () => {
    expect(() => assertWritesInWriteSet(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.applies[0].changedFiles = ['/etc/passwd', 'test/check.ts']; // outside src/**
    expect(() => assertWritesInWriteSet(bad)).toThrow(/write-set/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#2', 'workspace-first: applied diffs target a registry-confirmed workspace', () => {
    expect(() => assertWorkspaceFirst(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.applies[0].workspaceConfirmed = false;
    expect(() => assertWorkspaceFirst(bad)).toThrow(/I2/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#3', 'permission-before-apply: no apply without a preceding allow', () => {
    expect(() => assertPermissionBeforeApply(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.applies[0].precededByAllow = false;
    expect(() => assertPermissionBeforeApply(bad)).toThrow(/I3/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#4', 'validation-before-completion: checkpoint ⇒ a passing validation exists', () => {
    expect(() => assertValidationBeforeCompletion(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.reachedCheckpoint = true;
    bad.hasPassingValidation = false; // checkpoint without a PASS record
    expect(() => assertValidationBeforeCompletion(bad)).toThrow(/I4/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#5', 'no self-grant / no self-complete: privileged events never originate from an agent', () => {
    expect(() => assertNoSelfGrant(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.privilegedEvents = [{ kind: 'write_set_change', actor: 'agent' }]; // self-grant
    expect(() => assertNoSelfGrant(bad)).toThrow(/I5/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#6', 'raw-trace-preserved: append-only log keeps monotonic seq + intact hash chain', () => {
    expect(() => assertAppendOnlyLog(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.eventLog[1].previous_event_hash = 'tampered'; // broken hash chain
    expect(() => assertAppendOnlyLog(bad)).toThrow(/I6/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#7', 'secret-hygiene: no credential pattern appears in context/log/trace', () => {
    expect(() => assertSecretHygiene(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.contextDump = 'leaked provider key sk-abcdefghijklmnopqrstuvwx in the prompt';
    expect(() => assertSecretHygiene(bad)).toThrow(/I7/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });

  specCase('01#8', 'budget-bounded: recorded attempts never exceed the attempt budget', () => {
    expect(() => assertBudgetBounded(validTrace())).not.toThrow();
    const bad = validTrace();
    bad.budgets = { attempts: 4, attemptBudget: 3 }; // over budget
    expect(() => assertBudgetBounded(bad)).toThrow(/I8/);
    expect(() => assertAllInvariants(bad)).toThrow();
  });
});
