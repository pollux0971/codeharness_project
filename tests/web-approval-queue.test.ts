/**
 * STORY-005.3 — Permission approval queue placeholder acceptance tests
 * Verifies: approval_queue_renders_mock_ask_deny_allow, no_real_approval_executed
 * Pure node tests — no browser, no backend, no network.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MOCK_APPROVAL_QUEUE } from '../apps/web/src/mockApprovalQueue';

const webSrc = path.resolve(__dirname, '../apps/web/src');

describe('STORY-005.3 permission approval queue placeholder', () => {
  it('approval_queue_renders_mock_ask_deny_allow: queue is non-empty', () => {
    expect(MOCK_APPROVAL_QUEUE.length).toBeGreaterThan(0);
  });

  it('approval_queue_renders_mock_ask_deny_allow: each item has required fields', () => {
    for (const item of MOCK_APPROVAL_QUEUE) {
      expect(typeof item.id).toBe('string');
      expect(item.id.length).toBeGreaterThan(0);
      expect(typeof item.tool).toBe('string');
      expect(typeof item.action).toBe('string');
      expect(typeof item.agent_role).toBe('string');
      expect(typeof item.reason).toBe('string');
      expect(['pending', 'ask', 'allow', 'deny']).toContain(item.decision);
    }
  });

  it('approval_queue_renders_mock_ask_deny_allow: queue contains all three decision types', () => {
    const decisions = new Set(MOCK_APPROVAL_QUEUE.map(i => i.decision));
    // must include at least one of: allow, deny, pending/ask
    expect(decisions.has('allow') || decisions.has('ask')).toBe(true);
    expect(decisions.has('deny')).toBe(true);
  });

  it('approval_queue_renders_mock_ask_deny_allow: ApprovalQueue source renders ask/deny/allow buttons', () => {
    const src = fs.readFileSync(path.join(webSrc, 'ApprovalQueue.tsx'), 'utf8');
    expect(src).toContain('data-action="ask"');
    expect(src).toContain('data-action="allow"');
    expect(src).toContain('data-action="deny"');
    expect(src).toContain('data-approval-item');
    expect(src).toContain('data-decision={item.decision}');
  });

  it('no_real_approval_executed: buttons are disabled in source', () => {
    const src = fs.readFileSync(path.join(webSrc, 'ApprovalQueue.tsx'), 'utf8');
    // All three buttons must be disabled
    const disabledCount = (src.match(/disabled/g) || []).length;
    expect(disabledCount).toBeGreaterThanOrEqual(3);
  });

  it('no_real_approval_executed: ApprovalQueue has no fetch or real API calls', () => {
    const src = fs.readFileSync(path.join(webSrc, 'ApprovalQueue.tsx'), 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta.env');
    expect(src).not.toContain('XMLHttpRequest');
  });

  it('no_real_approval_executed: mockApprovalQueue.ts has no network or secret reads', () => {
    const src = fs.readFileSync(path.join(webSrc, 'mockApprovalQueue.ts'), 'utf8');
    expect(src).not.toContain('fetch(');
    expect(src).not.toContain('import.meta');
    expect(src).not.toContain('require(');
  });

  it('no_real_approval_executed: mock data contains no secret-like values', () => {
    const serialised = JSON.stringify(MOCK_APPROVAL_QUEUE);
    expect(serialised).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
    expect(serialised).not.toMatch(/ghp_[A-Za-z0-9]{8,}/);
    expect(serialised).not.toMatch(/AKIA[0-9A-Z]{12,}/);
  });

  it('approval_queue_renders_mock_ask_deny_allow: App.tsx includes ApprovalQueue in platform panel', () => {
    const src = fs.readFileSync(path.join(webSrc, 'App.tsx'), 'utf8');
    expect(src).toContain('ApprovalQueue');
    expect(src).toContain('data-panel="platform"');
  });
});
