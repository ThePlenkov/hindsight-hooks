/**
 * Stop / SubagentStop hook — score + retain transcript to Hindsight.
 *
 * Claude Code provides transcript_path + last_assistant_message on Stop.
 * extractMessages() handles JSONL reading + fallbacks automatically.
 */

import { extractMessages, loadConfig, performRetain, readStdin } from "hindsight-plugin";

async function main() {
	const hookInput = await readStdin();
	const config = loadConfig();
	const sessionId = hookInput.session_id ?? "unknown";
	const messages = extractMessages(hookInput, config);
	await performRetain(messages, sessionId, hookInput, config);
}

main().catch((e) => {
	console.error("[Hindsight] Fatal:", e);
	process.exit(0);
});
