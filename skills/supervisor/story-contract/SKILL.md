# Skill: story-contract (supervisor)

## When to use
To assemble the enforceable StoryContract from a machine-facing spec bundle — the artifact
the Permission Gateway and Validator enforce. The contract, not packet prose, is truth.

## Inputs / Outputs
- **In:** the program-spec bundle (objective, acceptance, write-set, guards, stub refs).
- **Out:** a `story_contract` per `specs/story_contract.schema.json` that passes
  `validator-suite.validateStoryContract`.

## Procedure
1. Copy the machine-checkable `acceptance_criteria` (files/behaviors/commands) verbatim.
2. Set `allowed_write_set` (non-empty globs) and `forbidden_actions` (incl. the three guards).
3. Set `validation_commands`, `required_validators`, `attempt_budget`, `parallelism_class`,
   `depends_on`, `rollback_notes`.
4. Do NOT add scope the spec did not authorize; widening needs a human-approved revision.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `objective` non-empty.
2. `allowed_write_set` is a non-empty array.
3. `acceptance_criteria` is machine-checkable (files_must_exist / behaviors_must_pass / commands_must_pass).
4. `validation_commands` is a non-empty array.
5. `rollback_notes` length ≥ 8 (non-trivial).
6. `forbidden_actions` includes guards: no secret, no sudo, no real api.
7. `attempt_budget` present; `parallelism_class` set; `depends_on` present (array).

## Postconditions
`scripts/evaluate.py` returns ok; `validator-suite.validateStoryContract` returns ok.

## Notes
AVOID enriching the contract with prose acceptance — the Validator only runs the
machine-checkable lists. Lessons in `.memory.md`.
