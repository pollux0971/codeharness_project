import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

def rep(**k): return {'advisory':True,'commands_run':['pnpm typecheck'],**k}
def test_passed_submit(): assert evaluate(rep(passed=True,verdict='submit',self_correction_attempts=0,same_signature_count=0))[0]
def test_failed_self_correct(): assert evaluate(rep(passed=False,verdict='self_correct',self_correction_attempts=0,same_signature_count=0))[0]
def test_repeated_escalate(): assert evaluate(rep(passed=False,verdict='escalate',self_correction_attempts=0,same_signature_count=2))[0]
def test_budget_escalate(): assert evaluate(rep(passed=False,verdict='escalate',self_correction_attempts=2,same_signature_count=0))[0]
def test_inconsistent_verdict_fails(): assert evaluate(rep(passed=True,verdict='self_correct',self_correction_attempts=0,same_signature_count=0))[0] is False
def test_disallowed_command_fails(): assert evaluate(rep(passed=True,verdict='submit',commands_run=['rm -rf x'],self_correction_attempts=0,same_signature_count=0))[0] is False
