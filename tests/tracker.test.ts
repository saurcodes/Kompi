import { describe, it, expect, beforeEach } from "vitest";
import { computeCost, MODEL_PRICING } from "../src/tracker/models.js";

describe("tracker/models", () => {
  it("computes cost correctly for Sonnet", () => {
    const cost = computeCost("claude-sonnet-4-6", 10_000, 2_000, 0, 0);
    const expected =
      (10_000 * MODEL_PRICING["claude-sonnet-4-6"].input_per_mtok) / 1_000_000 +
      (2_000 * MODEL_PRICING["claude-sonnet-4-6"].output_per_mtok) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 8);
  });

  it("computes cost correctly for Opus", () => {
    const cost = computeCost("claude-opus-4-7", 5_000, 1_000, 0, 0);
    const expected =
      (5_000 * MODEL_PRICING["claude-opus-4-7"].input_per_mtok) / 1_000_000 +
      (1_000 * MODEL_PRICING["claude-opus-4-7"].output_per_mtok) / 1_000_000;
    expect(cost).toBeCloseTo(expected, 8);
  });

  it("falls back to Sonnet pricing for unknown model", () => {
    const cost = computeCost("unknown-model", 1_000, 500, 0, 0);
    const expected = computeCost("claude-sonnet-4-6", 1_000, 500, 0, 0);
    expect(cost).toBeCloseTo(expected, 8);
  });

  it("includes cache token costs", () => {
    const noCacheCost = computeCost("claude-sonnet-4-6", 10_000, 0, 0, 0);
    const cacheCost = computeCost("claude-sonnet-4-6", 10_000, 0, 5_000, 0);
    expect(cacheCost).toBeGreaterThan(noCacheCost);
  });
});
