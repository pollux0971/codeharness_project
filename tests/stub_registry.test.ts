import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDocumentedStubsHaveStory, StubRef } from '../packages/validator-suite/src/index';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgsDir = path.join(here, '..', 'packages');
const storiesDir = path.join(here, '..', '..', 'builder', 'stories');
const registry = JSON.parse(fs.readFileSync(path.join(here, '..', 'specs', 'stub_registry.json'), 'utf8'));

function scanStubs(): StubRef[] {
  const found: StubRef[] = [];
  for (const pkg of fs.readdirSync(pkgsDir)) {
    const f = path.join(pkgsDir, pkg, 'src', 'index.ts');
    if (!fs.existsSync(f)) continue;
    let cur = '<module>';
    for (const ln of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = ln.match(/export (?:async )?function (\w+)/);
      if (m) cur = m[1];
      if (ln.includes('not implemented') && ln.includes('throw new Error'))
        found.push({ symbol: cur, file: `${pkg}/src/index.ts` });
    }
  }
  return found;
}

describe('stub-registry', () => {
  it('every_documented_stub_has_a_registered_owner', () => {
    const storyIds = fs.readdirSync(storiesDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    const known = new Set<string>([...storyIds, ...registry.valid_roadmap_owners]);
    const r = validateDocumentedStubsHaveStory(scanStubs(), registry.stubs, known);
    expect(r.errors).toEqual([]);
  });
  it('registry_has_no_orphan_entries', () => {
    const found = scanStubs();
    const orphans = registry.stubs.filter((e: StubRef) => !found.some(s => s.symbol === e.symbol && s.file === e.file));
    expect(orphans).toEqual([]);
  });
});
