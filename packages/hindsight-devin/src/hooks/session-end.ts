/**
 * Devin SessionEnd hook — reflect on session + stop daemon.
 */

import { loadConfig, performSessionEnd, readStdin } from "hindsight-plugin";

async function main() {
	const hookInput = await readStdin();
	const config = loadConfig();
	await performSessionEnd(hookInput, config);
}

main().catch((e) => {
	console.error("[Hindsight] Fatal:", e);
	process.exit(0);
});
