import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_impact_contract", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'contract_id': 'contract-020-001',
    'impact_set': ['src/auth/login.ts', 'src/auth/session.ts', 'tests/auth/'],
    'regression_tests': ['tests/auth/login.test.ts', 'tests/auth/session.test.ts'],
    'rollback_ref': 'checkpoint-2026-01-15-auth',
    'write_set': ['src/auth/login.ts', 'src/auth/session.ts'],
}

def test_good_contract_passes():
    ok, e = evaluate(GOOD)
    assert ok, e

def test_missing_contract_id_fails():
    bad = {k: v for k, v in GOOD.items() if k != 'contract_id'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('contract_id' in msg for msg in e)

def test_empty_impact_set_fails():
    bad = {**GOOD, 'impact_set': []}
    ok, e = evaluate(bad)
    assert not ok
    assert any('impact_set' in msg for msg in e)

def test_missing_regression_tests_fails():
    bad = {**GOOD, 'regression_tests': []}
    ok, e = evaluate(bad)
    assert not ok
    assert any('regression_tests' in msg for msg in e)

def test_missing_rollback_ref_fails():
    bad = {k: v for k, v in GOOD.items() if k != 'rollback_ref'}
    ok, e = evaluate(bad)
    assert not ok
    assert any('rollback_ref' in msg for msg in e)

def test_empty_write_set_fails():
    bad = {**GOOD, 'write_set': []}
    ok, e = evaluate(bad)
    assert not ok
    assert any('write_set' in msg for msg in e)
