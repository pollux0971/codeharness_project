# Skill: minimal-repair-pattern (debugger)

## When to use
After `root-cause-analysis` has produced a falsifiable hypothesis, apply the smallest
reversible fix using exactly one GRASP operator, one concern, within the existing write-set.

## Inputs / Outputs
- **In:** `{ operator, target_file, change_description, rollback_notes, changed_files?, is_new_feature? }`
- **Out:** `(ok: bool, errors: list)` — machine-checkable evaluation result.

## Procedure
1. Select exactly one `operator` from GRASP: `REBIND | INSERT_PREREQ | SUBSTITUTE | REWIRE | BYPASS`.
2. Identify the single `target_file` where the repair lands.
3. Write a clear `change_description` (what changes and why it fixes the root cause).
4. Write `rollback_notes` (how to undo if the repair introduces a regression).
5. Keep `changed_files` ≤ 3 (single concern). A repair touching more than 3 files is not minimal.
6. Never add a new feature (`is_new_feature` must be false/absent).

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `operator` ∈ {REBIND, INSERT_PREREQ, SUBSTITUTE, REWIRE, BYPASS}.
2. `target_file` non-empty.
3. `change_description` non-empty.
4. `rollback_notes` non-empty.
5. `changed_files` ≤ 3 (if provided).
6. Not a new feature addition.

## Postconditions
`scripts/evaluate.py` returns ok; repair is ready for workspace-only apply.

## Notes
NEVER rewrite the feature. NEVER add scope. A three-line fix beats a refactor.
Lessons in `.memory.md`.
