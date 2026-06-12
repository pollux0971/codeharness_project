# Skill: crud-web-app-template (developer)

## When to use
To produce a well-formed scaffold specification for a Vite+React CRUD web application.
The skill codifies *how to write* the spec correctly; the workspace-manager creates the
actual scaffold from the spec.

## Inputs / Outputs
- **In:** a `spec` dict describing the scaffold request (project_name, tech_stack,
  quality_bar_commands, directories, entry_point).
- **Out:** a validated scaffold spec conforming to the rubric in `scripts/evaluate.py`.

## Procedure
1. Set `tech_stack.framework` to `vite-react` and `tech_stack.language` to `typescript`.
2. Include all three quality bar commands: `build`, `test`, `typecheck`
   (matches STORY-013.3 DEFAULT_QUALITY_BAR).
3. Include all required directories: `src`, `src/components`, `public`.
4. Set a non-empty `entry_point` (e.g. `src/main.tsx`).
5. Provide a non-empty `project_name`.

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `project_name` is non-empty.
2. `tech_stack.framework` == `vite-react`.
3. `tech_stack.language` ∈ {`typescript`, `ts`}.
4. `quality_bar_commands` contains `build`, `test`, `typecheck`.
5. `directories` contains `src`, `src/components`, `public`.
6. `entry_point` is non-empty.

## Postconditions
`scripts/evaluate.py` returns ok; scaffold output would pass the quality bar.

## Notes
DECISION D12: templates assume Node/TS targets. All specs must include the three
DEFAULT_QUALITY_BAR commands. See `.memory.md` for past lessons.
