/**
 * Content processing: transcript parsing, tag stripping, memory scoring.
 */

export interface Message {
  role: string;
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: string | ContentBlock[];
}

/** Remove <hindsight_memories>…</hindsight_memories> to prevent feedback loops. */
export function stripMemoryTags(text: string): string {
  return text.replace(/<hindsight_memories>[\s\S]*?<\/hindsight_memories>/g, "").trim();
}

/** Format recall results as bullet-point list. */
export function formatMemories(results: Array<{ text?: string; type?: string | null; occurred_start?: string | null }>): string {
  return results
    .filter((r) => r.text?.trim())
    .map((r) => {
      const date = r.occurred_start ? ` (${r.occurred_start.slice(0, 10)})` : "";
      return `- ${r.text!.trim()} [${r.type ?? ""}]${date}`;
    })
    .join("\n");
}

/** Build multi-turn recall query from prompt + prior messages. */
export function composeRecallQuery(
  prompt: string,
  messages: Message[],
  contextTurns: number,
  roles: string[],
): string {
  if (contextTurns <= 1 || !messages.length) return prompt;

  const prior: string[] = [];
  let turnCount = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    if (!roles.includes(msg.role)) continue;
    const text = stripMemoryTags(extractText(msg.content)).trim();
    if (!text) continue;
    if (msg.role === "user" && ++turnCount > contextTurns) break;
    prior.push(`${msg.role}: ${text}`);
  }

  if (!prior.length) return prompt;
  prior.reverse();
  return `Prior context:\n${prior.join("\n")}\n\nCurrent query: ${prompt}`;
}

/** Truncate query to maxChars, preserving the latest prompt. */
export function truncateQuery(query: string, prompt: string, maxChars: number): string {
  if (query.length <= maxChars) return query;
  if (prompt.length >= maxChars) return prompt.slice(0, maxChars);
  const lines = query.split("\n");
  while (lines.join("\n").length > maxChars && lines.length > 1) lines.shift();
  return lines.join("\n");
}

/** Extract plain text from message content (string or content blocks). */
export function extractText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");
}

/** Prepare messages into a retention transcript string. */
export function prepareRetentionTranscript(
  messages: Message[],
  roles: string[],
  includeToolCalls: boolean,
): { transcript: string; messageCount: number } {
  const filtered: Array<{ role: string; content: string }> = [];

  for (const msg of messages) {
    if (!roles.includes(msg.role) && msg.role !== "tool") continue;

    let text: string;
    if (typeof msg.content === "string") {
      text = stripMemoryTags(msg.content);
    } else {
      const parts: string[] = [];
      for (const block of msg.content) {
        if (block.type === "text" && block.text) {
          parts.push(stripMemoryTags(block.text));
        } else if (block.type === "tool_use" && includeToolCalls) {
          parts.push(`[tool_use: ${block.name}(${JSON.stringify(block.input).slice(0, 200)})]`);
        } else if (block.type === "tool_result" && includeToolCalls) {
          const rc = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
          parts.push(`[tool_result: ${rc.slice(0, 200)}]`);
        }
      }
      text = parts.join("\n");
    }

    if (text.trim()) filtered.push({ role: msg.role, content: text.trim() });
  }

  const transcript = filtered.map((m) => `[${m.role}]: ${m.content}`).join("\n\n");
  return { transcript, messageCount: filtered.length };
}

/** Slice messages to the last N user-turn boundaries (for chunked retention). */
export function sliceLastTurns(messages: Message[], windowTurns: number): Message[] {
  const boundaries = messages
    .map((m, i) => (m.role === "user" ? i : -1))
    .filter((i) => i >= 0);
  if (!boundaries.length) return messages;
  const startIdx = Math.max(0, boundaries.length - windowTurns);
  return messages.slice(boundaries[startIdx]!);
}

// ---------------------------------------------------------------------------
// Memory-worthiness scoring
// ---------------------------------------------------------------------------

interface ScoringSignal {
  patterns: RegExp[];
  points: number;
  reason: string;
}

const SIGNALS: ScoringSignal[] = [
  { patterns: [/root cause/i, /the fix was/i, /fixed by/i, /caused by/i, /the issue was/i], points: 3, reason: "bug root cause" },
  { patterns: [/decided to/i, /tradeoff/i, /trade-off/i, /chose .* because/i, /design decision/i], points: 3, reason: "design decision" },
  { patterns: [/i prefer/i, /i like to/i, /always use/i, /don't use/i, /i want/i], points: 2, reason: "user preference" },
  { patterns: [/convention/i, /we always/i, /project uses/i, /standard is/i], points: 2, reason: "project convention" },
  { patterns: [/completed/i, /finished/i, /shipped/i, /deployed/i, /merged/i], points: 1, reason: "milestone" },
];

export function scoreTranscript(text: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  for (const signal of SIGNALS) {
    if (signal.patterns.some((p) => p.test(text))) {
      score += signal.points;
      reasons.push(signal.reason);
    }
  }

  if (text.length < 100) {
    score -= 2;
    reasons.push("too short");
  }

  return { score, reasons };
}
