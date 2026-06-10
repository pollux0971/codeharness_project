# Skill: acceptance-test-scaffold (planning_steward)

## When to use
After deriving behaviors, to emit the **runnable** vitest `*.test.ts` skeleton that locks
the spec — authored by the planner (non-implementer) to preserve acceptance-test integrity.

## Inputs / Outputs
- **In:** the `behaviors_must_pass` list + the unit-under-test module path (e.g. `./index`).
- **Out:** a `<unit>.test.ts` file: one `it('<behavior_id>')` per behavior, importing the
  unit, with stub-lock behaviors asserting `toThrow(/not implemented/)` and the rest left
  as `expect(...)` arrange/act/assert placeholders (NO implementation logic, NO hardcoded
  answers).

## Procedure
1. For each behavior id, emit exactly one `it('<id>', () => { /* arrange/act/assert */ })`.
2. Add the import of the unit under test at the top.
3. For any id ending `_is_not_implemented`, assert the stub throws `/not implemented/`.
4. Do NOT add behaviors that are not in `behaviors_must_pass`, and do NOT omit any.
5. Record `test_author` in provenance (must differ from the eventual implementer).

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. exactly one `it()` per behavior id — none missing, none extra, no duplicates.
2. every `it()` name matches `^[a-z][a-z0-9_]*$`.
3. the file imports the unit under test (the given module path appears in an `import`).
4. every `*_is_not_implemented` behavior asserts `toThrow(/not implemented/)`.
5. no leakage: no hardcoded expected literal that encodes the answer outside an assertion,
   no branching on a task id.

## Postconditions
`scripts/evaluate.py` returns ok; the skeleton runs under the story's `commands_must_pass`
(failing/red until implemented — that is correct test-first state).

## Notes
AVOID writing test bodies that pass trivially (e.g. `expect(true).toBe(true)`). Lessons in `.memory.md`.
