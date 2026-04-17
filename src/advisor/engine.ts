import { PATTERNS } from "./patterns.js";
import { TIPS, type Tip } from "./tips.js";
import { getRecentRecords } from "../tracker/store.js";

export interface AdvisorReport {
  deviceId: string;
  tips: Tip[];
  generatedAt: string;
}

export function generateReport(deviceId: string, lookback = 50): AdvisorReport {
  const records = getRecentRecords(deviceId, lookback);
  const tips: Tip[] = [];

  for (const pattern of PATTERNS) {
    if (pattern.detect(records)) {
      const tip = TIPS[pattern.tipId];
      if (tip) tips.push(tip);
    }
  }

  return {
    deviceId,
    tips,
    generatedAt: new Date().toISOString(),
  };
}
