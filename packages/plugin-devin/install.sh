#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# install.sh — Install the Hindsight memory plugin for Devin
#
# Usage:
#   ./install.sh [target-dir]     Install into target project
#   ./install.sh                  Install into current directory
#   ./install.sh --self           Install into this monorepo (dev mode)
#
# What gets installed:
#   .devin/hooks.v1.json          Hook definitions (merged if exists)
#   .devin/skills/hindsight/      Memory skill for /hindsight command
#   .devin/agents/memory-operator/ Subagent profile for memory ops
#   .devin/hindsight-settings.json Settings template (if not exists)
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$SCRIPT_DIR"
MONOREPO_ROOT="$(cd "$PLUGIN_DIR/../.." && pwd)"

# ── Parse arguments ──────────────────────────────────────────

SELF_MODE=false
TARGET=""

case "${1:-}" in
  --self)
    SELF_MODE=true
    TARGET="$MONOREPO_ROOT"
    ;;
  --help|-h)
    echo "Usage: $0 [--self | target-dir]"
    echo ""
    echo "  --self         Install into this monorepo (hooks use relative paths)"
    echo "  target-dir     Install into an external project directory"
    echo "  (no args)      Install into current working directory"
    exit 0
    ;;
  "")
    TARGET="$(pwd)"
    ;;
  *)
    TARGET="$(cd "$1" && pwd)"
    ;;
esac

# ── Preflight checks ────────────────────────────────────────

echo "┌─ Hindsight Plugin Installer ─────────────────────────┐"
echo "│  Plugin:  $PLUGIN_DIR"
echo "│  Target:  $TARGET"
echo "│  Mode:    $(if $SELF_MODE; then echo 'self (monorepo)'; else echo 'external'; fi)"
echo "└──────────────────────────────────────────────────────┘"

# Ensure core + plugin-base are built
if [ ! -d "$MONOREPO_ROOT/packages/core/dist" ] || [ ! -d "$MONOREPO_ROOT/packages/plugin-base/dist" ]; then
  echo ""
  echo "→ Building @hindsight/core + @hindsight/plugin-base (required for hooks)..."
  (cd "$MONOREPO_ROOT" && npm run build)
fi

# ── Determine hook command paths ─────────────────────────────

# Requires: bun link (dev) or bun i -g @hindsight/plugin-devin (production)
HOOK_CMD="hindsight-devin"

# ── Create directories ───────────────────────────────────────

echo ""
echo "→ Creating .devin directories..."
mkdir -p "$TARGET/.devin/skills/hindsight"
mkdir -p "$TARGET/.devin/agents/memory-operator"

# ── Install skills ───────────────────────────────────────────

echo "→ Installing skill: hindsight"
cp "$PLUGIN_DIR/skills/hindsight/SKILL.md" "$TARGET/.devin/skills/hindsight/SKILL.md"

# ── Install agents ───────────────────────────────────────────

echo "→ Installing agent: memory-operator"
cp "$PLUGIN_DIR/agents/memory-operator/AGENT.md" "$TARGET/.devin/agents/memory-operator/AGENT.md"

# ── Install hooks ────────────────────────────────────────────

HOOKS_FILE="$TARGET/.devin/hooks.v1.json"

generate_hooks_json() {
  node -e "
    const cmd = process.argv[1];
    const hooks = {
      SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: cmd + ' session-start', timeout: 5 }] }],
      UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: cmd + ' recall', timeout: 60 }] }],
      Stop: [{ matcher: '', hooks: [{ type: 'command', command: cmd + ' retain', timeout: 15 }] }],
      SessionEnd: [{ matcher: '', hooks: [{ type: 'command', command: cmd + ' session-end', timeout: 10 }] }],
    };
    console.log(JSON.stringify(hooks, null, 2));
  " "$HOOK_CMD"
}

if [ -f "$HOOKS_FILE" ]; then
  echo "→ hooks.v1.json exists — backing up and merging..."
  cp "$HOOKS_FILE" "${HOOKS_FILE}.bak"
  # Merge: combine existing hooks with hindsight hooks
  # Uses node since jq may not be available and this handles JSON properly
  HINDSIGHT_HOOKS="$(generate_hooks_json)"
  node -e "
    const fs = require('fs');
    const existing = JSON.parse(fs.readFileSync('$HOOKS_FILE', 'utf-8'));
    const hindsight = JSON.parse(process.argv[1]);
    for (const [event, entries] of Object.entries(hindsight)) {
      if (!existing[event]) existing[event] = [];
      // Remove any existing hindsight hooks (identified by hook command containing 'hindsight')
      existing[event] = existing[event].filter(e =>
        !e.hooks?.some(h => h.command?.includes('hindsight') || h.command?.includes('plugin-devin'))
      );
      existing[event].push(...entries);
    }
    fs.writeFileSync('$HOOKS_FILE', JSON.stringify(existing, null, 2) + '\n');
  " "$HINDSIGHT_HOOKS"
  echo "  ✓ Merged (backup at hooks.v1.json.bak)"
else
  echo "→ Creating hooks.v1.json"
  generate_hooks_json > "$HOOKS_FILE"
fi

# ── Install settings template ────────────────────────────────

SETTINGS_FILE="$TARGET/.devin/hindsight-settings.json"
if [ ! -f "$SETTINGS_FILE" ]; then
  echo "→ Creating settings template: .devin/hindsight-settings.json"
  cat > "$SETTINGS_FILE" <<'SETTINGS_EOF'
{
  "hindsightApiUrl": "",
  "hindsightApiToken": null,

  "bankId": "devin",
  "bankMission": "You are a Devin AI assistant with persistent memory. Focus on technical discussions, decisions, debugging patterns, and context relevant to the user's projects.",
  "retainMission": "Extract technical decisions, architectural choices, user preferences, debugging lessons, project conventions, and people/tool relationships.",
  "agentName": "devin",

  "autoRecall": true,
  "recallBudget": "mid",
  "recallMaxTokens": 1024,

  "autoRetain": true,
  "retainMode": "full-session",
  "scoringEnabled": true,
  "scoringThreshold": 3,

  "debug": false
}
SETTINGS_EOF
else
  echo "→ Settings already exist: .devin/hindsight-settings.json (skipped)"
fi

# ── Summary ──────────────────────────────────────────────────

echo ""
echo "┌─ Installation Complete ────────────────────────────────┐"
echo "│                                                        │"
echo "│  Installed:                                            │"
echo "│    ✓ .devin/hooks.v1.json         (4 lifecycle hooks)  │"
echo "│    ✓ .devin/skills/hindsight/     (/hindsight command) │"
echo "│    ✓ .devin/agents/memory-operator/ (subagent profile) │"
echo "│    ✓ .devin/hindsight-settings.json (config template)  │"
echo "│                                                        │"
echo "│  Next steps:                                           │"
echo "│    1. Edit .devin/hindsight-settings.json              │"
echo "│       Set hindsightApiUrl (e.g. http://localhost:8888) │"
echo "│    2. Start a Devin session in $TARGET"
echo "│    3. Type /hindsight to verify the skill is loaded    │"
echo "│    4. Type /hooks to verify hooks are registered       │"
echo "│                                                        │"
if ! $SELF_MODE; then
echo "│  Note: hooks reference the monorepo at:                │"
echo "│    $MONOREPO_ROOT"
echo "│  The monorepo must remain accessible for hooks to work.│"
echo "│                                                        │"
fi
echo "└────────────────────────────────────────────────────────┘"
