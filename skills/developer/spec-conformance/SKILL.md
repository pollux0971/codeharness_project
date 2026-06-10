# Skill: spec-conformance (developer)

## When to use
Right before submitting a patch proposal — run the HARD conformance gate so a malformed,
out-of-scope, or incomplete proposal never reaches the Validator.

## Inputs / Outputs
- **In:** the patch proposal + the StoryContract (`allowed_write_set`, `acceptance_criteria`).
- **Out:** pass → submit; fail → fix the proposal, or escalate if unfixable.

## Procedure
1. Run `validatePatchProposal`, `validateWriteSet`, `validateAcceptanceCriteria`, rollback check.
2. If any fails, fix the proposal fields (not the spec). Re-run.
3. If you cannot make it conform (e.g. you need files outside the write-set), STOP and emit
   a `scope_expansion_request` — never widen silently.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. proposal has `proposal_id`, `story_id`, `contract_id`, `change_type`, `changed_files`.
2. `changed_files` non-empty and ⊆ the contract `allowed_write_set`.
3. contract `acceptance_criteria` is machine-checkable (files/behaviors/commands).
4. proposal has non-empty `rollback_notes`.
5. on failure the skill returns a fixable error list, not a silent pass.

## Postconditions
`scripts/evaluate.py` returns ok ⟺ `validator-suite.specConformanceGate` returns ok.

## Notes
AVOID submitting to the Validator on a failed gate; AVOID widening scope to force conformance. Lessons in `.memory.md`.
