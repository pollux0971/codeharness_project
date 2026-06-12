# Skill: cli-tool-template (developer)

## When to use
To produce a well-formed scaffold specification for a Node/TypeScript CLI tool.
The skill codifies *how to write* the spec correctly; the workspace-manager creates the
actual scaffold from the spec. Pattern mirrors the `tiny-calc` E2E fixture.

## Inputs / Outputs
- **In:** a `spec` dict describing the scaffold request (project_name, tech_stack,
  quality_bar_commands, directories, subcommands, bin_entry).
- **Out:** a validated scaffold spec conforming to the rubric in `scripts/evaluate.py`.

## Procedure
1. Set `tech_stack.language` to `typescript`.
2. Set `tech_stack.arg_parser` to one of: `commander`, `yargs`, `minimist`, `none`.
3. Include all three quality bar commands: `build`, `test`, `typecheck`
   (matches STORY-013.3 DEFAULT_QUALITY_BAR).
4. Include all required directories: `src`, `bin`.
5. Declare at least one entry in `subcommands`.
6. Set a non-empty `bin_entry` (e.g. `bin/cli.js`).

## Evaluation criteria (machine-checkable — see scripts/evaluate.py)
1. `project_name` is non-empty.
2. `tech_stack.language` ∈ {`typescript`, `ts`}.
3. `tech_stack.arg_parser` ∈ {`commander`, `yargs`, `minimist`, `none`}.
4. `quality_bar_commands` contains `build`, `test`, `typecheck`.
5. `directories` contains `src`, `bin`.
6. `subcommands` is non-empty.
7. `bin_entry` is non-empty.

## Postconditions
`scripts/evaluate.py` returns ok; scaffold output would pass the quality bar.

## Notes
DECISION D12: templates assume Node/TS targets. CLI tools must declare at least one
subcommand and a bin entry point for package.json `bin` field wiring.
