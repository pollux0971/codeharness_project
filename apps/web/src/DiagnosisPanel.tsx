import type { DiagnosisReport } from '@codeharness/validator-suite';

export interface DiagnosisPanelProps {
  reports: DiagnosisReport[];
  selectedStoryId?: string;
}

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

export function DiagnosisPanel({ reports, selectedStoryId }: DiagnosisPanelProps): JSX.Element {
  const filtered = selectedStoryId
    ? reports.filter(r => r.story_id === selectedStoryId)
    : reports;

  if (filtered.length === 0) {
    return (
      <div style={{ ...mono, fontSize: 12, opacity: 0.5, padding: 16 }}>
        No diagnosis reports.
      </div>
    );
  }

  return (
    <div style={{ ...mono, fontSize: 12, padding: 16 }}>
      {filtered.map(report => {
        const sortedHypotheses = [...report.root_cause_hypotheses].sort(
          (a, b) => b.confidence - a.confidence
        );

        return (
          <div
            key={report.report_id}
            data-report-id={report.report_id}
            style={{
              border: '1px solid rgba(230,237,243,.18)',
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span
                style={{
                  fontSize: 10,
                  background: 'rgba(91,214,192,.15)',
                  color: '#5BD6C0',
                  border: '1px solid rgba(91,214,192,.3)',
                  borderRadius: 4,
                  padding: '2px 6px',
                }}
              >
                {report.reviewer_model}
              </span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>{report.story_id}</span>
              <span style={{ opacity: 0.4, fontSize: 10 }}>{report.failure_classification}</span>
            </div>

            <div style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>Root cause hypotheses</div>
              {sortedHypotheses.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    marginBottom: 4,
                    opacity: 0.85,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      minWidth: 36,
                      color: '#F2A65A',
                      opacity: 0.9,
                      flexShrink: 0,
                    }}
                  >
                    {Math.round(h.confidence * 100)}%
                  </span>
                  <span>{h.hypothesis}</span>
                </div>
              ))}
            </div>

            {report.improvement_directions.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>Improvement directions</div>
                {report.improvement_directions.map((d, i) => (
                  <div key={i} style={{ marginBottom: 4, opacity: 0.8 }}>
                    <span
                      style={{
                        fontSize: 10,
                        border: '1px solid rgba(230,237,243,.2)',
                        borderRadius: 4,
                        padding: '1px 5px',
                        marginRight: 6,
                      }}
                    >
                      {d.direction_type}
                    </span>
                    {d.rationale}
                  </div>
                ))}
              </div>
            )}

            {report.do_not_touch.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4, opacity: 0.5, fontSize: 11 }}>Do not touch</div>
                {report.do_not_touch.map((f, i) => (
                  <div key={i} style={{ opacity: 0.5, fontSize: 11 }}>{f}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
