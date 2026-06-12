import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_crud_web_app_template", _ep)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'project_name': 'my-crud-app',
    'tech_stack': {'framework': 'vite-react', 'language': 'typescript'},
    'quality_bar_commands': ['build', 'test', 'typecheck'],
    'directories': ['src', 'src/components', 'public'],
    'entry_point': 'src/main.tsx',
}

def test_good_spec_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_wrong_framework_fails():
    bad = {**GOOD, 'tech_stack': {'framework': 'create-react-app', 'language': 'typescript'}}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('vite-react' in e for e in errs)

def test_missing_quality_bar_commands_fails():
    bad = {**GOOD, 'quality_bar_commands': ['build', 'test']}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('typecheck' in e for e in errs)

def test_missing_required_directory_fails():
    bad = {**GOOD, 'directories': ['src', 'public']}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('src/components' in e for e in errs)

def test_non_typescript_language_fails():
    bad = {**GOOD, 'tech_stack': {'framework': 'vite-react', 'language': 'javascript'}}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('typescript' in e for e in errs)

def test_template_scaffolds_pass_quality_bar():
    """Every template spec must include build, test, typecheck in quality_bar_commands."""
    ok, errs = evaluate(GOOD)
    assert ok, errs
    assert 'build' in GOOD['quality_bar_commands']
    assert 'test' in GOOD['quality_bar_commands']
    assert 'typecheck' in GOOD['quality_bar_commands']
