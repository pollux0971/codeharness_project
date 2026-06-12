import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_as_is_doc", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD_ARCH = {
    'doc_type': 'ARCHITECTURE',
    'content': 'Entry points: src/index.ts. Layers: api, domain, infra. Dependencies: express, pg.',
}

GOOD_CONV = {
    'doc_type': 'CONVENTIONS',
    'content': 'Language: TypeScript. Framework: Express. Lint: ESLint. Tests: Vitest.',
}

def test_good_architecture_passes():
    ok, e = evaluate(GOOD_ARCH)
    assert ok, e

def test_good_conventions_passes():
    ok, e = evaluate(GOOD_CONV)
    assert ok, e

def test_invalid_doc_type_fails():
    bad = {**GOOD_ARCH, 'doc_type': 'README'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('doc_type' in msg for msg in e)

def test_content_too_short_fails():
    bad = {**GOOD_CONV, 'content': 'Short.'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('50 characters' in msg for msg in e)

def test_forward_looking_language_fails():
    bad = {**GOOD_CONV, 'content': 'Language: TypeScript. TODO: add linting rules later. Framework: Express.'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('forward-looking' in msg for msg in e)

def test_architecture_missing_entry_fails():
    bad = {'doc_type': 'ARCHITECTURE', 'content': 'Layers: api, domain, infra. Dependencies: express, pg, redis.'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('entry' in msg for msg in e)
