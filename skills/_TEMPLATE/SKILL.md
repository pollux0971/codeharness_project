# Example Skill (template)

## When to use
Describe the trigger conditions. Keep it tight enough that retrieval picks this
skill only when it genuinely applies.

## Interface
Inputs, outputs, side effects. Reference `scripts/` and `resources/` here.

## Standard operating procedure
1. ...
2. ...

## Postconditions
What observation confirms success. The harness verifies these before the skill
is considered to have worked (see GRASP-style postcondition checks).

## Notes
Keep this file an interface, not a diary. Lessons and known failure modes go in
`.memory.md` (compact, append-only) so the SKILL.md stays a stable control
surface.
