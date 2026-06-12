import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_rest_api_template", _ep)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'project_name': 'my-rest-api',
    'tech_stack': {'runtime': 'node', 'language': 'typescript', 'framework': 'express'},
    'quality_bar_commands': ['build', 'test', 'typecheck'],
    'directories': ['src', 'src/routes', 'src/middleware'],
    'routes': [{'path': '/health', 'method': 'GET'}, {'path': '/items', 'method': 'GET'}],
}

def test_good_spec_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_bad_runtime_fails():
    bad = {**GOOD, 'tech_stack': {'runtime': 'deno', 'language': 'typescript', 'framework': 'express'}}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('runtime' in e for e in errs)

def test_missing_health_route_fails():
    bad = {**GOOD, 'routes': [{'path': '/items', 'method': 'GET'}]}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('/health' in e for e in errs)

def test_unsupported_framework_fails():
    bad = {**GOOD, 'tech_stack': {'runtime': 'node', 'language': 'typescript', 'framework': 'koa'}}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('framework' in e for e in errs)

def test_missing_quality_bar_commands_fails():
    bad = {**GOOD, 'quality_bar_commands': ['build']}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('quality_bar_commands' in e for e in errs)

def test_template_scaffolds_pass_quality_bar():
    """Every template spec must include build, test, typecheck in quality_bar_commands."""
    ok, errs = evaluate(GOOD)
    assert ok, errs
    assert 'build' in GOOD['quality_bar_commands']
    assert 'test' in GOOD['quality_bar_commands']
    assert 'typecheck' in GOOD['quality_bar_commands']
