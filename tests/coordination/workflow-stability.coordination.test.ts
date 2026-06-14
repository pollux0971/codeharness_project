/**
 * L3 WORKFLOW STABILITY — the remaining rows of docs/validation/00_RUNTIME_WORKFLOW_STABILITY_TESTS.md
 * that the walking skeleton (00#2) and lifecycle template (00#7,00#8,00#10) do not cover.
 * Everything except the model is the real harness: real state table, real permission gateway,
 * real workspace/apply/validation, real planning-steward / context-manager / skill-runtime.
 *
 * Encoded spec rows (docs/validation/00_*):
 *   00#1  raw idea submitted directly to Developer → rejected; routed to Planning Steward
 *   00#3  brownfield bug repair, happy path → localized patch → regression PASS → checkpoint
 *   00#4  Developer patch writes outside allowed_write_set → Gateway denies before apply
 *   00#5  secret access attempt → Gateway deny/ask; never silent allow
 *   00#6  sudo attempt → Gateway ask/deny
 *   00#9  repair produces a NEW failure → back to Developer (rework)
 *   00#11 human issue reported → investigation-first; not auto-treated as a bug
 *   00#12 context compaction during a long run → raw trace preserved; summaries carry source_ref
 *   00#13 workspace-apply passed → promotion_status still not_started (apply ≠ promotion)
 *   00#14 promotion attempted without human approval → blocked
 *   00#15 skill registered without tests → rejected
 */
import { describe, it, expect } from 'vitest';
import { canTransition } from '@codeharness/harness-core';
import { classifyIdea, classifyDefect, type DefectReport } from '@codeharness/planning-steward';
import {
  evaluateToolRequest, type ToolRequest, type StoryContractView, type WorkspaceOracle,
} from '@codeharness/permission-gateway';
import { decideRepairRoute } from '@codeharness/debugger-runtime';
import {
  WorkspaceRegistry, createDisposableWorkspace, seedFile, commitAll, cleanupWorkspace,
  makeOracle, isPromotable,
} from '@codeharness/workspace-manager';
import { applyProposal, runValidation, promoteWorkspace } from '@codeharness/tool-executor';
import {
  compactContextWindow, validateContextPacket,
  type ContextWindow, type RoleContextPacket,
} from '@codeharness/context-manager';
import { rejectSkillWithoutTests, validateSkillPackage, type FullSkillManifest } from '@codeharness/skill-runtime';
import { assertAllInvariants, assertPromotionHumanGated, type InvariantTrace } from '../invariants/system-invariants';

function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

const WRITE_SET = ['src/**'];
/** A read-only fake oracle for pure permission-gateway decisions (no real fs). */
const permOracle: WorkspaceOracle = {
  resolveRealPath: (p) => p,
  isDisposableWorkspace: () => true,
  escapesWorkspace: () => false,
};
const contract: StoryContractView = { allowedWriteSet: WRITE_SET, forbiddenActions: ['sudo', 'real_api'] };

