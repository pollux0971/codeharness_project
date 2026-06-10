export function isWithinWriteSet(path: string, allowed: string[]): boolean {
  const normalized = path.replace(/\\/g, '/');
  return allowed.some(prefix => normalized === prefix || normalized.startsWith(prefix.replace(/\\/g, '/').replace(/\/$/, '') + '/'));
}
