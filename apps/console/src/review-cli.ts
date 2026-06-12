import * as readline from 'node:readline';
import { buildReviewSummary, recordReviewDecision } from '@codeharness/harness-core';
import type { ProjectRunState } from '@codeharness/harness-core';

/** Entry point: show summary, prompt approve/deny, record decision. */
export async function runReviewCLI(opts: {
  runState: ProjectRunState;
  traceLogPath: string;
}): Promise<void> {
  const summary = buildReviewSummary(opts.runState);

  console.log('\n=== PROMOTION REVIEW ===');
  console.log(`Project : ${summary.project_id}`);
  console.log(`Run     : ${summary.run_id}`);
  console.log(`Stories : ${summary.done_count}/${summary.total_stories} done`);
  console.log(`Checkpointed : ${summary.all_checkpointed ? 'YES' : 'NO'}`);
  console.log('\nValidation evidence:');
  summary.validation_evidence.forEach(e =>
    console.log(`  ${e.story_id}  ${e.checkpoint_sha ?? '(missing)'}`)
  );
  if (!summary.promotable) {
    console.log('\n[BLOCKED] Run is not fully checkpointed. Cannot promote.');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve =>
    rl.question('\nApprove promotion? [approve/deny + reason]: ', resolve)
  );
  rl.close();

  const [decision, ...rest] = answer.trim().split(' ');
  const reason = rest.join(' ');

  const outcome = decision?.toLowerCase() === 'approve' ? 'approved' : 'denied';
  const recorded = recordReviewDecision(
    { runId: summary.run_id, projectId: summary.project_id,
      runState: opts.runState, traceLogPath: opts.traceLogPath },
    outcome,
    reason || (outcome === 'approved' ? 'operator approved' : '')
  );

  console.log(`\nDecision recorded: ${recorded.outcome} (${recorded.decision_id})`);
}
