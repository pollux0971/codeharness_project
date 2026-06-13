import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiagnosisPanel } from './DiagnosisPanel';
import type { DiagnosisReport } from '@codeharness/validator-suite';

const report: DiagnosisReport = {
  report_id:              'dr-001',
  story_id:               'STORY-X',
  failure_classification: 'test_assertion_mismatch',
  root_cause_hypotheses: [
    { hypothesis: 'Division not guarded against zero.', confidence: 0.9, evidence_lines: [] },
    { hypothesis: 'Test expectations outdated.',        confidence: 0.4, evidence_lines: [] },
  ],
  improvement_directions: [
    { direction_type: 'change_implementation', rationale: 'Add a zero guard.', affected_files: ['src/calc.ts'] },
  ],
  do_not_touch:            ['test/calc.test.ts'],
  referenced_gene_signals: [],
  reviewer_model:          'scripted-v1',
  reviewed_at:             '2026-01-01T00:00:00Z',
};

describe('diagnosis-panel', () => {
  it('diagnosis_panel_renders_ranked_directions', () => {
    render(<DiagnosisPanel reports={[report]} />);
    expect(screen.getByText(/Division not guarded/)).toBeTruthy();
    expect(screen.getByText(/Test expectations/)).toBeTruthy();

    const allText = document.body.innerText ?? document.body.textContent ?? '';
    const divIdx  = allText.indexOf('Division not guarded');
    const testIdx = allText.indexOf('Test expectations');
    expect(divIdx).toBeLessThan(testIdx);
  });

  it('panel_shows_reviewer_model', () => {
    render(<DiagnosisPanel reports={[report]} />);
    expect(screen.getByText(/scripted-v1/)).toBeTruthy();
  });
});
