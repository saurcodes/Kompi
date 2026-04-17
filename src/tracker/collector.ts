import { randomUUID } from "crypto";
import { hostname, platform } from "os";
import { spawnSync } from "child_process";
import { insertRecord, makeDeviceId } from "./store.js";
import { computeCost } from "./models.js";
import type { TokenRecord } from "./models.js";

export interface HookPayload {
  session_id?: string;
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  tool_name?: string;
  event_type?: "post-tool" | "stop";
}

function deviceLabel(): string {
  try {
    const h = hostname();
    return `${h}-${platform()}`;
  } catch {
    return "unknown-device";
  }
}

function currentProject(): string {
  try {
    const result = spawnSync("git", ["remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status === 0 && result.stdout) return result.stdout.trim();
  } catch {
    // ignore
  }
  return process.cwd();
}

export function recordFromHook(payload: HookPayload): void {
  const deviceId = makeDeviceId(hostname(), platform());
  const inputTokens = payload.input_tokens ?? 0;
  const outputTokens = payload.output_tokens ?? 0;
  const cacheReadTokens = payload.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = payload.cache_creation_input_tokens ?? 0;
  const model = payload.model ?? "claude-sonnet-4-6";

  const record: TokenRecord = {
    id: randomUUID(),
    device_id: deviceId,
    device_label: deviceLabel(),
    session_id: payload.session_id ?? "unknown",
    timestamp: new Date().toISOString(),
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    cost_usd: computeCost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens),
    project: currentProject(),
    tool_name: payload.tool_name,
    event_type: payload.event_type ?? "stop",
  };

  insertRecord(record);
}

function safeInt(val: string | undefined): number {
  const n = parseInt(val ?? "0", 10);
  return isNaN(n) ? 0 : n;
}

export function parseHookEnv(): HookPayload {
  return {
    session_id: process.env.CLAUDE_SESSION_ID,
    model: process.env.CLAUDE_MODEL,
    input_tokens: safeInt(process.env.CLAUDE_INPUT_TOKENS),
    output_tokens: safeInt(process.env.CLAUDE_OUTPUT_TOKENS),
    cache_read_input_tokens: safeInt(process.env.CLAUDE_CACHE_READ_TOKENS),
    cache_creation_input_tokens: safeInt(process.env.CLAUDE_CACHE_WRITE_TOKENS),
    tool_name: process.env.CLAUDE_TOOL_NAME,
  };
}
