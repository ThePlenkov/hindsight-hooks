/**
 * File-based state persistence.
 * Uses $CLAUDE_PLUGIN_DATA/state/ or ~/.hindsight/state/.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";

let stateDir: string | null = null;

function getStateDir(): string {
  if (stateDir) return stateDir;
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  stateDir = pluginData
    ? join(pluginData, "state")
    : join(homedir(), ".hindsight", "state");
  mkdirSync(stateDir, { recursive: true });
  return stateDir;
}

function safePath(name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const dir = getStateDir();
  const full = join(dir, safe);
  // Prevent path traversal
  if (!full.startsWith(dir)) throw new Error(`Path traversal blocked: ${name}`);
  return full;
}

export async function readState(name: string): Promise<unknown | null> {
  const path = safePath(name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export async function writeState(name: string, data: unknown): Promise<void> {
  const path = safePath(name);
  const dir = getStateDir();
  const tmp = join(dir, `_tmp_${randomBytes(6).toString("hex")}.json`);
  try {
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

export async function incrementTurnCount(sessionId: string): Promise<number> {
  const name = "turn_counts.json";
  const counts = ((await readState(name)) ?? {}) as Record<string, number>;
  counts[sessionId] = (counts[sessionId] ?? 0) + 1;
  // Cap at 10k sessions
  const keys = Object.keys(counts);
  if (keys.length > 10_000) {
    const half = keys.sort().slice(keys.length >> 1);
    const trimmed: Record<string, number> = {};
    for (const k of half) trimmed[k] = counts[k]!;
    await writeState(name, trimmed);
    return trimmed[sessionId] ?? 1;
  }
  await writeState(name, counts);
  return counts[sessionId]!;
}
