---
name: hindsight
description: "Persistent memory powered by Hindsight. Recall past context, retain learnings, check memory status. Hooks run automatically; use this skill for manual control or troubleshooting."
---

# Hindsight Memory System

This plugin provides **automatic persistent memory** across Claude Code sessions via Hindsight.

## How It Works

Five hooks fire automatically during the session lifecycle:

| Event | Hook | What It Does |
|-------|------|-------------|
| `SessionStart` | `session-start.ts` | Initializes the Hindsight client and sets the bank mission |
| `UserPromptSubmit` | `recall.ts` | Searches memory for context relevant to the user's prompt, injects matches as `<hindsight_memories>` |
| `Stop` | `retain.ts` | Scores the conversation for memory-worthiness, retains high-value exchanges |
| `SubagentStop` | `retain.ts` | Same as Stop, also fires when a subagent finishes |
| `SessionEnd` | `session-end.ts` | Cleans up daemon (if started by the plugin) |

### Memory Scoring

The retain hook scores each conversation before persisting:

| Signal | Score | Examples |
|--------|-------|---------|
| Bug root cause | +3 | "The root cause was...", "Fixed by..." |
| User preference | +2 | "I prefer...", "Always use..." |
| Architecture decision | +2 | "We chose X because...", "The pattern is..." |
| Milestone / shipped | +1 | "Deployed to...", "PR merged" |
| Too short (< 50 chars) | -2 | Greetings, acknowledgments |

Only conversations scoring >= the threshold (default: 3) are retained.

## Configuration

Settings are loaded in cascade order (later wins):

1. **Built-in defaults** — sensible out-of-the-box values
2. **Plugin settings.json** — `$CLAUDE_PLUGIN_ROOT/settings.json`
3. **User config** — `~/.hindsight/claude-code.json`
4. **Environment variables** — `HINDSIGHT_*` prefixed

### Key Settings

| Setting | Env Var | Default | Description |
|---------|---------|---------|-------------|
| `hindsightApiUrl` | `HINDSIGHT_API_URL` | `""` | Hindsight API endpoint (required) |
| `bankId` | `HINDSIGHT_BANK_ID` | `claude_code` | Memory bank identifier |
| `autoRecall` | `HINDSIGHT_AUTO_RECALL` | `true` | Auto-inject memories on prompt |
| `autoRetain` | `HINDSIGHT_AUTO_RETAIN` | `true` | Auto-retain on stop |
| `recallBudget` | `HINDSIGHT_RECALL_BUDGET` | `mid` | Recall depth: low/mid/high |
| `recallMaxTokens` | `HINDSIGHT_RECALL_MAX_TOKENS` | `1024` | Max tokens in recall response |
| `scoringThreshold` | `HINDSIGHT_SCORING_THRESHOLD` | `3` | Min score to retain |
| `debug` | `HINDSIGHT_DEBUG` | `false` | Verbose logging to stderr |

## Manual Operations

### Force a Recall

```bash
echo '{"prompt":"<your query>","session_id":"manual"}' | \
  HINDSIGHT_API_URL=http://localhost:8888 \
  node "$CLAUDE_PLUGIN_ROOT/src/hooks/recall.ts"
```

### Force a Retain

```bash
echo '{"messages":[{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}' | \
  HINDSIGHT_API_URL=http://localhost:8888 \
  node "$CLAUDE_PLUGIN_ROOT/src/hooks/retain.ts"
```

## Using Recalled Memories

When memories are injected, they appear in `<hindsight_memories>` tags before the user's prompt:

- **Prior decisions** → follow them, don't re-debate
- **Known pitfalls** → avoid them proactively
- **User preferences** → apply without asking
- **Bug patterns** → check for similar issues
- **Incomplete work** → pick up where it left off

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| No memories injected | `hindsightApiUrl` empty or unreachable | Set `HINDSIGHT_API_URL` or edit settings.json |
| Memories never retained | Score below threshold | Lower `scoringThreshold` or check conversation content |
| Hook timeout errors | API slow or unreachable | Increase timeout in hooks.json or check API health |
| `@hindsight/core` not found | Core not built | Run `bunx nx build @hindsight/core` |
