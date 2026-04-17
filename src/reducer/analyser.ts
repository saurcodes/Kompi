import { DEFAULT_RULES, type PromptContext } from "./rules.js";

export interface AnalysisResult {
  original: string;
  reduced: string;
  originalTokens: number;
  reducedTokens: number;
  savedTokens: number;
  savingsPct: number;
  rulesApplied: string[];
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function analyse(prompt: string, rules = DEFAULT_RULES): AnalysisResult {
  const originalTokens = estimateTokens(prompt);
  let ctx: PromptContext = { prompt, tokenEstimate: originalTokens };
  const rulesApplied: string[] = [];

  for (const rule of rules) {
    const next = rule.apply(ctx);
    if (next.prompt !== ctx.prompt) {
      rulesApplied.push(rule.name);
    }
    ctx = next;
  }

  const savedTokens = originalTokens - ctx.tokenEstimate;
  const savingsPct = originalTokens > 0 ? (savedTokens / originalTokens) * 100 : 0;

  return {
    original: prompt,
    reduced: ctx.prompt,
    originalTokens,
    reducedTokens: ctx.tokenEstimate,
    savedTokens,
    savingsPct,
    rulesApplied,
  };
}
