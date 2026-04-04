# AGENTS.md — Developer Guide for hindsight-hooks

nx monorepo with 5 packages for AI agent memory via Hindsight. TypeScript, ESM, Node.js >= 22 (native TS for plugins).

## Verify

```bash
npm run build    # builds core + plugin-base to dist/
npm run check    # tsc --noEmit across all 5 packages
```

Build order (enforced by nx `^build`): `core` -> `plugin-base` -> plugins + mcp-server.

```bash
# E2E (needs Hindsight API on localhost:8888)
cd packages/plugin-claude && npm run test:recall
cd packages/plugin-claude && npm run test:retain
cd packages/plugin-devin && npm run test:recall
cd packages/plugin-devin && npm run test:retain
```

## Package Map

| Package | Path | Builds? | Depends on |
|---------|------|---------|------------|
| `@hindsight/core` | `packages/core/` | Yes (`tsc -b` -> `dist/`) | hindsight-client |
| `@hindsight/plugin-base` | `packages/plugin-base/` | Yes (`tsc -b` -> `dist/`) | core, hindsight-client |
| `@hindsight/plugin-claude` | `packages/plugin-claude/` | No (native .ts) | core, plugin-base, hindsight-client |
| `@hindsight/plugin-devin` | `packages/plugin-devin/` | No (native .ts) | core, plugin-base, hindsight-client |
| `@hindsight/mcp-server` | `packages/mcp-server/` | No (placeholder) | core, hindsight-client |

## Dependency Graph

```
@hindsight/core                       # config, content, bank, state, daemon
  └── @hindsight/plugin-base          # readStdin, performRecall/Retain/SessionStart/SessionEnd
        ├── @hindsight/plugin-claude   # thin hook wrappers + JSONL transcript reader
        └── @hindsight/plugin-devin    # thin hook wrappers
  └── @hindsight/mcp-server           # placeholder (depends on core only)
```

## Layer Responsibilities

- **core** — Pure business logic. Config cascade (defaults < settings.json < ~/.hindsight/<agent>.json < env vars), content processing (scoring, formatting, truncation), bank management (dynamic IDs, missions), daemon lifecycle, file-based state. Exports types: `PluginConfig`, `HookInput`, `Message`.
- **plugin-base** — Hook orchestration pipelines. `readStdin()`, `performRecall()`, `performRetain()`, `performSessionStart()`, `performSessionEnd()`, `formatRecallOutput()`. Re-exports core essentials so plugins import from one place.
- **plugin-claude / plugin-devin** — Thin wrappers (~13-73 lines each). Each hook file: `readStdin() -> loadConfig() -> performXxx() -> output`. Claude's `retain.ts` is larger (73 lines) because it reads JSONL transcripts via `transcript_path`.
- **mcp-server** — Empty scaffold, `export {}`.

## Key Constraints

- **One npm dependency** — `@vectorize-io/hindsight-client` (shared across packages)
- **Core + plugin-base build, plugins don't** — core and plugin-base compile to `dist/` via `tsdown` because Node's native TS stripping doesn't process `node_modules`. Plugin hooks are `.ts` files run directly by `bun` or `node`.
- **nx task graph** — `build` depends on `^build`, `check` depends on `^build`. Always build upstream first.
- **No secrets in code** — API tokens via env vars or user config only
- **Anti-feedback** — strip `<hindsight_memories>` tags before retain to avoid memory loops
- **Config cascade** — defaults < settings.json < ~/.hindsight/<agent>.json < env vars (18 `HINDSIGHT_*` vars)

## Hook Lifecycle

Both plugins wire 4 lifecycle events (Claude adds a 5th: `SubagentStop`):

| Event | Hook | What it does |
|-------|------|-------------|
| `SessionStart` | `session-start.ts` | Pre-start daemon, verify bank exists |
| `UserPromptSubmit` | `recall.ts` | Query Hindsight, inject memories into context (60s timeout) |
| `Stop` | `retain.ts` | Score transcript, retain to Hindsight if above threshold |
| `SubagentStop` | `retain.ts` | Same as Stop (Claude only) |
| `SessionEnd` | `session-end.ts` | Reflect on session, stop daemon |

Hooks read JSON from stdin, write to stdout (Claude: plain text, Devin: JSON `{result: "..."}`).

## Adding a New Plugin

1. Create `packages/plugin-<name>/` with `package.json` (private, type: module, no build)
2. Add dependencies: `@hindsight/core`, `@hindsight/plugin-base`, `@vectorize-io/hindsight-client`
3. Add `tsconfig.json` referencing `../core` and `../plugin-base`
4. Create `src/hooks/` with thin wrappers importing from `@hindsight/plugin-base`
5. Create `settings.json` with agent-specific defaults (bankId, agentName, missions)
6. Create hook config file in the target agent's format
