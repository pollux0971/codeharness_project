/**
 * Scripted ReviewStrategy for CI / fixture use.
 * Accepts a partial DiagnosisReport and fills in the required fields
 * (report_id, reviewed_at, reviewer_model) so tests never need to spell them out.
 * Owner: STORY-022.2
 */
import crypto from 'node:crypto';
import type { DiagnosisReport } from '@codeharness/validator-suite';
import type { ReviewStrategy, ReviewerInput } from './index.js';

/**
 * Create a ReviewStrategy that returns a fixed DiagnosisReport every call.
 * Required fields not supplied by `fixedReport` are auto-filled:
 *   - report_id: random UUID
 *   - reviewed_at: current ISO timestamp
 *   - reviewer_model: 'scripted-reviewer-v1'
 */
export function createScriptedReviewer(
  fixedReport: Partial<DiagnosisReport> & Record<string, unknown>,
): ReviewStrategy {
  return {
    async review(_input: ReviewerInput): Promise<DiagnosisReport> {
      return {
        report_id: crypto.randomUUID(),
        reviewed_at: new Date().toISOString(),
        reviewer_model: 'scripted-reviewer-v1',
        ...fixedReport,
      } as DiagnosisReport;
    },
  };
}
