import { useState } from 'react';
import type { CSSProperties } from 'react';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;
const dim  = { color: 'rgba(230,237,243,.34)' } as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EscalationOption {
  option_id: string;
  tradeoff: string;
}

export interface EscalationData {
  id: string;
  type: string;
  reason: string;
  story_id?: string;
  requested_decision?: string;
  raised_by?: string;
  options?: EscalationOption[];
}

export interface PromotionData {
  run_id: string;
  project_id: string;
  validation_evidence: { story_id: string; checkpoint_sha: string }[];
  promotable: boolean;
}

// ── EscalationCard ────────────────────────────────────────────────────────────

export interface EscalationCardProps {
  escalation: EscalationData;
  onDecide: (outcome: 'approved' | 'denied', reason: string) => void;
}

export function EscalationCard({ escalation, onDecide }: EscalationCardProps): JSX.Element {
  const [denyReason, setDenyReason] = useState('');

  return (
    <div
      data-escalation-id={escalation.id}
      style={{
        background: '#141E2A',
        border: '1px solid rgba(242,166,90,.28)',
        borderRadius: 9,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span
          data-field="type"
          style={{
            ...mono,
            fontSize: 11,
            color: '#F2A65A',
            fontWeight: 600,
            border: '1px solid rgba(242,166,90,.4)',
            borderRadius: 4,
            padding: '1px 6px',
          }}
        >
          {escalation.type}
        </span>
        {escalation.story_id && (
          <span style={{ ...mono, fontSize: 10, color: '#8AB4F8' }}>{escalation.story_id}</span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'rgba(230,237,243,.72)', marginBottom: 6, lineHeight: 1.5 }}>
        {escalation.reason}
      </div>
      {escalation.requested_decision && (
        <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 6, ...dim }}>
          {escalation.requested_decision}
        </div>
      )}
      {escalation.options && escalation.options.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {escalation.options.map(opt => (
            <div key={opt.option_id} style={{ fontSize: 11.5, ...dim, paddingLeft: 10, borderLeft: '2px solid rgba(230,237,243,.1)', marginBottom: 4 }}>
              <span style={{ ...mono, color: '#E6EDF3', fontWeight: 500 }}>{opt.option_id}</span>
              {' — '}{opt.tradeoff}
            </div>
          ))}
        </div>
      )}
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
        <button
          onClick={() => onDecide('approved', '')}
          style={btnStyle('#7EE081')}
        >
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

// ── PromotionCard ─────────────────────────────────────────────────────────────

export interface PromotionCardProps {
  promotion: PromotionData;
  onDecide: (outcome: 'approved' | 'denied', reason: string) => void;
}

export function PromotionCard({ promotion, onDecide }: PromotionCardProps): JSX.Element {
  const [denyReason, setDenyReason] = useState('');

  return (
    <div
      style={{
        background: '#141E2A',
        border: `1px solid ${promotion.promotable ? 'rgba(94,213,128,.3)' : 'rgba(230,237,243,.1)'}`,
        borderRadius: 9,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ ...mono, fontSize: 11, fontWeight: 600, color: '#5BD6C0' }}>promotion</span>
        <span style={{ ...mono, fontSize: 10, ...dim }}>{promotion.project_id}</span>
        <span style={{ ...mono, fontSize: 10, ...dim }}>run: {promotion.run_id}</span>
        <span
          style={{
            ...mono,
            fontSize: 10,
            color: promotion.promotable ? '#7EE081' : '#F2A65A',
            border: `1px solid ${promotion.promotable ? '#7EE08144' : '#F2A65A44'}`,
            borderRadius: 4,
            padding: '0 5px',
          }}
        >
          {promotion.promotable ? 'promotable' : 'not promotable'}
        </span>
      </div>
      <div style={{ marginBottom: 8 }}>
        {promotion.validation_evidence.map(ev => (
          <div
            key={ev.story_id}
            style={{ display: 'flex', gap: 8, ...mono, fontSize: 11, padding: '2px 0' }}
          >
            <span style={{ color: '#8AB4F8' }}>{ev.story_id}</span>
            <span style={dim}>{ev.checkpoint_sha.slice(0, 10)}</span>
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
        <button
          onClick={() => onDecide('approved', '')}
          style={btnStyle('#7EE081')}
        >
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

// ── ApprovalCenter ────────────────────────────────────────────────────────────

export interface ApprovalCenterProps {
  escalations: EscalationData[];
  promotions: PromotionData[];
  onDecide: (id: string, outcome: 'approved' | 'denied', reason: string) => void;
}

export function ApprovalCenter({ escalations, promotions, onDecide }: ApprovalCenterProps): JSX.Element {
  const empty = escalations.length === 0 && promotions.length === 0;

  if (empty) {
    return (
      <div
        data-testid="approval-center"
        style={{ ...mono, fontSize: 12, ...dim, padding: '10px 0' }}
      >
        No pending approvals.
      </div>
    );
  }

  return (
    <div data-testid="approval-center">
      {escalations.map(esc => (
        <EscalationCard
          key={esc.id}
          escalation={esc}
          onDecide={(outcome, reason) => onDecide(esc.id, outcome, reason)}
        />
      ))}
      {promotions.map((promo, i) => (
        <PromotionCard
          key={`${promo.run_id}-${i}`}
          promotion={promo}
          onDecide={(outcome, reason) => onDecide(promo.run_id, outcome, reason)}
        />
      ))}
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
