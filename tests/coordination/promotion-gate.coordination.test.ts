/**
 * L3 PROMOTION GATE — docs/validation/05_PROMOTION_GATE_TESTS.md. Promotion is the
 * trust-boundary crossing; it is gated deterministically by validatePromotionGate
 * (every precondition must hold) plus the human-approval invariant. Apply is NOT
 * promotion, and an agent can never declare promotion complete.
 *
 * Encoded spec rows:
 *   05#1 workspace-apply passed → promotion_status = not_started (apply ≠ promotion)
 *   05#2 promotion without human approval → blocked
 *   05#3 rollback plan missing → blocked
 *   05#4 raw trace missing → blocked
 *   05#5 secret-hygiene check failed → blocked
 *   05#6 contract.promotion_allowed = false → blocked
 *   05#7 all conditions met + human approves → merge → promote → DONE
 *   05#8 agent attempts to declare promotion complete → rejected (human-only)
 */
import { describe, it, expect } from 'vitest';
import { validatePromotionGate } from '@codeharness/validator-suite';
import { isPromotable } from '@codeharness/workspace-manager';
import { canTransition } from '@codeharness/harness-core';
import { assertPromotionHumanGated, assertNoSelfGrant, type InvariantTrace } from '../invariants/system-invariants';

function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

/** Every promotion precondition satisfied; each case flips exactly one to prove it blocks. */
function allMet() {
  return {
    validationPassed: true, rollbackPlanPresent: true, tracePresent: true,
    secretHygienePassed: true, promotionAllowed: true, humanApproved: true,
  };
}
function baseTrace(): InvariantTrace {
  return {
    states: ['DEVELOPER_PATCH_PROPOSAL'], applies: [], permissionEvents: [], allowedWriteSet: ['src/**'],
    hasPassingValidation: false, reachedCheckpoint: false, privilegedEvents: [], eventLog: [],
    contextDump: '', budgets: { attempts: 0, attemptBudget: 3 }, debugTurns: 0, failureGenesEmitted: 0,
    promotionOccurred: false, promotionHumanApproved: false,
  };
}

describe('promotion gate (05_PROMOTION_GATE_TESTS.md)', () => {
  specCase('05#1', 'a passing workspace-apply leaves promotion not_started (apply ≠ promotion)', () => {
    // The story was applied but is not done/checkpointed → not promotable; promotion never started.
    expect(isPromotable({ stories: [{ status: 'in_progress', checkpoint_sha: null }] })).toBe(false);
    // The full gate also refuses: an applied-but-unvalidated, unapproved run is blocked.
    const justApplied = { ...allMet(), validationPassed: false, humanApproved: false };
    expect(validatePromotionGate(justApplied).ok).toBe(false);
  });

  specCase('05#2', 'promotion without human approval is blocked', () => {
    const res = validatePromotionGate({ ...allMet(), humanApproved: false });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/human approval/i);
  });

  specCase('05#3', 'promotion with a missing rollback plan is blocked', () => {
    const res = validatePromotionGate({ ...allMet(), rollbackPlanPresent: false });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/rollback plan missing/i);
  });

  specCase('05#4', 'promotion with a missing raw trace is blocked', () => {
    const res = validatePromotionGate({ ...allMet(), tracePresent: false });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/raw trace missing/i);
  });

  specCase('05#5', 'promotion with a failed secret-hygiene check is blocked', () => {
    const res = validatePromotionGate({ ...allMet(), secretHygienePassed: false });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/secret hygiene/i);
  });

  specCase('05#6', 'promotion with contract.promotion_allowed = false is blocked', () => {
    const res = validatePromotionGate({ ...allMet(), promotionAllowed: false });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/promotion_allowed is false/i);
  });

  specCase('05#7', 'all conditions met + human approval → gate passes and the merge→promote→DONE path is legal', () => {
    expect(validatePromotionGate(allMet()).ok).toBe(true);
    // The terminal promotion path through the state machine is legal.
    expect(canTransition('CHECKPOINT', 'PROMOTION_REVIEW')).toBe(true);
    expect(canTransition('PROMOTION_REVIEW', 'DONE')).toBe(true);
    // A human-approved promotion satisfies the human-gate invariant.
    const t = baseTrace();
    t.promotionOccurred = true; t.promotionHumanApproved = true;
    expect(() => assertPromotionHumanGated(t)).not.toThrow();
  });

  specCase('05#8', 'an agent declaring promotion complete is rejected — promotion is human-only', () => {
    // Self-complete: a 'completion' privileged event from an agent is illegal.
    const selfComplete = baseTrace();
    selfComplete.privilegedEvents = [{ kind: 'completion', actor: 'agent' }];
    expect(() => assertNoSelfGrant(selfComplete)).toThrow(/I5/);
    // And a promotion recorded without human approval is illegal regardless of who claims it.
    const noApproval = baseTrace();
    noApproval.promotionOccurred = true; noApproval.promotionHumanApproved = false;
    expect(() => assertPromotionHumanGated(noApproval)).toThrow(/promotion/i);
  });
});
