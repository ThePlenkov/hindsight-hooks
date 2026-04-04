/**
 * Hindsight-embed daemon lifecycle.
 *
 * Three modes:
 * 1. External API — user provides hindsightApiUrl
 * 2. Existing local server — health-check port
 * 3. Auto-managed daemon — start/stop via uvx
 */

import { execFileSync, spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { debug, type PluginConfig } from "./config";
import { readState, writeState } from "./state";

const DAEMON_STATE = "daemon.json";
const PROFILE = "claude-code";

async function checkHealth(baseUrl: string, timeoutMs = 2000): Promise<boolean> {
	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
		clearTimeout(timer);
		return res.ok;
	} catch {
		return false;
	}
}

export async function getApiUrl(config: PluginConfig, allowDaemonStart = false): Promise<string> {
	// Mode 1: external API
	if (config.hindsightApiUrl) {
		debug(config, `Using external API: ${config.hindsightApiUrl}`);
		return config.hindsightApiUrl;
	}

	// Mode 2/3: local
	const port = config.apiPort;
	const base = `http://127.0.0.1:${port}`;

	if (await checkHealth(base)) {
		debug(config, `Existing server healthy on port ${port}`);
		return base;
	}

	if (!allowDaemonStart) {
		throw new Error(
			`No Hindsight server on port ${port}. Set hindsightApiUrl, ` +
				`start hindsight-embed, or wait for retain hook to auto-start.`,
		);
	}

	// Mode 3: auto-start
	debug(config, `No server on port ${port}, starting daemon`);
	await ensureDaemon(config, port);
	return base;
}

function findBin(name: string): string | null {
	try {
		return execFileSync("which", [name], { encoding: "utf-8" }).trim() || null;
	} catch {
		return null;
	}
}

function getEmbedCommand(config: PluginConfig): string[] {
	if (config.embedPackagePath)
		return ["uv", "run", "--directory", config.embedPackagePath, "hindsight-embed"];
	const ver = config.embedVersion || "latest";
	return ["uvx", `hindsight-embed@${ver}`];
}

function detectLlmEnv(config: PluginConfig): Record<string, string> {
	const env: Record<string, string> = {
		...(process.env as Record<string, string>),
	};
	let provider = config.llmProvider;
	if (!provider) {
		for (const [key, prov] of [
			["OPENAI_API_KEY", "openai"],
			["ANTHROPIC_API_KEY", "anthropic"],
			["GEMINI_API_KEY", "gemini"],
		] as const) {
			if (process.env[key]) {
				provider = prov;
				break;
			}
		}
	}
	if (provider) env.HINDSIGHT_API_LLM_PROVIDER = provider;
	if (config.llmModel) env.HINDSIGHT_API_LLM_MODEL = config.llmModel;
	return env;
}

async function ensureDaemon(config: PluginConfig, port: number): Promise<void> {
	if (!findBin("uvx") && !findBin("uv")) {
		throw new Error("uvx/uv not found — cannot auto-start hindsight-embed");
	}

	const cmd = getEmbedCommand(config);
	const profileDir = join(homedir(), ".hindsight", "profiles");
	mkdirSync(profileDir, { recursive: true });
	const logFile = join(profileDir, `${PROFILE}.log`);
	const fd = openSync(logFile, "a");

	const env = detectLlmEnv(config);
	env.HINDSIGHT_API_PORT = String(port);
	if (config.daemonIdleTimeout > 0)
		env.HINDSIGHT_API_IDLE_TIMEOUT = String(config.daemonIdleTimeout);

	const args = [...cmd.slice(1), "--profile", PROFILE, "--port", String(port)];
	debug(config, `Starting: ${cmd[0]} ${args.join(" ")}`);

	const proc = spawn(cmd[0]!, args, {
		stdio: ["ignore", fd, fd],
		env,
		detached: true,
	});
	proc.unref();
	closeSync(fd);

	await writeState(DAEMON_STATE, {
		port,
		pid: proc.pid,
		started_by_plugin: true,
		started_at: new Date().toISOString(),
	});

	// Wait up to 30s for health
	const base = `http://127.0.0.1:${port}`;
	for (let i = 0; i < 30; i++) {
		if (await checkHealth(base)) {
			debug(config, `Daemon ready on port ${port} (pid ${proc.pid})`);
			return;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	throw new Error(`Daemon failed to become healthy after 30s (port ${port})`);
}

export async function prestartDaemon(config: PluginConfig): Promise<void> {
	const port = config.apiPort;
	if (await checkHealth(`http://127.0.0.1:${port}`)) return;
	if (!findBin("uvx") && !findBin("uv")) {
		debug(config, "uvx not found, skipping pre-start");
		return;
	}

	const cmd = getEmbedCommand(config);
	const profileDir = join(homedir(), ".hindsight", "profiles");
	mkdirSync(profileDir, { recursive: true });
	const logFile = join(profileDir, `${PROFILE}.log`);
	const fd = openSync(logFile, "a");

	const env = detectLlmEnv(config);
	env.HINDSIGHT_API_PORT = String(port);

	const args = [...cmd.slice(1), "--profile", PROFILE, "--port", String(port)];
	const proc = spawn(cmd[0]!, args, {
		stdio: ["ignore", fd, fd],
		env,
		detached: true,
	});
	proc.unref();
	closeSync(fd);
	debug(config, `Background pre-start: pid ${proc.pid}`);
}

export async function stopDaemon(config: PluginConfig): Promise<void> {
	const state = (await readState(DAEMON_STATE)) as {
		pid?: number;
		started_by_plugin?: boolean;
	} | null;
	if (!state?.started_by_plugin) {
		debug(config, "Daemon not started by plugin, skipping stop");
		return;
	}
	if (state.pid) {
		try {
			process.kill(state.pid, "SIGTERM");
			debug(config, `Sent SIGTERM to daemon pid ${state.pid}`);
		} catch (e: any) {
			if (e.code === "ESRCH") debug(config, `Daemon pid ${state.pid} already gone`);
			else debug(config, `Failed to stop daemon: ${e}`);
		}
	}
	await writeState(DAEMON_STATE, {});
}
