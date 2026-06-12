import { useState } from 'react';
import type { CSSProperties } from 'react';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const dim:  CSSProperties = { color: 'rgba(230,237,243,.34)' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 12, marginBottom: 10 };

// ── FileTreeView ───────────────────────────────────────────────────────────────

export interface ProjectFile { path: string; kind: 'file' | 'dir' }

export interface FileTreeViewProps {
  files: ProjectFile[];
  onSelect?: (path: string) => void;
  selectedPath?: string;
}

export function FileTreeView({ files, onSelect, selectedPath }: FileTreeViewProps): JSX.Element {
  const fileItems = files.filter(f => f.kind === 'file');
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {fileItems.map(f => (
        <li key={f.path}>
          <button
            type="button"
            aria-selected={f.path === selectedPath}
            onClick={() => onSelect?.(f.path)}
            style={{
              ...mono,
              fontSize: 12,
              background: f.path === selectedPath ? 'rgba(91,214,192,.12)' : 'none',
              border: 'none',
              color: f.path === selectedPath ? '#5BD6C0' : '#E6EDF3',
              cursor: 'pointer',
              padding: '3px 6px',
              borderRadius: 4,
              display: 'block',
              width: '100%',
              textAlign: 'left',
            }}
          >
            {f.path}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ── DiffViewer ─────────────────────────────────────────────────────────────────

export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface DiffViewerProps {
  diff: FileDiff;
}

export function DiffViewer({ diff }: DiffViewerProps): JSX.Element {
  const lines = diff.patch.split('\n');
  return (
    <div style={{ ...card, overflow: 'auto' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, ...mono, fontSize: 12 }} data-diff-path={diff.path}>
        <span style={{ color: '#7EE081' }}>+{diff.additions}</span>
        <span style={{ color: '#E57373' }}>-{diff.deletions}</span>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+');
          const isDel = line.startsWith('-');
          const bg = isAdd ? 'rgba(126,224,129,.1)' : isDel ? 'rgba(229,115,115,.1)' : 'transparent';
          return (
            <div key={i} style={{ ...mono, background: bg, padding: '0 4px', whiteSpace: 'pre' }}>
              {line}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── PromotionHistory ───────────────────────────────────────────────────────────

export interface PromotionHistoryEntry {
  promotion_id: string;
  promoted_at: string;
  story_ids_promoted: string[];
  isLatest: boolean;
}

export interface PromotionHistoryProps {
  promotions: PromotionHistoryEntry[];
  onRollback: (promotion_id: string) => void;
}

export function PromotionHistory({ promotions, onRollback }: PromotionHistoryProps): JSX.Element {
  const th: CSSProperties = { ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(230,237,243,.1)' };
  const td: CSSProperties = { ...mono, fontSize: 11.5, padding: '5px 8px', borderBottom: '1px solid rgba(230,237,243,.06)', verticalAlign: 'middle' };
  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Promotion History</div>
      {promotions.length === 0 && <div style={{ ...dim, fontSize: 12 }}>— no promotions yet —</div>}
      {promotions.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Promotion ID</th>
              <th style={th}>Promoted At</th>
              <th style={th}>Stories</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {promotions.map(p => (
              <tr key={p.promotion_id} data-promo-id={p.promotion_id}>
                <td style={td}>{p.promotion_id}</td>
                <td style={td}>{p.promoted_at}</td>
                <td style={td}>{p.story_ids_promoted.length}</td>
                <td style={td}>
                  <button
                    type="button"
                    disabled={!p.isLatest}
                    onClick={() => { if (p.isLatest) onRollback(p.promotion_id); }}
                    style={{
                      ...mono,
                      fontSize: 11,
                      background: 'transparent',
                      color: p.isLatest ? '#F2A65A' : 'rgba(230,237,243,.24)',
                      border: `1px solid ${p.isLatest ? '#F2A65A55' : 'rgba(230,237,243,.1)'}`,
                      borderRadius: 5,
                      padding: '3px 10px',
                      cursor: p.isLatest ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Rollback
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── ProjectPreview ─────────────────────────────────────────────────────────────

export interface ProjectPreviewProps {
  files: ProjectFile[];
  diffs?: FileDiff[];
  targetType: 'web' | 'cli' | 'api' | 'library';
  previewUrl?: string;
  qualityBarResult?: { ok: boolean; results: { check: string; passed: boolean }[] };
  promotionHistory: PromotionHistoryEntry[];
  onRollback: (promotion_id: string) => void;
}

export function ProjectPreview(props: ProjectPreviewProps): JSX.Element {
  const { files, diffs = [], targetType, previewUrl, qualityBarResult, promotionHistory, onRollback } = props;
  const [selectedPath, setSelectedPath] = useState<string>(
    diffs.length > 0 ? diffs[0].path : (files[0]?.path ?? '')
  );
  const activeDiff = diffs.find(d => d.path === selectedPath) ?? diffs[0];

  return (
    <div>
      {/* File tree + diff view */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ ...card }}>
          <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Files</div>
          <FileTreeView
            files={files}
            selectedPath={selectedPath}
            onSelect={p => setSelectedPath(p)}
          />
        </div>
        <div>
          {activeDiff && <DiffViewer diff={activeDiff} />}
        </div>
      </div>
      {/* Live preview iframe (web targets only) */}
      {targetType === 'web' && previewUrl && (
        <div style={{ marginBottom: 12 }}>
          <iframe
            src={previewUrl}
            style={{ width: '100%', height: 400, border: '1px solid rgba(230,237,243,.1)', borderRadius: 9 }}
            title="Live preview"
          />
        </div>
      )}
      {/* Quality bar */}
      {qualityBarResult && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>
            Quality Bar — {qualityBarResult.ok ? <span style={{ color: '#7EE081' }}>OK</span> : <span style={{ color: '#E57373' }}>FAIL</span>}
          </div>
          {qualityBarResult.results.map(r => (
            <div key={r.check} style={{ display: 'flex', gap: 8, ...mono, fontSize: 12, padding: '2px 0' }}>
              <span style={{ color: r.passed ? '#7EE081' : '#E57373' }}>{r.passed ? '✓' : '✗'}</span>
              <span>{r.check}</span>
            </div>
          ))}
        </div>
      )}
      {/* Promotion history */}
      <PromotionHistory promotions={promotionHistory} onRollback={onRollback} />
    </div>
  );
}
