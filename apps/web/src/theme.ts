export type ConsoleRole = 'supervisor' | 'developer' | 'debugger' | 'reviewer';

export const ROLE_CSS_VAR: Record<ConsoleRole, string> = {
  supervisor: 'var(--role-supervisor)',
  developer:  'var(--role-developer)',
  debugger:   'var(--role-debugger)',
  reviewer:   'var(--role-reviewer)',
};

export function getRoleColor(role: ConsoleRole): string {
  return ROLE_CSS_VAR[role];
}
