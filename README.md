# CodeHarness

An agent-orchestration platform for autonomous software development, built on one
principle: **agents propose, a deterministic harness disposes.** Every action an
agent wants to take — a code patch, a file write, a model call — passes through a
gate that the agent cannot bypass. The result is a system where autonomous
development is auditable and controllable by construction, not by good behaviour.

## Why this exists

Most autonomous-coding setups let a model act directly. CodeHarness separates the
*cognition* (what an agent proposes) from the *execution* (what the system allows
to happen). Agents are advisory; the harness — workspace isolation, permission
gateway, validator, state machine, tracker — is authoritative. An agent can be
wrong without the system becoming unsafe.

## The agents

Five role-scoped agents, each with a strict boundary:

- **Planning Steward** — turns an idea into a validated backlog (PRD, architecture,
  schema-checked stories). The only entry point for new scope.
- **Supervisor** — routes work (develop / debug / escalate / checkpoint) and
  composes task packets. It coordinates; it does not write code.
- **Developer** — produces minimal, reversible patch proposals confined to a
  story's declared write-set.
- **Debugger** — diagnoses a local failure and proposes the smallest repair.
- **Reviewer** — a read-only agent, structurally denied the implementation history
  that anchors the others, so it can see what they cannot. Optionally cross-model.

## How a story flows

```
idea → planning bundle → supervisor contract → developer patch proposal
     → preflight → spec-conformance gate → workspace apply → validation
     → (on fail) debug loop → re-validate → checkpoint
```

Every transition is an explicit state recorded in an append-only trace. A run
ends in one of three terminal states — `DONE`, `FAILED`, `CANCELLED` — never an
implicit halt.

## Safety model

Four global gates are **human-only** and cannot be opened by configuration,
settings, or any agent:

- `real_api_calls` — live model provider calls (off by default; fixture providers
  run in CI)
- `sudo_broker_runtime`
- `bypass_workspace_runtime`
- `stable_promotion`

Settings may relax cost or quality, but never weaken a trust boundary. No secret
value ever enters an agent's context or the trace.

## Repository layout

```
packages/      core engine (gateway, validator, runtimes, harness-core, …)
apps/          cockpit web UI
specs/         JSON schemas and the OpenAPI surface (source of truth)
configs/       routing, policy, settings defaults
scripts/       driver loop and tooling
tests/         deterministic test suites (fixture provider; CI-safe)
skills/        agent skill catalogs
fixtures/      test fixtures
```

## Getting started

```bash
pnpm install
pnpm typecheck
pnpm test          # runs against the scripted/fixture provider — no API key needed
```

The test suite is deterministic and requires no model credentials: the harness is
exercised end-to-end with a scripted provider standing in for the model. Enabling
a real provider is a deliberate, human-gated step.

## Status

The deterministic harness — workspace, permission gateway, validator, state
machine, tracker, checkpointing — is implemented and tested. Autonomous code
generation against a live model is gated behind `real_api_calls` and activated
explicitly.

## License

See `LICENSE`.
