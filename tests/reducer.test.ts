import { describe, it, expect } from "vitest";
import { analyse } from "../src/reducer/analyser.js";

describe("reducer/analyser", () => {
  it("strips verbose preamble", () => {
    const result = analyse("Can you please fix the bug in the auth module?");
    expect(result.reduced).toBe("Fix the bug in the auth module?");
    expect(result.savedTokens).toBeGreaterThan(0);
  });

  it("collapses double blank lines", () => {
    const input = "First line\n\n\nSecond line\n\n\nThird line";
    const result = analyse(input);
    expect(result.reduced).not.toMatch(/\n\n\n/);
  });

  it("strips bullet preamble fillers", () => {
    const input = "- Please make sure to run tests\n- Ensure that the types are correct";
    const result = analyse(input);
    expect(result.reduced).not.toContain("Please make sure to");
  });

  it("returns identical string when no rules apply", () => {
    const input = "Refactor the auth module to use JWT.";
    const result = analyse(input);
    expect(result.reduced).toBe(input);
    expect(result.rulesApplied).toHaveLength(0);
  });

  it("reports correct savings percentage", () => {
    const input = "Can you please help me to understand the codebase?";
    const result = analyse(input);
    expect(result.savingsPct).toBeGreaterThan(0);
    expect(result.savingsPct).toBeLessThanOrEqual(100);
  });
});
