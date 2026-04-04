/**
 * SessionStart hook — pre-start daemon + verify bank.
 */

import { loadConfig, readStdin, performSessionStart } from "@hindsight/plugin-base";

async function main() {
  const hookInput = await readStdin();
  const config = loadConfig();
  await performSessionStart(hookInput, config);
}

main().catch((e) => { console.error("[Hindsight] Fatal:", e); process.exit(0); });
