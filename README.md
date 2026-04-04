# hindsight-hooks

[![CI](https://github.com/ThePlenkov/hindsight-hooks/actions/workflows/ci.yml/badge.svg)](https://github.com/ThePlenkov/hindsight-hooks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Give your AI coding agents persistent memory across sessions. Agents automatically recall relevant context before each prompt and retain valuable learnings after each conversation.

Powered by [Hindsight](https://hindsight.vectorize.io/).

## How It Works

```
User Prompt
    │
    ▼
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│ UserPromptSubmit │────▶│ Hindsight    │────▶│ Inject memories│
│ (recall)         │     │ API /recall  │     │ into context   │
└─────────────────┘     └──────────────┘     └────────────────┘
    │
    ▼
  Agent works...
    │
    ▼
┌─────────────────┐     ┌──────────────┐     ┌────────────────┐
│ Stop             │────▶│ Score        │────▶│ Hindsight      │
│ (retain)         │     │ transcript   │     │ API /retain    │
└─────────────────┘     └──────────────┘     └────────────────┘
```

Before each prompt, the agent recalls relevant memories from past sessions. After each conversation, valuable content (debugging lessons, architecture decisions, user preferences) is scored and retained — only if it passes a quality threshold.

## Supported Agents

| Package | Agent | Install method |
|---------|-------|----------------|
| [`hindsight-claude`](packages/hindsight-claude/) | Claude Code | Copy hooks config |
| [`hindsight-devin`](packages/hindsight-devin/) | Devin | Run install script |

The shared core (`hindsight-plugin`) handles config, scoring, recall/retain pipelines, and daemon lifecycle.

## Prerequisites

- **Node.js >= 22** (native TypeScript support required)
- **Hindsight API** — running locally or accessible remotely

Get Hindsight at [hindsight.vectorize.io](https://hindsight.vectorize.io/).

## Install

```bash
git clone https://github.com/ThePlenkov/hindsight-hooks.git
cd hindsight-hooks
bun install
bun run build
```

## Setup: Claude Code

1. Configure `packages/hindsight-claude/settings.json`:

```json
{
  "hindsightApiUrl": "http://localhost:8888",
  "bankId": "claude_code"
}
```

2. Copy the hooks into your project:

```bash
cp -r packages/hindsight-claude/hooks /path/to/project/.claude/hooks
```

3. Done. Claude Code will now recall and retain memories automatically via lifecycle hooks.

## Setup: Devin

1. Configure `packages/hindsight-devin/settings.json`:

```json
{
  "hindsightApiUrl": "http://localhost:8888",
  "bankId": "devin"
}
```

2. Run the installer:

```bash
cd packages/hindsight-devin
./install.sh /path/to/project
```

This copies hook definitions, skills, and agent configs into the project's `.devin/` directory.

## Configuration

All settings live in each plugin's `settings.json`. Override per-machine with `~/.hindsight/<agentName>.json`, or per-env with `HINDSIGHT_*` variables.

**Cascade:** defaults → `settings.json` → `~/.hindsight/<agent>.json` → env vars

| Setting | Default | Description |
|---------|---------|-------------|
| `hindsightApiUrl` | `""` | Hindsight API URL (falls back to daemon auto-start) |
| `bankId` | `"claude_code"` / `"devin"` | Memory bank identifier |
| `autoRecall` | `true` | Inject memories before each prompt |
| `autoRetain` | `true` | Store transcripts after each conversation |
| `recallBudget` | `"mid"` | Recall depth: `"low"`, `"mid"`, `"high"` |
| `recallMaxTokens` | `1024` | Max tokens for recalled memories |
| `scoringEnabled` | `true` | Score transcripts before retaining |
| `scoringThreshold` | `3` | Minimum score (0–10) to retain |
| `retainMode` | `"full-session"` | `"full-session"` or `"chunked"` |
| `debug` | `false` | Log debug output to stderr |

### Environment Variables

```bash
HINDSIGHT_API_URL=http://localhost:8888
HINDSIGHT_BANK_ID=my_bank
HINDSIGHT_AUTO_RECALL=true
HINDSIGHT_DEBUG=true
```

## Adding a New Agent

1. Create `packages/hindsight-<name>/` with a `package.json` (private, type: module)
2. Add `hindsight-plugin` and `@vectorize-io/hindsight-client` as dependencies
3. Create thin hook wrappers in `src/hooks/` — import `readStdin`, `loadConfig`, and `perform*` from `hindsight-plugin`
4. Create a `settings.json` with agent-specific defaults
5. Wire hooks into the agent's hook config format

See existing plugins for reference — each hook file is ~15 lines.

## Development

```bash
bun run build       # build hindsight-plugin
bun run check       # typecheck all packages
bun run lint        # biome lint + format check
bun run lint:fix    # auto-fix lint + format issues
```

E2E tests (requires running Hindsight API):

```bash
cd packages/hindsight-devin && npm run test:recall
cd packages/hindsight-devin && npm run test:retain
```

## License

MIT
