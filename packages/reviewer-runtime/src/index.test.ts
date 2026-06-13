import { describe, it, expect } from 'vitest';
import { runReviewer, type ReviewerInput } from './index.js';
import { createScriptedReviewer } from './scripted.js';
import { readJsonl } from '@codeharness/event-log';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const baseInput: ReviewerInput = {
  story_id: 'STORY-X',
  failing_test_output: 'AssertionError: expected 5 but received NaN',
  acceptance_criteria: 'divide(10, 2) === 5',
  diff_under_review:
    '-export const divide = (a, b) => a / b;\n' +
    '+export const divide = (a, b) => { if (b===0) throw new Error("DivideByZero"); return a/b; };',
  matching_genes: [],
};

const validPartialReport = {
  story_id: 'STORY-X',
  failure_classification: 'test_assertion_mismatch' as const,
  root_cause_hypotheses: [
    {
      hypothesis: 'Division by zero not guarded before arithmetic.',
      confidence: 0.9,
      evidence_lines: ['src/calc.ts:12'],
    },
  ],
  improvement_directions: [
    {
      direction_type: 'change_implementation' as const,
      rationale: 'Add zero-guard before division to prevent NaN result.',
      affected_files: ['src/calc.ts'],
    },
  ],
  do_not_touch: ['test/'],
  referenced_gene_signals: [],
};

function tmpTrace(): string {
  return join(tmpdir(), `rv-trace-${Math.floor(Math.random() * 1e9)}.jsonl`);
}

function cleanup(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

describe('reviewer-runtime', () => {
  it('reviewer_emits_schema_valid_diagnosis', async () => {
    const trace = tmpTrace();
    try {
      const strategy = createScriptedReviewer(validPartialReport);
      const result = await runReviewer(baseInput, { strategy, traceLogPath: trace });
      expect(result.valid).toBe(true);
      expect(result.validationErrors).toHaveLength(0);
    } finally {
      cleanup(trace);
    }
  });

  it('reviewer_holds_no_write_set', async () => {
    const trace = tmpTrace();
    try {
      // Inject a write_set field via a rogue partial report — must be stripped.
      const strategy = createScriptedReviewer({
        ...validPartialReport,
        write_set: ['src/**'],
      } as Record<string, unknown>);
      const result = await runReviewer(baseInput, { strategy, traceLogPath: trace });
      expect((result.report as Record<string, unknown>).write_set).toBeUndefined();
    } finally {
      cleanup(trace);
    }
  });

  it('diagnosis_written_to_trace', async () => {
    const trace = tmpTrace();
    try {
      const strategy = createScriptedReviewer(validPartialReport);
      await runReviewer(baseInput, { strategy, traceLogPath: trace });
      const events = readJsonl(trace);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('reviewer_diagnosis');
    } finally {
      cleanup(trace);
    }
  });

  it('scripted_reviewer_fills_required_fields', async () => {
    const strategy = createScriptedReviewer(validPartialReport);
    const report = await strategy.review(baseInput);
    expect(report.report_id).toBeTruthy();
    expect(report.reviewed_at).toBeTruthy();
    expect(report.reviewer_model).toBe('scripted-reviewer-v1');
  });

  it('reviewer_cannot_change_goal_or_acceptance', async () => {
    const trace = tmpTrace();
    try {
      // A rogue strategy that injects acceptance_criteria — must be stripped.
      const rogueStrategy = createScriptedReviewer({
        ...validPartialReport,
        acceptance_criteria: 'OVERRIDE',
      } as Record<string, unknown>);
      const result = await runReviewer(baseInput, {
        strategy: rogueStrategy,
        traceLogPath: trace,
      });
      expect((result.report as Record<string, unknown>).acceptance_criteria).toBeUndefined();
    } finally {
      cleanup(trace);
    }
  });
});
