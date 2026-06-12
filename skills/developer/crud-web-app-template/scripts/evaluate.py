"""Rubric for a CRUD Web App scaffold spec. Returns (ok, errors). Input: spec dict."""
REQUIRED_COMMANDS = {'build', 'test', 'typecheck'}
REQUIRED_DIRS = {'src', 'src/components', 'public'}

def evaluate(spec):
    e = []
    if not (spec.get('project_name') or '').strip():
        e.append('missing project_name')
    tech = spec.get('tech_stack') or {}
    if tech.get('framework') != 'vite-react':
        e.append(f'expected framework vite-react; got {tech.get("framework")}')
    if tech.get('language') not in ('typescript', 'ts'):
        e.append('language must be typescript')
    cmds = set(spec.get('quality_bar_commands') or [])
    missing = REQUIRED_COMMANDS - cmds
    if missing:
        e.append(f'quality_bar_commands missing: {sorted(missing)}')
    dirs = set(spec.get('directories') or [])
    miss_dirs = REQUIRED_DIRS - dirs
    if miss_dirs:
        e.append(f'directories missing: {sorted(miss_dirs)}')
    if not spec.get('entry_point'):
        e.append('missing entry_point')
    return (len(e) == 0, e)
