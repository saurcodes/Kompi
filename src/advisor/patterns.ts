import type { TokenRecord } from "../tracker/models.js";

export interface Pattern {
  id: string;
  tipId: string;
  detect(records: TokenRecord[]): boolean;
}

export const PATTERNS: Pattern[] = [
  {
    id: "repeated-uncached-input",
    tipId: "enable_prompt_caching",
    detect(records) {
      if (records.length < 5) return false;
      const avgInput = records.reduce((s, r) => s + r.input_tokens, 0) / records.length;
      const cacheRatio =
        records.reduce((s, r) => s + r.cache_read_tokens, 0) /
        Math.max(records.reduce((s, r) => s + r.input_tokens, 0), 1);
      return avgInput > 2000 && cacheRatio < 0.1;
    },
  },
  {
    id: "opus-on-small-tasks",
    tipId: "use_sonnet_for_complex",
    detect(records) {
      const opusRecords = records.filter((r) => r.model.includes("opus"));
      if (opusRecords.length < 3) return false;
      const avgOutput = opusRecords.reduce((s, r) => s + r.output_tokens, 0) / opusRecords.length;
      return avgOutput < 500;
    },
  },
  {
    id: "sonnet-on-trivial-tasks",
    tipId: "switch_to_haiku",
    detect(records) {
      const nonHaiku = records.filter((r) => !r.model.includes("haiku"));
      if (nonHaiku.length < 5) return false;
      const avgOutput = nonHaiku.reduce((s, r) => s + r.output_tokens, 0) / nonHaiku.length;
      return avgOutput < 200;
    },
  },
  {
    id: "high-context-sessions",
    tipId: "use_compact",
    detect(records) {
      const stopRecords = records.filter((r) => r.event_type === "stop");
      if (stopRecords.length < 3) return false;
      const avg =
        stopRecords.reduce((s, r) => s + r.input_tokens + r.output_tokens, 0) /
        stopRecords.length;
      return avg > 100_000;
    },
  },
];
