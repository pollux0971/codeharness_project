# Skill: behavior-test-derivation (planning_steward)

## When to use
Turning an objective into the **named behaviors + a vitest test skeleton BEFORE
implementation**. Authoring tests at planning time (not by the implementer) preserves
acceptance-test integrity and gives the machine an exact target.

## Inputs / Outputs
- **In:** objective + the component's interface contract + its documented stubs.
- **Out:** (a) a categorized behavior list, (b) a `*.test.ts` skeleton with one
  `it('<behavior_id>', () => { /* arrange-act-assert */ })` per behavior.

## Procedure
1. Enumerate behaviors across coverage classes: **happy**, **negative/failure**,
   **boundary**, **security/deny** (for any component that touches paths, commands,
   secrets, or permissions), **stub_lock** (one per documented stub).
2. Name each `snake_case`, describing the observable result (e.g.
   `bypass_workspace_without_registry_disposable_returns_deny`).
3. Emit the vitest skeleton: `describe('<pkg>')` + an `it('<id>')` per behavior, bodies
   as arrange-act-assert stubs (no hardcoded ground truth, no branching on ids).
4. Hand the behavior list to `machine-checkable-acceptance` as `behaviors_must_pass`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. ≥1 happy-path, ≥1 negative/failure, and ≥1 boundary behavior present.
2. for a safety-relevant component, ≥1 security/deny behavior present.
3. every documented stub has a matching `*_is_not_implemented` behavior.
4. behavior ids are unique and `snake_case`.
5. the skeleton's `it()` names equal the behavior list exactly (1:1, no extras/missing).
6. no leakage: tests don't read ground-truth files or branch on task ids.

## Postconditions
`scripts/evaluate.py` passes; the skeleton compiles as a vitest file and every `it()`
maps to a planned behavior.

## Notes
AVOID generating only happy-path behaviors. AVOID letting the implementer rename behaviors
afterwards — the planned id is the contract. Lessons in `.memory.md`.
