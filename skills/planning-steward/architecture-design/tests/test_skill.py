import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {"decisions":[{"id":"ADR1","context":"c","decision":"d","consequences":"x"}],
        "component_boundaries":["b"],"tech_stack":["ts"]}
def test_good_arch_passes(): ok,e=evaluate(GOOD); assert ok,e
def test_decision_missing_consequences_fails(): assert evaluate({**GOOD,"decisions":[{"id":"A","context":"c","decision":"d"}]})[0] is False
def test_missing_boundaries_fails(): assert evaluate({k:v for k,v in GOOD.items() if k!="component_boundaries"})[0] is False
def test_no_decisions_fails(): assert evaluate({"component_boundaries":["b"],"tech_stack":["t"]})[0] is False
