/**
 * Shared hook pipelines — the business logic behind recall, retain, session-start, session-end.
 *
 * Plugins become thin wrappers: readStdin → pipeline → agent-specific output.
 */

import { readFileSync } from "node:fs";
import { HindsightClient } from "@vectorize-io/hindsight-client";
import {
	composeRecallQuery,
	debug,
	deriveBankId,
	ensureBankMission,
	formatMemories,
	getApiUrl,
	type HookInput,
	incrementTurnCount,
	loadConfig,
	type Message,
	type PluginConfig,
	prepareRetentionTranscript,
	prestartDaemon,
	scoreTranscript,
	sliceLastTurns,
	stopDaemon,
	stripMemoryTags,
	truncateQuery,
} from "./index";

// ---------------------------------------------------------------------------
// Stdin
// ---------------------------------------------------------------------------

/** Read and parse JSON from stdin (shared by all hooks). */
export async function readStdin(): Promise<HookInput> {
	try {
		const raw = await new Promise<string>((resolve) => {
			let data = "";
			process.stdin.setEncoding("utf-8");
			process.stdin.on("data", (chunk: string) => (data += chunk));
			process.stdin.on("end", () => resolve(data));
			if (process.stdin.isTTY) resolve("");
		});
		return raw.trim() ? JSON.parse(raw) : {};
	} catch {
		return {};
	}
}

// ---------------------------------------------------------------------------
// Transcript reading
// ---------------------------------------------------------------------------

/** Extract user/assistant messages from a JSONL transcript (Claude Code format). */
export function readTranscript(path: string): Message[] {
	try {
		const lines = readFileSync(path, "utf-8").split("\n").filter(Boolean);
		const messages: Message[] = [];
		for (const line of lines) {
			const entry = JSON.parse(line);
			const type = entry.type as string;
			if (type !== "user" && type !== "assistant") continue;

			const data = entry.data ?? entry.message ?? entry;
			let content: string | undefined;

			if (typeof data === "string") {
				content = data;
			} else if (typeof data?.content === "string") {
				content = data.content;
			} else if (Array.isArray(data?.content)) {
				content = data.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n");
			} else if (typeof data?.message?.content === "string") {
				content = data.message.content;
			} else if (Array.isArray(data?.message?.content)) {
				content = data.message.content
					.filter((c: any) => c.type === "text")
					.map((c: any) => c.text)
					.join("\n");
			}

			if (content?.trim()) {
				messages.push({ role: type as "user" | "assistant", content });
			}
		}
		return messages;
	} catch {
		return [];
	}
}

/**
 * Extract messages from hook input using all available sources:
 * 1. hookInput.messages (direct)
 * 2. hookInput.transcript_path (JSONL file — Claude Code)
 * 3. hookInput.last_assistant_message (fallback)
 */
