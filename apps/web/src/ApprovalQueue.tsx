import { MOCK_APPROVAL_QUEUE, ApprovalDecision } from './mockApprovalQueue';

const mono = { fontFamily: 'JetBrains Mono, ui-monospace, monospace' } as const;

const DECISION_COLOR: Record<ApprovalDecision, string> = {
  pending: '#E0C36B',
  ask:     '#8AB4F8',
  allow:   '#7EE081',
  deny:    '#F2A65A',
};

/** Approval queue placeholder — renders MOCK_APPROVAL_QUEUE items with disabled
 *  ask/deny/allow controls. No fetch, no real approval execution. */
export function ApprovalQueue() {
  return (
    <div data-testid="approval-queue">
      {MOCK_APPROVAL_QUEUE.map(item => (
        <div
          key={item.id}
          data-approval-item
          data-decision={item.decision}
          style={{ background: '#141E2A', border: '1px solid rgba(230,237,243,.1)', borderRadius: 9, padding: 11, marginBottom: 9 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span data-field="tool" style={{ ...mono, fontSize: 11, color: '#C792EA', fontWeight: 600 }}>{item.tool}</span>
            <span data-field="decision"
              style={{ ...mono, fontSize: 10, color: DECISION_COLOR[item.decision], border: `1px solid ${DECISION_COLOR[item.decision]}44`, borderRadius: 4, padding: '1px 6px' }}>
              {item.decision}
            </span>
            <span style={{ ...mono, fontSize: 10, color: 'rgba(230,237,243,.34)' }}>{item.agent_role}</span>
          </div>
          <code data-field="action" style={{ ...mono, fontSize: 11.5, color: '#5BD6C0', display: 'block', marginBottom: 5 }}>{item.action}</code>
          <div style={{ fontSize: 12, color: 'rgba(230,237,243,.56)', marginBottom: 8 }}>{item.reason}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button data-action="ask"   disabled style={{ ...btnBase, color: '#8AB4F8', borderColor: '#8AB4F833' }}>Ask</button>
            <button data-action="allow" disabled style={{ ...btnBase, color: '#7EE081', borderColor: '#7EE08133' }}>Allow</button>
            <button data-action="deny"  disabled style={{ ...btnBase, color: '#F2A65A', borderColor: '#F2A65A33' }}>Deny</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const btnBase = {
  ...mono,
  fontSize: 10.5,
  background: 'transparent',
  border: '1px solid',
  borderRadius: 5,
  padding: '3px 10px',
  cursor: 'not-allowed',
  opacity: 0.5,
} as const;
