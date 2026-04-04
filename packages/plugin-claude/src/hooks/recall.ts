/**
 * UserPromptSubmit hook — recall memories and inject into context.
 */

import {
  loadConfig, readStdin, performRecall, formatRecallOutput,
} from "@hindsight/plugin-base";

async function main() {
  const hookInput = await readStdin();
  const config = loadConfig();
  const result = await performRecall(hookInput, config);
  if (result) console.log(formatRecallOutput(result.memoryBlock, config));
}

main().catch((e) => { console.error("[Hindsight] Fatal:", e); process.exit(0); });
