import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
  'files_must_exist': ['codeharness/packages/foo/src/index.ts', 'codeharness/packages/foo/src/index.test.ts'],
  'behaviors_must_pass': ['plan_mode_write_file_returns_deny', 'sudo_returns_deny'],
  'commands_must_pass': ['pnpm test foo', 'pnpm typecheck'],
}

def test_good_acceptance_passes():
    ok, errs = evaluate(GOOD); assert ok, errs

def test_prose_behavior_fails():
    assert evaluate({**GOOD, 'behaviors_must_pass': ['tests pass']})[0] is False

def test_missing_test_file_fails():
    assert evaluate({**GOOD, 'files_must_exist': ['codeharness/packages/foo/src/index.ts']})[0] is False

def test_behavior_must_map_to_it_name():
    skeleton = "describe('foo', () => { it('sudo_returns_deny', () => {}); });"
    ok, errs = evaluate(GOOD, skeleton)
    assert ok is False and any('plan_mode' in e for e in errs)
