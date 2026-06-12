import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_delta_spec", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'delta_id': 'delta-001',
    'affected_files': ['src/auth/login.ts', 'src/auth/session.ts'],
    'change_summary': 'Migrate session tokens to httpOnly cookies for compliance.',
    'write_set': ['src/auth/'],
    'public_api_frozen': ['src/api/public/'],
}

def test_good_delta_passes():
    ok, e = evaluate(GOOD)
    assert ok, e

def test_missing_delta_id_fails():
    bad = {k: v for k, v in GOOD.items() if k != 'delta_id'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('delta_id' in msg for msg in e)

def test_empty_affected_files_fails():
    bad = {**GOOD, 'affected_files': []}
    ok, e = evaluate(bad)
    assert not ok
    assert any('affected_files' in msg for msg in e)

def test_short_change_summary_fails():
    bad = {**GOOD, 'change_summary': 'Fix bug.'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('20 characters' in msg for msg in e)

def test_write_set_overlaps_frozen_fails():
    bad = {**GOOD, 'write_set': ['src/api/public/auth.ts'], 'public_api_frozen': ['src/api/public/']}
    ok, e = evaluate(bad)
    assert not ok
    assert any('overlaps' in msg for msg in e)

def test_no_frozen_paths_passes():
    ok, e = evaluate({**GOOD, 'public_api_frozen': []})
    assert ok, e
