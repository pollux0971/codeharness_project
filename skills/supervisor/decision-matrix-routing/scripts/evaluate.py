"""Rubric for a decision-matrix routing decision."""
STATES = {'resume', 'select', 'contract', 'develop', 'validate', 'debug',
          'checkpoint', 'gate', 'done'}
ACTIONS = {'develop_patch', 'route_debugger', 'escalate_human', 'write_checkpoint',
           'select_next_story', 'stop_run', 'build_contract', 'mark_story_done'}

def evaluate(routing):
    e = []
    if routing.get('state') not in STATES:
        e.append(f'bad state: {routing.get("state")}')
    action = routing.get('action')
    if action not in ACTIONS:
        e.append(f'bad action: {action}')
    if routing.get('attempts', 0) >= routing.get('budget', 3) and action != 'escalate_human':
        e.append('budget exhausted but action is not escalate_human')
    if routing.get('validation_passed') is True and action == 'route_debugger':
        e.append('validation passed but action is route_debugger')
    return (len(e) == 0, e)
