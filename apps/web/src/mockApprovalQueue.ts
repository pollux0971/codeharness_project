/** Mock permission approval queue items — no real API, no fetch. */
export type ApprovalDecision = 'pending' | 'ask' | 'allow' | 'deny';

export interface MockApprovalItem {
  id: string;
  tool: string;
  action: string;
  agent_role: string;
  decision: ApprovalDecision;
  reason: string;
}

export const MOCK_APPROVAL_QUEUE: MockApprovalItem[] = [
  {
    id: 'aq-001',
    tool: 'Bash',
    action: 'git status --short',
    agent_role: 'developer',
    decision: 'pending',
    reason: 'read-only shell command — awaiting human review',
  },
  {
    id: 'aq-002',
    tool: 'Edit',
    action: 'packages/shared/src/index.ts',
    agent_role: 'developer',
    decision: 'allow',
    reason: 'file is within the story write-set',
  },
  {
    id: 'aq-003',
    tool: 'Bash',
    action: 'rm -rf /tmp/workspace-old',
    agent_role: 'developer',
    decision: 'deny',
    reason: 'destructive delete — outside workspace boundary',
  },
];
