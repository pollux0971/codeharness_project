# Skill: test-output-interpretation (reviewer)

## When to use
When the Reviewer receives failing test output and needs to convert it into structured
failure signals before hypothesis ranking or direction authoring.

## Inputs / Outputs
- **In:** raw failing test output string (stderr / stdout from the test runner).
- **Out:** `{ test_name, assertion_type, actual, expected, evidence_lines, stack_summary }`
  where `assertion_type` ∈ {equality, inequality, throws, rejects, truthy, falsy,
  type_error, timeout, unknown}.

## Procedure
1. Identify the test name from the output (e.g., `● test_name`, `FAIL > test name`).
2. Classify the assertion type from the failure message.
3. Extract `actual` and `expected` values when the assertion is `equality`.
4. Collect `evidence_lines`: the exact lines from the output that are diagnostic.
5. Summarise the stack trace in ≤ 3 lines (`stack_summary`).
6. **Never infer implementation intent** — record only what the test output states.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `test_name` non-empty string.
2. `assertion_type` ∈ the allowed enum set.
3. `evidence_lines` is a non-empty list.
4. `implementation_intent` must be absent (or falsy).
5. For `equality` assertions: both `actual` and `expected` must be present.

## Notes
AVOID inferring what the developer intended; only report what the test output proves.
AVOID omitting `evidence_lines` — they are the anchor for hypothesis ranking.
