export interface Tip {
  id: string;
  category: "caching" | "model-selection" | "session-hygiene" | "batching" | "general";
  title: string;
  detail: string;
  estimatedSavingsPct?: number;
}

export const TIPS: Record<string, Tip> = {
  enable_prompt_caching: {
    id: "enable_prompt_caching",
    category: "caching",
    title: "Enable prompt caching",
    detail:
      "Your last 20 sessions re-sent the same system prompt uncached. Add `cache_control: {type: 'ephemeral'}` to save ~40% on input tokens.",
    estimatedSavingsPct: 40,
  },
  switch_to_haiku: {
    id: "switch_to_haiku",
    category: "model-selection",
    title: "Switch to Haiku for simple tasks",
    detail:
      "80%+ of your tasks are single-file edits or searches. `claude-haiku-4-5` handles these at ~6x lower cost than Sonnet.",
    estimatedSavingsPct: 83,
  },
  use_compact: {
    id: "use_compact",
    category: "session-hygiene",
    title: "Use /compact at 100k tokens",
    detail:
      "Average session context exceeds 150k tokens. Running /compact at 100k reduces tail degradation and cuts cost.",
    estimatedSavingsPct: 25,
  },
  batch_file_reads: {
    id: "batch_file_reads",
    category: "batching",
    title: "Batch file reads",
    detail:
      "Multiple sequential single-file reads detected. Combine into one multi-range Read call to cut round-trip overhead.",
    estimatedSavingsPct: 10,
  },
  tighten_glob_patterns: {
    id: "tighten_glob_patterns",
    category: "general",
    title: "Tighten Glob patterns",
    detail:
      'Broad patterns like `**/*` return far more files than needed. Scope to `src/**/*.ts` or similar to reduce context noise.',
    estimatedSavingsPct: 15,
  },
  use_sonnet_for_complex: {
    id: "use_sonnet_for_complex",
    category: "model-selection",
    title: "Use Sonnet for multi-file refactors",
    detail:
      "You're running Opus on tasks with <5 file changes. Sonnet handles these equally well at 5x lower cost.",
    estimatedSavingsPct: 80,
  },
  clear_todos: {
    id: "clear_todos",
    category: "session-hygiene",
    title: "Clear completed todos",
    detail:
      "Stale TodoWrite entries inflate context. Mark completed tasks done immediately to keep context lean.",
    estimatedSavingsPct: 5,
  },
};
