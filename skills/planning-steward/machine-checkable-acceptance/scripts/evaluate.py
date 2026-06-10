"""Executable rubric for a machine-checkable acceptance_criteria block.
Input is the parsed dict (so tests need no YAML parser). Returns (ok, errors)."""
import re
ID = re.compile(r'^[a-z][a-z0-9_]*$')

def evaluate(ac: dict, test_file_text=None):
    errors = []
    behaviors = ac.get('behaviors_must_pass') or []
    files = ac.get('files_must_exist') or []
    cmds = ac.get('commands_must_pass') or []
    if not behaviors:
        errors.append('behaviors_must_pass is empty')
    for b in behaviors:
        if not ID.match(str(b)):
            errors.append(f'behavior id not snake_case test name: {b!r}')
    if not any('pnpm test' in c for c in cmds):
        errors.append('commands_must_pass missing a "pnpm test" command')
    if not any('typecheck' in c for c in cmds):
        errors.append('commands_must_pass missing "pnpm typecheck"')
    if not any(str(f).endswith('.test.ts') for f in files):
        errors.append('files_must_exist has no *.test.ts (acceptance not test-locked)')
    for k, v in ac.items():
        if k not in ('files_must_exist', 'behaviors_must_pass', 'commands_must_pass'):
            errors.append(f'unexpected/prose key in acceptance_criteria: {k}')
        elif not isinstance(v, list):
            errors.append(f'{k} must be a list')
    if test_file_text is not None:
        names = set(re.findall(r"it\(\s*['\"]([a-z0-9_]+)['\"]", test_file_text))
        for b in behaviors:
            if b not in names:
                errors.append(f'behavior {b} has no matching it() in the test file')
    return (len(errors) == 0, errors)
