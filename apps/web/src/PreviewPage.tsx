import type { CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const dim:  CSSProperties = { color: 'rgba(230,237,243,.34)' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 24 };

export type PreviewState =
  | 'no_frontend_stage'
  | 'not_yet_reached'
  | 'live';

export type DeviceViewport = 'mobile' | 'tablet' | 'desktop';

export interface PreviewPageProps {
  hasFrontendStage: boolean | null;
  showcaseStoryId?: string;
  showcaseCheckpointed?: boolean;
  previewUrl?: string;
  /** MD3 viewport sizes: mobile=390px, tablet=768px, desktop=1280px */
  viewport?: DeviceViewport;
  onViewportChange?: (v: DeviceViewport) => void;
}

const VIEWPORT_WIDTHS: Record<DeviceViewport, number> = {
  mobile: 390,
  tablet: 768,
  desktop: 1280,
};

function deriveState(props: PreviewPageProps): PreviewState {
  if (!props.hasFrontendStage) return 'no_frontend_stage';
  if (!props.showcaseCheckpointed) return 'not_yet_reached';
  return 'live';
}

function vpBtn(active: boolean): CSSProperties {
  return {
    ...mono,
    fontSize: 11,
    padding: '4px 12px',
    borderRadius: 4,
    border: active ? '1px solid #5BD6C0' : '1px solid rgba(230,237,243,.2)',
    background: active ? 'rgba(91,214,192,.12)' : 'none',
    color: active ? '#5BD6C0' : 'rgba(230,237,243,.7)',
    cursor: 'pointer',
  };
}

export function PreviewPage(props: PreviewPageProps): JSX.Element {
  const state = deriveState(props);
  const viewport = props.viewport ?? 'desktop';

  return (
    <div
      data-preview-state={state}
      style={{ padding: 24, color: '#E6EDF3', minHeight: 200 }}
    >
      {state === 'no_frontend_stage' && (
        <div style={card}>
          <div style={{ ...mono, fontSize: 13, ...dim }}>此專案並無前端開發階段</div>
        </div>
      )}

      {state === 'not_yet_reached' && (
        <div style={card}>
          <div style={{ ...mono, fontSize: 13, ...dim, marginBottom: 8 }}>
            還沒進入前端開發階段
          </div>
          {props.showcaseStoryId && (
            <div style={{ ...mono, fontSize: 12, color: '#8AB4F8' }}>
              {props.showcaseStoryId}
            </div>
          )}
        </div>
      )}

      {state === 'live' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['mobile', 'tablet', 'desktop'] as DeviceViewport[]).map(vp => (
              <button
                key={vp}
                type="button"
                aria-label={vp}
                style={vpBtn(viewport === vp)}
                onClick={() => props.onViewportChange?.(vp)}
              >
                {vp.charAt(0).toUpperCase() + vp.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <iframe
              src={props.previewUrl}
              title="Preview"
              sandbox="allow-scripts allow-same-origin"
              style={{
                width: VIEWPORT_WIDTHS[viewport],
                height: 600,
                border: '1px solid rgba(230,237,243,.1)',
                borderRadius: 9,
                display: 'block',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
