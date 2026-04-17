# Kompi — Claude Code Token Intelligence

Kompi tracks Claude Code token consumption across every device you work from, then actively reduces waste and guides you toward leaner usage patterns.

## What This App Does

**Token Tracking** — Collects input/output/cache token counts from Claude Code sessions per device (identified by hostname + OS). Persists history so you can compare usage over time.

**Intelligent Reducer** — Analyses your prompts and context before each session. Flags bloated system prompts, redundant file reads, unnecessary multi-turn verbosity, and oversized context windows. Suggests trimmed alternatives inline.

**Best-Practice Advisor** — Per-device recommendations based on your actual usage patterns: when to use prompt caching, when to switch to Haiku vs Sonnet vs Opus, how to restructure prompts for fewer tokens without losing quality.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ / TypeScript |
| CLI wrapper | Claude Code SDK (`@anthropic-ai/sdk`) |
| Storage | SQLite (via `better-sqlite3`) — one DB per device, sync-able |
| Dashboard | Terminal UI (`ink`) or optional Next.js web view |
| Sync | Optional: S3 / Supabase for cross-device aggregation |

## Project Structure

```
kompi/
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # CLI entry point
│   ├── tracker/
│   │   ├── collector.ts       # Hooks into Claude Code session events
│   │   ├── store.ts           # SQLite read/write for token records
│   │   └── models.ts          # TypeScript types for token records
│   ├── reducer/
│   │   ├── analyser.ts        # Scans prompts/context for token waste
│   │   ├── compressor.ts      # Rewrites prompts to be leaner
│   │   └── rules.ts           # Configurable reduction rule set
│   ├── advisor/
│   │   ├── engine.ts          # Generates per-device recommendations
│   │   ├── patterns.ts        # Usage pattern detectors
│   │   └── tips.ts            # Best-practice tip library
│   └── dashboard/
│       ├── cli.tsx            # Ink terminal dashboard
│       └── charts.ts          # Sparkline/bar rendering helpers
├── .claude/
│   └── settings.json          # Claude Code hook configuration
└── tests/
    ├── tracker.test.ts
    ├── reducer.test.ts
    └── advisor.test.ts
```

## Core Data Model

```typescript
interface TokenRecord {
  id: string;
  device_id: string;       // sha256(hostname + platform)
  device_label: string;    // human-readable, e.g. "macbook-pro-work"
  session_id: string;
  timestamp: string;       // ISO-8601
  model: string;           // e.g. "claude-sonnet-4-6"
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;        // computed from model pricing table
  project: string;         // git remote origin or cwd hash
}

interface DeviceSummary {
  device_id: string;
  device_label: string;
  total_sessions: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  avg_tokens_per_session: number;
  top_model: string;
  reduction_savings_pct: number;  // % saved by reducer since install
}
```

## Key Features & Behaviours

### Token Collection
- Hooks into Claude Code's `PostToolUse` and `Stop` events via `.claude/settings.json` hooks.
- Each hook fires a lightweight local HTTP call to the Kompi daemon, which writes the record to SQLite.
- Device ID is derived at install time: `sha256(os.hostname() + process.platform)`, stored in `~/.kompi/device.json`.

### Intelligent Reducer
Runs before each Claude Code session start (`PreToolUse` on first message).

**Rules applied (configurable in `reducer/rules.ts`):**
1. **Context deduplication** — strips files already in the cache write window.
2. **Prompt compression** — rewrites verbose imperative prompts into concise directives.
3. **Unnecessary preamble removal** — drops filler like "Can you please help me to...".
4. **Tool result truncation** — trims oversized Bash/Read outputs to relevant lines only.
5. **Model right-sizing** — flags when Opus is used for tasks Haiku handles equally well.

### Best-Practice Advisor
Runs after every 10 sessions and on `kompi report` command.

**Advice categories:**
- **Caching** — "Your last 20 sessions re-sent the same system prompt. Enable `prompt_caching: true` to save ~40% input tokens."
- **Model selection** — "80% of your tasks on device `laptop-home` are single-file edits. Switch default model to `claude-haiku-4-5` to cut cost by ~6×."
- **Session hygiene** — "Average context at session end: 180k tokens. Use `/compact` at the 100k mark to avoid tail degradation."
- **Batch opportunities** — "You ran 12 sequential single-file reads. Combine into one multi-file Read call."

## Claude Code Hooks Configuration

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "kompi record --event post-tool"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "kompi record --event stop --session $CLAUDE_SESSION_ID"
          }
        ]
      }
    ]
  }
}
```

## CLI Commands

```
kompi install          # Set up daemon, DB, and Claude Code hooks
kompi status           # Live token usage for current session
kompi report           # Per-device summary + advisor output
kompi report --device <id>   # Single device deep-dive
kompi compare          # Side-by-side across devices
kompi reduce <prompt>  # Run reducer on a prompt string and print result
kompi export --format csv    # Export all records to CSV
kompi sync             # Push/pull records to configured remote store
```

## Development Guidelines

### Adding a Reduction Rule
1. Add a typed `Rule` object to `src/reducer/rules.ts`.
2. Implement the `apply(context: PromptContext): PromptContext` function.
3. Register it in the `DEFAULT_RULES` array (order matters — cheaper rules first).
4. Add a unit test in `tests/reducer.test.ts` covering the before/after token delta.

### Adding an Advisor Pattern
1. Add a `Pattern` detector to `src/advisor/patterns.ts`.
2. Map it to a `Tip` in `src/advisor/tips.ts`.
3. The `engine.ts` runner picks it up automatically via the exported `PATTERNS` array.

### Pricing Table Updates
Token costs live in `src/tracker/models.ts` under `MODEL_PRICING`. Update when Anthropic publishes new rates. Costs are stored at record time so historical records remain accurate.

### Testing
```bash
npm test              # Vitest unit tests
npm run test:e2e      # End-to-end: spins a mock Claude Code session
npm run lint          # ESLint + tsc --noEmit
```

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `KOMPI_DB_PATH` | `~/.kompi/kompi.db` | SQLite file location |
| `KOMPI_DAEMON_PORT` | `7432` | Local HTTP daemon port |
| `KOMPI_SYNC_URL` | — | Remote sync endpoint (S3/Supabase URL) |
| `KOMPI_SYNC_KEY` | — | Auth key for remote sync |
| `KOMPI_LOG_LEVEL` | `warn` | `debug` / `info` / `warn` / `error` |

## Token Reduction Best Practices (Built-In Tips)

These are the advisor tips Kompi ships with. Expand in `src/advisor/tips.ts`.

1. **Use prompt caching** for system prompts > 1024 tokens that repeat across sessions.
2. **Prefer `/compact`** over continuing a session beyond 100k context tokens.
3. **Use `claude-haiku-4-5`** for single-file edits, grep searches, and code formatting.
4. **Use `claude-sonnet-4-6`** for multi-file refactors and architectural decisions.
5. **Reserve `claude-opus-4-7`** for complex reasoning, security reviews, and ambiguous requirements.
6. **Batch file reads** — one `Read` call with a range beats five sequential reads.
7. **Scope Glob patterns tightly** — `src/components/**/*.tsx` beats `**/*`.
8. **Write concise task descriptions** — bullet points over paragraphs for tool instructions.
9. **Clear completed todos** — TodoWrite state inflates context if left unchecked.
10. **Set `CLAUDE_MAX_TOKENS`** per project to enforce a hard session ceiling.

## Contributing

PRs welcome. Keep each change focused: tracker, reducer, and advisor are intentionally decoupled — changes to one should not require changes to the others.
