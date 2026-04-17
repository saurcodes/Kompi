export interface TokenRecord {
  id: string;
  device_id: string;
  device_label: string;
  session_id: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  project: string;
  tool_name?: string;
  event_type: "post-tool" | "stop";
}

export interface DeviceSummary {
  device_id: string;
  device_label: string;
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  total_cost_usd: number;
  avg_tokens_per_session: number;
  top_model: string;
  reduction_savings_pct: number;
  last_seen: string;
}

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-7": {
    input_per_mtok: 15.0,
    output_per_mtok: 75.0,
    cache_read_per_mtok: 1.5,
    cache_write_per_mtok: 18.75,
  },
  "claude-sonnet-4-6": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_read_per_mtok: 0.3,
    cache_write_per_mtok: 3.75,
  },
  "claude-haiku-4-5": {
    input_per_mtok: 0.8,
    output_per_mtok: 4.0,
    cache_read_per_mtok: 0.08,
    cache_write_per_mtok: 1.0,
  },
};

export function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  return (
    (inputTokens * pricing.input_per_mtok) / 1_000_000 +
    (outputTokens * pricing.output_per_mtok) / 1_000_000 +
    (cacheReadTokens * pricing.cache_read_per_mtok) / 1_000_000 +
    (cacheWriteTokens * pricing.cache_write_per_mtok) / 1_000_000
  );
}
