/**
 * @codeharness/codegraph-adapter
 *
 * Wraps the CodeGraph MCP server for harness use. Read-only; no write path,
 * no secrets, no network needed in tests — inject a CodeGraphClient fixture.
 *
 * Architecture: codeharness/docs/architecture/06_CODEGRAPH_INTEGRATION.md
 */

export type CodeGraphOperation =
  | 'symbol_lookup'
  | 'impact'
  | 'dependents'
  | 'dependencies'
  | 'callgraph';

export interface CodeGraphQuery {
  operation: CodeGraphOperation;
  target: string;
  /** Glob patterns the agent is allowed to read (from the story contract). */
  readScope?: string[];
}

export interface SymbolLocation {
  file: string;
  line: number;
  column?: number;
  kind?: 'definition' | 'reference';
}

export interface CodeGraphResult {
  operation: CodeGraphOperation;
  target: string;
  locations: SymbolLocation[];
  /** File paths in the impact/dependent/dependency set. */
  impactedFiles: string[];
  /** Compact, ≤200 chars — injected into context. Never raw file content. */
  summary: string;
}

export interface CodeGraphClient {
  query(q: CodeGraphQuery): Promise<{
    locations?: { file: string; line: number; column?: number; kind?: string }[];
    impacted_files?: string[];
  }>;
}

/** CI-safe no-op client — use when the real MCP server is unavailable. */
export const NULL_CLIENT: CodeGraphClient = {
  async query(_q) { return { locations: [], impacted_files: [] }; },
};

function globMatch(globs: string[], p: string): boolean {
  return globs.some(g => {
    const re = new RegExp(
      '^' +
      g.replace(/[.+^${}()|[\]\\]/g, '\\$&')
       .replace(/\*\*/g, '§')
       .replace(/\*/g, '[^/]*')
       .replace(/§/g, '.*') +
      '$'
    );
    return re.test(p);
  });
}

/** Filter locations to those within the agent's read scope. */
export function filterToReadScope(
  locations: SymbolLocation[],
  readScope: string[],
): SymbolLocation[] {
  if (readScope.length === 0) return locations;
  return locations.filter(l => globMatch(readScope, l.file));
}

function truncateSummary(s: string): string {
  return s.length <= 200 ? s : s.slice(0, 197) + '...';
}

/** Look up symbol definitions and references. */
export async function lookupSymbol(
  symbol: string,
  client: CodeGraphClient = NULL_CLIENT,
  readScope?: string[],
): Promise<CodeGraphResult> {
  const raw = await client.query({ operation: 'symbol_lookup', target: symbol, readScope });
  const allLocs: SymbolLocation[] = (raw.locations ?? []).map(l => ({
    file: l.file,
    line: l.line,
    ...(l.column !== undefined && { column: l.column }),
    ...(l.kind !== undefined && { kind: l.kind as SymbolLocation['kind'] }),
  }));
  const locations = readScope && readScope.length > 0
    ? filterToReadScope(allLocs, readScope)
    : allLocs;
  const defs = locations.filter(l => l.kind === 'definition').length;
  const refs = locations.filter(l => l.kind === 'reference').length;
  const summary = truncateSummary(
    `symbol '${symbol}': ${defs} definition${defs !== 1 ? 's' : ''}, ${refs} reference${refs !== 1 ? 's' : ''}`,
  );
  return { operation: 'symbol_lookup', target: symbol, locations, impactedFiles: [], summary };
}

/** Compute the impact set (dependents) for a proposed write-set. */
export async function computeImpactSet(
  files: string[],
  client: CodeGraphClient = NULL_CLIENT,
  readScope?: string[],
): Promise<CodeGraphResult> {
  const target = files.join(',');
  const raw = await client.query({ operation: 'impact', target, readScope });
  const allImpacted = raw.impacted_files ?? [];
  const impactedFiles = readScope && readScope.length > 0
    ? allImpacted.filter(f => globMatch(readScope, f))
    : allImpacted;
  const summary = truncateSummary(
    `impact set for ${files.length} file${files.length !== 1 ? 's' : ''}: ${impactedFiles.length} dependent${impactedFiles.length !== 1 ? 's' : ''}`,
  );
  return { operation: 'impact', target, locations: [], impactedFiles, summary };
}

/**
 * Extract the compact summary for context injection.
 * Never returns raw file content — only the pre-built summary string.
 */
export function summarizeForContext(result: CodeGraphResult): string {
  return result.summary;
}
