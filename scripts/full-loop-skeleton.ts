/**
 * Full-loop walking skeleton — scripted provider from story input to CHECKPOINT.
 * STORY-008.5: full_loop_reaches_checkpoint · injected_failure_recovers_via_debug_loop · no_real_provider_called
 *
 * Scenario: `add(a,b)` throws. The scripted developer proposes a wrong fix (a-b).
 * Validation FAILS. The debug loop receives the failure, banks a failure gene, calls
 * the scripted repair provider (a+b), gates the repair, applies it, re-validates.
 * Re-validation PASSES → machine-readable CHECKPOINT.
 *
 * No real LLM. No external API. No secrets. Fully deterministic.
 * Run:  node --experimental-strip-types scripts/full-loop-skeleton.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WorkspaceRegistry,
  createDisposableWorkspace,
  seedFile, commitAll,
  makeOracle, cleanupWorkspace,
} from '@codeharness/workspace-manager';
import { applyProposal, runValidation } from '@codeharness/tool-executor';
import { specConformanceGate, validateWriteSet } from '@codeharness/validator-suite';
import { canTransition } from '@codeharness/harness-core';
import {
  callFirstValid, createScriptedProvider, ProviderRegistry,
  type ModelGatewayRequest, type DeveloperOutput,
} from '@codeharness/model-gateway';
import { validateDeveloperResponse, validateDebuggerResponse } from '@codeharness/agent-output';
import { runPreflight } from '@codeharness/preflight-runner';
import {
  detectPhase, buildRoleContextPacket, validateContextPacket,
  lifecycleToTrajectory, pickStrategy,
  type ArtifactRef,
} from '@codeharness/context-manager';
import {
  bankGene as fbBankGene,
  injectRelevant as fbInjectRelevant,
  isSystemic as fbIsSystemic,
  type WarningBank,
  type FailureGene as FBFailureGene,
} from '@codeharness/failure-bank';
import {
  runDebugLoop,
  type FailureBankOps,
  type BankGene,
} from '@codeharness/debugger-runtime';

// ── Story constants ─────────────────────────────────────────────────────────

const STORY_ID = 'STORY-LOOP-FULL';

const BROKEN_MATH =
  `export function add(a: number, b: number): number { throw new Error('not implemented'); }\n`;

const CHECK_SCRIPT =
  `import { add } from '../src/math.ts';\n` +
  `if (add(2, 3) !== 5) { console.error('FAIL add(2,3)!==5'); process.exit(1); }\n` +
  `console.log('ok add(2,3)=5');\n`;

// Developer proposes a WRONG fix: a - b (causes test failure → triggers debug loop)
const WRONG_PATCH = [
  'diff --git a/src/math.ts b/src/math.ts',
  '--- a/src/math.ts',
  '+++ b/src/math.ts',
  '@@ -1 +1 @@',
  `-export function add(a: number, b: number): number { throw new Error('not implemented'); }`,
  '+export function add(a: number, b: number): number { return a - b; }',
  '',
].join('\n');

// Repair provider proposes the CORRECT fix: a + b
const REPAIR_PATCH = [
  'diff --git a/src/math.ts b/src/math.ts',
  '--- a/src/math.ts',
  '+++ b/src/math.ts',
  '@@ -1 +1 @@',
  '-export function add(a: number, b: number): number { return a - b; }',
  '+export function add(a: number, b: number): number { return a + b; }',
  '',
].join('\n');

// ── Output types ────────────────────────────────────────────────────────────

/** Machine-readable checkpoint record. Same input → same fields. */
export interface CheckpointRecord {
  story_id: string;
  provider_kind: string;
  preflight_decision: string;
  validation_status: 'passed' | 'failed';
  debug_loop_status: string;
  failure_bank_status: string;
  final_checkpoint_marker: string;
}

export interface FullLoopResult {
  reached_checkpoint: boolean;
  checkpoint: CheckpointRecord | null;
  output: string;
}

