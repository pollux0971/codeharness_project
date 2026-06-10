import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

BEH = [
  {'id': 'parse_returns_value', 'category': 'happy'},
  {'id': 'parse_empty_returns_error', 'category': 'negative'},
  {'id': 'parse_max_length_boundary', 'category': 'boundary'},
  {'id': 'parse_secret_path_returns_deny', 'category': 'security'},
]
SKELETON = ("describe('p', () => {"
  "it('parse_returns_value', () => {});"
  "it('parse_empty_returns_error', () => {});"
  "it('parse_max_length_boundary', () => {});"
  "it('parse_secret_path_returns_deny', () => {}); });")

def test_complete_behavior_set_passes():
    ok, errs = evaluate(BEH, SKELETON, safety_relevant=True); assert ok, errs

def test_only_happy_path_fails():
    assert evaluate([{'id': 'x_ok', 'category': 'happy'}], "it('x_ok',()=>{})")[0] is False

def test_skeleton_mismatch_fails():
    ok, errs = evaluate(BEH, "it('parse_returns_value',()=>{})", safety_relevant=True)
    assert ok is False and any('it() names' in e for e in errs)
