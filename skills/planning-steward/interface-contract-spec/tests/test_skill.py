import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

SPEC = ("export function evaluateToolRequest(req: ToolRequest, oracle: WorkspaceOracle): PolicyDecision {}\n"
        "export function resolveRealPath(p: string): string {}")
CONTRACTS = {
  'evaluateToolRequest': {'pre': 'req built', 'post': 'returns allow/ask/deny', 'throws': 'none'},
  'resolveRealPath': {'post': 'absolute realpath'},
}

def test_typed_contract_passes():
    ok, errs = evaluate(SPEC, CONTRACTS); assert ok, errs

def test_missing_return_type_fails():
    assert evaluate("export function f(x: string) {}", {'f': {'post': 'p'}})[0] is False

def test_self_reported_trust_flag_fails():
    bad = "export function f(req: { isDisposable?: boolean }): R {}"
    assert evaluate(bad, {'f': {'post': 'p'}})[0] is False

def test_orphan_contract_fails():
    assert evaluate(SPEC, {**CONTRACTS, 'ghost': {'post': 'x'}})[0] is False
