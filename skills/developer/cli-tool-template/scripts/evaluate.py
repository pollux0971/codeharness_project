"""Rubric for a CLI Tool scaffold spec. Returns (ok, errors). Input: spec dict."""
REQUIRED_COMMANDS = {'build', 'test', 'typecheck'}
PARSERS = {'commander', 'yargs', 'minimist', 'none'}
REQUIRED_DIRS = {'src', 'bin'}

def evaluate(spec):
    e = []
    if not (spec.get('project_name') or '').strip():
        e.append('missing project_name')
    tech = spec.get('tech_stack') or {}
    if tech.get('language') not in ('typescript', 'ts'):
        e.append('language must be typescript')
    if tech.get('arg_parser') not in PARSERS:
        e.append(f'arg_parser must be one of {sorted(PARSERS)}')
    cmds = set(spec.get('quality_bar_commands') or [])
    missing = REQUIRED_COMMANDS - cmds
    if missing:
        e.append(f'quality_bar_commands missing: {sorted(missing)}')
    dirs = set(spec.get('directories') or [])
    miss_dirs = REQUIRED_DIRS - dirs
    if miss_dirs:
        e.append(f'directories missing: {sorted(miss_dirs)}')
    subcommands = spec.get('subcommands') or []
    if not subcommands:
        e.append('cli-tool spec must declare at least one subcommand')
    if not spec.get('bin_entry'):
        e.append('missing bin_entry')
    return (len(e) == 0, e)
