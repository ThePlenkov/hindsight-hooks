#!/usr/bin/env node
/**
 * hindsight-devin — Devin-specific hook CLI.
 *
 * Usage:
 *   hindsight-devin recall          # UserPromptSubmit
 *   hindsight-devin retain          # Stop
 *   hindsight-devin session-start   # SessionStart
 *   hindsight-devin session-end     # SessionEnd
 */

import { loadConfig } from "@hindsight/core";
import {
  readStdin, extractMessages, formatRecallOutput,
  performRecall, performRetain, performSessionStart, performSessionEnd,
} from "@hindsight/plugin-base";

const command = process.argv[2];

async function main() {
  const hookInput = await readStdin();
  const config = loadConfig();

  switch (command) {
    case "recall": {
      const result = await performRecall(hookInput, config);
      if (result) console.log(formatRecallOutput(result.memoryBlock, config));
      break;
    }
    case "retain": {
      const sessionId = hookInput.session_id ?? "unknown";
      const messages = extractMessages(hookInput, config);
      await performRetain(messages, sessionId, hookInput, config);
      break;
    }
    case "session-start": {
      await performSessionStart(hookInput, config);
      break;
    }
    case "session-end": {
      await performSessionEnd(hookInput, config);
      break;
    }
    default:
      console.error(`Usage: hindsight-devin <recall|retain|session-start|session-end>`);
      process.exit(1);
  }
}

main().catch((e) => { console.error("[Hindsight] Fatal:", e); process.exit(0); });
