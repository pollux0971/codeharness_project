# Skill: flaky-test-detection (debugger)

## When to use
When a test failure is observed and it is unclear whether the failure is deterministic.
Apply the re-run protocol before classifying or escalating.

## Inputs / Outputs
- **In:** `{ run_count, failure_count, classification, escalated_on_first_run? }`
- **Out:** `(ok: bool, errors: list)` — machine-checkable evaluation result.

## Procedure
1. Run the failing test at least **3 times** (`run_count ≥ 3`). Never escalate on a single run.
2. Count `failure_count` — how many of those runs failed.
3. Classify the result:
   - `real_failure` — all runs fail (failure_count == run_count).
   - `flaky` — some runs fail, some pass (0 < failure_count < run_count).
   - `intermittent` — similar to flaky but with a known environmental trigger.
   - `undetermined` — insufficient signal even after ≥3 runs (rare).
4. Only escalate after completing the re-run protocol.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `run_count` ≥ 3.
2. `classification` ∈ {real_failure, flaky, intermittent, undetermined}.
3. `real_failure` → failure_count == run_count.
4. `flaky` → 0 < failure_count < run_count.
5. `escalated_on_first_run` is falsy/absent.

## Postconditions
`scripts/evaluate.py` returns ok; if `real_failure`, hand off to `root-cause-analysis`.
If `flaky`, log gene with `failure_type: regression` and flag for retry-stabilization.

## Notes
NEVER escalate on first failure alone. A flaky test is not a blocker; a real failure is.
Lessons in `.memory.md`.
