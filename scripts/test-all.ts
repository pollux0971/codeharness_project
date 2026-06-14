/**
 * test-all.ts — the layered test runner (L0→L4) + spec-coverage manifest.
 *
 *   node --experimental-strip-types scripts/test-all.ts            # L0–L4a
 *   node --experimental-strip-types scripts/test-all.ts --until=L3 # stop after coordination
 *   CODEHARNESS_LIVE_SMOKE=1 node ... scripts/test-all.ts          # also run L4b live smoke
 *
 * Ordered, fail-fast across layers; within a layer, run all and report. Emits
 * artifacts/test-report.json. Exits non-zero if any gate failed OR spec coverage regressed
 * below the committed baseline.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VALIDATION_DIR = path.join(ROOT, 'docs', 'validation');
const TESTS_DIR = path.join(ROOT, 'tests');
const ARTIFACTS = path.join(ROOT, 'artifacts');

// Invoke node-based tools through the ABSOLUTE node binary, not the `npx`/`node`
// PATH shim. On snap-packaged Node the shim silently drops child stdout when it
// is re-invoked from within an already-running node process (as execSync does),
// which makes every vitest layer report an empty-detail FAIL even when green.
// process.execPath is the real binary and is immune to that. tsc/vitest are
// resolved from node_modules so we never shell out to a wrapper.
const NODE = process.execPath;
const VITEST = `${NODE} ${path.join(ROOT, 'node_modules', 'vitest', 'vitest.mjs')}`;
const TSC = `${NODE} ${path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')}`;

type LayerId = 'L0' | 'L1' | 'L2' | 'L3' | 'L4a' | 'L4b';
interface LayerResult { id: LayerId; name: string; passed: boolean; skipped?: boolean; detail?: string }

const arg = process.argv.find(a => a.startsWith('--until='));
const until = (arg?.split('=')[1] ?? 'L4a') as LayerId;
const ORDER: LayerId[] = ['L0', 'L1', 'L2', 'L3', 'L4a', 'L4b'];
const stopAfter = ORDER.indexOf(until);

function run(cmd: string): { ok: boolean; out: string } {
  try { return { ok: true, out: execSync(cmd, { cwd: ROOT, stdio: 'pipe' }).toString() }; }
  catch (e: unknown) { const err = e as { stdout?: Buffer; stderr?: Buffer }; return { ok: false, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }; }
}

// --- spec coverage manifest -----------------------------------------------------------
/** Parse "| 7 | … |" table rows from a validation doc into row IDs like "00#7". */
function specifiedRows(): Set<string> {
  const rows = new Set<string>();
  for (const file of fs.existsSync(VALIDATION_DIR) ? fs.readdirSync(VALIDATION_DIR) : []) {
    const m = file.match(/^(\d{2})_/); if (!m) continue;
    const prefix = m[1];
    const text = fs.readFileSync(path.join(VALIDATION_DIR, file), 'utf8');
    for (const line of text.split('\n')) {
      const r = line.match(/^\|\s*(\d+)\s*\|/);            // numbered table rows
      if (r) rows.add(`${prefix}#${r[1]}`);
    }
    // invariants doc: numbered list "1. **…**" — keyed on FILENAME (only the
    // runtime-invariants doc), so design docs that merely mention "invariant" in
    // prose (06/07) don't get their workflow steps miscounted as spec rows.
    if (/INVARIANT/i.test(file)) for (const line of text.split('\n')) { const r = line.match(/^(\d+)\.\s+\*\*/); if (r) rows.add(`${prefix}#${r[1]}`); }
  }
  return rows;
}

