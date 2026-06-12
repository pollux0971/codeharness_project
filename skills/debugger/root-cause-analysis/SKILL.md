# Skill: root-cause-analysis (debugger)

## When to use
When a failure has been classified and you need to isolate the true root cause — not just
the symptom. Use this before proposing any repair.

## Inputs / Outputs
- **In:** `{ failure_description, hypothesis, method, evidence, scope_widened? }`
- **Out:** `(ok: bool, errors: list)` — machine-checkable evaluation result.

## Procedure
1. State the `failure_description` clearly (what was observed, not what was expected).
2. Choose one `method`: `stack_trace | bisect | log_narrow | hypothesis_probe | diff_blame`.
3. Form a falsifiable `hypothesis` — must contain "if", "because", "when", or "caused by".
4. Supply `evidence` that supports or refutes the hypothesis.
5. **Never widen scope** (`scope_widened` must be false/absent); fixing symptoms elsewhere
   to mask the root cause is forbidden.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `failure_description` non-empty.
2. `hypothesis` non-empty and falsifiable (contains if/because/when/caused by).
3. `method` ∈ {stack_trace, bisect, log_narrow, hypothesis_probe, diff_blame}.
4. `evidence` non-empty.
5. `scope_widened` is falsy/absent.

## Postconditions
`scripts/evaluate.py` returns ok; hypothesis is handed to `minimal-repair-pattern` for repair selection.

## Notes
NEVER broaden scope to fix a symptom in a different file. NEVER skip the hypothesis step —
every repair must trace back to a falsifiable claim. Lessons in `.memory.md`.
