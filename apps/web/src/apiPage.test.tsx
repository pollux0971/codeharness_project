import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TierHistory, ShadowEvalPanel, EnablementWizard } from './ApiPage';

describe('api-page', () => {
  it('per_attempt_tier_and_reason_visible', () => {
    const entries = [
      { attempt: 1, tier: 'cheap' as const, escalation_reason: null },
      { attempt: 2, tier: 'strong' as const, escalation_reason: 'gene_match' as const },
    ];
    render(<TierHistory entries={entries} />);
    expect(screen.getByText('cheap')).toBeTruthy();
    expect(screen.getByText('strong')).toBeTruthy();
    expect(screen.getByText(/gene_match/)).toBeTruthy();
  });

  it('shadow_eval_results_rendered', () => {
    const results = [
      { model_ref: 'test/model-v1', pass_rate: 1.0, status_after: 'active' as const },
      { model_ref: 'test/model-v2', pass_rate: 0.5, status_after: 'candidate' as const },
    ];
    render(<ShadowEvalPanel results={results} />);
    expect(screen.getByText('test/model-v1')).toBeTruthy();
    expect(screen.getByText('active')).toBeTruthy();
    expect(screen.getByText('candidate')).toBeTruthy();
  });

  it('enablement_wizard_guides_but_cannot_flip', () => {
    render(<EnablementWizard
      steps={['Step 1: Read runbook', 'Step 2: Set env var', 'Step 3: Confirm in policy.yaml']}
      currentStep={1}
      gateCurrentlyEnabled={false}
    />);
    expect(document.querySelector('[data-testid="enablement-wizard-guide-only"]')).toBeTruthy();
    // No button that says "enable" or "flip"
    expect(screen.queryAllByRole('button', { name: /enable now|flip gate/i }).length).toBe(0);
    // Steps are visible
    expect(screen.getByText(/Step 1/)).toBeTruthy();
  });
});
