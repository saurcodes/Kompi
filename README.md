# Kompi

Claude Code token tracker, intelligent reducer, and best-practice advisor — across every device you work from.

## What It Does

- **Tracks** input/output/cache token counts per device from every Claude Code session
- **Reduces** token waste by analysing prompts before each session and applying compression rules
- **Advises** with per-device recommendations based on your actual usage patterns

## Requirements

- Node.js 20+
- [Cloudflare account](https://dash.cloudflare.com) (for D1 sync — optional for local-only use)

## Installation

```bash
npm install -g kompi
```

Then wire up Claude Code hooks in any project:

```bash
cd your-project
kompi install
```

Restart Claude Code. Kompi will now record every session automatically.

## Cloudflare D1 Setup (Cross-Device Sync)

1. Create the D1 database:
   ```bash
   wrangler d1 create kompi
   ```
   Copy the `database_id` into `wrangler.toml`.

2. Set the API key secret:
   ```bash
   wrangler secret put KOMPI_API_KEY
   ```

3. Deploy the Worker:
   ```bash
   wrangler deploy
   ```

4. Configure your environment:
   ```bash
   export KOMPI_D1_URL=https://kompi.<your-sub>.workers.dev
   export KOMPI_D1_KEY=<your-api-key>
   ```

> S3/R2 and Firebase Firestore are also supported — see [Environment Variables](#environment-variables).

## CLI Commands

| Command | Description |
|---|---|
| `kompi install` | Write Claude Code hooks into `.claude/settings.json` |
| `kompi status` | Terminal dashboard — live token usage per device |
| `kompi report` | Per-device advisor report with saving recommendations |
| `kompi report --device <id>` | Deep-dive for a single device |
| `kompi compare` | Side-by-side table across all devices |
| `kompi reduce "<prompt>"` | Run the reducer on a prompt and print the result |
| `kompi export` | Print all records as JSON |
| `kompi export --format csv` | Export as CSV |
| `kompi sync` | Push local records to remote and pull remote records |
| `kompi web` | Start the local web dashboard at `http://localhost:7433` |

## Dashboards

### Terminal
```bash
kompi status
```

### Web
```bash
kompi web
# Open http://localhost:7433
```

The web dashboard shows per-device stats and advisor recommendations, auto-refreshing every 30 seconds.

## Reducer Rules

Applied automatically before prompt submission. Configurable in `src/reducer/rules.ts`.

| Rule | What It Does |
|---|---|
| `collapse-whitespace` | Removes redundant blank lines and trailing spaces |
| `remove-preamble` | Strips openers like "Can you please…", "Hey,…" |
| `compress-bullets` | Removes filler from bullet points ("Please make sure to…") |
| `imperative-shortening` | Converts passive phrasing to direct directives |
| `drop-redundant-context` | Removes file paths already established in context |

## Advisor Tips

Kompi analyses your last 50 sessions per device and flags:

- **Uncached repeated input** — same system prompt sent every session without cache
- **Opus on trivial tasks** — high-cost model used for low-complexity work
- **Haiku opportunity** — non-Haiku model used for small single-turn tasks
- **High context sessions** — average session exceeds 100k tokens (use `/compact`)

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `KOMPI_DB_PATH` | `~/.kompi/kompi.db` | SQLite file location |
| `KOMPI_D1_URL` | — | Cloudflare Worker URL (primary sync) |
| `KOMPI_D1_KEY` | — | API key for D1 Worker |
| `KOMPI_SYNC_BUCKET` | — | S3 / R2 bucket name |
| `KOMPI_SYNC_KEY` | — | S3 access key ID |
| `KOMPI_SYNC_SECRET` | — | S3 secret access key |
| `KOMPI_SYNC_URL` | — | Custom S3 endpoint (e.g. R2) |
| `KOMPI_SYNC_REGION` | `auto` | S3 region |
| `KOMPI_FIREBASE_PROJECT` | — | Firebase project ID |
| `KOMPI_FIREBASE_KEY` | — | Firebase API key |
| `KOMPI_WEB_PORT` | `7433` | Web dashboard port |
| `KOMPI_LOG_LEVEL` | `warn` | `debug` / `info` / `warn` / `error` |

## Development

```bash
npm install
npm run dev        # Run CLI via tsx (no build step)
npm test           # Vitest unit tests
npm run build      # Compile to dist/
npm run lint       # ESLint + tsc --noEmit
```

### Adding a Reduction Rule

1. Add a `Rule` object to `src/reducer/rules.ts`
2. Implement `apply(ctx: PromptContext): PromptContext`
3. Register it in `DEFAULT_RULES` (cheaper rules first)
4. Add a test in `tests/reducer.test.ts`

### Adding an Advisor Pattern

1. Add a `Pattern` to `src/advisor/patterns.ts`
2. Map it to a `Tip` in `src/advisor/tips.ts`
3. The engine picks it up automatically via `PATTERNS`

### Updating Pricing

Token costs live in `src/tracker/models.ts` under `MODEL_PRICING`. Update when Anthropic publishes new rates — costs are stored at record time so history stays accurate.

## Project Structure

```
kompi/
├── src/
│   ├── index.ts               # CLI entry point
│   ├── tracker/
│   │   ├── collector.ts       # Claude Code hook payload parsing
│   │   ├── store.ts           # SQLite read/write
│   │   ├── models.ts          # Types + pricing table
│   │   └── sync.ts            # D1 / S3 / Firebase sync backends
│   ├── reducer/
│   │   ├── analyser.ts        # Rule runner + savings report
│   │   └── rules.ts           # Reduction rule set
│   ├── advisor/
│   │   ├── engine.ts          # Pattern → tip report generator
│   │   ├── patterns.ts        # Usage pattern detectors
│   │   └── tips.ts            # Tip library
│   └── dashboard/
│       ├── cli.tsx            # Ink terminal dashboard
│       └── web.ts             # Local HTTP web dashboard
├── worker/
│   └── index.ts               # Cloudflare Worker + D1 REST API
├── tests/
│   ├── tracker.test.ts
│   ├── reducer.test.ts
│   └── advisor.test.ts
├── wrangler.toml
└── .claude/
    └── settings.json          # Claude Code hook config
```

## License

MIT
