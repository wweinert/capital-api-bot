function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let word = value;
    word = Math.imul(word ^ (word >>> 15), word | 1);
    word ^= word + Math.imul(word ^ (word >>> 7), word | 61);
    return ((word ^ (word >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

export function createScoringCandidateRng(seed = 20260727) {
  return mulberry32(Number(seed) || 20260727);
}

// This only mutates knobs consumed by strategies/scoring/entry.js.  It keeps the
// portfolio to one selected trade, matching the runtime's quality-ranking gate.
export function buildScoringCandidate(index, rng = createScoringCandidateRng()) {
  const symbols = pick(rng, [
    ["EURUSD"],
    ["USDJPY"],
    ["AUDJPY"],
    ["EURUSD", "USDJPY"],
    ["EURUSD", "AUDJPY"],
    ["EURUSD", "USDJPY", "AUDJPY"],
  ]);
  const sessions = pick(rng, [
    ["LONDON", "NY"],
    ["TOKYO"],
    ["SYDNEY", "TOKYO"],
    ["TOKYO", "LONDON", "NY"],
    ["SYDNEY", "TOKYO", "LONDON", "NY"],
  ]);
  const takeProfitR = pick(rng, [1.25, 1.5, 1.75, 2, 2.25, 2.5, 3]);
  const trailing = pick(rng, [false, false, false, true]);
  const entry = {
    threshold: pick(rng, [2, 2, 3, 3, 4]),
    h1RsiOversold: pick(rng, [30, 32, 35, 38, 40, 45]),
    h1RsiOverbought: pick(rng, [55, 60, 62, 65, 68, 70]),
    m15RsiOversold: pick(rng, [20, 25, 28, 30, 32, 35]),
    m15RsiOverbought: pick(rng, [65, 68, 70, 72, 75, 80]),
    atrStopMultiplier: pick(rng, [1, 1.25, 1.5, 1.75, 2, 2.5]),
    minStopPips: pick(rng, [2, 3, 4, 5, 6]),
    maxStopPips: pick(rng, [10, 12, 15, 18, 22, 30]),
    takeProfitR,
  };
  entry.maxStopPips = Math.max(entry.minStopPips, entry.maxStopPips);

  return {
    label: `scoring_${trailing ? "trail" : "fixed"}_${String(index).padStart(4, "0")}`,
    overrides: {
      enabledSymbols: symbols,
      enabledSessions: sessions,
      entry,
      // Fixed TP represents current live behavior. Trailing variants are isolated
      // experiments that must be separately enabled in the live exit module.
      exits: trailing
        ? {
            hardTakeProfitR: 99,
            breakEvenAtR: pick(rng, [0.75, 1, 1.25]),
            breakEvenLockR: pick(rng, [0, 0.1, 0.2]),
            trailStartMinR: pick(rng, [0.75, 1, 1.25, 1.5]),
            trailStartMaxR: pick(rng, [1.25, 1.5, 1.75, 2]),
            trailStartAtrRiskMultiplier: pick(rng, [0.8, 1.2, 1.6]),
            trailMinDistanceR: pick(rng, [0.25, 0.4, 0.6, 0.8]),
            trailMaxDistanceR: pick(rng, [0.8, 1, 1.25, 1.5]),
            trailAtrMultiplier: pick(rng, [1, 1.4, 1.8, 2.2]),
            minTrailPips: pick(rng, [1, 2, 3]),
            stepR: pick(rng, [0.05, 0.1, 0.2]),
          }
        : {
            hardTakeProfitR: takeProfitR,
            breakEvenAtR: 99,
            trailStartMinR: 99,
            trailStartMaxR: 99,
          },
    },
    execution: {
      maxPositions: 1,
      enforceMargin: true,
      marginUtilization: 0.85,
      // The replay currently models 3% of equity risk per trade. Keep the
      // portfolio cap equal to that one selected position; live deployment
      // must reduce both values together if 2% risk is chosen.
      maxOpenRiskPct: 0.03,
      guardConfig: {
        maxDailyLossPct: 0.03,
        maxDailyLossR: 1.5,
        maxSymbolLossesPerDay: 1,
        maxLossStreak: 2,
        lossStreakCooldownMinutes: 240,
      },
    },
    notes: "Current seven-condition scoring strategy: fixed-TP parity and explicit trailing-only experiments.",
  };
}
