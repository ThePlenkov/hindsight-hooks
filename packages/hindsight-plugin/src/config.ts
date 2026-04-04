/**
 * Configuration cascade for the Hindsight plugin.
 *
 * Loading order (later wins):
 * 1. Built-in DEFAULTS
 * 2. Plugin settings.json ($CLAUDE_PLUGIN_ROOT/settings.json)
 * 3. User config (~/.hindsight/claude-code.json)
 * 4. Environment variable overrides
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface PluginConfig {
	// Connection
	hindsightApiUrl: string;
	hindsightApiToken: string | null;
	apiPort: number;
	daemonIdleTimeout: number;
	embedVersion: string;
	embedPackagePath: string | null;

	// Bank
	bankId: string;
	bankIdPrefix: string;
	dynamicBankId: boolean;
	dynamicBankGranularity: string[];
	bankMission: string;
	retainMission: string | null;
	agentName: string;

	// Recall
	autoRecall: boolean;
	recallBudget: "low" | "mid" | "high";
	recallMaxTokens: number;
	recallTypes: string[];
	recallContextTurns: number;
	recallMaxQueryChars: number;
	recallRoles: string[];
	recallPromptPreamble: string;

	// Retain
	autoRetain: boolean;
	retainMode: "full-session" | "chunked";
	retainRoles: string[];
	retainEveryNTurns: number;
	retainOverlapTurns: number;
	retainToolCalls: boolean;
	retainTags: string[];
	retainMetadata: Record<string, string>;
	retainContext: string;

	// Scoring (our extension)
	scoringEnabled: boolean;
	scoringThreshold: number;

	// LLM (for daemon mode)
	llmProvider: string | null;
	llmModel: string | null;
	llmApiKeyEnv: string | null;

	// Misc
	debug: boolean;
}

const DEFAULTS: PluginConfig = {
	hindsightApiUrl: "",
	hindsightApiToken: null,
	apiPort: 9077,
	daemonIdleTimeout: 0,
	embedVersion: "latest",
	embedPackagePath: null,

	bankId: "claude_code",
	bankIdPrefix: "",
	dynamicBankId: false,
	dynamicBankGranularity: ["agent", "project"],
	bankMission: "",
	retainMission: null,
	agentName: "claude-code",

	autoRecall: true,
	recallBudget: "mid",
	recallMaxTokens: 1024,
	recallTypes: ["world", "experience"],
	recallContextTurns: 1,
	recallMaxQueryChars: 800,
	recallRoles: ["user", "assistant"],
	recallPromptPreamble:
		"Relevant memories from past conversations (prioritize recent when " +
		"conflicting). Only use memories that are directly useful to continue " +
		"this conversation; ignore the rest:",

	autoRetain: true,
	retainMode: "full-session",
	retainRoles: ["user", "assistant"],
	retainEveryNTurns: 10,
	retainOverlapTurns: 2,
	retainToolCalls: true,
	retainTags: [],
	retainMetadata: {},
	retainContext: "claude-code",

	scoringEnabled: true,
	scoringThreshold: 3,

	llmProvider: null,
	llmModel: null,
	llmApiKeyEnv: null,

	debug: false,
};

const ENV_MAP: Record<string, { key: keyof PluginConfig; type: "string" | "number" | "boolean" }> =
	{
		HINDSIGHT_API_URL: { key: "hindsightApiUrl", type: "string" },
		HINDSIGHT_API_TOKEN: { key: "hindsightApiToken", type: "string" },
		HINDSIGHT_BANK_ID: { key: "bankId", type: "string" },
		HINDSIGHT_AGENT_NAME: { key: "agentName", type: "string" },
		HINDSIGHT_AUTO_RECALL: { key: "autoRecall", type: "boolean" },
		HINDSIGHT_AUTO_RETAIN: { key: "autoRetain", type: "boolean" },
		HINDSIGHT_RETAIN_MODE: { key: "retainMode", type: "string" },
		HINDSIGHT_RECALL_BUDGET: { key: "recallBudget", type: "string" },
		HINDSIGHT_RECALL_MAX_TOKENS: { key: "recallMaxTokens", type: "number" },
		HINDSIGHT_RECALL_MAX_QUERY_CHARS: {
			key: "recallMaxQueryChars",
			type: "number",
		},
		HINDSIGHT_RECALL_CONTEXT_TURNS: { key: "recallContextTurns", type: "number" },
		HINDSIGHT_API_PORT: { key: "apiPort", type: "number" },
		HINDSIGHT_DAEMON_IDLE_TIMEOUT: { key: "daemonIdleTimeout", type: "number" },
		HINDSIGHT_EMBED_VERSION: { key: "embedVersion", type: "string" },
		HINDSIGHT_EMBED_PACKAGE_PATH: { key: "embedPackagePath", type: "string" },
		HINDSIGHT_DYNAMIC_BANK_ID: { key: "dynamicBankId", type: "boolean" },
		HINDSIGHT_BANK_MISSION: { key: "bankMission", type: "string" },
		HINDSIGHT_LLM_PROVIDER: { key: "llmProvider", type: "string" },
		HINDSIGHT_LLM_MODEL: { key: "llmModel", type: "string" },
		HINDSIGHT_DEBUG: { key: "debug", type: "boolean" },
		HINDSIGHT_SCORING_ENABLED: { key: "scoringEnabled", type: "boolean" },
		HINDSIGHT_SCORING_THRESHOLD: { key: "scoringThreshold", type: "number" },
	};

function castEnv(value: string, type: "string" | "number" | "boolean"): unknown {
	if (type === "boolean") return ["true", "1", "yes"].includes(value.toLowerCase());
	if (type === "number") {
		const n = Number(value);
		return Number.isNaN(n) ? undefined : n;
	}
	return value;
}

function loadJsonFile(path: string): Record<string, unknown> | null {
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return null;
	}
}

function pluginRoot(): string {
	if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
	if (process.env.DEVIN_PROJECT_DIR) return process.env.DEVIN_PROJECT_DIR;
	// Walk up from packages/*/dist/ or packages/*/src/hooks/ to package root
	const thisDir = dirname(fileURLToPath(import.meta.url));
	return join(thisDir, "..", "..");
}

export function loadConfig(): PluginConfig {
	const config: PluginConfig = { ...DEFAULTS };

	// Layer 2: plugin settings.json
	const pluginSettings = loadJsonFile(join(pluginRoot(), "settings.json"));
	if (pluginSettings) {
		for (const [k, v] of Object.entries(pluginSettings)) {
			if (v != null && k in config) (config as any)[k] = v;
		}
	}

	// Layer 3: user config (check agent-specific, then generic)
	const agentName = process.env.HINDSIGHT_AGENT_NAME ?? config.agentName;
	const userConfigPaths = [
		join(homedir(), ".hindsight", `${agentName}.json`),
		join(homedir(), ".hindsight", "claude-code.json"),
	];
	for (const ucp of userConfigPaths) {
		const userConfig = loadJsonFile(ucp);
		if (userConfig) {
			for (const [k, v] of Object.entries(userConfig)) {
				if (v != null && k in config) (config as any)[k] = v;
			}
			break;
		}
	}

	// Layer 4: environment overrides
	for (const [envName, { key, type }] of Object.entries(ENV_MAP)) {
		const val = process.env[envName];
		if (val !== undefined) {
			const cast = castEnv(val, type);
			if (cast !== undefined) (config as any)[key] = cast;
		}
	}

	return config;
}

export function debug(config: PluginConfig, ...args: unknown[]): void {
	if (config.debug) console.error("[Hindsight]", ...args);
}
