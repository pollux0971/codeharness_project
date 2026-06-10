"""Executable rubric for a documented stub + its registry entry.
stub_source: the function source; symbol/file: identity; registry: list of {symbol,file,owner}."""
import re
OWNER = re.compile(r'^(STORY-\d|ROADMAP:phase-\d)')

def evaluate(stub_source, symbol, file, registry):
    errors = []
    if not re.search(r"not implemented:\s*\S", stub_source):
        errors.append('stub does not throw "not implemented: ..."')
    if symbol not in stub_source:
        errors.append('stub message does not name the symbol')
    if not re.search(rf'export (?:async )?function {re.escape(symbol)}\s*\([^)]*\)\s*:', stub_source):
        errors.append('stub lost its typed signature (params + return)')
    entry = next((e for e in registry if e['symbol'] == symbol and e['file'] == file), None)
    if not entry:
        errors.append(f'no registry entry for {symbol} ({file})')
    elif not OWNER.match(entry.get('owner', '')):
        errors.append(f'owner not a STORY-/ROADMAP:phase- id: {entry.get("owner")!r}')
    return (len(errors) == 0, errors)

def find_orphans(found, registry):
    """found: list of {symbol,file}. Returns registry entries with no matching stub."""
    return [e for e in registry if not any(s['symbol'] == e['symbol'] and s['file'] == e['file'] for s in found)]
