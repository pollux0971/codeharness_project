"""Rubric for a REST API scaffold spec. Returns (ok, errors). Input: spec dict."""
REQUIRED_COMMANDS = {'build', 'test', 'typecheck'}
FRAMEWORKS = {'express', 'fastify', 'hono'}
REQUIRED_DIRS = {'src', 'src/routes', 'src/middleware'}

def evaluate(spec):
    e = []
    if not (spec.get('project_name') or '').strip():
        e.append('missing project_name')
    tech = spec.get('tech_stack') or {}
    if tech.get('runtime') not in ('node', 'nodejs'):
        e.append('runtime must be node')
    if tech.get('language') not in ('typescript', 'ts'):
        e.append('language must be typescript')
    if tech.get('framework') not in FRAMEWORKS:
        e.append(f'framework must be one of {sorted(FRAMEWORKS)}')
    cmds = set(spec.get('quality_bar_commands') or [])
    missing = REQUIRED_COMMANDS - cmds
    if missing:
        e.append(f'quality_bar_commands missing: {sorted(missing)}')
    dirs = set(spec.get('directories') or [])
    miss_dirs = REQUIRED_DIRS - dirs
    if miss_dirs:
        e.append(f'directories missing: {sorted(miss_dirs)}')
    routes = spec.get('routes') or []
    if not any(r.get('path') == '/health' for r in routes):
        e.append('REST service spec must include /health route')
    return (len(e) == 0, e)
