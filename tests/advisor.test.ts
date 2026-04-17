import { describe, it, expect } from "vitest";
import { PATTERNS } from "../src/advisor/patterns.js";
import type { TokenRecord } from "../src/tracker/models.js";

function makeRecord(overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    id: "test-id",
    device_id: "dev1",
    device_label: "test-device",
    session_id: "sess1",
    timestamp: new Date().toISOString(),
    model: "claude-sonnet-4-6",
    input_tokens: 5_000,
    output_tokens: 500,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0.02,
    project: "/test",
    event_type: "stop",
    ...overrides,
  };
}

describe("advisor/patterns", () => {
  it("detects uncached repeated input", () => {
    const pattern = PATTERNS.find((p) => p.id === "repeated-uncached-input")!;
    const records = Array.from({ length: 10 }, () =>
      makeRecord({ input_tokens: 5_000, cache_read_tokens: 0 })
    );
    expect(pattern.detect(records)).toBe(true);
  });

  it("does not fire uncached pattern when cache is in use", () => {
    const pattern = PATTERNS.find((p) => p.id === "repeated-uncached-input")!;
    const records = Array.from({ length: 10 }, () =>
      makeRecord({ input_tokens: 5_000, cache_read_tokens: 3_000 })
    );
    expect(pattern.detect(records)).toBe(false);
  });

  it("detects Opus on trivial tasks", () => {
    const pattern = PATTERNS.find((p) => p.id === "opus-on-small-tasks")!;
    const records = Array.from({ length: 5 }, () =>
      makeRecord({ model: "claude-opus-4-7", output_tokens: 100 })
    );
    expect(pattern.detect(records)).toBe(true);
  });

  it("does not fire Opus pattern on large outputs", () => {
    const pattern = PATTERNS.find((p) => p.id === "opus-on-small-tasks")!;
    const records = Array.from({ length: 5 }, () =>
      makeRecord({ model: "claude-opus-4-7", output_tokens: 2_000 })
    );
    expect(pattern.detect(records)).toBe(false);
  });

  it("detects high context sessions", () => {
    const pattern = PATTERNS.find((p) => p.id === "high-context-sessions")!;
    const records = Array.from({ length: 5 }, () =>
      makeRecord({ input_tokens: 80_000, output_tokens: 30_000, event_type: "stop" })
    );
    expect(pattern.detect(records)).toBe(true);
  });
});
