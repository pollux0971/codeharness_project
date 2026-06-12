# Skill: decision-matrix-routing (supervisor)

## When to use
Apply `configs/decision_matrix.yaml` rules: given current harness state + story status +
attempt counts, return exactly one action (develop / debug / escalate / checkpoint / stop).

## Inputs / Outputs
- **In:** `routing` dict with `state`, `story_status`, `attempts`, `budget`, `validation_passed`, `result`.
- **Out:** a `routing` dict with `state`, `action`, and optional `reason`.

## Procedure
1. Map current `state` to the decision_matrix row.
2. If `attempts >= budget` → action must be `escalate_human`.
3. If `validation_passed` is True → action must be `write_checkpoint` or `mark_story_done`, never `route_debugger`.
4. Otherwise select action from the matrix by state + story_status.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `state` is a valid harness state.
2. `action` is a valid harness action.
3. Budget exhaustion forces `escalate_human`.
4. Validation pass must not result in `route_debugger`.

## Postconditions
`scripts/evaluate.py` returns ok; exactly one action emitted per routing call.

## Notes
AVOID emitting multiple actions — the harness executes exactly one per turn.
AVOID `route_debugger` after a validation pass — that discards passing work.
Lessons in `.memory.md`.
