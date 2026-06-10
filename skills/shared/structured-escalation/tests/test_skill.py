import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

def test_good_clarification(): assert evaluate({'type':'needs_clarification','reason':'ambiguous spec','requested_decision':'which behavior?'})[0]
def test_bad_type_fails(): assert evaluate({'type':'meh','reason':'r','requested_decision':'d'})[0] is False
def test_option_needs_tradeoff(): assert evaluate({'type':'needs_clarification','reason':'r','requested_decision':'d','options':[{'option_id':'a'}]})[0] is False
def test_missing_context_needs_evidence(): assert evaluate({'type':'blocked_by_missing_context','reason':'r','requested_decision':'d'})[0] is False
def test_missing_context_with_evidence_ok(): assert evaluate({'type':'blocked_by_missing_context','reason':'r','requested_decision':'d','evidence_refs':['trace#3']})[0]
