# Skill: architecture-recovery (Planning Steward · brownfield)

## When to use
At the start of a brownfield mode engagement, BEFORE writing any delta specs.
Run this to discover and document the existing system's shape.

## Standard operating procedure
1. **Identify entry points** — scan `package.json` `main`/`bin`, then look for `src/index.*`, `src/main.*`, `src/cli.*`.
2. **Classify layers** — sort paths into: `api` (routes/controllers/handlers), `domain` (services/models/core), `infra` (db/cache/queue), `test`, `config`, `root` (src/).
3. **Build dependency map** — use CodeGraph impact set for file-to-file dependencies; store as `{ file: [] }` pairs.
4. **Write recovery docs** — output `as-is/ARCHITECTURE.md` and `as-is/CONVENTIONS.md` to the designated output area (NOT inside the source repo).
5. **Return intake record** — `{ intake_id, repo_path, intake_at, entry_points, layers, dependency_map, conventions, recovery_docs_path }`.

## Constraints
- **Read-only on source repo** — never write files into the repo being analyzed.
- `recovery_docs_path` MUST end with or contain `as-is`.
- Unknown layer names are rejected; valid layers: `api`, `domain`, `infra`, `test`, `config`, `root`.

## Output
`recovery` dict as defined above; `as-is/ARCHITECTURE.md` and `as-is/CONVENTIONS.md` written to output area.
