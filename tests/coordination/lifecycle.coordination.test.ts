/**
 * L3 COORDINATION TEMPLATE — the develop ↔ debug ↔ escalate loop, end to end, no LLM.
 *
 * This is the pattern every 00_RUNTIME_WORKFLOW_STABILITY_TESTS.md row clones. It extends
 * the single-agent walking skeleton to the MULTI-agent failure path: a patch that validates
 * is the happy case (already covered by the skeleton); here we cover the rows the skeleton
 * does NOT — validation failure routing to the Debugger, a repair that still fails on the
 * same signature, and budget-driven escalation to a human gate.
 *
 * Everything except the model is the real harness. Scripted providers play the Developer and
 * Debugger brains; the orchestrator, gates, permission gateway, validator, and state table are
 * real. At the end of each run we assert the full invariant set.
 *
 * Encoded spec rows (see docs/validation/):
 *   00#7  validation fails → routed to Debug Loop
 *   00#8  repair fails, same root, within budget → back to Debugger
 *   00#10 same failure signature ×2 / budget exhausted → escalate to human gate
 *   01#*  all 8 runtime invariants (via assertAllInvariants)
 *   02#11 Debugger deletes a test to force PASS → rejected (negative case below)
 */
import { describe, it, expect } from 'vitest';
import {
  WorkspaceRegistry, createDisposableWorkspace, seedFile, commitAll, makeOracle, cleanupWorkspace,
} from '@codeharness/workspace-manager';
import { applyProposal, runValidation } from '@codeharness/tool-executor';
import { specConformanceGate } from '@codeharness/validator-suite';
import { canTransition, type HarnessState } from '@codeharness/harness-core';
import {
  classifyFailure, buildFailureSignature, decideRepairRoute, emitFailureGene,
} from '@codeharness/debugger-runtime';
import {
  callFirstValid, createScriptedProvider, ProviderRegistry, type DeveloperOutput,
} from '@codeharness/model-gateway';
import type { DebuggerOutput } from '@codeharness/agent-output';
import { assertAllInvariants, type InvariantTrace } from '../invariants/system-invariants';

/** Tags a test with the spec row it covers, so scripts/test-all.ts can build the coverage manifest. */
function specCase(rowId: string, name: string, fn: () => Promise<void> | void) {
  it(`[${rowId}] ${name}`, fn);
}

const STORY = 'STORY-COORD-1';
const WRITE_SET = ['src/**'];
const ACCEPTANCE = { behaviors_must_pass: ['add_2_3_equals_5'], commands_must_pass: ['node --experimental-strip-types test/check.ts'] };

/** A patch that does NOT fix the bug (still throws) — used to force the failure path. */
const STILL_BROKEN_PATCH =
  `diff --git a/src/math.ts b/src/math.ts\n--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1 +1 @@\n` +
  `-export function add(a: number, b: number): number { throw new Error('not implemented'); }\n` +
  `+export function add(a: number, b: number): number { return a - b; }\n`; // wrong: subtraction

/** A correct repair. */
const CORRECT_PATCH =
  `diff --git a/src/math.ts b/src/math.ts\n--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1 +1 @@\n` +
  `-export function add(a: number, b: number): number { return a - b; }\n` +
  `+export function add(a: number, b: number): number { return a + b; }\n`;

function developerOutput(patch_text: string, id: string): DeveloperOutput {
  return {
    kind: 'patch_proposal', proposal_id: id, story_id: STORY, contract_id: 'C1', contract_version: 1,
    summary: 'scripted developer output', change_type: 'MODIFY', changed_files: ['src/math.ts'],
    patch_branch: 'b', patch_text, rollback_notes: 'git checkout -- src/math.ts',
    postconditions_claimed: ['add_2_3_equals_5'], proposed_at: new Date().toISOString(), status: 'proposed',
  };
}

/** A scripted Debugger repair: identical payload to a developer patch but kind
 *  'repair_proposal' — the shape validateDebuggerResponse requires for target
 *  'debugger' (a 'patch_proposal' is a *developer* kind and is rejected). */
function debuggerRepairOutput(patch_text: string, id: string): DebuggerOutput {
  return { ...developerOutput(patch_text, id), kind: 'repair_proposal' } as DebuggerOutput;
}

