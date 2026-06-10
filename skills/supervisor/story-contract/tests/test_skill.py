import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
  'objective': 'do x',
  'allowed_write_set': ['codeharness/packages/foo/src/**'],
  'acceptance_criteria': {'behaviors_must_pass': ['a_returns_b'], 'files_must_exist': ['x.test.ts'], 'commands_must_pass': ['pnpm test foo']},
  'validation_commands': ['pnpm test foo'],
  'rollback_notes': 'revert the package change',
  'forbidden_actions': ['no secret', 'no sudo', 'no real api'],
  'attempt_budget': 3, 'parallelism_class': 'sequential', 'depends_on': [],
}
def test_good_contract_passes(): ok, errs = evaluate(GOOD); assert ok, errs
def test_empty_write_set_fails(): assert evaluate({**GOOD, 'allowed_write_set': []})[0] is False
def test_prose_acceptance_fails(): assert evaluate({**GOOD, 'acceptance_criteria': ['works']})[0] is False
def test_missing_guard_fails(): assert evaluate({**GOOD, 'forbidden_actions': ['no sudo']})[0] is False
def test_missing_attempt_budget_fails(): assert evaluate({**GOOD, 'attempt_budget': None})[0] is False
