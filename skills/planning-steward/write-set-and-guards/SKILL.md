# Skill: write-set-and-guards (planning_steward)

## When to use
When scoping a story, to derive the enforceable `allowed_write_set` (globs) and
`forbidden_actions` the Permission Gateway enforces — minimal blast radius, disjoint
from parallel stories, with mandatory safety guards.

## Inputs / Outputs
- **In:** the files the behaviors touch (impl + test), and (optionally) the write-sets of
  sibling stories that may run in parallel.
- **Out:**
```yaml
allowed_write_set: [ "codeharness/packages/<pkg>/src/**" ]   # globs, minimal
forbidden_actions:
  - "Do not read secrets."   # no secret
  - "Do not use sudo."       # no sudo
  - "Do not call real APIs." # no api
```

## Procedure
1. Start from the exact files the behaviors create/modify; widen only to the smallest
   glob that covers them (prefer `<pkg>/src/**` over a repo-wide pattern).
2. Include the test file path so the implementer may extend tests within scope.
3. Ensure the write-set is **disjoint** from every parallel story's write-set.
4. Exclude protected paths (`.git`, `.env`, `secrets/`, `.ssh`, `reserved_patches`, `stable/`).
5. Always add the three mandatory guards (secret / sudo / real-api) to `forbidden_actions`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `allowed_write_set` is non-empty and every entry is a valid glob (path chars + `*`/`**`).
2. no entry is repo-wide (`**`, `*`, `.`, `./**`) — blast radius must be bounded.
3. no entry includes a protected path fragment.
4. `forbidden_actions` contains all three guards: no secret, no sudo, no real api.
5. (if peers given) no write-set glob overlaps a parallel story's glob.
6. (if behavior files given) every behavior file is covered by some glob.

## Postconditions
`scripts/evaluate.py` returns ok; `validator-suite.validateForbiddenActions` returns ok.

## Notes
AVOID a bare `**` or repo-root write-set — it defeats the Gateway. Lessons in `.memory.md`.
