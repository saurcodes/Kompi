import { randomUUID } from "crypto";
import { hostname, platform } from "os";
import { execSync } from "child_process";
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
    const remote = execSync("git remote get-url origin 2>/dev/null", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return remote || process.cwd();
  } catch {
    return process.cwd();
  }
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

export function parseHookEnv(): HookPayload {
  return {
    session_id: process.env.CLAUDE_SESSION_ID,
    model: process.env.CLAUDE_MODEL,
    input_tokens: parseInt(process.env.CLAUDE_INPUT_TOKENS ?? "0") || 0,
    output_tokens: parseInt(process.env.CLAUDE_OUTPUT_TOKENS ?? "0") || 0,
    cache_read_input_tokens: parseInt(process.env.CLAUDE_CACHE_READ_TOKENS ?? "0") || 0,
    cache_creation_input_tokens: parseInt(process.env.CLAUDE_CACHE_WRITE_TOKENS ?? "0") || 0,
    tool_name: process.env.CLAUDE_TOOL_NAME,
  };
}
