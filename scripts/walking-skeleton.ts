/**
 * Walking skeleton — provider-driven deterministic core loop, end to end, with NO LLM.
 *
 * A no-key scripted Model Gateway provider plays the Developer; everything else is the
 * real harness: createDisposableWorkspace (real git) → provider output union validation →
 * spec-conformance HARD gate → Permission Gateway (per-file) → tool-executor apply
 * (git apply) → Validator runs the story command → real PASS/FAIL verdict → state transition.
 *
 * Run:  node --experimental-strip-types scripts/walking-skeleton.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WorkspaceRegistry, createDisposableWorkspace, seedFile, commitAll, makeOracle, cleanupWorkspace,
} from '@codeharness/workspace-manager';
import { applyProposal, runValidation } from '@codeharness/tool-executor';
import { specConformanceGate } from '@codeharness/validator-suite';
import { canTransition } from '@codeharness/harness-core';
import { callFirstValid, createScriptedProvider, ProviderRegistry, type DeveloperOutput } from '@codeharness/model-gateway';

export interface WalkingSkeletonResult {
  validated: boolean;
  output: string;
}

export async function runWalkingSkeleton(opts: { print?: boolean } = {}): Promise<WalkingSkeletonResult> {
  const logs: string[] = [];
  const line = (s: string) => { logs.push(s); if (opts.print ?? true) console.log(s); };
  const registry = new WorkspaceRegistry();

  const contract = { allowedWriteSet: ['src/**'], forbiddenActions: ['sudo', 'real_api'] };
  const acceptance = { behaviors_must_pass: ['add_2_3_equals_5'], commands_must_pass: ['node --experimental-strip-types test/check.ts'] };

  const ws = createDisposableWorkspace(registry, { story_id: 'STORY-DEMO' });
  const oracle = makeOracle(registry);
  line(`workspace:        ${ws.workspace_id}  (disposable=${ws.disposable})  @ ${ws.root}`);

  try {
    seedFile(ws, 'src/math.ts', `export function add(a: number, b: number): number { throw new Error('not implemented'); }\n`);
    seedFile(ws, 'test/check.ts', `import { add } from '../src/math.ts';\nif (add(2, 3) !== 5) { console.error('FAIL add(2,3)!==5'); process.exit(1); }\nconsole.log('ok add(2,3)=5');\n`);
    commitAll(ws, 'seed story STORY-DEMO (failing)');

    const before = runValidation(ws, acceptance.commands_must_pass);
    line(`baseline verdict: ${before.passed ? 'PASS' : 'FAIL'}  (expected FAIL — add() throws)`);

    const patchText = `diff --git a/src/math.ts b/src/math.ts\n--- a/src/math.ts\n+++ b/src/math.ts\n@@ -1 +1 @@\n-export function add(a: number, b: number): number { throw new Error('not implemented'); }\n+export function add(a: number, b: number): number { return a + b; }\n`;
    const scriptedOutput: DeveloperOutput = {
      kind: 'patch_proposal',
      proposal_id: 'P1', story_id: 'STORY-DEMO', contract_id: 'C1', contract_version: 1,
      summary: 'Replace the throwing add implementation with addition.', change_type: 'MODIFY',
      changed_files: ['src/math.ts'], patch_branch: ws.workspace_id,
      patch_text: patchText, rollback_notes: 'git checkout -- src/math.ts',
      postconditions_claimed: ['add_2_3_equals_5'], proposed_at: new Date().toISOString(), status: 'proposed',
    };
    const providers = new ProviderRegistry();
    providers.register(createScriptedProvider('scripted-demo-developer', [{
      case_id: 'demo-add-fix', match: { target_agent: 'developer', task_class: 'patch_generation', story_id: 'STORY-DEMO' }, output: scriptedOutput,
    }]));
    const modelResult = await callFirstValid(providers, ['scripted-demo-developer'], {
      request_id: 'REQ-STORY-DEMO-001', target_agent: 'developer', task_class: 'patch_generation', story_id: 'STORY-DEMO',
      task_packet: { task_goal: 'Make add(2,3) equal 5', allowed_write_set: contract.allowedWriteSet },
    });
    line(`model-gateway:    ${modelResult.ok ? 'PASS' : 'FAIL'}  provider=${modelResult.provider_id} kind=${modelResult.output?.kind ?? 'none'}`);
    if (!modelResult.ok || !modelResult.output || modelResult.output.kind !== 'patch_proposal') {
      return { validated: false, output: logs.join('\n') };
    }

    const proposal = modelResult.output as DeveloperOutput & Record<string, unknown>;
    const diffPath = path.join(ws.root, '_proposal.diff');
    fs.writeFileSync(diffPath, String(proposal.patch_text));

    const gate = specConformanceGate({ proposal, contract: { allowed_write_set: contract.allowedWriteSet, acceptance_criteria: acceptance } });
    line(`spec-conformance: ${gate.ok ? 'PASS' : 'FAIL'}  ${gate.ok ? '' : JSON.stringify(gate.errors)}`);
    if (!gate.ok) return { validated: false, output: logs.join('\n') };
    line(`  transition:     SPEC_CONFORMANCE_REVIEW → WORKSPACE_APPLY = ${canTransition('SPEC_CONFORMANCE_REVIEW', 'WORKSPACE_APPLY')}`);

    const applied = applyProposal({ ws, diffPath, changedFiles: proposal.changed_files as string[], contract, oracle });
    line(`gateway+apply:    ${applied.applied ? 'APPLIED' : 'BLOCKED'}  decision=${applied.decision.decision}  changed=${JSON.stringify(applied.changed_files)}`);
    if (!applied.applied) return { validated: false, output: logs.join('\n') };
    line(`  transition:     WORKSPACE_APPLY → VALIDATION = ${canTransition('WORKSPACE_APPLY', 'VALIDATION')}`);

    const after = runValidation(ws, acceptance.commands_must_pass);
    after.results.forEach(r => line(`  $ ${r.command}\n      -> ${r.ok ? 'ok' : 'FAIL'}  ${r.output}`));
    line(`validator:        ${after.passed ? 'PASS' : 'FAIL'}`);
    line(`  transition:     VALIDATION → CHECKPOINT = ${canTransition('VALIDATION', 'CHECKPOINT')}`);

    const validated = modelResult.ok && gate.ok && applied.applied && after.passed && !before.passed;
    line('');
    line(validated ? '=== STORY VALIDATED ✓ (provider-driven deterministic core ran end-to-end, no LLM) ===' : '=== NOT VALIDATED ===');
    return { validated, output: logs.join('\n') };
  } finally {
    cleanupWorkspace(registry, ws);
    line(`cleanup:          workspace removed (exists=${fs.existsSync(ws.root)})`);
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await runWalkingSkeleton({ print: true });
  process.exit(result.validated ? 0 : 1);
}
