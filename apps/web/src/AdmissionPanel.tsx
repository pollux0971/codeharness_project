import { useState } from 'react';
import type { CSSProperties } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
const dim  = { color: 'rgba(230,237,243,.34)' } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type BlockReason = 'held' | 'wave_closed' | 'wip_blocked' | 'overlap_blocked' | 'none';

export interface AdmissionStoryEntry {
  story_id: string;
  block_reason: BlockReason;
  human_hold: boolean;
  supervisor_proposed_hold: boolean;
  wave_id?: string;
}

export interface WaveDefinition {
  wave_id: string;
  status: 'open' | 'closed';
  max_stories?: number;
}

export interface AdmissionPanelProps {
  stories: AdmissionStoryEntry[];
  waves: WaveDefinition[];
  maxWipPerEpic: number;
  onHoldConfirm: (story_id: string) => void;
  onReleaseConfirm: (story_id: string) => void;
  onWipChange: (newLimit: number) => void;
}

// ── Badge config ──────────────────────────────────────────────────────────────

const BADGE: Record<BlockReason, { icon: string; color: string; label: string }> = {
  held:             { icon: '🔒', color: '#F85149', label: 'held' },
  wave_closed:      { icon: '🌊', color: '#F2A65A', label: 'wave_closed' },
  wip_blocked:      { icon: '⛔', color: '#E36209', label: 'wip_blocked' },
  overlap_blocked:  { icon: '⚡', color: '#EAC54F', label: 'overlap_blocked' },
  none:             { icon: '●',  color: '#3FB950', label: 'none' },
};

// ── StoryRow ──────────────────────────────────────────────────────────────────

interface StoryRowProps {
  entry: AdmissionStoryEntry;
  onHoldConfirm: (id: string) => void;
  onReleaseConfirm: (id: string) => void;
}

function StoryRow({ entry, onHoldConfirm, onReleaseConfirm }: StoryRowProps): JSX.Element {
  const [pendingRelease, setPendingRelease] = useState(false);
  const badge = BADGE[entry.block_reason];

  const handleRelease = () => {
    if (pendingRelease) {
      onReleaseConfirm(entry.story_id);
      setPendingRelease(false);
    } else {
      setPendingRelease(true);
    }
  };

  return (
    <div
      data-story-id={entry.story_id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px',
        marginBottom: 6,
        background: '#141E2A',
        border: '1px solid rgba(230,237,243,.1)',
        borderRadius: 7,
        flexWrap: 'wrap',
      }}
    >
      {/* Story ID */}
      <span style={{ ...mono, fontSize: 12, color: '#8AB4F8', minWidth: 80 }}>
        {entry.story_id}
      </span>

      {/* Block reason badge */}
      <span
        data-field="block_reason"
        style={{
          ...mono,
          fontSize: 11,
          color: badge.color,
          border: `1px solid ${badge.color}55`,
          borderRadius: 4,
          padding: '1px 7px',
        }}
      >
        {badge.icon} {badge.label}
      </span>

      {/* Wave label */}
      {entry.wave_id && (
        <span style={{ ...mono, fontSize: 10, ...dim }}>wave: {entry.wave_id}</span>
      )}

      {/* Supervisor proposed hold badge + confirm button */}
      {entry.supervisor_proposed_hold && (
        <>
          <span
            style={{
              ...mono,
              fontSize: 10,
              color: '#F2A65A',
              border: '1px solid rgba(242,166,90,.4)',
              borderRadius: 4,
              padding: '1px 6px',
            }}
          >
            Proposed hold (pending confirm)
          </span>
          <button
            onClick={() => onHoldConfirm(entry.story_id)}
            style={btnStyle('#F2A65A')}
          >
            Confirm hold
          </button>
        </>
      )}

      {/* Release button (human_hold) */}
      {entry.human_hold && (
        pendingRelease ? (
          <span style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            <span style={{ ...mono, fontSize: 10, color: '#F85149' }}>Confirm release?</span>
            <button onClick={handleRelease} style={btnStyle('#F85149')}>Yes, Release</button>
            <button onClick={() => setPendingRelease(false)} style={btnStyle('rgba(230,237,243,.4)')}>Cancel</button>
          </span>
        ) : (
          <button onClick={handleRelease} style={btnStyle('#5BD6C0')}>
            Release
          </button>
        )
      )}
    </div>
  );
}

// ── WaveChip ──────────────────────────────────────────────────────────────────

function WaveChip({ wave }: { wave: WaveDefinition }): JSX.Element {
  const isOpen = wave.status === 'open';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: '#141E2A',
        border: `1px solid ${isOpen ? 'rgba(94,213,128,.3)' : 'rgba(230,237,243,.1)'}`,
        borderRadius: 6,
        padding: '4px 10px',
        marginRight: 6,
        marginBottom: 6,
      }}
    >
      <span style={{ ...mono, fontSize: 11, color: '#8AB4F8' }}>{wave.wave_id}</span>
      <span
        style={{
          ...mono,
          fontSize: 10,
          color: isOpen ? '#3FB950' : 'rgba(230,237,243,.4)',
          border: `1px solid ${isOpen ? '#3FB95044' : 'rgba(230,237,243,.1)'}`,
          borderRadius: 3,
          padding: '0 5px',
        }}
      >
        {wave.status}
      </span>
      {wave.max_stories != null && (
        <span style={{ ...mono, fontSize: 10, ...dim }}>max: {wave.max_stories}</span>
      )}
    </div>
  );
}

// ── AdmissionPanel ────────────────────────────────────────────────────────────

export function AdmissionPanel({
  stories,
  waves,
  maxWipPerEpic,
  onHoldConfirm,
  onReleaseConfirm,
  onWipChange,
}: AdmissionPanelProps): JSX.Element {
  const [wipInput, setWipInput] = useState(maxWipPerEpic);

  return (
    <div data-testid="admission-panel" style={{ ...mono, color: '#E6EDF3' }}>
      {/* ── Stories ── */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(230,237,243,.55)', marginBottom: 8, letterSpacing: 1 }}>
          STORIES
        </div>
        {stories.length === 0 ? (
          <div style={{ fontSize: 12, ...dim }}>No stories.</div>
        ) : (
          stories.map(entry => (
            <StoryRow
              key={entry.story_id}
              entry={entry}
              onHoldConfirm={onHoldConfirm}
              onReleaseConfirm={onReleaseConfirm}
            />
          ))
        )}
      </section>

      {/* ── WIP limit ── */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(230,237,243,.55)', marginBottom: 8, letterSpacing: 1 }}>
          WIP LIMIT PER EPIC
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            min={1}
            value={wipInput}
            onChange={e => setWipInput(Number(e.target.value))}
            style={{
              ...mono,
              fontSize: 13,
              width: 64,
              background: '#0E1620',
              color: '#E6EDF3',
              border: '1px solid rgba(230,237,243,.2)',
              borderRadius: 5,
              padding: '4px 8px',
            }}
          />
          <button
            onClick={() => onWipChange(wipInput)}
            style={btnStyle('#8AB4F8')}
          >
            Update
          </button>
        </div>
      </section>

      {/* ── Waves ── */}
      <section>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(230,237,243,.55)', marginBottom: 8, letterSpacing: 1 }}>
          WAVES
        </div>
        {waves.length === 0 ? (
          <div style={{ fontSize: 12, ...dim }}>No waves.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {waves.map(w => <WaveChip key={w.wave_id} wave={w} />)}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