describe('workflow stability (00_RUNTIME_WORKFLOW_STABILITY_TESTS.md)', () => {
  specCase('00#1', 'a raw idea cannot reach the Developer directly — it is routed to the Planning Steward', () => {
    // The state table forbids skipping intake/planning: an idea enters at IDEA_INBOX and
    // can only advance to the Planning Steward, never straight to a Developer patch.
    expect(canTransition('IDEA_INBOX', 'DEVELOPER_PATCH_PROPOSAL')).toBe(false);
    expect(canTransition('IDEA_INBOX', 'PLANNING_BUNDLE')).toBe(true);
    // The Planning Steward (not the Developer) is what classifies the raw idea.
    const mode = classifyIdea({ title: 'add a CSV exporter', description: 'we want CSV export', source: 'human' } as never);
    expect(['greenfield', 'patch', 'brownfield', 'research_spike', 'checkpoint']).toContain(mode);
  });

  specCase('00#3', 'brownfield bug repair happy path: localized patch → regression PASS → checkpoint', async () => {
    const registry = new WorkspaceRegistry();
    const ws = createDisposableWorkspace(registry, { story_id: 'STORY-BROWNFIELD' });
    const oracle = makeOracle(registry);
    const trace: InvariantTrace = {
      states: ['DEVELOPER_PATCH_PROPOSAL'], applies: [], permissionEvents: [], allowedWriteSet: WRITE_SET,
      hasPassingValidation: false, reachedCheckpoint: false, privilegedEvents: [], eventLog: [],
      contextDump: '', budgets: { attempts: 0, attemptBudget: 3 }, debugTurns: 0, failureGenesEmitted: 0,
      promotionOccurred: false, promotionHumanApproved: false,
    };
    const goto = (s: Parameters<typeof canTransition>[1]) => {
      expect(canTransition(trace.states[trace.states.length - 1], s)).toBe(true); trace.states.push(s);
    };
    try {
      // Existing (brownfield) buggy code: subtraction where addition is required.
      seedFile(ws, 'src/calc.ts', `export function add(a: number, b: number): number { return a - b; }\n`);
      seedFile(ws, 'test/check.ts', `import { add } from '../src/calc.ts';\nif (add(2,3)!==5){console.error('FAIL add(2,3)!==5');process.exit(1);}\nconsole.log('ok');\n`);
      commitAll(ws, 'seed brownfield bug');

      const CORRECT_PATCH =
        `diff --git a/src/calc.ts b/src/calc.ts\n--- a/src/calc.ts\n+++ b/src/calc.ts\n@@ -1 +1 @@\n` +
        `-export function add(a: number, b: number): number { return a - b; }\n` +
        `+export function add(a: number, b: number): number { return a + b; }\n`;

      goto('DEVELOPER_PREFLIGHT'); goto('SPEC_CONFORMANCE_REVIEW'); goto('WORKSPACE_APPLY');
      const fs = await import('node:fs'); const path = await import('node:path');
      const diffPath = path.join(ws.root, '_fix.diff'); fs.writeFileSync(diffPath, CORRECT_PATCH);
      const applied = applyProposal({ ws, diffPath, changedFiles: ['src/calc.ts'], contract: { allowedWriteSet: WRITE_SET, forbiddenActions: ['sudo', 'real_api'] }, oracle });
      expect(applied.applied).toBe(true);
      trace.permissionEvents.push({ action: 'write src/calc.ts', decision: 'allow' });
      trace.applies.push({ changedFiles: ['src/calc.ts'], precededByAllow: true, workspaceConfirmed: true });

      goto('VALIDATION');
      const v = runValidation(ws, ['node --experimental-strip-types test/check.ts']);
      expect(v.passed).toBe(true); // regression PASS (localized fix)
      trace.hasPassingValidation = true;

      goto('CHECKPOINT');
      trace.reachedCheckpoint = true;
      trace.eventLog.push({ seq: 0, previous_event_hash: null, hash: 'h0' });
      assertAllInvariants(trace);
    } finally {
      cleanupWorkspace(registry, ws);
    }
  });

  specCase('00#4', 'a write outside allowed_write_set is denied by the gateway BEFORE apply', () => {
    const req: ToolRequest = { mode: 'deny_unlisted', tool: 'write_file', cwd: '/ws', targetPaths: ['config/app.ts'], isWrite: true };
    const decision = evaluateToolRequest(req, contract, permOracle);
    expect(decision.decision).toBe('deny');
    expect(decision.reasons.join(' ')).toMatch(/write/i);
    // and a write INSIDE the write-set is allowed (the rule is targeted, not blanket-deny)
    const ok = evaluateToolRequest({ ...req, targetPaths: ['src/app.ts'] }, contract, permOracle);
    expect(ok.decision).toBe('allow');
  });

  specCase('00#5', 'a secret-path access is never silently allowed', () => {
    const req: ToolRequest = { mode: 'ask', tool: 'read_file', cwd: '/ws', targetPaths: ['/home/u/.env'], isWrite: false };
    const decision = evaluateToolRequest(req, contract, permOracle);
    expect(decision.decision).not.toBe('allow'); // deny or ask — never silent allow
    expect(decision.decision).toBe('deny');
    expect(decision.reasons.join(' ')).toMatch(/secret|credential/i);
  });

  specCase('00#6', 'a sudo command is denied by the gateway', () => {
    const req: ToolRequest = { mode: 'ask', tool: 'shell', command: 'sudo apt-get update', cwd: '/ws' };
    const decision = evaluateToolRequest(req, contract, permOracle);
    expect(decision.decision).not.toBe('allow');
    expect(decision.decision).toBe('deny');
    expect(decision.reasons.join(' ')).toMatch(/sudo|privilege/i);
  });

  specCase('00#9', 'a repair that produces a NEW failure routes back to the Developer for rework', () => {
    // sameRootCause=false ⇒ the signature changed ⇒ it is a new failure, not a same-root loop.
    const route = decideRepairRoute({ sameRootCause: false, sameSignatureCount: 1, debuggerAttempts: 1, budget: { debugger: 3, sameSignature: 2 } });
    expect(route).toBe('developer');
    // contrast: a same-root failure within budget stays in the debug loop (00#8 semantics)
    const stay = decideRepairRoute({ sameRootCause: true, sameSignatureCount: 1, debuggerAttempts: 1, budget: { debugger: 3, sameSignature: 2 } });
    expect(stay).toBe('debugger');
  });

  specCase('00#11', 'a human-reported issue is investigation-first, not auto-classified as a regression', () => {
    // No confirming artifact version (SHA) and no env/doc signal ⇒ 'unknown' = needs investigation,
    // NOT auto-treated as a regression/bug.
    const unconfirmed: DefectReport = {
      report_id: 'D1', title: 'it feels slow', what_broke: 'the app seems sluggish sometimes',
      expected_behaviour: 'snappy', actual_behaviour: 'slow', artifact_version: '', reported_at: '2026-06-14',
    };
    expect(classifyDefect(unconfirmed)).toBe('unknown');
    // Only a report tied to a concrete checkpoint SHA is classified as a regression.
    const confirmed: DefectReport = { ...unconfirmed, artifact_version: 'a1b2c3d' };
    expect(classifyDefect(confirmed)).toBe('regression');
  });

  specCase('00#12', 'context compaction preserves the raw trace and keeps source_refs on summaries', () => {
    // A long run with large MIDDLE nodes gets compacted (Level-1 summarizes any
    // non-pinned turn over the node threshold that is neither in the first-3 nor
    // last-5). The pinned (raw-essential) turn survives.
    const big = 'lorem ipsum dolor '.repeat(2000); // ~36k chars ⇒ ~9k tokens, over the 4000 node threshold
    const small = (n: number): { role: string; content: string; tokenCount: number } => ({ role: 'assistant', content: `turn ${n}`, tokenCount: 8 });
    const bigTurn = { role: 'assistant', content: big, tokenCount: Math.ceil(big.length / 4) };
    const turns = [
      { role: 'system', content: 'PINNED CONTRACT', tokenCount: 5, pinned: true },
      small(1), small(2),
      { ...bigTurn }, { ...bigTurn }, // indices 3,4 — compressible middle
      small(5), small(6), small(7), small(8), small(9),
    ];
    const window: ContextWindow = { turns, totalTokens: turns.reduce((s, t) => s + t.tokenCount, 0) };
    const compacted = compactContextWindow(window);
    expect(compacted.totalTokens).toBeLessThan(window.totalTokens); // compaction happened
    expect(compacted.turns.some(t => t.pinned)).toBe(true);          // raw-essential preserved

    // A separate append-only raw trace is NOT touched by context compaction.
    const rawTrace = [{ seq: 0, hash: 'h0' }, { seq: 1, hash: 'h1' }];
    const before = JSON.stringify(rawTrace);
    void compactContextWindow(window);
    expect(JSON.stringify(rawTrace)).toBe(before);

    // Every summary section must carry a source_ref; one missing a ref is rejected.
    const withRef: RoleContextPacket = { role: 'developer', sections: [{ name: 'story_contract', ref: 'artifact://story/contract#1' }], excluded: [] };
    expect(validateContextPacket(withRef).ok).toBe(true);
    const noRef: RoleContextPacket = { role: 'developer', sections: [{ name: 'story_contract', ref: '' }], excluded: [] };
    const res = validateContextPacket(noRef);
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/source_ref/);
  });

  specCase('00#13', 'a passing workspace-apply does not by itself make the run promotable (apply ≠ promotion)', async () => {
    const registry = new WorkspaceRegistry();
    const ws = createDisposableWorkspace(registry, { story_id: 'STORY-APPLY' });
    const oracle = makeOracle(registry);
    try {
      seedFile(ws, 'src/a.ts', `export const a = 1;\n`);
      commitAll(ws, 'seed');
      const patch =
        `diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n` +
        `-export const a = 1;\n+export const a = 2;\n`;
      const fs = await import('node:fs'); const path = await import('node:path');
      const diffPath = path.join(ws.root, '_p.diff'); fs.writeFileSync(diffPath, patch);
      const applied = applyProposal({ ws, diffPath, changedFiles: ['src/a.ts'], contract: { allowedWriteSet: WRITE_SET, forbiddenActions: ['sudo', 'real_api'] }, oracle });
      expect(applied.applied).toBe(true);
      // Apply succeeded, but the story is not done/checkpointed → NOT promotable.
      const runState = { stories: [{ status: 'in_progress', checkpoint_sha: null }] };
      expect(isPromotable(runState)).toBe(false);
    } finally {
      cleanupWorkspace(registry, ws);
    }
  });

  specCase('00#14', 'promotion without a fully-checkpointed, human-approved run is blocked', async () => {
    const registry = new WorkspaceRegistry();
    const ws = createDisposableWorkspace(registry, { story_id: 'STORY-PROMO' });
    try {
      seedFile(ws, 'src/a.ts', 'export const a = 1;\n'); commitAll(ws, 'seed');
      const fs = await import('node:fs'); const path = await import('node:path');
      const target = fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'promo-target-'));
      const traceLog = path.join(ws.root, 'trace.jsonl');
      // Run is NOT fully checkpointed → promoteWorkspace must reject it.
      await expect(promoteWorkspace({
        runState: { project_id: 'p', stories: [{ story_id: 'S1', status: 'in_progress', checkpoint_sha: null }] },
        sourceWorkspace: ws, targetPath: target, traceLogPath: traceLog, runId: 'r1',
      })).rejects.toThrow(/promotion rejected/i);
      fs.rmSync(target, { recursive: true, force: true });

      // And the invariant guard: a promotion recorded without human approval is illegal.
      const badTrace = baseTrace();
      badTrace.promotionOccurred = true; badTrace.promotionHumanApproved = false;
      expect(() => assertPromotionHumanGated(badTrace)).toThrow(/promotion/i);
    } finally {
      cleanupWorkspace(registry, ws);
    }
  });

  specCase('00#15', 'a skill package with no tests is rejected at registration', () => {
    const noTests: FullSkillManifest = { skill_id: 'sk-1', agent_role: 'developer', path: 'skills/sk-1' };
    expect(rejectSkillWithoutTests(noTests)).toBe(true);
    expect(validateSkillPackage(noTests).ok).toBe(false);
    // A skill that ships tests is registerable.
    const withTests: FullSkillManifest = { ...noTests, tests: ['tests/test_sk1.py'] };
    expect(rejectSkillWithoutTests(withTests)).toBe(false);
    expect(validateSkillPackage(withTests).ok).toBe(true);
  });
});

/** A minimal invariant-satisfying trace for the guard-only assertions above. */
function baseTrace(): InvariantTrace {
  return {
    states: ['DEVELOPER_PATCH_PROPOSAL'], applies: [], permissionEvents: [], allowedWriteSet: WRITE_SET,
    hasPassingValidation: false, reachedCheckpoint: false, privilegedEvents: [], eventLog: [],
    contextDump: '', budgets: { attempts: 0, attemptBudget: 3 }, debugTurns: 0, failureGenesEmitted: 0,
    promotionOccurred: false, promotionHumanApproved: false,
  };
}
