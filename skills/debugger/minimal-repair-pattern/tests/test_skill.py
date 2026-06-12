import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("debugger_mrp_eval", _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'operator': 'INSERT_PREREQ',
    'target_file': 'src/processor.py',
    'change_description': 'Add None guard before validate() call on line 42',
    'rollback_notes': 'Revert line 42 addition; re-run test suite to confirm',
    'changed_files': ['src/processor.py'],
    'is_new_feature': False,
}

def test_good_minimal_repair_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_bad_grasp_operator_fails():
    ok, errs = evaluate({**GOOD, 'operator': 'NUKE'})
    assert not ok
    assert any('bad operator' in err for err in errs)

def test_missing_rollback_fails():
    ok, errs = evaluate({**GOOD, 'rollback_notes': ''})
    assert not ok
    assert any('rollback_notes' in err for err in errs)

def test_too_many_files_fails():
    ok, errs = evaluate({**GOOD, 'changed_files': ['a.py', 'b.py', 'c.py', 'd.py']})
    assert not ok
    assert any('4 files' in err for err in errs)

def test_new_feature_add_fails():
    ok, errs = evaluate({**GOOD, 'operator': 'ADD', 'is_new_feature': True})
    assert not ok
    assert any('new features' in err for err in errs)
