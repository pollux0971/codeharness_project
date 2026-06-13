import type { CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 12 };

export interface SandboxedPreviewProps {
  previewUrl: string;
  targetType: 'web' | 'cli' | 'api' | 'library';
  refreshKey?: number;
  qualityBarResult?: { ok: boolean; checks: { name: string; passed: boolean }[] };
}

export function SandboxedPreview({ previewUrl, targetType, refreshKey, qualityBarResult }: SandboxedPreviewProps): JSX.Element {
  const showIframe = targetType === 'web' && previewUrl;

  return (
    <div data-testid="sandboxed-preview">
      {showIframe ? (
        <iframe
          key={refreshKey}
          src={previewUrl}
          sandbox="allow-scripts allow-same-origin"
          style={{ width: '100%', height: 400, border: '1px solid rgba(230,237,243,.1)', borderRadius: 9 }}
          title="Sandboxed preview"
        />
      ) : (
        qualityBarResult && (
          <div style={card}>
            <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>
              Quality Report — {qualityBarResult.ok
                ? <span style={{ color: '#7EE081' }}>OK</span>
                : <span style={{ color: '#E57373' }}>FAIL</span>}
            </div>
            {qualityBarResult.checks.map(c => (
              <div key={c.name} style={{ display: 'flex', gap: 8, ...mono, fontSize: 12, padding: '2px 0' }}>
                <span style={{ color: c.passed ? '#7EE081' : '#E57373' }}>{c.passed ? '✓' : '✗'}</span>
                <span>{c.name}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
