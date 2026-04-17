import React from "react";
import { render, Box, Text, Newline } from "ink";
import chalk from "chalk";
import { getDeviceSummaries, getTopModel } from "../tracker/store.js";
import { generateReport } from "../advisor/engine.js";
import type { DeviceSummary } from "../tracker/models.js";

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function formatNum(n: number): string {
  return n.toLocaleString();
}

function modelBadge(model: string): string {
  if (model.includes("opus")) return chalk.magenta("Opus");
  if (model.includes("sonnet")) return chalk.cyan("Sonnet");
  if (model.includes("haiku")) return chalk.green("Haiku");
  return model;
}

function DeviceRow({ d }: { d: DeviceSummary }) {
  const topModel = getTopModel(d.device_id);
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold>{d.device_label}</Text>
      <Box gap={2} marginLeft={2}>
        <Text>Sessions: <Text color="cyan">{d.total_sessions}</Text></Text>
        <Text>Input: <Text color="yellow">{formatNum(d.total_input_tokens)}</Text></Text>
        <Text>Output: <Text color="yellow">{formatNum(d.total_output_tokens)}</Text></Text>
        <Text>Cost: <Text color="green">{formatCost(d.total_cost_usd)}</Text></Text>
        <Text>Model: <Text color="magenta">{topModel}</Text></Text>
      </Box>
      <Text dimColor marginLeft={2}>Last seen: {d.last_seen}</Text>
    </Box>
  );
}

export function renderDashboard() {
  const summaries = getDeviceSummaries();

  if (summaries.length === 0) {
    console.log(chalk.yellow("No token records yet. Run some Claude Code sessions first."));
    return;
  }

  render(
    <Box flexDirection="column" padding={1}>
      <Text bold color="blue">Kompi — Token Usage Dashboard</Text>
      <Newline />
      {summaries.map((d) => <DeviceRow key={d.device_id} d={d} />)}
    </Box>
  );
}

export function renderReport(deviceId?: string) {
  const summaries = getDeviceSummaries();
  const targets = deviceId ? summaries.filter((d) => d.device_id === deviceId) : summaries;

  for (const device of targets) {
    const report = generateReport(device.device_id);
    console.log(chalk.bold.blue(`\nAdvisor Report — ${device.device_label}`));
    console.log(chalk.dim(`Generated: ${report.generatedAt}`));

    if (report.tips.length === 0) {
      console.log(chalk.green("  No issues found. Token usage looks efficient!"));
    } else {
      for (const tip of report.tips) {
        const saving = tip.estimatedSavingsPct ? chalk.green(` (~${tip.estimatedSavingsPct}% savings)`) : "";
        console.log(`\n  ${chalk.yellow("!")} ${chalk.bold(tip.title)}${saving}`);
        console.log(`    ${chalk.dim(tip.detail)}`);
      }
    }
  }
}
