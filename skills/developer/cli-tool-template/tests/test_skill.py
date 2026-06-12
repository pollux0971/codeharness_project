import importlib.util as _ilu
from pathlib import Path as _P

_ep = _P(__file__).parents[1] / "scripts" / "evaluate.py"
_spec = _ilu.spec_from_file_location("eval_cli_tool_template", _ep)
_mod = _ilu.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
evaluate = _mod.evaluate

GOOD = {
    'project_name': 'my-cli-tool',
    'tech_stack': {'language': 'typescript', 'arg_parser': 'commander'},
    'quality_bar_commands': ['build', 'test', 'typecheck'],
    'directories': ['src', 'bin'],
    'subcommands': [{'name': 'run', 'description': 'Run the tool'}],
    'bin_entry': 'bin/cli.js',
}

def test_good_spec_passes():
    ok, errs = evaluate(GOOD)
    assert ok, errs

def test_no_subcommands_fails():
    bad = {**GOOD, 'subcommands': []}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('subcommand' in e for e in errs)

def test_missing_bin_entry_fails():
    bad = {**GOOD, 'bin_entry': ''}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('bin_entry' in e for e in errs)

def test_bad_arg_parser_fails():
    bad = {**GOOD, 'tech_stack': {'language': 'typescript', 'arg_parser': 'docopt'}}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('arg_parser' in e for e in errs)

def test_missing_quality_bar_commands_fails():
    bad = {**GOOD, 'quality_bar_commands': ['build', 'typecheck']}
    ok, errs = evaluate(bad)
    assert not ok
    assert any('test' in e for e in errs)

def test_template_scaffolds_pass_quality_bar():
    """Every template spec must include build, test, typecheck in quality_bar_commands."""
    ok, errs = evaluate(GOOD)
    assert ok, errs
    assert 'build' in GOOD['quality_bar_commands']
    assert 'test' in GOOD['quality_bar_commands']
    assert 'typecheck' in GOOD['quality_bar_commands']
