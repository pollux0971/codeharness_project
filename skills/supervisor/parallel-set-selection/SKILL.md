# Skill: parallel-set-selection (supervisor)

## When to use
Given a list of candidate stories (with `parallelism_class` and `allowed_write_set`),
identify safe parallel sets — stories whose write-sets do not overlap and whose
`parallelism_class` is `parallel_safe`.

## Inputs / Outputs
- **In:** `stories` list (each with `story_id`, `parallelism_class`, `allowed_write_set`).
- **Out:** `selection` dict with `parallel_set` (list of story_ids), `sequential_next` (str|None),
  `overlap_conflicts` (list).

## Procedure
1. Filter candidates to only `parallelism_class == parallel_safe`.
2. For each candidate pair, check whether their write-sets share a common glob prefix.
3. Emit a `parallel_set` of non-overlapping parallel_safe stories.
4. Set `sequential_next` to the first sequential story not in the parallel set.
5. Record any `overlap_conflicts` detected.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. All stories in `parallel_set` must have `parallelism_class == parallel_safe`.
2. No two stories in `parallel_set` may have overlapping write-sets (prefix check).
3. Stories in `parallel_set` must exist in the input `stories` list.

## Postconditions
`scripts/evaluate.py` returns ok; no write-set conflicts in the emitted parallel set.

## Notes
AVOID including `sequential` stories in the parallel set — the harness will serialize them.
AVOID ignoring prefix overlap — two globs that share a prefix can mutate the same files.
Lessons in `.memory.md`.
