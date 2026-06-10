"""Rubric for a StoryContract (mirrors validator-suite.validateStoryContract + extras)."""
GUARDS = ('secret', 'sudo', 'api')
def _nonempty_list(v): return isinstance(v, list) and len(v) > 0
def _machine_checkable(ac):
    o = ac if isinstance(ac, dict) else {}
    return any(_nonempty_list(o.get(k)) for k in ('files_must_exist', 'behaviors_must_pass', 'commands_must_pass'))
def evaluate(c: dict):
    e = []
    if not (c.get('objective') or '').strip(): e.append('missing objective')
    if not _nonempty_list(c.get('allowed_write_set')): e.append('allowed_write_set must be a non-empty array')
    if not _machine_checkable(c.get('acceptance_criteria')): e.append('acceptance_criteria not machine-checkable')
    if not _nonempty_list(c.get('validation_commands')): e.append('validation_commands must be a non-empty array')
    if len((c.get('rollback_notes') or '').strip()) < 8: e.append('rollback_notes too vague')
    joined = ' '.join(c.get('forbidden_actions') or []).lower()
    for g in GUARDS:
        if g not in joined: e.append(f'forbidden_actions missing guard: no {g}')
    if c.get('attempt_budget') in (None, ''): e.append('missing attempt_budget')
    if not c.get('parallelism_class'): e.append('missing parallelism_class')
    if not isinstance(c.get('depends_on'), list): e.append('depends_on must be an array')
    return (len(e) == 0, e)
