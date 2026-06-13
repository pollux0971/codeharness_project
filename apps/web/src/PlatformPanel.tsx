const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

export interface PlatformFact {
  key:      string;
  value:    string;
  category: 'sandbox' | 'auth' | 'gate';
}

export interface PlatformPanelProps {
  facts: PlatformFact[];
}

const categoryColor: Record<PlatformFact['category'], string> = {
  sandbox: '#5BD6C0',
  auth:    '#F2A65A',
  gate:    '#7EE081',
};

export function PlatformPanel({ facts }: PlatformPanelProps): JSX.Element {
  return (
    <div data-testid="platform-panel-read-only" style={{ ...mono, fontSize: 12, padding: 16 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', opacity: 0.5, fontWeight: 600, paddingBottom: 8, paddingRight: 24 }}>
              Key
            </th>
            <th style={{ textAlign: 'left', opacity: 0.5, fontWeight: 600, paddingBottom: 8, paddingRight: 24 }}>
              Value
            </th>
            <th style={{ textAlign: 'left', opacity: 0.5, fontWeight: 600, paddingBottom: 8 }}>
              Category
            </th>
          </tr>
        </thead>
        <tbody>
          {facts.map(fact => (
            <tr key={fact.key} style={{ borderTop: '1px solid rgba(230,237,243,.08)' }}>
              <td style={{ padding: '6px 24px 6px 0', opacity: 0.8 }}>{fact.key}</td>
              <td style={{ padding: '6px 24px 6px 0', opacity: 0.7 }}>{fact.value}</td>
              <td style={{ padding: '6px 0' }}>
                <span
                  style={{
                    fontSize:     10,
                    color:        categoryColor[fact.category],
                    border:       `1px solid ${categoryColor[fact.category]}44`,
                    borderRadius: 4,
                    padding:      '1px 6px',
                  }}
                >
                  {fact.category}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
