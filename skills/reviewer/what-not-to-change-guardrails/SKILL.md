# Skill: what-not-to-change-guardrails (reviewer)

## When to use
When the Reviewer must author `do_not_touch` constraints to prevent the Debugger from
modifying files that would cause regressions or violate boundaries. Conservative: when
in doubt, add to do_not_touch rather than omit.

## Inputs / Outputs
- **In:** acceptance criteria, diff under review, passing test list, write-set scope.
- **Out:** `{ do_not_touch: [patterns], rationale_per_entry: { pattern: reason } }`

## Procedure
1. Always include passing test files in `do_not_touch`.
2. Include any file outside the write-set scope.
3. Include any file whose modification would change acceptance criteria semantics.
4. For each entry, write a rationale explaining why it must not be touched.
5. Be conservative: an extra do_not_touch entry costs little; a missing one can cause
   silent regressions.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `do_not_touch` non-empty list.
2. Every entry has a non-empty rationale in `rationale_per_entry`.
3. Passing test files must appear in `do_not_touch`.

## Notes
AVOID omitting passing test files — they are always in do_not_touch.
AVOID missing rationale for any do_not_touch entry — an unexlained constraint is not
enforceable by the harness.
