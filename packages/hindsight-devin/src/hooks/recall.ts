/**
 * Devin UserPromptSubmit hook — recall memories and inject into context.
 */

import { formatRecallOutput, loadConfig, performRecall, readStdin } from "hindsight-plugin";

async function main() {
	const hookInput = await readStdin();
	const config = loadConfig();
	const result = await performRecall(hookInput, config);
	if (result) console.log(formatRecallOutput(result.memoryBlock, config));
}

main().catch((e) => {
	console.error("[Hindsight] Fatal:", e);
	process.exit(0);
});
