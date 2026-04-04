/**
 * Devin Stop hook — score + retain transcript to Hindsight.
 */

import {
  loadConfig, readStdin, extractMessages, performRetain,
} from "@hindsight/plugin-base";

async function main() {
  const hookInput = await readStdin();
  const config = loadConfig();
  const sessionId = hookInput.session_id ?? "unknown";
  const messages = extractMessages(hookInput, config);
  await performRetain(messages, sessionId, hookInput, config);
}

main().catch((e) => { console.error("[Hindsight] Fatal:", e); process.exit(0); });
