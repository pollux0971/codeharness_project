# Skill: program-spec-assembly (planning_steward)

## When to use
The final step: assemble the outputs of the other six spec skills into one machine-facing
spec bundle ready to become a StoryContract — and verify they are mutually consistent.

## Inputs / Outputs
- **In:** outputs of behaviors, acceptance, test-scaffold, interface-contract, write-set,
  stub-registry skills for one story.
- **Out:** a bundle:
```yaml
objective: <one testable sentence>
acceptance_criteria: { files_must_exist, behaviors_must_pass, commands_must_pass }
test_skeleton_behaviors: [ ... ]        # it() names actually present in the *.test.ts
interface_stub_symbols: [ ... ]         # documented stubs in the contract
registered_stub_symbols: [ ... ]        # symbols present in stub_registry.json
allowed_write_set: [ ... ]
forbidden_actions: [ ... ]
rollback_notes: <non-trivial>
test_author: <id>   # must differ from implementer
implementer: <id>
```

## Procedure
1. Run each upstream skill's `evaluate.py`; all must pass.
2. Assert the **behavior-id set is identical** across `behaviors_must_pass`,
   `test_skeleton_behaviors`, and the contract's referenced behaviors.
3. Assert `files_must_exist` includes both the impl file and the test file.
4. Assert every `interface_stub_symbols` entry is in `registered_stub_symbols`.
5. Assert the guards are present and `rollback_notes` is non-trivial.
6. Assert acceptance-test integrity: `test_author != implementer`.
7. Hand the bundle to the Supervisor's `story-contract` skill / `validateStoryContract`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `behaviors_must_pass` non-empty.
2. behavior-id set equality: acceptance == test skeleton (drift is a hard failure).
3. `files_must_exist` contains a `*.test.ts` AND a non-test `*.ts`.
4. every documented stub is registered (no unregistered stub).
5. `forbidden_actions` contains all three guards (secret/sudo/api).
6. `rollback_notes` length ≥ 8 (non-trivial).
7. `test_author != implementer` (acceptance-test integrity).

## Postconditions
`scripts/evaluate.py` returns ok; the bundle passes `validator-suite.validateStoryContract`.

## Notes
The #1 failure this catches is **behavior drift** — acceptance lists a behavior the test
file never asserts (or vice versa). That silent gap is exactly how a spec stops being
machine-checkable. Lessons in `.memory.md`.