describe('coordination: develop ↔ debug ↔ escalate', () => {
  specCase('00#7,00#8,00#10', 'failed validation routes to debugger, then escalates on repeated signature', async () => {
    const registry = new WorkspaceRegistry();
    const ws = createDisposableWorkspace(registry, { story_id: STORY });
    const oracle = makeOracle(registry);

    // Trace the coordination run for the invariant assertions.
    const trace: InvariantTrace = {
      states: ['DEVELOPER_PATCH_PROPOSAL'], applies: [], permissionEvents: [], allowedWriteSet: WRITE_SET,
      hasPassingValidation: false, reachedCheckpoint: false, privilegedEvents: [], eventLog: [],
      contextDump: '', budgets: { attempts: 0, attemptBudget: 3 }, debugTurns: 0, failureGenesEmitted: 0,
      promotionOccurred: false, promotionHumanApproved: false,
    };
    const goto = (s: HarnessState) => { expect(canTransition(trace.states[trace.states.length - 1], s)).toBe(true); trace.states.push(s); };
    let seq = 0; let lastHash: string | null = null;
    const logEvent = (name: string) => { const hash = `h${seq}`; trace.eventLog.push({ seq, previous_event_hash: lastHash, hash }); lastHash = hash; seq++; return name; };

    try {
      seedFile(ws, 'src/math.ts', `export function add(a: number, b: number): number { throw new Error('not implemented'); }\n`);
      seedFile(ws, 'test/check.ts', `import { add } from '../src/math.ts';\nif (add(2,3)!==5){console.error('FAIL add(2,3)!==5');process.exit(1);}\nconsole.log('ok');\n`);
      commitAll(ws, 'seed failing story');
      logEvent('seed');

      // --- attempt 1: Developer produces a patch that still fails -------------------
      const providers = new ProviderRegistry();
      providers.register(createScriptedProvider('dev', [
        { case_id: 'dev1', match: { target_agent: 'developer', task_class: 'patch_generation', story_id: STORY }, output: developerOutput(STILL_BROKEN_PATCH, 'P1') },
      ]));
      // The Debugger, on both turns, returns a repair that does NOT change the root cause
      // (same wrong direction) → same failure signature → must escalate, not loop forever.
      providers.register(createScriptedProvider('dbg', [
        { case_id: 'dbg1', match: { target_agent: 'debugger', task_class: 'failure_repair', story_id: STORY }, output: debuggerRepairOutput(STILL_BROKEN_PATCH, 'R1') },
      ]));

      const dev = await callFirstValid(providers, ['dev'], {
        request_id: 'REQ-1', target_agent: 'developer', task_class: 'patch_generation', story_id: STORY,
        task_packet: { task_goal: 'add(2,3)=5', allowed_write_set: WRITE_SET },
      });
      expect(dev.ok).toBe(true);
      const proposal = dev.output as DeveloperOutput & Record<string, unknown>;

      // spec-conformance HARD gate (real)
      goto('DEVELOPER_PREFLIGHT'); goto('SPEC_CONFORMANCE_REVIEW');
      const gate = specConformanceGate({ proposal, contract: { allowed_write_set: WRITE_SET, acceptance_criteria: ACCEPTANCE } });
      expect(gate.ok).toBe(true); // malformed never reaches validator (invariant I-conformance)

      // permission gateway + apply (real)
      goto('WORKSPACE_APPLY');
      const fs = await import('node:fs'); const path = await import('node:path');
      const diffPath = path.join(ws.root, '_p1.diff'); fs.writeFileSync(diffPath, STILL_BROKEN_PATCH);
      const applied = applyProposal({ ws, diffPath, changedFiles: ['src/math.ts'], contract: { allowedWriteSet: WRITE_SET, forbiddenActions: ['sudo', 'real_api'] }, oracle });
      expect(applied.applied).toBe(true);
      trace.permissionEvents.push({ action: 'write src/math.ts', decision: 'allow' });
      trace.applies.push({ changedFiles: ['src/math.ts'], precededByAllow: true, workspaceConfirmed: true });
      logEvent('apply-1');

      // validation FAILS → route to debugger (spec 00#7)
      goto('VALIDATION');
      const v1 = runValidation(ws, ACCEPTANCE.commands_must_pass);
      expect(v1.passed).toBe(false);
      const log1 = v1.results.map(r => r.output).join('\n');

      const ftype = classifyFailure(ACCEPTANCE.commands_must_pass[0], log1);
      const sig1 = buildFailureSignature(ftype, log1);

      const budget = { debugger: 3, sameSignature: 2 };
      let debuggerAttempts = 0; let sameSignatureCount = 1; let route = decideRepairRoute({ sameRootCause: true, sameSignatureCount, debuggerAttempts, budget });
      expect(route).toBe('debugger'); // 00#7/00#8: stays in debug loop within budget

      // --- debug loop: each turn MUST emit exactly one failure gene -----------------
      let currentSig = sig1;
      while (route === 'debugger') {
        goto('DEBUG_LOOP');
        trace.debugTurns++;
        const gene = emitFailureGene({
          matching_signal: currentSig, summary: 'add returns wrong value', strategy: 'inspect operator in add()',
          avoid: 'do not change the test or the acceptance criteria to force a pass', failure_type: ftype, story_id: STORY,
        });
        expect(gene.matching_signal).toBe(currentSig);
        trace.failureGenesEmitted++;
        logEvent('failure-gene');

        // Debugger repair (scripted: still wrong → same signature)
        const dbg = await callFirstValid(providers, ['dbg'], {
          request_id: `REQ-DBG-${debuggerAttempts}`, target_agent: 'debugger', task_class: 'failure_repair', story_id: STORY,
          task_packet: { failure_signature: currentSig, allowed_write_set: WRITE_SET },
        });
        expect(dbg.ok).toBe(true);
        debuggerAttempts++; trace.budgets.attempts++;

        // A repair is a fresh proposal: per the harness state table DEBUG_LOOP
        // cannot jump straight to VALIDATION — the repair re-enters the apply
        // pipeline through the same gates a developer patch does.
        goto('DEVELOPER_PATCH_PROPOSAL');
        goto('DEVELOPER_PREFLIGHT');
        goto('SPEC_CONFORMANCE_REVIEW');
        goto('WORKSPACE_APPLY');
        goto('VALIDATION'); // re-validate after repair
        // Same wrong patch → same failing signature.
        const vN = runValidation(ws, ACCEPTANCE.commands_must_pass);
        const sigN = buildFailureSignature(classifyFailure(ACCEPTANCE.commands_must_pass[0], vN.results.map(r => r.output).join('\n')), vN.results.map(r => r.output).join('\n'));
        sameSignatureCount = sigN === currentSig ? sameSignatureCount + 1 : 1;
        currentSig = sigN;
        route = decideRepairRoute({ sameRootCause: true, sameSignatureCount, debuggerAttempts, budget });
      }

      // 00#10: repeated signature exhausted same-signature budget → escalate to human
      expect(route).toBe('human');
      goto('HUMAN_GATE');
      trace.privilegedEvents.push({ kind: 'completion', actor: 'human' }); // only a human resolves the gate

      // never reached checkpoint without a pass → invariant I4 holds
      trace.reachedCheckpoint = false; trace.hasPassingValidation = false;
      assertAllInvariants(trace);
    } finally {
      cleanupWorkspace(registry, ws);
      // I9 cleanup
      const fs = await import('node:fs');
      expect(fs.existsSync(ws.root)).toBe(false);
    }
  });

  // NEGATIVE coordination case: the Debugger tries to delete the test to force a PASS.
  // The spec-conformance gate / write-set must reject it — the suite never lets a
  // boundary-violating "repair" through. (spec 02#11)
  specCase('02#11', 'debugger deleting a test to force PASS is rejected', async () => {
    const deleteTestPatch =
      `diff --git a/test/check.ts b/test/check.ts\ndeleted file mode 100644\n--- a/test/check.ts\n+++ /dev/null\n`;
    const proposal = developerOutput(deleteTestPatch, 'R-BAD');
    (proposal as Record<string, unknown>).changed_files = ['test/check.ts']; // outside src/** write-set
    const gate = specConformanceGate({ proposal, contract: { allowed_write_set: WRITE_SET, acceptance_criteria: ACCEPTANCE } });
    expect(gate.ok).toBe(false); // changed_files ⊄ write-set → HARD gate blocks before apply
  });
});
