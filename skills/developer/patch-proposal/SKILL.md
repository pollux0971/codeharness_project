# Skill: patch-proposal (developer)

## When to use
To turn a (decomposed) Task Packet into a single minimal, additive, reversible Patch
Proposal the harness can apply. The Developer proposes; the harness applies.

## Inputs / Outputs
- **In:** the Task Packet + the contract `allowed_write_set` (and the subtask plan from
  `shared.task-decomposition`).
- **Out:** a `patch_proposal` per `specs/patch_proposal.schema.json`.

## Procedure
1. Decompose first (see `shared.task-decomposition`); implement one subtask at a time.
2. Localize with codegraph/LSP; change the smallest set of files.
3. Choose a `change_type` (GRASP op); keep it additive where possible.
4. Provide `changed_files` (⊆ write-set), `summary`, `test_plan`, `rollback_notes`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. required fields present: `proposal_id`, `story_id`, `contract_id`, `change_type`, `changed_files`.
2. `change_type` ∈ {REBIND, INSERT_PREREQ, SUBSTITUTE, REWIRE, BYPASS, ADD}.
3. `changed_files` is non-empty and ⊆ the contract `allowed_write_set`.
4. `rollback_notes` length ≥ 8 (reversible).
5. `test_plan` present and non-empty.
6. `summary` non-empty.

## Postconditions
`scripts/evaluate.py` returns ok; `validator-suite.validatePatchProposal` returns ok; the
Permission Gateway can confirm `changed_files` ⊆ write-set before apply.

## Notes
AVOID a wholesale rewrite when an additive change suffices; AVOID touching files outside
the write-set (escalate instead). Lessons in `.memory.md`.
