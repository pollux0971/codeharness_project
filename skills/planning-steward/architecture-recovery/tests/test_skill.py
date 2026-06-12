import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_arch_recovery", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'intake_id': 'bf-001',
    'repo_path': '/tmp/repo',
    'intake_at': '2026-01-01T00:00:00Z',
    'entry_points': ['src/index.ts'],
    'layers': [{'name': 'domain', 'paths': ['src/domain/']}, {'name': 'test', 'paths': ['test/']}],
    'dependency_map': {},
    'conventions': {},
    'recovery_docs_path': '/tmp/out/as-is',
}

def test_good_recovery_passes():
    ok, e = evaluate(GOOD)
    assert ok, e

def test_missing_intake_id_fails():
    bad = {k: v for k, v in GOOD.items() if k != 'intake_id'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('intake_id' in msg for msg in e)

def test_unknown_layer_fails():
    bad = {**GOOD, 'layers': [{'name': 'unknown_xyz', 'paths': ['xyz/']}]}
    ok, e = evaluate(bad)
    assert not ok
    assert any('unknown layer' in msg for msg in e)

def test_recovery_docs_path_not_in_asis_fails():
    bad = {**GOOD, 'recovery_docs_path': '/tmp/out/docs'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('as-is' in msg for msg in e)

def test_wrote_inside_source_repo_fails():
    bad = {**GOOD, 'wrote_inside_source_repo': True}
    ok, e = evaluate(bad)
    assert not ok
    assert any('source repo' in msg for msg in e)
