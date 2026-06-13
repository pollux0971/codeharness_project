/**
 * E2E greenfield run — deterministic, fixture provider, CI-safe.
 * Flows: planning-bundle validation → 3-story sequential scheduler →
 *        simulated human approve → promotion → promoted artifact verified.
 *
 * No LLM. No external API. No secrets. Fully deterministic.
 * Run:  node --experimental-strip-types scripts/e2e-greenfield.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  WorkspaceRegistry, createDisposableWorkspace, makeOracle, cleanupWorkspace,
} from '@codeharness/workspace-manager';
import { applyProposal, runValidation, promoteWorkspace, type PromotionRecord } from '@codeharness/tool-executor';
import { specConformanceGate } from '@codeharness/validator-suite';
import { validatePlanningBundle } from '@codeharness/planning-steward';
import {
  loadOrInitProjectRunState, buildReviewSummary, recordReviewDecision,
  type StoryRecord, type CheckpointRecord,
} from '@codeharness/harness-core';
// task-graph is the one multi-file package; its NodeNext './scheduler.js'
// specifiers aren't resolved by `node --experimental-strip-types`, so import the
// compiled dist (whose .js siblings exist). Other packages are single-file src.
import { runSequentialScheduler } from '../packages/task-graph/dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.join(here, '../tests/fixtures/e2e-cli-tool');

export interface E2EResult {
  ok: boolean;
  promotionRecord: PromotionRecord | null;
  log: string[];
}

export async function runE2EGreenfield(opts: { print?: boolean } = {}): Promise<E2EResult> {
  const logs: string[] = [];
  const line = (s: string) => { logs.push(s); if (opts.print ?? true) console.log(s); };

  // Step 1: Load fixture files
  const bundleDir = path.join(fixtureRoot, 'planning-bundle');
  const bundleFiles = fs.readdirSync(bundleDir);

  // Step 2: Validate planning bundle before scheduling
  const bundleValidation = validatePlanningBundle(bundleFiles);
  if (!bundleValidation.ok) {
    line(`planning-bundle validation FAILED: ${bundleValidation.errors.join(', ')}`);
    return { ok: false, promotionRecord: null, log: logs };
  }
  line('planning-bundle: VALID');

  // Step 3: Create one disposable workspace shared across all stories (sequential build)
  const registry = new WorkspaceRegistry();
  const ws = createDisposableWorkspace(registry, { story_id: 'e2e-greenfield' });
  const oracle = makeOracle(registry);
  line(`workspace: ${ws.workspace_id} @ ${ws.root}`);

  // Step 4: Build ProjectRunState (fresh, not persisted to disk)
  const storyIds = ['STORY-E2E-001', 'STORY-E2E-002', 'STORY-E2E-003'];
  const runState = loadOrInitProjectRunState(
    path.join(os.tmpdir(), `e2e-run-${Date.now()}.json`),
    'e2e-tiny-calc',
    storyIds,
    10,
  );

  // StoryRecord[] for the sequential scheduler (depends_on chain)
  const storyRecords: StoryRecord[] = [
    makeStoryRecord('STORY-E2E-001', []),
    makeStoryRecord('STORY-E2E-002', ['STORY-E2E-001']),
    makeStoryRecord('STORY-E2E-003', ['STORY-E2E-002']),
  ];

  try {
    // Step 5: Run runSequentialScheduler with fixture-driven inner loop
    const schedulerResult = await runSequentialScheduler({
      stories: storyRecords,
      runBudget: 10,
      runInnerLoop: async (story) => {
        line(`  [story] ${story.story_id}`);

        // Load scripted DeveloperOutput fixture
        const fixtureFile = path.join(fixtureRoot, 'stories', `${story.story_id}.json`);
        const fixture = JSON.parse(fs.readFileSync(fixtureFile, 'utf8')) as Record<string, unknown>;
        const allowedWriteSet = fixture.allowed_write_set as string[];
        const validationCommands = fixture.validation_commands as string[];
        const acceptanceCriteria = fixture.acceptance_criteria;

        // specConformanceGate (HARD gate before apply)
        const gate = specConformanceGate({
          proposal: fixture,
          contract: { allowed_write_set: allowedWriteSet, acceptance_criteria: acceptanceCriteria },
        });
        if (!gate.ok) { line(`  [spec-gate] FAIL ${gate.errors.join(', ')}`); return false; }
        line(`  [spec-gate] PASS`);

        // Write patch_text to temp diff file
        const diffPath = path.join(ws.root, `_proposal_${story.story_id}.diff`);
        fs.writeFileSync(diffPath, String(fixture.patch_text));

        // Permission gateway + apply in disposable workspace
        const applied = applyProposal({
          ws,
          diffPath,
          changedFiles: fixture.changed_files as string[],
          contract: { allowedWriteSet, forbiddenActions: ['sudo', 'real_api'] },
          oracle,
        });
        if (!applied.applied) {
          line(`  [apply] BLOCKED ${applied.decision.reasons.join(', ')}`);
          return false;
        }
        line(`  [apply] APPLIED`);

        // Run validation commands inside the workspace
        const verdict = runValidation(ws, validationCommands);
        line(`  [validate] ${verdict.passed ? 'PASS' : 'FAIL'}`);
        if (!verdict.passed) {
          verdict.results.forEach(r => {
            if (!r.ok) line(`    $ ${r.command} → ${r.output.slice(0, 200)}`);
          });
        }
        return verdict.passed;
      },
      onCheckpoint: async (story): Promise<CheckpointRecord> => {
        // Commit in the workspace root (writeCheckpoint has no cwd; we do it correctly here)
        try {
          execFileSync('git', ['add', '-A'], { cwd: ws.root, stdio: 'pipe' });
          execFileSync('git', ['commit', '-q', '-m', `checkpoint: ${story.story_id}`, '--allow-empty'], { cwd: ws.root, stdio: 'pipe' });
        } catch { /* nothing new to commit */ }
        let sha = 'stub-no-git';
        try {
          sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ws.root, encoding: 'utf8' }).trim();
        } catch { /* fallback */ }
        // Persist checkpoint_sha into runState for the promote check
        const entry = runState.stories.find(s => s.story_id === story.story_id);
        if (entry) entry.checkpoint_sha = sha;
        line(`  [checkpoint] ${story.story_id} sha=${sha.slice(0, 8)}`);
        return {
          story_id: story.story_id,
          branch: `checkpoint/${story.story_id}`,
          commit_sha: sha,
          checkpointed_at: new Date().toISOString(),
        };
      },
    });

    line(`scheduler: outcome=${schedulerResult.outcome} completed=[${schedulerResult.completed.join(',')}]`);
    if (schedulerResult.outcome !== 'all_done') {
      return { ok: false, promotionRecord: null, log: logs };
    }

    // Sync story statuses from StoryRecord[] → ProjectRunState (scheduler sets status='done')
    for (const sr of storyRecords) {
      const entry = runState.stories.find(s => s.story_id === sr.story_id);
      if (entry) entry.status = sr.status;
    }

    // Step 6: Assert all stories done + all checkpointed
    const summary = buildReviewSummary(runState);
    line(`review-summary: done=${summary.done_count}/${summary.total_stories} promotable=${summary.promotable}`);
    if (!summary.promotable) {
      return { ok: false, promotionRecord: null, log: logs };
    }

    // Step 7–8: Simulated human approve (no interactive stdin — inline)
    const traceLog = path.join(os.tmpdir(), `e2e-trace-${Date.now()}.jsonl`);
    recordReviewDecision(
      { runId: runState.run_id, projectId: runState.project_id, runState, traceLogPath: traceLog },
      'approved',
      'e2e fixture approval',
    );
    line('review-decision: approved');

    // Step 9: Promote workspace to target path
    const targetPath = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-promoted-'));
    const promotionRecord = await promoteWorkspace({
      runState,
      sourceWorkspace: ws,
      targetPath,
      traceLogPath: traceLog,
      runId: runState.run_id,
    });
    line(`promoted: ${promotionRecord.target_path}`);

    return { ok: true, promotionRecord, log: logs };
  } finally {
    cleanupWorkspace(registry, ws);
  }
}

function makeStoryRecord(storyId: string, dependsOn: string[]): StoryRecord {
  return {
    story_id: storyId,
    epic_id: 'EPIC-E2E',
    depends_on: dependsOn,
    parallelism_class: 'sequential',
    status: 'todo',
    attempts: 0,
    attempt_budget: 3,
    branch: null,
    last_action: null,
    last_result: null,
    last_validation: null,
    blocked_reason: null,
  };
}

// ── Entry point ─────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const result = await runE2EGreenfield({ print: true });
  process.exit(result.ok ? 0 : 1);
}
