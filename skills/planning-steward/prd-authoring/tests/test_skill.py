import importlib.util as _ilu
from pathlib import Path as _P
_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("se_" + _ep.parents[2].name.replace("-","_") + "_" + _ep.parents[1].name.replace("-","_"), _ep)
_mod = _ilu.module_from_spec(_spec); _spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {"vision":"v","jobs_to_be_done":["j"],"user_journeys":["u"],"glossary":{"a":"b"},
        "functional_requirements":[{"id":"FR1","statement":"do x"}],
        "non_functional_requirements":["nfr"],"success_metrics":["m"]}
def test_good_prd_passes(): ok,e=evaluate(GOOD); assert ok,e
def test_missing_vision_fails(): assert evaluate({k:v for k,v in GOOD.items() if k!="vision"})[0] is False
def test_fr_without_id_fails(): assert evaluate({**GOOD,"functional_requirements":[{"statement":"x"}]})[0] is False
def test_empty_success_metrics_fails(): assert evaluate({**GOOD,"success_metrics":[]})[0] is False
