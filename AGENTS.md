# AGENTS.md — Developer Guide for hindsight-hooks

nx monorepo with 3 packages for AI agent memory via Hindsight. TypeScript, ESM, Node.js >= 22 (native TS for plugins).

## Verify

```bash
npm run build    # builds hindsight-plugin to dist/
npm run check    # tsc --noEmit across all 3 packages
```

Build order (enforced by nx `^build`): `hindsight-plugin` -> plugins.

```bash
# E2E (needs Hindsight API on localhost:8888)
cd packages/hindsight-claude && npm run test:recall
cd packages/hindsight-claude && npm run test:retain
cd packages/hindsight-devin && npm run test:recall
cd packages/hindsight-devin && npm run test:retain
```

## Package Map

| Package            | Path                         | Builds?                   | Depends on                         |
| ------------------ | ---------------------------- | ------------------------- | ---------------------------------- |
| `hindsight-plugin` | `packages/hindsight-plugin/` | Yes (`tsdown` -> `dist/`) | hindsight-client                   |
| `hindsight-claude` | `packages/hindsight-claude/` | No (native .ts)           | hindsight-plugin, hindsight-client |
| `hindsight-devin`  | `packages/hindsight-devin/`  | No (native .ts)           | hindsight-plugin, hindsight-client |

## Dependency Graph

```
hindsight-plugin                     # config, content, bank, state, daemon, hook pipelines, CLI
  ├── hindsight-claude               # thin hook wrappers + JSONL transcript reader
  └── hindsight-devin                # thin hook wrappers
```

## Layer Responsibilities

- **hindsight-plugin** — All business logic + hook orchestration. Config cascade (defaults < settings.json < ~/.hindsight/<agent>.json < env vars), content processing (scoring, formatting, truncation), bank management (dynamic IDs, missions), daemon lifecycle, file-based state, hook pipelines (`readStdin`, `performRecall/Retain/SessionStart/SessionEnd`, `formatRecallOutput`), generic CLI. Exports types: `PluginConfig`, `HookInput`, `Message`.
- **hindsight-claude / hindsight-devin** — Thin wrappers (~13-73 lines each). Each hook file: `readStdin() -> loadConfig() -> performXxx() -> output`. Claude's `retain.ts` is larger (73 lines) because it reads JSONL transcripts via `transcript_path`.

## Key Constraints

- **One npm dependency** — `@vectorize-io/hindsight-client` (shared across packages)
- **hindsight-plugin builds, agent plugins don't** — hindsight-plugin compiles to `dist/` via `tsdown` because Node's native TS stripping doesn't process `node_modules`. Plugin hooks are `.ts` files run directly by `bun` or `node`.
- **nx task graph** — `build` depends on `^build`, `check` depends on `^build`. Always build upstream first.
- **No secrets in code** — API tokens via env vars or user config only
- **Anti-feedback** — strip `<hindsight_memories>` tags before retain to avoid memory loops
- **Config cascade** — defaults < settings.json < ~/.hindsight/<agent>.json < env vars (18 `HINDSIGHT_*` vars)

## Hook Lifecycle

Both plugins wire 4 lifecycle events (Claude adds a 5th: `SubagentStop`):

| Event              | Hook               | What it does                                                |
| ------------------ | ------------------ | ----------------------------------------------------------- |
| `SessionStart`     | `session-start.ts` | Pre-start daemon, verify bank exists                        |
| `UserPromptSubmit` | `recall.ts`        | Query Hindsight, inject memories into context (60s timeout) |
| `Stop`             | `retain.ts`        | Score transcript, retain to Hindsight if above threshold    |
| `SubagentStop`     | `retain.ts`        | Same as Stop (Claude only)                                  |
| `SessionEnd`       | `session-end.ts`   | Reflect on session, stop daemon                             |

Hooks read JSON from stdin, write to stdout (Claude: plain text, Devin: JSON `{result: "..."}`).

## Adding a New Plugin

1. Create `packages/hindsight-<name>/` with `package.json` (private, type: module, no build)
2. Add dependencies: `hindsight-plugin`, `@vectorize-io/hindsight-client`
3. Add `tsconfig.json` referencing `../hindsight-plugin`
4. Create `src/hooks/` with thin wrappers importing from `hindsight-plugin`
5. Create `settings.json` with agent-specific defaults (bankId, agentName, missions)
6. Create hook config file in the target agent's format
