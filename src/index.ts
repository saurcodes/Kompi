#!/usr/bin/env node
import { Command } from "commander";
import { hostname, platform } from "os";
import chalk from "chalk";
import { recordFromHook, parseHookEnv } from "./tracker/collector.js";
import { getDeviceSummaries, exportAll, makeDeviceId } from "./tracker/store.js";
import { analyse } from "./reducer/analyser.js";
import { renderDashboard, renderReport } from "./dashboard/cli.js";
import { startWebDashboard } from "./dashboard/web.js";
import { backendFromEnv, syncToRemote, syncFromRemote } from "./tracker/sync.js";

const program = new Command();

program
  .name("kompi")
  .description("Claude Code token tracker, reducer, and best-practice advisor")
  .version("0.1.0");

// ─── record (called by Claude Code hooks) ─────────────────────────────────────
program
  .command("record")
  .description("Record a token event from a Claude Code hook (internal use)")
  .option("--event <type>", "Event type: post-tool | stop", "stop")
  .action((opts) => {
    const payload = parseHookEnv();
    payload.event_type = opts.event as "post-tool" | "stop";
    recordFromHook(payload);

    const backend = backendFromEnv(makeDeviceId(hostname(), platform()));
    if (backend) {
      const records = exportAll();
      backend.push(records).catch(() => {
        // silent — sync failure must never block Claude Code
      });
    }
  });

// ─── status ───────────────────────────────────────────────────────────────────
program
  .command("status")
  .description("Show token usage summary per device")
  .action(() => {
    renderDashboard();
  });

// ─── report ───────────────────────────────────────────────────────────────────
program
  .command("report")
  .description("Per-device advisor report")
  .option("--device <id>", "Filter to a specific device ID")
  .action((opts) => {
    renderReport(opts.device);
  });

// ─── compare ──────────────────────────────────────────────────────────────────
program
  .command("compare")
  .description("Side-by-side token usage across all devices")
  .action(() => {
    const summaries = getDeviceSummaries();
    if (summaries.length === 0) {
      console.log(chalk.yellow("No data yet."));
      return;
    }
    console.log(chalk.bold.blue("\nDevice Comparison\n"));
    console.log(
      chalk.dim(
        "Device".padEnd(32) +
          "Sessions".padStart(10) +
          "Input".padStart(12) +
          "Output".padStart(12) +
          "Cost".padStart(10) +
          "Model".padStart(14)
      )
    );
    console.log(chalk.dim("─".repeat(90)));
    for (const d of summaries) {
      console.log(
        d.device_label.slice(0, 31).padEnd(32) +
          String(d.total_sessions).padStart(10) +
          String(d.total_input_tokens.toLocaleString()).padStart(12) +
          String(d.total_output_tokens.toLocaleString()).padStart(12) +
          `$${d.total_cost_usd.toFixed(4)}`.padStart(10) +
          (d.top_model ?? "unknown").slice(0, 13).padStart(14)
      );
    }
    console.log();
  });

// ─── reduce ───────────────────────────────────────────────────────────────────
program
  .command("reduce <prompt>")
  .description("Run the reducer on a prompt string and print the result")
  .action((prompt: string) => {
    const result = analyse(prompt);
    console.log(chalk.bold("\nOriginal:"));
    console.log(chalk.dim(result.original));
    console.log(chalk.bold("\nReduced:"));
    console.log(chalk.green(result.reduced));
    console.log(
      chalk.dim(
        `\nSaved ${result.savedTokens} tokens (${result.savingsPct.toFixed(1)}%) via: ${result.rulesApplied.join(", ") || "none"}`
      )
    );
  });

// ─── export ───────────────────────────────────────────────────────────────────
program
  .command("export")
  .description("Export all records to stdout")
  .option("--format <fmt>", "Output format: json | csv", "json")
  .action((opts) => {
    const records = exportAll();
    if (opts.format === "csv") {
      const cols = [
        "id","device_id","device_label","session_id","timestamp","model",
        "input_tokens","output_tokens","cache_read_tokens","cache_write_tokens",
        "cost_usd","project","tool_name","event_type",
      ];
      console.log(cols.join(","));
      for (const r of records) {
        console.log(cols.map((c) => JSON.stringify((r as Record<string, unknown>)[c] ?? "")).join(","));
      }
    } else {
      console.log(JSON.stringify(records, null, 2));
    }
  });

// ─── sync ─────────────────────────────────────────────────────────────────────
program
  .command("sync")
  .description("Push/pull records to/from the configured remote (D1, S3, Firebase)")
  .option("--pull", "Pull remote records into local DB")
  .option("--push", "Push local records to remote")
  .action(async (opts) => {
    const deviceId = makeDeviceId(hostname(), platform());
    const backend = backendFromEnv(deviceId);
    if (!backend) {
      console.log(chalk.red("No sync backend configured. Set KOMPI_D1_URL + KOMPI_D1_KEY (or S3/Firebase vars)."));
      process.exit(1);
    }

    const doPush = opts.push || (!opts.pull && !opts.push);
    const doPull = opts.pull || (!opts.pull && !opts.push);

    if (doPush) {
      const { pushed } = await syncToRemote(backend);
      console.log(chalk.green(`Pushed ${pushed} records to remote.`));
    }
    if (doPull) {
      const { pulled, merged } = await syncFromRemote(backend);
      console.log(chalk.green(`Pulled ${pulled} records, merged ${merged} new.`));
    }
  });

// ─── web ──────────────────────────────────────────────────────────────────────
program
  .command("web")
  .description("Start the local web dashboard")
  .action(() => {
    startWebDashboard();
  });

// ─── install ──────────────────────────────────────────────────────────────────
program
  .command("install")
  .description("Set up Claude Code hooks in the current project")
  .action(async () => {
    const { writeFileSync, mkdirSync, existsSync } = await import("fs");
    const { join } = await import("path");

    const dir = join(process.cwd(), ".claude");
    if (!existsSync(dir)) mkdirSync(dir);

    const settingsPath = join(dir, "settings.json");
    let existing: Record<string, unknown> = {};
    if (existsSync(settingsPath)) {
      const { readFileSync } = await import("fs");
      try {
        existing = JSON.parse(readFileSync(settingsPath, "utf8"));
      } catch {}
    }

    const hooks = {
      PostToolUse: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "kompi record --event post-tool" }],
        },
      ],
      Stop: [
        {
          hooks: [{ type: "command", command: "kompi record --event stop" }],
        },
      ],
    };

    writeFileSync(settingsPath, JSON.stringify({ ...existing, hooks }, null, 2));
    console.log(chalk.green(`Hooks written to ${settingsPath}`));
    console.log(chalk.dim("Restart Claude Code for hooks to take effect."));
  });

program.parse();
