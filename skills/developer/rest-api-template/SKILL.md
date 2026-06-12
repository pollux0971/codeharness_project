# Skill: rest-api-template (developer)

## When to use
To produce a well-formed scaffold specification for a Node/TypeScript REST service.
The skill codifies *how to write* the spec correctly; the workspace-manager creates the
actual scaffold from the spec.

## Inputs / Outputs
- **In:** a `spec` dict describing the scaffold request (project_name, tech_stack,
  quality_bar_commands, directories, routes).
- **Out:** a validated scaffold spec conforming to the rubric in `scripts/evaluate.py`.

## Procedure
1. Set `tech_stack.runtime` to `node` and `tech_stack.language` to `typescript`.
2. Set `tech_stack.framework` to one of: `express`, `fastify`, `hono`.
3. Include all three quality bar commands: `build`, `test`, `typecheck`
   (matches STORY-013.3 DEFAULT_QUALITY_BAR).
4. Include all required directories: `src`, `src/routes`, `src/middleware`.
5. Include a `/health` route in `routes` (required for REST services).

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `project_name` is non-empty.
2. `tech_stack.runtime` ∈ {`node`, `nodejs`}.
3. `tech_stack.language` ∈ {`typescript`, `ts`}.
4. `tech_stack.framework` ∈ {`express`, `fastify`, `hono`}.
5. `quality_bar_commands` contains `build`, `test`, `typecheck`.
6. `directories` contains `src`, `src/routes`, `src/middleware`.
7. `routes` contains an entry with `path == /health`.

## Postconditions
`scripts/evaluate.py` returns ok; scaffold output would pass the quality bar.

## Notes
DECISION D12: templates assume Node/TS targets. All specs must include the three
DEFAULT_QUALITY_BAR commands and a `/health` liveness endpoint.
