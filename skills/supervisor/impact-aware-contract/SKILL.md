# Skill: impact-aware-contract (Supervisor · brownfield)

## When to use
When issuing a story contract for a brownfield patch, to ensure the contract captures
the impact set — callers, downstream tests, and interface contracts that might break.

## Standard operating procedure
1. **contract_id** — unique identifier for this story contract.
2. **impact_set** — list of files/modules known to be transitively affected by the
   patch (callers, dependents, integration tests).
3. **regression_tests** — list test files covering the impacted area. Must be non-empty
   for brownfield contracts.
4. **rollback_ref** — a git ref or checkpoint identifier the Developer can revert to.
5. **write_set** — paths the Developer is authorized to modify.
6. **Scope check** — write_set must be a subset of impact_set or explicitly justified.

## Constraints
- `contract_id` must be present and non-empty.
- `impact_set` must be a non-empty list.
- `regression_tests` must be a non-empty list.
- `rollback_ref` must be present and non-empty.
- `write_set` must be a non-empty list.

## Output
A story contract artifact passed to the Developer, logged to the harness trace.
