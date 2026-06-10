export type FailureKind = 'test_failure' | 'type_error' | 'permission_denied' | 'timeout' | 'unknown';

export function classifyFailure(log: string): FailureKind {
  const t = log.toLowerCase();
  if (t.includes('permission denied')) return 'permission_denied';
  if (t.includes('timed out') || t.includes('timeout')) return 'timeout';
  if (t.includes('ts') && t.includes('error')) return 'type_error';
  if (t.includes('failed') || t.includes('assert')) return 'test_failure';
  return 'unknown';
}
