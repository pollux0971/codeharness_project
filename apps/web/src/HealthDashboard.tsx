import type { CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const dim:  CSSProperties = { color: 'rgba(230,237,243,.34)' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 12, marginBottom: 10 };

// ── BudgetPanel ───────────────────────────────────────────────────────────────

export interface BudgetSnapshot {
  story_id: string;
  epic_id?: string;
  calls_used: number;
  calls_budget: number;
  tokens_used: number;
  tokens_budget: number;
  killed: boolean;
}

export interface BudgetPanelProps {
  snapshots: BudgetSnapshot[];
}

function budgetStatus(s: BudgetSnapshot): string {
  if (s.killed) return 'KILLED';
  const callsPct  = s.calls_budget  > 0 ? s.calls_used  / s.calls_budget  : 0;
  const tokensPct = s.tokens_budget > 0 ? s.tokens_used / s.tokens_budget : 0;
  if (callsPct > 0.8 || tokensPct > 0.8) return 'NEAR_LIMIT';
  return 'OK';
}

const STATUS_COLOR: Record<string, string> = {
  OK: '#7EE081',
  NEAR_LIMIT: '#F2A65A',
  KILLED: '#E57373',
};

export function BudgetPanel({ snapshots }: BudgetPanelProps): JSX.Element {
  const th: CSSProperties = { ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(230,237,243,.1)' };
  const td: CSSProperties = { ...mono, fontSize: 11.5, padding: '5px 8px', borderBottom: '1px solid rgba(230,237,243,.06)' };
  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Budget</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Story</th>
            <th style={th}>Calls</th>
            <th style={th}>Tokens</th>
            <th style={th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map(s => {
            const status = budgetStatus(s);
            return (
              <tr key={s.story_id}>
                <td style={td}>{s.story_id}{s.epic_id ? <span style={{ ...dim, marginLeft: 4 }}>[{s.epic_id}]</span> : null}</td>
                <td style={td}>{s.calls_used} / {s.calls_budget}</td>
                <td style={td}>{s.tokens_used.toLocaleString()} / {s.tokens_budget.toLocaleString()}</td>
                <td style={td}><span style={{ color: STATUS_COLOR[status] ?? '#9FB0BF', ...mono, fontSize: 11 }}>{status}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── FailureHeatmap ────────────────────────────────────────────────────────────

export interface FailureHeatmapProps {
  genes: Array<{
    id: string;
    failure_type: string;
    summary: string;
    consolidated_count: number;
    story_id: string;
  }>;
}

export function FailureHeatmap({ genes }: FailureHeatmapProps): JSX.Element {
  const groups = new Map<string, typeof genes>();
  for (const g of genes) {
    if (!groups.has(g.failure_type)) groups.set(g.failure_type, []);
    groups.get(g.failure_type)!.push(g);
  }
  const maxCount = Math.max(1, ...genes.map(g => g.consolidated_count));

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Failure Heatmap</div>
      {groups.size === 0 && <div style={{ ...dim, fontSize: 12 }}>— no failure genes —</div>}
      {Array.from(groups.entries()).map(([type, geneList]) => (
        <div key={type} style={{ marginBottom: 10 }}>
          <div style={{ ...mono, fontSize: 11, color: '#F2A65A', marginBottom: 4 }}>{type}</div>
          {geneList.map(g => {
            const intensity = g.consolidated_count / maxCount;
            const bg = `rgba(242,166,90,${(intensity * 0.35).toFixed(2)})`;
            return (
              <div key={g.id} style={{ background: bg, borderRadius: 5, padding: '4px 8px', marginBottom: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12 }}>{g.summary}</span>
                <span style={{ ...mono, fontSize: 10, color: '#F2A65A', marginLeft: 8 }}>×{g.consolidated_count}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── GateStatusPanel ───────────────────────────────────────────────────────────

export interface GateConfig {
  real_api_calls_enabled: boolean;
  kill_switch: boolean;
  ci_override: boolean;
}

export interface GateAuditEntry {
  timestamp: string;
  gate: string;
  change: string;
  operator: string;
}

export interface GateStatusPanelProps {
  config: GateConfig;
  auditLog: GateAuditEntry[];
}

const GATES: Array<{ label: string; display: string; key: keyof GateConfig }> = [
  { label: 'real_api_calls', display: 'Real API Calls', key: 'real_api_calls_enabled' },
  { label: 'kill_switch',    display: 'Kill Switch',    key: 'kill_switch' },
  { label: 'ci_override',    display: 'CI Override',    key: 'ci_override' },
];

export function GateStatusPanel({ config, auditLog }: GateStatusPanelProps): JSX.Element {
  const th: CSSProperties = { ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(230,237,243,.1)' };
  const td: CSSProperties = { ...mono, fontSize: 11.5, padding: '5px 8px', borderBottom: '1px solid rgba(230,237,243,.06)' };
  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Gate Status</div>
      <div style={{ marginBottom: 10 }}>
        {GATES.map(g => (
          <label key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'not-allowed' }}>
            <input
              type="checkbox"
              checked={config[g.key]}
              disabled
              readOnly
              style={{ cursor: 'not-allowed' }}
            />
            <span data-gate={g.label} style={{ ...mono, fontSize: 12 }}>{g.display}</span>
            <span style={{ ...mono, fontSize: 10, color: config[g.key] ? '#7EE081' : 'rgba(230,237,243,.34)' }}>
              {config[g.key] ? 'on' : 'off'}
            </span>
          </label>
        ))}
      </div>
      {auditLog.length > 0 && (
        <>
          <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 6 }}>Audit log</div>
          <div style={{ maxHeight: 140, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Time</th>
                  <th style={th}>Gate</th>
                  <th style={th}>Change</th>
                  <th style={th}>Operator</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((e, i) => (
                  <tr key={i}>
                    <td style={td}>{e.timestamp}</td>
                    <td style={td}>{e.gate}</td>
                    <td style={td}>{e.change}</td>
                    <td style={td}>{e.operator}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── HealthDashboard ───────────────────────────────────────────────────────────

export interface HealthDashboardProps {
  budgetSnapshots: BudgetSnapshot[];
  failureGenes: FailureHeatmapProps['genes'];
  gateConfig: GateConfig;
  gateAuditLog: GateAuditEntry[];
}

export function HealthDashboard(props: HealthDashboardProps): JSX.Element {
  const { budgetSnapshots, failureGenes, gateConfig, gateAuditLog } = props;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '12px 0' }}>
      <BudgetPanel snapshots={budgetSnapshots} />
      <FailureHeatmap genes={failureGenes} />
      <GateStatusPanel config={gateConfig} auditLog={gateAuditLog} />
    </div>
  );
}