// ── Main orchestration ──────────────────────────────────────────────────────

export async function runFullLoopSkeleton(
  opts: { print?: boolean } = {},
): Promise<FullLoopResult> {
  const logs: string[] = [];
  const line = (s: string) => {
    logs.push(s);
    if (opts.print ?? true) console.log(s);
  };

  const registry = new WorkspaceRegistry();
  const contract = {
    allowedWriteSet: ['src/**'],
    forbiddenActions: ['sudo', 'real_api'],
  };
  const acceptance = {
    commands_must_pass: [`node --experimental-strip-types test/check.ts`],
    acceptance_criteria: { behaviors_must_pass: ['add_2_3_equals_5'] },
  };

  const ws = createDisposableWorkspace(registry, { story_id: STORY_ID });
  const oracle = makeOracle(registry);
  line(`[full-loop] workspace: ${ws.workspace_id}  (disposable=${ws.disposable})  @ ${ws.root}`);

  // In-memory failure bank (no file I/O required for the skeleton)
  const bank: WarningBank = { schema_version: 'failure_bank/v1', updated_at: '', bank: [] };
  let bankResultStr = 'empty';

  try {
    // ── Phase 1: Seed disposable workspace ─────────────────────────────────
    seedFile(ws, 'src/math.ts', BROKEN_MATH);
    seedFile(ws, 'test/check.ts', CHECK_SCRIPT);
    commitAll(ws, `seed ${STORY_ID} (add throws)`);
    line(`[workspace] seeded and committed: src/math.ts + test/check.ts`);

    // ── Phase 2: Context Manager — developer lifecycle phase detection ──────
    const devLifecycle = detectPhase({ storyStatus: 'in_progress' });
    line(`[context-mgr] developer lifecycle phase: ${devLifecycle}`);
    const devTrajectory = lifecycleToTrajectory(devLifecycle);
    line(`[context-mgr] compression trajectory: ${devTrajectory} → ${pickStrategy(devTrajectory)}`);

    const devArtifacts: ArtifactRef[] = [
      { name: 'story_contract',      ref: `contract/${STORY_ID}/v1`,   tokenCount: 100, priority: 1 },
      { name: 'relevant_files',      ref: `ws/src/math.ts`,            tokenCount: 50,  priority: 2 },
      { name: 'allowed_write_set',   ref: `contract/write_set`,        tokenCount: 10,  priority: 1 },
      { name: 'validation_commands', ref: `contract/validation_cmds`,  tokenCount: 20,  priority: 1 },
      { name: 'failure_genes',       ref: `failure_bank/empty`,        tokenCount: 0,   priority: 3 },
    ];
    const devCtxPacket = buildRoleContextPacket('developer', devArtifacts);
    const devCtxVal = validateContextPacket(devCtxPacket);
    line(
      `[context-mgr] developer context packet: ` +
      `${devCtxVal.ok ? 'valid' : 'INVALID: ' + devCtxVal.errors.join(', ')}  ` +
      `(role=${devCtxPacket.role} sections=${devCtxPacket.sections.length})`,
    );

    // ── Phase 3: Model gateway — scripted developer provider ────────────────
    const developerOutput: DeveloperOutput = {
      kind: 'patch_proposal',
      proposal_id: 'P-WRONG-001',
      story_id: STORY_ID,
      contract_id: 'C-LOOP-001',
      contract_version: 1,
      summary: 'Implement add as subtraction (intentionally wrong — exercise debug loop)',
      change_type: 'MODIFY',
      changed_files: ['src/math.ts'],
      patch_branch: ws.workspace_id,
      patch_text: WRONG_PATCH,
      rollback_notes: 'git checkout -- src/math.ts',
      postconditions_claimed: ['add_2_3_equals_5'],
      proposed_at: '2026-06-11T00:00:00.000Z',
      status: 'proposed',
    };

    const providers = new ProviderRegistry();
    providers.register(createScriptedProvider('scripted-developer-loop', [{
      case_id: 'wrong-add-fix',
      match: { target_agent: 'developer', task_class: 'patch_generation', story_id: STORY_ID },
      output: developerOutput,
    }]));

    const devReq: ModelGatewayRequest = {
      request_id: 'REQ-FULL-001',
      target_agent: 'developer',
      task_class: 'patch_generation',
      story_id: STORY_ID,
      task_packet: { task_goal: 'Implement add(a, b)', allowed_write_set: contract.allowedWriteSet },
    };

    const devResult = await callFirstValid(providers, ['scripted-developer-loop'], devReq);
    line(
      `[model-gateway] developer: ${devResult.ok ? 'PASS' : 'FAIL'}` +
      `  provider_kind=${devResult.provider_kind}  kind=${devResult.output?.kind ?? 'none'}`,
    );
    if (!devResult.ok || !devResult.output || devResult.output.kind !== 'patch_proposal') {
      return { reached_checkpoint: false, checkpoint: null, output: logs.join('\n') };
    }

    const proposal = devResult.output as DeveloperOutput & Record<string, unknown>;

    // ── Phase 4: Agent-output validation (shallow) ──────────────────────────
    const aoVal = validateDeveloperResponse(
      proposal as { kind?: string } & Record<string, unknown>,
    );
    line(`[agent-output] developer output validation: ${aoVal.ok ? 'PASS' : 'FAIL'}  ${aoVal.errors.join(', ')}`);
    if (!aoVal.ok) return { reached_checkpoint: false, checkpoint: null, output: logs.join('\n') };

    // ── Phase 5: Preflight — advisory self-check (not the story verdict) ────
    const preflightInput: Record<string, unknown> = {
      ...proposal,
      story_id: STORY_ID,
      validation_results: {
        'pnpm typecheck': true,
        'pnpm test --filter affected': true,
      },
      self_correction_attempts: 0,
      same_signature_count: 0,
    };
    const preflight = await runPreflight(preflightInput, ws);
    line(
      `[preflight] advisory: verdict=${preflight.verdict}  passed=${preflight.passed}` +
      `  (advisory only — not the story verdict)`,
    );
    line(`  transition: DEVELOPER_PATCH_PROPOSAL → DEVELOPER_PREFLIGHT = ${canTransition('DEVELOPER_PATCH_PROPOSAL', 'DEVELOPER_PREFLIGHT')}`);
    line(`  transition: DEVELOPER_PREFLIGHT → SPEC_CONFORMANCE_REVIEW = ${canTransition('DEVELOPER_PREFLIGHT', 'SPEC_CONFORMANCE_REVIEW')}`);

    // ── Phase 6: Spec-conformance gate (HARD) ──────────────────────────────
    const gate = specConformanceGate({
      proposal,
      contract: {
        allowed_write_set: contract.allowedWriteSet,
        acceptance_criteria: acceptance.acceptance_criteria,
      },
    });
    line(`[spec-gate] spec conformance: ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.ok ? '' : JSON.stringify(gate.errors)}`);
    if (!gate.ok) return { reached_checkpoint: false, checkpoint: null, output: logs.join('\n') };

    // ── Phase 7: Permission gateway + apply in disposable workspace ─────────
    const diffPath = path.join(ws.root, '_proposal.diff');
    fs.writeFileSync(diffPath, String(proposal.patch_text));

    const applied = applyProposal({
      ws, diffPath,
      changedFiles: proposal.changed_files as string[],
      contract, oracle,
    });
    line(`[apply] gateway+apply: ${applied.applied ? 'APPLIED' : 'BLOCKED'}  decision=${applied.decision.decision}`);
    if (!applied.applied) return { reached_checkpoint: false, checkpoint: null, output: logs.join('\n') };
    line(`  transition: WORKSPACE_APPLY → VALIDATION = ${canTransition('WORKSPACE_APPLY', 'VALIDATION')}`);

    // ── Phase 8: First validation — expected to FAIL (wrong patch a-b) ──────
    const verdict1 = runValidation(ws, acceptance.commands_must_pass);
    line(`[validation-1] ${verdict1.passed ? 'PASS' : 'FAIL'}  (expected FAIL — wrong implementation returns a-b)`);
    verdict1.results.forEach(r =>
      line(`  $ ${r.command} → ${r.ok ? 'ok' : 'FAIL: ' + r.output.slice(0, 120)}`),
    );

    if (verdict1.passed) {
      // Shouldn't happen but handle gracefully
      line('[WARNING] first validation unexpectedly passed — debug loop skipped');
      const cp: CheckpointRecord = {
        story_id: STORY_ID,
        provider_kind: devResult.provider_kind,
        preflight_decision: preflight.verdict,
        validation_status: 'passed',
        debug_loop_status: 'skipped',
        failure_bank_status: bankResultStr,
        final_checkpoint_marker: 'CHECKPOINT REACHED ✓',
      };
      line('');
      line(JSON.stringify(cp, null, 2));
      line('');
      line('CHECKPOINT REACHED ✓');
      return { reached_checkpoint: true, checkpoint: cp, output: logs.join('\n') };
    }

    // ── Phase 9: Context Manager — debugger context after failure ────────────
    const debugLifecycle = detectPhase({
      validationPassed: false,
      storyStatus: 'debugging',
      failureCount: 1,
    });
    line(`[context-mgr] debugger lifecycle phase: ${debugLifecycle}`);
    const debugTrajectory = lifecycleToTrajectory(debugLifecycle);
    line(`[context-mgr] compression trajectory: ${debugTrajectory} → ${pickStrategy(debugTrajectory)}`);

    const debugArtifacts: ArtifactRef[] = [
      { name: 'failed_logs',            ref: `validation/${STORY_ID}/run1/stderr`, tokenCount: 200, priority: 1 },
      { name: 'current_patch',          ref: `patches/${STORY_ID}/001`,            tokenCount: 100, priority: 1 },
      { name: 'affected_codegraph',     ref: `codegraph/src/math`,                  tokenCount: 50,  priority: 2 },
      { name: 'debug_attempts',         ref: `state/${STORY_ID}/debug_attempts`,    tokenCount: 10,  priority: 1 },
      { name: 'matching_failure_genes', ref: `failure_bank/${STORY_ID}/relevant`,   tokenCount: 50,  priority: 2 },
    ];
    const debugCtxPacket = buildRoleContextPacket('debugger', debugArtifacts);
    const debugCtxVal = validateContextPacket(debugCtxPacket);
    line(
      `[context-mgr] debugger context packet: ` +
      `${debugCtxVal.ok ? 'valid' : 'INVALID: ' + debugCtxVal.errors.join(', ')}  ` +
      `(role=${debugCtxPacket.role} sections=${debugCtxPacket.sections.length})`,
    );

    // ── Phase 10: Debug loop ────────────────────────────────────────────────
    line(`  transition: VALIDATION → DEBUG_LOOP = ${canTransition('VALIDATION', 'DEBUG_LOOP')}`);

    // Scripted repair proposal (correct fix: a + b)
    const repairOutput = {
      kind: 'repair_proposal' as const,
      proposal_id: 'REPAIR-001',
      story_id: STORY_ID,
      changed_files: ['src/math.ts'],
      rollback_notes: 'git checkout -- src/math.ts',
      patch_text: REPAIR_PATCH,
    };

    const bankOps: FailureBankOps = {
      bankGene(gene: BankGene) {
        const fbGene = gene as unknown as FBFailureGene;
        const r = fbBankGene(bank, fbGene);
        bankResultStr = r === 'added' ? 'gene_banked'
          : r === 'merged' ? 'gene_merged'
          : 'bank_full';
      },
      injectRelevant(context: string, maxK?: number) {
        const genes = fbInjectRelevant(bank, context, maxK);
        return genes as unknown as BankGene[];
      },
      isSystemic(gene: BankGene) {
        // Look up the possibly-merged entry in the bank
        const found = bank.bank.find(g =>
          g.matching_signal.split('|').some(t => gene.matching_signal.includes(t.trim())),
        );
        if (found) return fbIsSystemic(found);
        return gene.consolidated_count >= 2;
      },
    };

    const failingVerdict: {
      passed: false;
      results: Array<{ command: string; ok: boolean; output: string }>;
    } = { passed: false, results: verdict1.results };

    const debugResult = runDebugLoop({
      storyId: STORY_ID,
      failingVerdict,
      allowedWriteSet: contract.allowedWriteSet,
      maxAttempts: 3,
      bankOps,
      validateDebuggerOutput: (o) =>
        validateDebuggerResponse(o as { kind?: string } & Record<string, unknown>),
      validateWriteSet: (files, allowedSet) => validateWriteSet(files, allowedSet),
      repairProvider: (_ctx) => repairOutput,
      applyAndValidate: (p) => {
        try {
          const patchText = String((p as Record<string, unknown>).patch_text ?? '');
          if (!patchText) {
            return { applied: false, passed: false, error: 'no patch_text in repair proposal' };
          }
          const repairDiff = path.join(ws.root, '_repair.diff');
          fs.writeFileSync(repairDiff, patchText);
          const repairApplied = applyProposal({
            ws, diffPath: repairDiff, changedFiles: p.changed_files, contract, oracle,
          });
          if (!repairApplied.applied) {
            return {
              applied: false, passed: false,
              error: repairApplied.decision.reasons.join(', '),
            };
          }
          const v = runValidation(ws, acceptance.commands_must_pass);
          return { applied: true, passed: v.passed };
        } catch (e) {
          return { applied: false, passed: false, error: String(e) };
        }
      },
      clock: () => '2026-06-11T00:00:00.000Z',
      idGen: () => `fg_STORY_LOOP_FULL_test`,
    });

    line(`[debug-loop] result: kind=${debugResult.kind}  attempts=${debugResult.attempts}`);
    if (debugResult.kind === 'escalated') {
      line(`  escalation reason: ${(debugResult as { reason: string }).reason}`);
    } else {
      line(`  summary: ${(debugResult as { summary: string }).summary}`);
    }
    line(`[failure-bank] gene status after debug loop: ${bankResultStr}`);
    line(`  bank size: ${bank.bank.length} active gene(s)`);

    if (debugResult.kind !== 'validated') {
      return { reached_checkpoint: false, checkpoint: null, output: logs.join('\n') };
    }

    // ── Phase 11: Context Manager — checkpoint lifecycle phase ───────────────
    const cpLifecycle = detectPhase({ checkpointMarker: true });
    line(`[context-mgr] checkpoint lifecycle phase: ${cpLifecycle}`);
    line(`  transition: VALIDATION → CHECKPOINT = ${canTransition('VALIDATION', 'CHECKPOINT')}`);

    // ── Phase 12: Machine-readable checkpoint ───────────────────────────────
    const checkpoint: CheckpointRecord = {
      story_id: STORY_ID,
      provider_kind: devResult.provider_kind,
      preflight_decision: preflight.verdict,
      validation_status: 'passed',
      debug_loop_status: debugResult.kind,
      failure_bank_status: bankResultStr,
      final_checkpoint_marker: 'CHECKPOINT REACHED ✓',
    };

    line('');
    line(JSON.stringify(checkpoint, null, 2));
    line('');
    line('CHECKPOINT REACHED ✓');

    return { reached_checkpoint: true, checkpoint, output: logs.join('\n') };
  } finally {
    cleanupWorkspace(registry, ws);
    line(`[cleanup] workspace removed (exists=${fs.existsSync(ws.root)})`);
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await runFullLoopSkeleton({ print: true });
  process.exit(result.reached_checkpoint ? 0 : 1);
}
