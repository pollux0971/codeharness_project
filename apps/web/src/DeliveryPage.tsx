import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { PromotionHistoryEntry } from './ProjectPreview';
import { PromotionHistory } from './ProjectPreview';

const mono: CSSProperties = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' };
const dim:  CSSProperties = { color: 'rgba(230,237,243,.34)' };
const card: CSSProperties = { background: '#18242F', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 12, marginBottom: 10 };

// ── ArtifactBrowser ────────────────────────────────────────────────────────────

export interface ArtifactBrowserProps {
  files: { path: string; kind: 'file' | 'dir'; size?: number }[];
}

export function ArtifactBrowser({ files }: ArtifactBrowserProps): JSX.Element {
  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Artifacts</div>
      {files.length === 0 && <div style={{ ...dim, ...mono, fontSize: 12 }}>— no artifacts —</div>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {files.map(f => (
          <li key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}>
            <span style={{ ...mono, fontSize: 11, color: f.kind === 'dir' ? '#8AB4F8' : '#5BD6C0', width: 28 }}>
              {f.kind === 'dir' ? 'dir' : 'file'}
            </span>
            <span style={{ ...mono, fontSize: 12, color: '#E6EDF3', flex: 1 }}>{f.path}</span>
            {f.size !== undefined && (
              <span style={{ ...mono, fontSize: 11, ...dim }}>{f.size}B</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── CheckpointHistory ──────────────────────────────────────────────────────────

export interface CheckpointEntry {
  checkpoint_id: string;
  story_id: string;
  commit_sha: string;
  checkpointed_at: string;
  is_resume_entry: boolean;
}

export interface CheckpointHistoryProps {
  checkpoints: CheckpointEntry[];
  onResume?: (checkpoint_id: string) => void;
}

export function CheckpointHistory({ checkpoints, onResume }: CheckpointHistoryProps): JSX.Element {
  const th: CSSProperties = { ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(230,237,243,.1)' };
  const td: CSSProperties = { ...mono, fontSize: 11.5, padding: '5px 8px', borderBottom: '1px solid rgba(230,237,243,.06)', verticalAlign: 'middle' };

  return (
    <div style={card}>
      <div style={{ ...mono, fontSize: 10, textTransform: 'uppercase', color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>Checkpoint History</div>
      {checkpoints.length === 0 && <div style={{ ...dim, ...mono, fontSize: 12 }}>— no checkpoints —</div>}
      {checkpoints.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Story</th>
              <th style={th}>Commit</th>
              <th style={th}>At</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {checkpoints.map(cp => (
              <tr key={cp.checkpoint_id} data-checkpoint-id={cp.checkpoint_id}>
                <td style={td}>{cp.story_id}</td>
                <td style={td}>{cp.commit_sha}</td>
                <td style={td}>{cp.checkpointed_at}</td>
                <td style={td}>
                  {cp.is_resume_entry && (
                    <button
                      type="button"
                      onClick={() => onResume?.(cp.checkpoint_id)}
                      style={{
                        ...mono,
                        fontSize: 11,
                        background: 'transparent',
                        color: '#5BD6C0',
                        border: '1px solid rgba(91,214,192,.4)',
                        borderRadius: 5,
                        padding: '3px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Resume
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── PromotionReview ────────────────────────────────────────────────────────────

export interface PromotionReviewProps {
  runId: string;
  diffStats: { additions: number; deletions: number };
  validationEvidence: { story_id: string; sha: string }[];
  qualityBarPassed: boolean;
  onDecide: (outcome: 'approved' | 'denied', reason: string) => void;
}

export function PromotionReview({ runId, diffStats, validationEvidence, qualityBarPassed, onDecide }: PromotionReviewProps): JSX.Element {
  const [denyReason, setDenyReason] = useState('');

  return (
    <div
      style={{
        background: '#141E2A',
        border: `1px solid ${qualityBarPassed ? 'rgba(94,213,128,.3)' : 'rgba(229,115,115,.3)'}`,
        borderRadius: 9,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: '#5BD6C0' }}>promotion review</span>
        <span style={{ ...mono, fontSize: 10, ...dim }}>run: {runId}</span>
        <span style={{ ...mono, fontSize: 11, color: '#7EE081' }}>+{diffStats.additions}</span>
        <span style={{ ...mono, fontSize: 11, color: '#E57373' }}>-{diffStats.deletions}</span>
        <span
          style={{
            ...mono,
            fontSize: 10,
            color: qualityBarPassed ? '#7EE081' : '#E57373',
            border: `1px solid ${qualityBarPassed ? '#7EE08144' : '#E5737344'}`,
            borderRadius: 4,
            padding: '0 5px',
          }}
        >
          {qualityBarPassed ? 'quality: pass' : 'quality: fail'}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        {validationEvidence.map(ev => (
          <div key={ev.story_id} style={{ display: 'flex', gap: 8, ...mono, fontSize: 11, padding: '2px 0' }}>
            <span style={{ color: '#8AB4F8' }}>{ev.story_id}</span>
            <span style={dim}>{ev.sha.slice(0, 10)}</span>
          </div>
        ))}
      </div>
      <textarea
        value={denyReason}
        onChange={e => setDenyReason(e.target.value)}
        placeholder="Deny reason (required)…"
        rows={2}
        style={{
          ...mono,
          fontSize: 11,
          width: '100%',
          background: '#0E1620',
          color: '#E6EDF3',
          border: '1px solid rgba(230,237,243,.15)',
          borderRadius: 5,
          padding: '5px 8px',
          resize: 'vertical',
          marginBottom: 8,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onDecide('approved', '')} style={btnStyle('#7EE081')}>
          Approve
        </button>
        <button
          disabled={!denyReason.trim()}
          onClick={() => { if (denyReason.trim()) onDecide('denied', denyReason.trim()); }}
          style={btnStyle('#F2A65A', !denyReason.trim())}
        >
          Deny
        </button>
      </div>
    </div>
  );
}

// ── DeliveryPage ───────────────────────────────────────────────────────────────

export interface DeliveryPageProps {
  artifacts?: ArtifactBrowserProps['files'];
  checkpoints?: CheckpointEntry[];
  promotionReview?: PromotionReviewProps;
  promotionHistory?: PromotionHistoryEntry[];
  onRollback?: (promotion_id: string) => void;
}

export function DeliveryPage({ artifacts, checkpoints, promotionReview, promotionHistory, onRollback }: DeliveryPageProps): JSX.Element {
  return (
    <div>
      {artifacts && <ArtifactBrowser files={artifacts} />}
      {checkpoints && <CheckpointHistory checkpoints={checkpoints} />}
      {promotionReview && <PromotionReview {...promotionReview} />}
      {promotionHistory && onRollback && (
        <PromotionHistory promotions={promotionHistory} onRollback={onRollback} />
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function btnStyle(color: string, disabled = false): CSSProperties {
  return {
    ...mono,
    fontSize: 11,
    background: 'transparent',
    color: disabled ? 'rgba(230,237,243,.24)' : color,
    border: `1px solid ${disabled ? 'rgba(230,237,243,.1)' : color + '55'}`,
    borderRadius: 5,
    padding: '4px 12px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
