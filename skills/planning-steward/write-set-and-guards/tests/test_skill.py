import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

WS = ['codeharness/packages/foo/src/**']
GUARDS = ['Do not read secrets.', 'Do not use sudo.', 'Do not call real APIs.']

def test_good_passes():
    ok, errs = evaluate(WS, GUARDS, behavior_files=['codeharness/packages/foo/src/index.ts']); assert ok, errs

def test_missing_guard_fails():
    assert evaluate(WS, ['Do not use sudo.', 'no real api'])[0] is False

def test_repo_wide_fails():
    assert evaluate(['**'], GUARDS)[0] is False

def test_protected_path_fails():
    assert evaluate(['codeharness/packages/foo/.git/**'], GUARDS)[0] is False

def test_parallel_overlap_fails():
    ok, errs = evaluate(['codeharness/packages/foo/src/**'], GUARDS,
                        peer_write_sets=[['codeharness/packages/foo/src/util/**']])
    assert ok is False and any('overlaps' in e for e in errs)

def test_uncovered_behavior_file_fails():
    assert evaluate(WS, GUARDS, behavior_files=['codeharness/packages/bar/src/x.ts'])[0] is False