/** Parse specCase('00#7,00#8', …) and [00#7] it-names from test files into encoded row IDs. */
function encodedRows(): Set<string> {
  const rows = new Set<string>();
  const walk = (dir: string) => { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.test\.ts$/.test(e.name)) {
      const text = fs.readFileSync(p, 'utf8');
      for (const m of text.matchAll(/specCase\(\s*'([^']+)'/g)) for (const id of m[1].split(',')) rows.add(id.trim());
      for (const m of text.matchAll(/\[(\d{2}#\d+)\]/g)) rows.add(m[1]);   // [00#7] it-name tags
    }
  } };
  walk(TESTS_DIR);
  return rows;
}

function coverage() {
  const specified = specifiedRows(); const encoded = encodedRows();
  const missing = [...specified].filter(r => !encoded.has(r)).sort();
  return { specifiedCount: specified.size, encodedCount: [...encoded].filter(r => specified.has(r)).length, missing };
}

// --- layers ----------------------------------------------------------------------------
function layer(id: LayerId, name: string, fn: () => LayerResult): LayerResult {
  if (ORDER.indexOf(id) > stopAfter) return { id, name, passed: true, skipped: true };
  process.stdout.write(`\n=== ${id} ${name} ===\n`);
  const res = fn(); process.stdout.write(res.skipped ? '  (skipped)\n' : res.passed ? '  PASS\n' : `  FAIL\n${res.detail ?? ''}\n`);
  return res;
}

const results: LayerResult[] = [];
results.push(layer('L0', 'static + schema conformance', () => { const r = run(`${TSC} -b --pretty false`); return { id: 'L0', name: 'static', passed: r.ok, detail: r.out }; }));
const gate = (r: LayerResult) => { if (!r.skipped && !r.passed) { finish(); process.exit(1); } };
gate(results[results.length - 1]);

results.push(layer('L1', 'unit (vitest packages + pytest skills)', () => {
  const v = run(`${VITEST} run packages --passWithNoTests`); const py = run('python3 -m pytest -q skills/');
  return { id: 'L1', name: 'unit', passed: v.ok && py.ok, detail: v.ok ? py.out : v.out };
})); gate(results[results.length - 1]);

results.push(layer('L2', 'seam / integration', () => { const r = run(`${VITEST} run tests/seam --passWithNoTests`); return { id: 'L2', name: 'seam', passed: r.ok, detail: r.out }; })); gate(results[results.length - 1]);

results.push(layer('L3', 'coordination (multi-agent + invariants)', () => { const r = run(`${VITEST} run tests/coordination --passWithNoTests`); return { id: 'L3', name: 'coordination', passed: r.ok, detail: r.out }; })); gate(results[results.length - 1]);

results.push(layer('L4a', 'scenario / real-use (scripted)', () => { const r = run(`${VITEST} run tests/scenario --passWithNoTests`); return { id: 'L4a', name: 'scenario', passed: r.ok, detail: r.out }; })); gate(results[results.length - 1]);

results.push(layer('L4b', 'live-provider smoke (opt-in)', () => {
  if (process.env.CODEHARNESS_LIVE_SMOKE !== '1') return { id: 'L4b', name: 'live-smoke', passed: true, skipped: true };
  const r = run(`${VITEST} run tests/live-smoke --passWithNoTests`); return { id: 'L4b', name: 'live-smoke', passed: r.ok, detail: r.out };
}));

// --- coverage gate + report ------------------------------------------------------------
function finish() {
  const cov = coverage();
  const pct = cov.specifiedCount ? Math.round((cov.encodedCount / cov.specifiedCount) * 100) : 100;
  process.stdout.write(`\n=== SPEC COVERAGE ===\n  ${cov.encodedCount}/${cov.specifiedCount} specified rows encoded (${pct}%)\n`);
  if (cov.missing.length) process.stdout.write(`  missing: ${cov.missing.join(', ')}\n`);

  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const reportPath = path.join(ARTIFACTS, 'test-report.json');
  const prev = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
  const baseline = prev?.coverage?.pct ?? 0;
  const report = {
    ts: new Date().toISOString(),
    layers: results.map(r => ({ id: r.id, passed: r.passed, skipped: !!r.skipped })),
    coverage: { ...cov, pct },
    regressed: pct < baseline,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  if (report.regressed) process.stdout.write(`\n  COVERAGE REGRESSED: ${pct}% < baseline ${baseline}%\n`);
  return report;
}

const report = finish();
const anyFail = results.some(r => !r.skipped && !r.passed) || report.regressed;
process.exit(anyFail ? 1 : 0);
