/**
 * Bank ID derivation and mission management.
 */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { type HindsightClient } from "@vectorize-io/hindsight-client";
import { type PluginConfig, debug } from "./config.js";
import { readState, writeState } from "./state.js";

const BANK_MISSION_STATE = "bank_missions.json";

function sanitizeBankId(raw: string): string {
  let s = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.length > 64) {
    const hash = createHash("sha256").update(s).digest("hex").slice(0, 8);
    s = `${s.slice(0, 55)}-${hash}`;
  }
  return s || "default";
}

export interface HookInput {
  cwd?: string;
  session_id?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string | unknown[] }>;
  transcript_path?: string;
  message?: { content?: string };
  // Claude Code Stop/SubagentStop fields
  last_assistant_message?: string;
  stop_hook_active?: boolean;
  agent_transcript_path?: string;
}

export function deriveBankId(hookInput: HookInput, config: PluginConfig): string {
  if (!config.dynamicBankId) {
    const id = config.bankId || "claude_code";
    return config.bankIdPrefix ? sanitizeBankId(config.bankIdPrefix + id) : sanitizeBankId(id);
  }

  const parts: string[] = [];
  for (const field of config.dynamicBankGranularity) {
    switch (field) {
      case "agent":   parts.push(config.agentName); break;
      case "project": parts.push(basename(hookInput.cwd ?? process.cwd())); break;
      case "session": parts.push(hookInput.session_id ?? "unknown"); break;
      case "channel": parts.push(process.env.HINDSIGHT_CHANNEL_ID ?? "default"); break;
      case "user":    parts.push(process.env.HINDSIGHT_USER_ID ?? "default"); break;
    }
  }
  return sanitizeBankId(config.bankIdPrefix + parts.join("::"));
}

export async function ensureBankMission(
  client: HindsightClient,
  bankId: string,
  config: PluginConfig,
): Promise<void> {
  if (!config.bankMission) return;

  const state = (await readState(BANK_MISSION_STATE)) as Record<string, boolean> | null ?? {};
  if (state[bankId]) return;

  try {
    await client.setMission(bankId, config.bankMission);
    state[bankId] = true;
    // Cap at 10k
    const keys = Object.keys(state);
    if (keys.length > 10_000) {
      const half = keys.sort().slice(keys.length >> 1);
      const trimmed: Record<string, boolean> = {};
      for (const k of half) trimmed[k] = true;
      await writeState(BANK_MISSION_STATE, trimmed);
    } else {
      await writeState(BANK_MISSION_STATE, state);
    }
    debug(config, `Set mission for bank '${bankId}'`);
  } catch (e) {
    debug(config, `Failed to set bank mission: ${e}`);
  }
}
