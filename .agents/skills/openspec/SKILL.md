---
name: openspec
description: "Spec-driven development with OpenSpec. Propose changes, explore specs, apply tasks, and archive completed work."
metadata:
  tags:
    - planning
    - specs
    - architecture
  version: "1.0.0"
---

# OpenSpec — Spec-Driven Development

This project uses [OpenSpec](https://openspec.dev/) to maintain living specifications alongside the code. Specs capture the **why** and **what** — requirements, scenarios, and constraints — so agents and developers always have context.

## Structure

```
openspec/
  specs/           # Living specifications by capability
    <name>/spec.md # One spec per system capability
  changes/         # Change proposals (proposal → specs → design → tasks)
    <name>/        # Each change gets its own directory
```

## Existing Specs

| Spec | Covers |
|------|--------|
| `hook-lifecycle` | The 4 lifecycle events: SessionStart, Recall, Retain, SessionEnd |
| `config-cascade` | Four-layer config resolution, env var mapping, user config paths |
| `content-processing` | Score-before-store, anti-feedback loop, token bounds, silent failure |
| `plugin-architecture` | One-dependency rule, three-layer separation, build vs native TS, I/O contracts |
| `memory-bank` | Dynamic bank IDs, auto-creation, mission-driven recall |

## Workflows

### Propose a Change

When planning a new feature or modification:

1. Create a change directory: `openspec new change <name>`
2. Write the proposal explaining what and why
3. Update or create spec deltas showing how requirements change
4. Add a design document with technical decisions
5. Break down into implementation tasks

### Explore Specs

Before modifying the system, read the relevant specs to understand requirements:

```bash
openspec show <spec-name>       # View a spec
openspec list --specs           # List all specs
openspec validate --specs       # Validate spec structure
```

### Apply a Change

After implementing a change proposal:

1. Verify all tasks are complete
2. Run `openspec archive <change-name>` to merge spec deltas into main specs

## Guidelines

- **Read specs before coding** — understand existing requirements before modifying
- **Update specs with code** — when behavior changes, the spec should change too
- **Proposals before PRs** — for significant changes, create a proposal first
- **Specs are living docs** — they evolve; don't try to write perfect specs upfront
