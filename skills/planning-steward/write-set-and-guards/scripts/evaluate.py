"""Rubric for allowed_write_set + forbidden_actions. Returns (ok, errors)."""
import re
GLOB_OK = re.compile(r'^[A-Za-z0-9_./*-]+$')
PROTECTED = ('.git', '.env', 'secrets/', '.ssh', 'reserved_patches', 'stable/')
GUARDS = ('secret', 'sudo', 'api')
TOO_BROAD = {'**', '/**', '*', '.', './**', './', '/'}

def _covers(glob: str, f: str) -> bool:
    rx = '^' + re.escape(glob).replace(r'\*\*', '§').replace(r'\*', '[^/]*').replace('§', '.*') + '$'
    return re.match(rx, f) is not None

def evaluate(allowed_write_set, forbidden_actions, peer_write_sets=None, behavior_files=None):
    errors = []
    if not allowed_write_set:
        errors.append('allowed_write_set is empty')
    for g in allowed_write_set:
        if not GLOB_OK.match(g):
            errors.append(f'invalid glob: {g!r}')
        if g.strip() in TOO_BROAD:
            errors.append(f'write-set too broad (repo-wide): {g!r}')
        if any(p in g for p in PROTECTED):
            errors.append(f'write-set includes protected path: {g!r}')
    joined = ' '.join(forbidden_actions).lower()
    for guard in GUARDS:
        if guard not in joined:
            errors.append(f'forbidden_actions missing guard: no {guard}')
    if peer_write_sets:
        norm = lambda s: s.rstrip('*').rstrip('/')
        for peer in peer_write_sets:
            for a in allowed_write_set:
                for b in peer:
                    na, nb = norm(a), norm(b)
                    if na and nb and (na.startswith(nb) or nb.startswith(na)):
                        errors.append(f'write-set overlaps a parallel story: {a!r} ~ {b!r}')
    if behavior_files:
        for f in behavior_files:
            if not any(_covers(g, f) for g in allowed_write_set):
                errors.append(f'behavior file not covered by write-set: {f}')
    return (len(errors) == 0, errors)
