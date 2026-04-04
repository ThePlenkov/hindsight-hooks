/**
 * SessionEnd hook — reflect on session + stop daemon if we started it.
 */

import { loadConfig, readStdin, performSessionEnd } from "@hindsight/plugin-base";

async function main() {
  const hookInput = await readStdin();
  const config = loadConfig();
  await performSessionEnd(hookInput, config);
}

main().catch((e) => { console.error("[Hindsight] Fatal:", e); process.exit(0); });
