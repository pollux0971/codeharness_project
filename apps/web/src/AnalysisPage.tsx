export interface GeneBrowserProps {
  genes: Array<{
    id: string;
    failure_type: string;
    summary: string;
    consolidated_count: number;
    status: string;
    proven_remedy?: string | null;
    matching_signal: string;
  }>;
  searchQuery?: string;
}

export function GeneBrowser({ genes, searchQuery }: GeneBrowserProps): JSX.Element {
  const filtered = searchQuery
    ? genes.filter(
        g =>
          g.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.failure_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          g.matching_signal.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : genes;

  const byType = filtered.reduce<Record<string, typeof filtered>>((acc, g) => {
    (acc[g.failure_type] ??= []).push(g);
    return acc;
  }, {});

  return (
    <div data-testid="gene-browser">
      {Object.entries(byType).map(([type, group]) => (
        <div key={type} style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              color: 'rgba(230,237,243,.5)',
              marginBottom: 6,
            }}
          >
            {type}
          </div>
          {group.map(g => (
            <div
              key={g.id}
              data-gene-id={g.id}
              style={{
                background: '#18242F',
                border: '1px solid rgba(230,237,243,.1)',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 13, marginBottom: 4 }}>{g.summary}</div>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  fontSize: 11,
                }}
              >
                <span
                  style={{
                    background: g.status === 'resolved' ? '#1a3a2a' : '#3a1a1a',
                    color: g.status === 'resolved' ? '#7EE081' : '#F2A65A',
                    borderRadius: 4,
                    padding: '1px 7px',
                  }}
                >
                  {g.status}
                </span>
                <span style={{ color: 'rgba(230,237,243,.4)', fontFamily: 'monospace' }}>
                  ×{g.consolidated_count}
                </span>
                <span style={{ color: 'rgba(230,237,243,.35)', fontFamily: 'monospace' }}>
                  {g.matching_signal}
                </span>
                {g.proven_remedy && (
                  <span
                    data-remedy
                    style={{
                      background: '#1a2f3a',
                      color: '#8AB4F8',
                      border: '1px solid rgba(138,180,248,.3)',
                      borderRadius: 4,
                      padding: '1px 8px',
                    }}
                  >
                    remedy: {g.proven_remedy}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
      {filtered.length === 0 && (
        <div style={{ fontSize: 12, color: 'rgba(230,237,243,.3)', fontStyle: 'italic' }}>
          No genes match
        </div>
      )}
    </div>
  );
}

export interface ImpactViewerProps {
  impactedFiles: string[];
  writeSet: string[];
}

export function ImpactViewer({ impactedFiles, writeSet }: ImpactViewerProps): JSX.Element {
  const writeSetSet = new Set(writeSet);
  return (
    <div data-testid="impact-viewer">
      {impactedFiles.map(f => {
        const isOverlap = writeSetSet.has(f);
        return (
          <div
            key={f}
            data-file={f}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 10px',
              marginBottom: 4,
              background: isOverlap ? '#2a1f10' : '#141E2A',
              border: `1px solid ${isOverlap ? 'rgba(242,166,90,.3)' : 'rgba(230,237,243,.08)'}`,
              borderRadius: 6,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
            }}
          >
            <span>{f}</span>
            {isOverlap && (
              <span
                data-overlap
                style={{
                  background: '#F2A65A22',
                  color: '#F2A65A',
                  border: '1px solid rgba(242,166,90,.4)',
                  borderRadius: 4,
                  padding: '1px 6px',
                  fontSize: 10,
                }}
              >
                overlap
              </span>
            )}
          </div>
        );
      })}
      {impactedFiles.length === 0 && (
        <div style={{ fontSize: 12, color: 'rgba(230,237,243,.3)', fontStyle: 'italic' }}>
          No impacted files
        </div>
      )}
    </div>
  );
}

export interface ConventionsProfileProps {
  profile: {
    toolchain: Record<string, string>;
    test_layout: Record<string, unknown>;
    summary: string;
  };
}

export function ConventionsProfile({ profile }: ConventionsProfileProps): JSX.Element {
  return (
    <div data-testid="conventions-profile">
      <div
        style={{
          fontSize: 12,
          color: 'rgba(230,237,243,.7)',
          marginBottom: 10,
          fontStyle: 'italic',
        }}
      >
        {profile.summary}
      </div>
      <Section title="Toolchain">
        {Object.entries(profile.toolchain).map(([k, v]) => (
          <KV key={k} k={k} v={String(v)} />
        ))}
      </Section>
      <Section title="Test layout">
        {Object.entries(profile.test_layout).map(([k, v]) => (
          <KV key={k} k={k} v={String(v)} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          color: 'rgba(230,237,243,.4)',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        fontSize: 12,
        padding: '2px 0',
        fontFamily: 'JetBrains Mono, monospace',
      }}
    >
      <span style={{ color: 'rgba(230,237,243,.45)', minWidth: 120 }}>{k}</span>
      <span style={{ color: '#E6EDF3' }}>{v}</span>
    </div>
  );
}

export interface CompactionStatsProps {
  beforeTokens: number;
  afterTokens: number;
  pinnedSections: string[];
}

export function CompactionStats({
  beforeTokens,
  afterTokens,
  pinnedSections,
}: CompactionStatsProps): JSX.Element {
  const ratio = beforeTokens > 0 ? ((1 - afterTokens / beforeTokens) * 100).toFixed(1) : '0';
  return (
    <div data-testid="compaction-stats">
      <div
        style={{
          display: 'flex',
          gap: 24,
          marginBottom: 10,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 13,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: 'rgba(230,237,243,.4)', marginBottom: 2 }}>
            BEFORE
          </div>
          <span data-before-tokens>{beforeTokens}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(230,237,243,.4)', marginBottom: 2 }}>
            AFTER
          </div>
          <span data-after-tokens>{afterTokens}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(230,237,243,.4)', marginBottom: 2 }}>
            SAVED
          </div>
          <span style={{ color: '#7EE081' }}>{ratio}%</span>
        </div>
      </div>
      {pinnedSections.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              color: 'rgba(230,237,243,.4)',
              marginBottom: 4,
            }}
          >
            Pinned sections
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {pinnedSections.map(s => (
              <span
                key={s}
                data-pinned-section={s}
                style={{
                  background: '#1a2f3a',
                  color: '#8AB4F8',
                  border: '1px solid rgba(138,180,248,.3)',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface AnalysisPageProps {
  genes?: GeneBrowserProps['genes'];
  impact?: ImpactViewerProps;
  profile?: ConventionsProfileProps['profile'];
  compaction?: CompactionStatsProps;
}

export function AnalysisPage({ genes, impact, profile, compaction }: AnalysisPageProps): JSX.Element {
  const mono = { fontFamily: 'JetBrains Mono, monospace' } as const;
  const heading = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '.12em',
    color: 'rgba(230,237,243,.5)',
    margin: '18px 0 8px',
    ...mono,
  };

  return (
    <div
      data-testid="analysis-page"
      style={{
        fontFamily: 'Inter, system-ui, sans-serif',
        color: '#E6EDF3',
        padding: 20,
        background: '#0E1620',
        minHeight: '100vh',
      }}
    >
      <h2 style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, ...mono }}>
        Analysis
      </h2>

      {genes && genes.length > 0 && (
        <section>
          <div style={heading}>Failure bank</div>
          <GeneBrowser genes={genes} />
        </section>
      )}

      {impact && (impact.impactedFiles.length > 0 || impact.writeSet.length > 0) && (
        <section>
          <div style={heading}>Impact viewer</div>
          <ImpactViewer
            impactedFiles={impact.impactedFiles}
            writeSet={impact.writeSet}
          />
        </section>
      )}

      {profile && (
        <section>
          <div style={heading}>Conventions profile</div>
          <ConventionsProfile profile={profile} />
        </section>
      )}

      {compaction && (
        <section>
          <div style={heading}>Compaction stats</div>
          <CompactionStats
            beforeTokens={compaction.beforeTokens}
            afterTokens={compaction.afterTokens}
            pinnedSections={compaction.pinnedSections}
          />
        </section>
      )}

      {!genes && !impact && !profile && !compaction && (
        <div style={{ fontSize: 12, color: 'rgba(230,237,243,.3)', fontStyle: 'italic' }}>
          No analysis data available.
        </div>
      )}
    </div>
  );
}
