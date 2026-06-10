"""Cross-artifact consistency rubric for a fully-assembled spec bundle. Returns (ok, errors)."""
def evaluate(bundle: dict):
    errors = []
    ac = bundle.get('acceptance_criteria') or {}
    behaviors = set(ac.get('behaviors_must_pass') or [])
    files = ac.get('files_must_exist') or []
    test_behaviors = set(bundle.get('test_skeleton_behaviors') or [])
    contract_stubs = bundle.get('interface_stub_symbols') or []
    registry_symbols = set(bundle.get('registered_stub_symbols') or [])
    forbidden = ' '.join(bundle.get('forbidden_actions') or []).lower()

    if not behaviors:
        errors.append('behaviors_must_pass is empty')
    if behaviors != test_behaviors:
        missing = behaviors - test_behaviors
        extra = test_behaviors - behaviors
        errors.append(f'behavior drift: acceptance != test skeleton (missing={sorted(missing)}, extra={sorted(extra)})')
    if not any(str(f).endswith('.test.ts') for f in files):
        errors.append('files_must_exist missing a *.test.ts')
    if not any(str(f).endswith('.ts') and not str(f).endswith('.test.ts') for f in files):
        errors.append('files_must_exist missing an implementation *.ts')
    for s in contract_stubs:
        if s not in registry_symbols:
            errors.append(f'unregistered documented stub: {s}')
    for guard in ('secret', 'sudo', 'api'):
        if guard not in forbidden:
            errors.append(f'forbidden_actions missing guard: no {guard}')
    if len((bundle.get('rollback_notes') or '').strip()) < 8:
        errors.append('rollback_notes too vague')
    if bundle.get('test_author') and bundle.get('test_author') == bundle.get('implementer'):
        errors.append('acceptance-test integrity violated: test_author == implementer')
    return (len(errors) == 0, errors)
