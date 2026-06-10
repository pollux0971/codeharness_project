# Skill: pre-flight-check (developer)

## When to use
After producing a proposal and before spec-conformance — run an advisory self-check in a
disposable workspace to catch low-level errors early. NOT the verdict (the Validator decides).

## Inputs / Outputs
- **In:** the proposal + the contract `validation_commands`.
- **Out:** a `preflight_report` (advisory) + a decision: `submit` | `self_correct` | `escalate`.

## Procedure
1. Apply the proposal in a disposable workspace.
2. Run allowed checks only: `pnpm typecheck`, `pnpm test --filter affected`, `pnpm test <pkg>`.
3. On failure, self-correct at most **twice**.
4. If the **same failure signature** recurs (≥2) or attempts are exhausted ⇒ `escalate`.
5. Never delete tests, change policy, or mark a failed pre-flight as passed.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `verdict` ∈ {submit, self_correct, escalate}.
2. passed report ⇒ verdict `submit`.
3. failed + attempts ≥ max (2) ⇒ verdict `escalate`.
4. repeated signature (≥2) ⇒ verdict `escalate`.
5. only allow-listed commands appear in `commands_run`.
6. `advisory` is true (pre-flight never claims to be the verdict).

## Postconditions
`scripts/evaluate.py` returns ok; matches `preflight-runner.decidePreflightNext`.

## Notes
AVOID unbounded self-correction; AVOID running anything outside the allow-list. Lessons in `.memory.md`.