export function extractMessages(hookInput: HookInput, config: PluginConfig): Message[] {
	let messages = (hookInput.messages ?? []) as Message[];
	if (!messages.length && hookInput.transcript_path) {
		debug(config, `Reading transcript: ${hookInput.transcript_path}`);
		messages = readTranscript(hookInput.transcript_path as string);
	}
	if (!messages.length && hookInput.last_assistant_message) {
		messages = [
			{
				role: "assistant",
				content: hookInput.last_assistant_message as string,
			},
		];
	}
	return messages;
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Format recall output for the target agent.
 * Claude Code: plain text on stdout.
 * Devin / others: JSON `{ result: "..." }`.
 */
export function formatRecallOutput(memoryBlock: string, config: PluginConfig): string {
	if (config.agentName === "claude-code" || process.env.CLAUDE_PLUGIN_ROOT) {
		return memoryBlock;
	}
	return JSON.stringify({ result: memoryBlock });
}

// ---------------------------------------------------------------------------
// Recall pipeline
// ---------------------------------------------------------------------------

export interface RecallResult {
	memoryBlock: string;
	memoryCount: number;
}

/**
 * Core recall logic: extract prompt → query Hindsight → format memories.
 * Returns null if nothing to inject (disabled, no prompt, no memories, API down).
 */
export async function performRecall(
	hookInput: HookInput,
	config: PluginConfig,
): Promise<RecallResult | null> {
	if (!config.autoRecall) {
		debug(config, "Auto-recall disabled");
		return null;
	}

	let prompt = hookInput.prompt ?? hookInput.message?.content ?? "";
	if (!prompt) {
		debug(config, "No prompt found");
		return null;
	}
	prompt = stripMemoryTags(prompt);
	if (!prompt.trim()) return null;

	let apiUrl: string;
	try {
		apiUrl = await getApiUrl(config, false);
	} catch (e) {
		debug(config, `Cannot recall — no API: ${e}`);
		return null;
	}

	const client = new HindsightClient({ baseUrl: apiUrl });
	const bankId = deriveBankId(hookInput, config);
	await ensureBankMission(client, bankId, config);

	const messages = (hookInput.messages ?? []) as Message[];
	let query = composeRecallQuery(prompt, messages, config.recallContextTurns, config.recallRoles);
	query = truncateQuery(query, prompt, config.recallMaxQueryChars);

	debug(config, `Recall query (${query.length} chars): ${query.slice(0, 100)}...`);

	let result: Awaited<ReturnType<typeof client.recall>>;
	try {
		result = await client.recall(bankId, query, {
			maxTokens: config.recallMaxTokens,
			budget: config.recallBudget,
			types: config.recallTypes as any,
		});
	} catch (e) {
		debug(config, `Recall API failed: ${e}`);
		return null;
	}

	const memories = result.results ?? [];
	if (!memories.length) {
		debug(config, "No memories returned");
		return null;
	}

	const formatted = formatMemories(memories);
	if (!formatted) return null;

	debug(config, `Injecting ${memories.length} memories (${formatted.length} chars)`);

	const memoryBlock = `<hindsight_memories>\n${config.recallPromptPreamble}\n${formatted}\n</hindsight_memories>`;
	return { memoryBlock, memoryCount: memories.length };
}

// ---------------------------------------------------------------------------
// Retain pipeline
// ---------------------------------------------------------------------------

/**
 * Core retain logic: chunked windowing → scoring → API call.
 * Caller is responsible for extracting messages (agent-specific).
 */
export async function performRetain(
	messages: Message[],
	sessionId: string,
	hookInput: HookInput,
	config: PluginConfig,
): Promise<void> {
	if (!config.autoRetain) {
		debug(config, "Auto-retain disabled");
		return;
	}

	if (!messages.length) {
		debug(config, "No messages to retain");
		return;
	}

	// Chunked mode: only retain every N turns
	if (config.retainMode === "chunked") {
		const turnCount = await incrementTurnCount(sessionId);
		if (turnCount % config.retainEveryNTurns !== 0) {
			debug(config, `Chunked: turn ${turnCount}, not a retain boundary`);
			return;
		}
		const window = config.retainEveryNTurns + config.retainOverlapTurns;
		messages = sliceLastTurns(messages, window);
		debug(config, `Chunked retain: turn ${turnCount}, window ${window}`);
	}

	const { transcript, messageCount } = prepareRetentionTranscript(
		messages,
		config.retainRoles,
		config.retainToolCalls,
	);
	if (!transcript) {
		debug(config, "Empty transcript after filtering");
		return;
	}

	// Memory-worthiness scoring
	let memoryScore: number | undefined;
	let memoryReasons: string[] | undefined;
	if (config.scoringEnabled) {
		const { score, reasons } = scoreTranscript(transcript);
		debug(
			config,
			`Memory score: ${score} (threshold ${config.scoringThreshold}), reasons: [${reasons}]`,
		);
		if (score < config.scoringThreshold) {
			debug(config, `Skipping retention: score ${score} < threshold ${config.scoringThreshold}`);
			return;
		}
		memoryScore = score;
		memoryReasons = reasons;
	}

	let apiUrl: string;
	try {
		apiUrl = await getApiUrl(config, true);
	} catch (e) {
		debug(config, `Cannot retain — no API: ${e}`);
		return;
	}

	const client = new HindsightClient({ baseUrl: apiUrl });
	const bankId = deriveBankId(hookInput, config);
	await ensureBankMission(client, bankId, config);

	const metadata: Record<string, string> = { ...config.retainMetadata };
	metadata.session_id = sessionId;
	metadata.message_count = String(messageCount);
	metadata.retain_mode = config.retainMode;
	if (config.scoringEnabled && memoryScore !== undefined) {
		metadata.memory_score = String(memoryScore);
		metadata.memory_reasons = memoryReasons!.join(",");
	}

	debug(
		config,
		`Retaining ${messageCount} messages (${transcript.length} chars) to bank '${bankId}'`,
	);

	try {
		const result = await client.retain(bankId, transcript, {
			metadata,
			async: true,
			context: config.retainContext,
		});
		debug(config, `Retain result: ${JSON.stringify(result).slice(0, 200)}`);
	} catch (e) {
		debug(config, `Retain failed: ${e}`);
	}
}

// ---------------------------------------------------------------------------
// Session start pipeline
// ---------------------------------------------------------------------------

/** Pre-start daemon + verify bank exists. */
export async function performSessionStart(
	hookInput: HookInput,
	config: PluginConfig,
): Promise<void> {
	// Pre-start daemon (non-blocking, fire-and-forget)
	if (!config.hindsightApiUrl) {
		prestartDaemon(config).catch((e) => debug(config, `Pre-start skipped: ${e}`));
	}

	if (!config.autoRecall) return;

	try {
		const apiUrl = await getApiUrl(config, false);
		const client = new HindsightClient({ baseUrl: apiUrl });
		const bankId = deriveBankId(hookInput, config);
		await ensureBankMission(client, bankId, config);
		debug(config, `Session started, bank: ${bankId}`);
	} catch (e) {
		debug(config, `Session start setup failed (non-fatal): ${e}`);
	}
}

// ---------------------------------------------------------------------------
// Session end pipeline
// ---------------------------------------------------------------------------

/** Reflect on session + stop daemon if we started it. */
export async function performSessionEnd(hookInput: HookInput, config: PluginConfig): Promise<void> {
	const sessionId = hookInput.session_id ?? "unknown";

	// Reflect on session
	try {
		const apiUrl = await getApiUrl(config, false);
		const client = new HindsightClient({ baseUrl: apiUrl });
		const bankId = deriveBankId(hookInput, config);

		const messages = (hookInput.messages ?? []) as Message[];
		if (messages.length) {
			const { transcript } = prepareRetentionTranscript(messages, ["user", "assistant"], false);
			if (transcript && transcript.length > 100) {
				const query = `Reflect on this session and extract key learnings:\n\n${transcript.slice(0, 2000)}`;
				const result = await client.reflect(bankId, query, { budget: "low" });
				debug(config, `Session reflection: ${JSON.stringify(result).slice(0, 200)}`);
			}
		}
	} catch (e) {
		debug(config, `Session reflection failed (non-fatal): ${e}`);
	}

	// Stop daemon if we started it
	if (config.daemonIdleTimeout === 0) {
		await stopDaemon(config).catch((e) => debug(config, `Daemon stop failed: ${e}`));
	}

	debug(config, `Session ${sessionId} ended`);
}
