# hindsight-hooks

[![DeepWiki](https://img.shields.io/badge/DeepWiki-ThePlenkov%2Fhindsight--hooks-blue.svg?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTQgNGgxNnYxNkg0eiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjIiLz48cGF0aCBkPSJNOCA4aDh2OEg4eiIgZmlsbD0iI2ZmZiIvPjwvc3ZnPg==)](https://deepwiki.com/ThePlenkov/hindsight-hooks)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Monorepo for AI agent memory hooks powered by [Hindsight](https://github.com/vectorize-io/hindsight).

Give your AI coding agents persistent memory across sessions. Agents automatically recall relevant context before each prompt and retain valuable learnings after each conversation.

Uses the official [`@vectorize-io/hindsight-client`](https://hindsight.vectorize.io/sdks/nodejs) SDK, Node.js native TypeScript (no build step for plugins), and [nx](https://nx.dev) for task orchestration.

## Packages

| Package                                          | Description                                                       | Status |
| ------------------------------------------------ | ----------------------------------------------------------------- | ------ |
| [`hindsight-plugin`](packages/hindsight-plugin/) | Config, content processing, hook pipelines, daemon lifecycle, CLI | Ready  |
| [`hindsight-claude`](packages/hindsight-claude/) | Claude Code plugin: hook wrappers + JSONL transcript reader       | Ready  |
| [`hindsight-devin`](packages/hindsight-devin/)   | Devin CLI plugin: hook wrappers + install script                  | Ready  |

## Prerequisites

- **Node.js >= 22** (for native TypeScript execution)
- **Bun** (recommended) or npm for package management
- **Hindsight API** running locally or accessible remotely (default: `http://localhost:8888`)

## Quick Start

```bash
bun install
bun run build    # builds hindsight-plugin
bun run check    # type-check all packages
```

## Using with Claude Code

1. Edit `packages/hindsight-claude/settings.json` -- set `hindsightApiUrl` and `bankId`:

   ```json
   {
     "hindsightApiUrl": "http://localhost:8888",
     "bankId": "claude_code"
   }
   ```

2. Install the plugin into your project by copying the hooks config:

   ```bash
   mkdir -p /path/to/project/.claude/hooks
   cp packages/hindsight-claude/hooks/hooks.json /path/to/project/.claude/hooks/hooks.json
   ```

3. Claude Code will now:
   - **Recall** relevant memories before each prompt (injected via `UserPromptSubmit` hook)
   - **Retain** valuable conversation content after each response (via `Stop` hook)
   - **Reflect** on sessions at end (via `SessionEnd` hook)

### User Config Override

Create `~/.hindsight/claude-code.json` to override settings per-machine without editing the repo:

```json
{
  "hindsightApiUrl": "http://localhost:8888",
  "debug": true
}
```

Config cascade: defaults < `settings.json` < `~/.hindsight/<agentName>.json` < environment variables.

## Using with Devin

1. Edit `packages/hindsight-devin/settings.json` -- set `hindsightApiUrl`:

   ```json
   {
     "hindsightApiUrl": "http://localhost:8888",
     "bankId": "devin"
   }
   ```

2. Link the CLI globally (development):

   ```bash
   cd packages/hindsight-devin && bun link
   ```

   Or install globally (production):

   ```bash
   bun i -g hindsight-devin
   ```

3. Run the installer to set up hooks in your project:

   ```bash
   cd packages/hindsight-devin
   ./install.sh /path/to/project
   ```

   This copies hook definitions, skills, and agent configs into `/path/to/project/.devin/`.

4. Or for development within this monorepo:
   ```bash
   ./install.sh --self
   ```

## Configuration

All settings are configured through `settings.json` in each plugin. Key options:

| Setting            | Default                     | Description                                              |
| ------------------ | --------------------------- | -------------------------------------------------------- |
| `hindsightApiUrl`  | `""`                        | Hindsight API URL (falls back to daemon auto-start)      |
| `bankId`           | `"claude_code"` / `"devin"` | Memory bank identifier                                   |
| `autoRecall`       | `true`                      | Inject memories before each prompt                       |
| `autoRetain`       | `true`                      | Store transcripts after each conversation                |
| `recallBudget`     | `"mid"`                     | Recall search depth: `"low"`, `"mid"`, `"high"`          |
| `recallMaxTokens`  | `1024`                      | Max tokens for recalled memories                         |
| `scoringEnabled`   | `true`                      | Score transcripts for memory-worthiness before retaining |
| `scoringThreshold` | `3`                         | Minimum score (0-10) to retain a transcript              |
| `retainMode`       | `"full-session"`            | `"full-session"` or `"chunked"` (retain every N turns)   |
| `debug`            | `false`                     | Log debug output to stderr                               |

### Environment Variables

Override any setting with `HINDSIGHT_*` environment variables:

```bash
HINDSIGHT_API_URL=http://localhost:8888
HINDSIGHT_BANK_ID=my_bank
HINDSIGHT_AUTO_RECALL=true
HINDSIGHT_DEBUG=true
```

## How It Works

```
User Prompt
    |
    v
+-------------------+     +--------------+     +----------------+
| UserPromptSubmit  |---->| Hindsight    |---->| Inject memories|
| (recall)          |     | API /recall  |     | into context   |
+-------------------+     +--------------+     +----------------+
    |
    v
  Agent works...
    |
    v
+-------------------+     +--------------+     +----------------+
| Stop              |---->| Score        |---->| Hindsight      |
| (retain)          |     | transcript   |     | API /retain    |
+-------------------+     +--------------+     +----------------+
```

**Scoring** filters out trivial conversations. The scorer checks for signals like root cause analysis, design decisions, debugging lessons, user preferences, and architectural choices. Only transcripts above the threshold are retained.

**Anti-feedback loop**: `<hindsight_memories>` tags are stripped before retention to prevent memories from compounding on themselves.

## Architecture

```
hindsight-hooks/
+-- .agents/                       # Cross-agent skills & agents
|   +-- skills/hindsight/          # Hindsight memory skill
|   +-- skills/openspec/           # OpenSpec skill
|   +-- agents/memory-operator/    # Memory ops subagent
+-- openspec/                      # OpenSpec specs & changes
+-- packages/
|   +-- hindsight-plugin/          # Core + hook pipelines (builds to dist/)
|   |   +-- src/
|   |       +-- config.ts          # 34-option config cascade
|   |       +-- content.ts         # Transcript processing + scoring
|   |       +-- bank.ts            # Dynamic bank IDs + mission
|   |       +-- state.ts           # File-based persistence
|   |       +-- daemon.ts          # hindsight-embed lifecycle
|   |       +-- hooks.ts           # readStdin, performRecall/Retain/Session*
|   |       +-- cli.ts             # Generic `hindsight` CLI entry point
|   |       +-- index.ts           # Barrel export
|   +-- hindsight-claude/          # Claude Code hooks (native .ts)
|   |   +-- src/hooks/             # recall, retain, session-start, session-end
|   |   +-- hooks/hooks.json       # Claude Code hook definitions
|   |   +-- settings.json
|   +-- hindsight-devin/           # Devin CLI hooks (native .ts)
|       +-- src/
|       |   +-- hooks/             # recall, retain, session-start, session-end
|       |   +-- cli.ts             # `hindsight-devin` CLI entry point
|       +-- hooks.v1.json          # Devin hook definitions
|       +-- install.sh             # Installer script
|       +-- settings.json
+-- nx.json                        # Task graph: build -> check -> test
+-- tsconfig.base.json             # Shared TS config
+-- package.json                   # Workspaces root
```

## Development

```bash
# Build
bunx nx build hindsight-plugin

# Type-check a specific package
bunx nx check hindsight-claude

# Run all checks
bunx nx run-many -t check

# Test recall/retain end-to-end (needs running Hindsight API)
cd packages/hindsight-devin && npm run test:recall
cd packages/hindsight-devin && npm run test:retain
```

## License

MIT
