import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
  'objective': 'do x',
  'acceptance_criteria': {
    'files_must_exist': ['codeharness/packages/foo/src/index.ts', 'codeharness/packages/foo/src/index.test.ts'],
    'behaviors_must_pass': ['a_returns_b', 'sudo_returns_deny'],
    'commands_must_pass': ['pnpm test foo', 'pnpm typecheck'],
  },
  'test_skeleton_behaviors': ['a_returns_b', 'sudo_returns_deny'],
  'interface_stub_symbols': ['producePatchProposal'],
  'registered_stub_symbols': ['producePatchProposal', 'applyPatch'],
  'allowed_write_set': ['codeharness/packages/foo/src/**'],
  'forbidden_actions': ['no secret', 'no sudo', 'no real api'],
  'rollback_notes': 'revert the package change',
  'test_author': 'planner', 'implementer': 'dev',
}

def test_good_bundle_passes():
    ok, errs = evaluate(GOOD); assert ok, errs

def test_behavior_drift_fails():
    bad = {**GOOD, 'test_skeleton_behaviors': ['a_returns_b']}
    ok, errs = evaluate(bad); assert ok is False and any('drift' in e for e in errs)

def test_missing_test_file_fails():
    bad = {**GOOD, 'acceptance_criteria': {**GOOD['acceptance_criteria'],
           'files_must_exist': ['codeharness/packages/foo/src/index.ts']}}
    assert evaluate(bad)[0] is False

def test_unregistered_stub_fails():
    bad = {**GOOD, 'registered_stub_symbols': []}
    assert evaluate(bad)[0] is False

def test_same_author_fails():
    bad = {**GOOD, 'implementer': 'planner'}
    assert evaluate(bad)[0] is False
