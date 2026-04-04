/**
 * Devin SessionStart hook — pre-start daemon + verify bank.
 */

import { loadConfig, performSessionStart, readStdin } from "hindsight-plugin";

async function main() {
	const hookInput = await readStdin();
	const config = loadConfig();
	await performSessionStart(hookInput, config);
}

main().catch((e) => {
	console.error("[Hindsight] Fatal:", e);
	process.exit(0);
});
