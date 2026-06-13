import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeneBrowser, ImpactViewer, ConventionsProfile, CompactionStats, AnalysisPage } from './AnalysisPage';

const genes = [
  { id: 'g1', failure_type: 'test_failure', summary: 'Divide crashes', consolidated_count: 3, status: 'resolved', proven_remedy: 'Add guard', matching_signal: 'src:calc' },
  { id: 'g2', failure_type: 'build_error', summary: 'TS error', consolidated_count: 1, status: 'active', proven_remedy: null, matching_signal: 'src:types' },
];

describe('analysis-page', () => {
  it('gene_browser_with_remedy_pairings', () => {
    render(<GeneBrowser genes={genes} />);
    expect(screen.getByText(/Divide crashes/)).toBeTruthy();
    expect(screen.getByText(/Add guard/)).toBeTruthy();
  });

  it('impact_set_rendered_against_write_set', () => {
    render(<ImpactViewer impactedFiles={['src/calc.ts','test/x.ts']} writeSet={['src/calc.ts']} />);
    expect(screen.getByText(/src\/calc\.ts/)).toBeTruthy();
    expect(screen.getByText(/overlap/i)).toBeTruthy();
  });

  it('conventions_profile_visible', () => {
    const profile = { toolchain: { language: 'typescript', lint_tool: 'eslint' }, test_layout: { framework: 'vitest' }, summary: 'TS vitest project' };
    render(<ConventionsProfile profile={profile} />);
    expect(screen.getByText(/typescript/i)).toBeTruthy();
  });

  it('compaction_stats_visible', () => {
    render(<CompactionStats beforeTokens={10000} afterTokens={3000} pinnedSections={['acceptance']} />);
    expect(screen.getByText(/10000/)).toBeTruthy();
    expect(screen.getByText(/3000/)).toBeTruthy();
    expect(screen.getByText(/acceptance/)).toBeTruthy();
  });
});
