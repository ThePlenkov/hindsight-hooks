#!/usr/bin/env node

/**
 * hindsight CLI — hook entry point for all agents.
 *
 * Usage:
 *   hindsight recall          # UserPromptSubmit: inject memories
 *   hindsight retain          # Stop: score + retain transcript
 *   hindsight session-start   # SessionStart: pre-start daemon, verify bank
 *   hindsight session-end     # SessionEnd: reflect + stop daemon
 */

import {
	extractMessages,
	formatRecallOutput,
	performRecall,
	performRetain,
	performSessionEnd,
	performSessionStart,
	readStdin,
} from "./hooks";
import { debug, loadConfig } from "./index";

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
			console.error(`Usage: hindsight <recall|retain|session-start|session-end>`);
			process.exit(1);
	}
}

main().catch((e) => {
	console.error("[Hindsight] Fatal:", e);
	process.exit(0);
});
