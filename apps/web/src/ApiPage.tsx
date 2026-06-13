export interface AttemptTierEntry {
  attempt: number;
  tier: 'cheap' | 'mid' | 'strong';
  escalation_reason?: 'failure_count' | 'gene_match' | null;
}

export interface TierHistoryProps { entries: AttemptTierEntry[] }

export function TierHistory({ entries }: TierHistoryProps): JSX.Element {
  const style = {
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
    th: { textAlign: 'left' as const, padding: '4px 8px', opacity: 0.5, fontWeight: 600, borderBottom: '1px solid rgba(230,237,243,.15)' },
    td: { padding: '4px 8px', borderBottom: '1px solid rgba(230,237,243,.08)' },
  };

  return (
    <div data-testid="tier-history">
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Per-Attempt Tier</h3>
      <table style={style.table}>
        <thead>
          <tr>
            <th style={style.th}>Attempt</th>
            <th style={style.th}>Tier</th>
            <th style={style.th}>Escalation Reason</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.attempt}>
              <td style={style.td}>{e.attempt}</td>
              <td style={style.td}>{e.tier}</td>
              <td style={style.td}>{e.escalation_reason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ShadowEvalEntry {
  model_ref: string;
  pass_rate: number;
  status_after: 'active' | 'candidate' | 'blocked';
}

export interface ShadowEvalPanelProps { results: ShadowEvalEntry[] }

export function ShadowEvalPanel({ results }: ShadowEvalPanelProps): JSX.Element {
  const style = {
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
    th: { textAlign: 'left' as const, padding: '4px 8px', opacity: 0.5, fontWeight: 600, borderBottom: '1px solid rgba(230,237,243,.15)' },
    td: { padding: '4px 8px', borderBottom: '1px solid rgba(230,237,243,.08)' },
  };

  return (
    <div data-testid="shadow-eval-panel">
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Shadow Eval Results</h3>
      <table style={style.table}>
        <thead>
          <tr>
            <th style={style.th}>Model</th>
            <th style={style.th}>Pass Rate</th>
            <th style={style.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map(r => (
            <tr key={r.model_ref}>
              <td style={style.td}>{r.model_ref}</td>
              <td style={style.td}>{(r.pass_rate * 100).toFixed(0)}%</td>
              <td style={style.td}>{r.status_after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface EnablementWizardProps {
  steps: string[];
  currentStep: number;
  gateCurrentlyEnabled: boolean;
}

export function EnablementWizard({ steps, currentStep, gateCurrentlyEnabled }: EnablementWizardProps): JSX.Element {
  const style = {
    container: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, padding: 12, border: '1px solid rgba(230,237,243,.15)', borderRadius: 4 },
    step: (i: number) => ({
      padding: '4px 0',
      opacity: i < currentStep ? 0.4 : i === currentStep ? 1 : 0.6,
      fontWeight: i === currentStep ? 600 : 400,
    }),
    status: { fontSize: 11, marginTop: 10, opacity: 0.6 },
  };

  return (
    <div data-testid="enablement-wizard-guide-only" style={style.container}>
      <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Enablement Guide</h3>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        {steps.map((step, i) => (
          <li key={i} style={style.step(i)}>{step}</li>
        ))}
      </ol>
      <p style={style.status}>
        Gate status: <strong>{gateCurrentlyEnabled ? 'enabled' : 'disabled'}</strong>
        {' '}— enablement requires human action outside this panel.
      </p>
    </div>
  );
}

export interface ApiPageProps {
  tierHistory?: AttemptTierEntry[];
  shadowEval?: ShadowEvalEntry[];
  wizard?: EnablementWizardProps;
}

export function ApiPage(props: ApiPageProps): JSX.Element {
  const { tierHistory, shadowEval, wizard } = props;

  const style = {
    page: { fontFamily: 'JetBrains Mono, monospace', fontSize: 12, padding: 16, display: 'flex', flexDirection: 'column' as const, gap: 24 },
  };

  return (
    <div data-testid="api-page" style={style.page}>
      <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 0 }}>API</h2>
      {tierHistory && <TierHistory entries={tierHistory} />}
      {shadowEval && <ShadowEvalPanel results={shadowEval} />}
      {wizard && <EnablementWizard {...wizard} />}
    </div>
  );
}
