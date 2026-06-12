# Skill: delta-spec-authoring (Planning Steward · brownfield)

## When to use
After as-is documentation is complete, to author a delta spec that describes ONLY the
changes needed — not the full system state. Used when a story modifies existing code.

## Standard operating procedure
1. **delta_id** — assign a unique identifier for this delta (e.g. `delta-001`).
2. **affected_files** — list every file the patch will touch. Must be non-empty.
3. **change_summary** — one-sentence description of what changes and why.
4. **public_api_frozen** — list file patterns that must not change public interface.
5. **write_set** — the specific paths this delta is authorized to write. Must not
   overlap `public_api_frozen`.
6. **No scope creep** — do not list files outside the story's authorized write-set.

## Constraints
- `delta_id` must be present and non-empty.
- `affected_files` must be a non-empty list.
- `write_set` must be a non-empty list.
- `write_set` must not overlap `public_api_frozen`.
- `change_summary` must be at least 20 characters.

## Output
A delta spec artifact stored under `as-is/deltas/` alongside the as-is docs.
