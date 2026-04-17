export interface PromptContext {
  prompt: string;
  tokenEstimate: number;
}

export interface Rule {
  name: string;
  description: string;
  apply(ctx: PromptContext): PromptContext;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const removePreamble: Rule = {
  name: "remove-preamble",
  description: "Strip verbose filler openers",
  apply(ctx) {
    const patterns = [
      /^(can you please |please |could you |would you mind |i was wondering if you could |i need you to |i want you to )/i,
      /^(hey|hi|hello),?\s*/i,
      /^(i'd like (you )?to |i would like (you )?to )/i,
    ];
    let prompt = ctx.prompt;
    for (const p of patterns) {
      prompt = prompt.replace(p, "");
    }
    prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1);
    return { prompt, tokenEstimate: estimateTokens(prompt) };
  },
};

const collapseWhitespace: Rule = {
  name: "collapse-whitespace",
  description: "Remove redundant blank lines and trailing spaces",
  apply(ctx) {
    const prompt = ctx.prompt
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
      .join("\n")
      .trim();
    return { prompt, tokenEstimate: estimateTokens(prompt) };
  },
};

const compressBulletLists: Rule = {
  name: "compress-bullets",
  description: "Shorten over-worded bullet points",
  apply(ctx) {
    const prompt = ctx.prompt.replace(
      /^(\s*[-*•]\s+)(please\s+|kindly\s+|make sure (to\s+)?|ensure (that\s+)?)/gim,
      "$1"
    );
    return { prompt, tokenEstimate: estimateTokens(prompt) };
  },
};

const dropRedundantContext: Rule = {
  name: "drop-redundant-context",
  description: "Remove repeated file path mentions already established in context",
  apply(ctx) {
    const lines = ctx.prompt.split("\n");
    const seenPaths = new Set<string>();
    const result: string[] = [];
    const pathPattern = /`([^`]+\.[a-z]{1,6})`/g;

    for (const line of lines) {
      let match: RegExpExecArray | null;
      let skip = false;
      const localPaths: string[] = [];

      while ((match = pathPattern.exec(line)) !== null) {
        if (seenPaths.has(match[1])) {
          skip = true;
        } else {
          localPaths.push(match[1]);
        }
      }
      pathPattern.lastIndex = 0;

      if (!skip) {
        localPaths.forEach((p) => seenPaths.add(p));
        result.push(line);
      }
    }

    const prompt = result.join("\n");
    return { prompt, tokenEstimate: estimateTokens(prompt) };
  },
};

const imperativeShorting: Rule = {
  name: "imperative-shortening",
  description: "Convert passive/verbose phrasing to imperative directives",
  apply(ctx) {
    const replacements: Array<[RegExp, string]> = [
      [/\bI would like you to\b/gi, ""],
      [/\bI want you to\b/gi, ""],
      [/\bYou should\b/gi, ""],
      [/\bYou need to\b/gi, ""],
      [/\bMake sure that\b/gi, "Ensure"],
      [/\bIt is important that you\b/gi, ""],
      [/\bDo not forget to\b/gi, ""],
    ];
    let prompt = ctx.prompt;
    for (const [pattern, replacement] of replacements) {
      prompt = prompt.replace(pattern, replacement);
    }
    return { prompt: prompt.trim(), tokenEstimate: estimateTokens(prompt) };
  },
};

export const DEFAULT_RULES: Rule[] = [
  collapseWhitespace,
  removePreamble,
  compressBulletLists,
  imperativeShorting,
  dropRedundantContext,
];
