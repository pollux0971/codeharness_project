# Skill: machine-checkable-acceptance (planning_steward)

## When to use
Whenever you write or revise the **acceptance criteria** of a story/spec. The audience
is a machine (Claude Code / validator), so acceptance MUST be executable checks, not prose.

## Inputs / Outputs
- **In:** a story objective + the target package path (e.g. `codeharness/packages/foo`).
- **Out:** one `acceptance_criteria` block with exactly three machine-checkable lists:
```yaml
acceptance_criteria:
  files_must_exist:   [ <impl file>, <test file *.test.ts> ]
  behaviors_must_pass: [ snake_case_behavior_id, ... ]   # == it() names in the test file
  commands_must_pass: [ "pnpm test <pkg>", "pnpm typecheck" ]
```

## Procedure
1. Restate the objective as observable behaviors (use the `behavior-test-derivation` skill).
2. Name each behavior in `snake_case` — this string IS the `it(...)` name in the test file.
3. List `files_must_exist`: the implementation file **and** its `*.test.ts` (acceptance must be locked by a test).
4. List `commands_must_pass`: the scoped test run + typecheck.
5. Delete every prose bullet ("tests pass", "works correctly"). If it cannot be a file,
   a behavior id, or a command, it does not belong here.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `behaviors_must_pass` is present and non-empty.
2. every behavior id matches `^[a-z][a-z0-9_]*$` (a valid test name; no spaces/prose).
3. `commands_must_pass` includes a `pnpm test` command and `pnpm typecheck`.
4. `files_must_exist` includes at least one `*.test.ts` (behaviors are test-locked).
5. no free-text/prose criterion remains (only the three structured lists).
6. (if the test file is provided) every behavior id appears as an `it('<id>')` in it.

## Postconditions
The block passes `scripts/evaluate.py`; `validator-suite.validateAcceptanceCriteria` returns ok.

## Notes
AVOID prose acceptance — it lets an implementer write a shallow test and claim done.
Lessons in `.memory.md`.
