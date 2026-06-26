import {
  BotConfig,
  Candle,
  CandleBundle,
  GlobalHistoryPoint,
  GlobalSnapshot,
  LeaderName,
  RegimeName,
  RegimeScoreResult,
  SavedState,
  ScoreComponent,
  Timeframe
} from "./types";
import { averageVolumeRatio, closes, ema, emaSlope, getStructure, latest, rateOfChange } from "./indicators";
import { average, clamp, pctChange, round, nowIso } from "./utils";

export function scoreMarketRegime(params: {
  timeframe: Timeframe;
  candles: CandleBundle;
  global: GlobalSnapshot;
  state: SavedState;
  config: BotConfig;
}): RegimeScoreResult {
  const { timeframe, candles, global, state } = params;

  const components: ScoreComponent[] = [
    scoreBtcTrend(candles.btcUsdt),
    scoreTotalMarketTrend(global, candles),
    scoreBtcDominance(global, state.globalHistory),
    scoreStablecoinDominance(global, state.globalHistory),
    scoreRelativeStrength("ETH/BTC relative strength", candles.ethBtc, 10),
    scoreRelativeStrength("SOL/BTC relative strength", candles.solBtc, 10),
    scoreRelativeStrength("SOL/ETH relative strength", candles.solEth, 5),
    scoreVolumeConfirmation(candles)
  ];

  const rawScore = 50 + components.reduce((sum, component) => sum + component.score, 0);
  const score = round(clamp(rawScore, 0, 100), 0);
  const regime = classifyRegime(score);
  const leader = classifyLeader(score, components);
  const memeCondition = classifyMemeCondition(score, components);
  const researchBias = classifyResearchBias(regime, leader, memeCondition);
  const reason = buildReason(score, regime, leader, memeCondition, components);

  return {
    timestamp: nowIso(),
    timeframe,
    score,
    regime,
    leader,
    memeCondition,
    researchBias,
    components,
    reason,
    global
  };
}

function scoreBtcTrend(candles: Candle[]): ScoreComponent {
  const closeValues = closes(candles);
  const lastClose = closeValues[closeValues.length - 1];
  const ema50 = latest(ema(closeValues, 50));
  const ema200 = latest(ema(closeValues, 200));
  const slope50 = emaSlope(closeValues, 50, 10);
  const roc7 = rateOfChange(closeValues, 7);
  const structure = getStructure(candles, 3);

  let score = 0;
  const reasons: string[] = [];

  if (ema50 !== null) {
    score += lastClose > ema50 ? 3 : -3;
    reasons.push(lastClose > ema50 ? "BTC is above EMA50" : "BTC is below EMA50");
  }

  if (ema200 !== null) {
    score += lastClose > ema200 ? 3 : -3;
    reasons.push(lastClose > ema200 ? "BTC is above EMA200" : "BTC is below EMA200");
  }

  if (ema50 !== null && ema200 !== null) {
    score += ema50 > ema200 ? 3 : -3;
    reasons.push(ema50 > ema200 ? "EMA50 is above EMA200" : "EMA50 is below EMA200");
  }

  if (slope50 !== null) {
    score += slope50 > 0 ? 2 : -2;
    reasons.push(slope50 > 0 ? "EMA50 slope is rising" : "EMA50 slope is falling");
  }

  if (structure.label === "Bullish" || structure.event === "Bullish BOS") score += 3;
  if (structure.label === "Bearish" || structure.event === "Bearish BOS") score -= 3;
  reasons.push(`${structure.label} structure / ${structure.event}`);

  if (roc7 !== null) {
    score += roc7 > 0 ? 1 : -1;
    reasons.push(roc7 > 0 ? "7-candle momentum is positive" : "7-candle momentum is negative");
  }

  const clipped = round(clamp(score, -15, 15), 2);
  return {
    name: "BTC trend / structure",
    score: clipped,
    min: -15,
    max: 15,
    label: scoreToLabel(clipped, 15),
    reason: reasons.join("; ")
  };
}

function scoreTotalMarketTrend(global: GlobalSnapshot, candles: CandleBundle): ScoreComponent {
  let score = 0;
  const reasons: string[] = [];

  if (global.totalMarketCapChange24hPct !== null) {
    const change = global.totalMarketCapChange24hPct;
    if (change >= 2) score = 10;
    else if (change >= 0.75) score = 6;
    else if (change >= 0.25) score = 3;
    else if (change <= -2) score = -10;
    else if (change <= -0.75) score = -6;
    else if (change <= -0.25) score = -3;
    else score = 0;
    reasons.push(`CoinGecko global market cap 24h change is ${round(change, 2)}%`);
  } else {
    // Fallback proxy when global market cap is unavailable.
    const btcRoc = rateOfChange(closes(candles.btcUsdt), 7) ?? 0;
    const ethRoc = rateOfChange(closes(candles.ethUsdt), 7) ?? 0;
    const solRoc = rateOfChange(closes(candles.solUsdt), 7) ?? 0;
    const synthetic = btcRoc * 0.5 + ethRoc * 0.3 + solRoc * 0.2;
    score = clamp(synthetic, -10, 10);
    reasons.push(`Global cap unavailable, using BTC/ETH/SOL synthetic 7-candle trend of ${round(synthetic, 2)}%`);
  }

  const clipped = round(clamp(score, -10, 10), 2);
  return {
    name: "Total crypto market trend",
    score: clipped,
    min: -10,
    max: 10,
    label: scoreToLabel(clipped, 10),
    reason: reasons.join("; ")
  };
}

function scoreBtcDominance(global: GlobalSnapshot, history: GlobalHistoryPoint[]): ScoreComponent {
  const currentBtcDom = global.btcDominancePct;
  const currentTotalCap = global.totalMarketCapUsd;

  if (currentBtcDom === null || currentTotalCap === null || history.length < 3) {
    return neutralComponent("BTC dominance behavior", -10, 10, "Need more saved global history before dominance behavior can be judged.");
  }

  const recent = history.slice(-7);
  const avgBtcDom = average(recent.map((point) => point.btcDominancePct).filter((value): value is number => value !== null));
  const avgTotalCap = average(recent.map((point) => point.totalMarketCapUsd).filter((value): value is number => value !== null));

  if (avgBtcDom === null || avgTotalCap === null) {
    return neutralComponent("BTC dominance behavior", -10, 10, "Saved history is missing dominance or total market cap data.");
  }

  const domDelta = currentBtcDom - avgBtcDom;
  const totalCapDelta = pctChange(currentTotalCap, avgTotalCap) ?? 0;

  let score = 0;
  if (domDelta <= -0.25 && totalCapDelta >= 0.25) score = 10;
  else if (domDelta >= 0.25 && totalCapDelta <= -0.25) score = -10;
  else if (domDelta >= 0.25 && totalCapDelta >= 0.25) score = -4;
  else if (domDelta <= -0.25 && totalCapDelta <= -0.25) score = -5;
  else if (domDelta <= -0.1 && totalCapDelta > 0) score = 5;
  else if (domDelta >= 0.1) score = -5;

  const reason = `BTC dominance change vs recent average: ${round(domDelta, 3)} pts. Total market cap change vs recent average: ${round(totalCapDelta, 2)}%.`;
  return {
    name: "BTC dominance behavior",
    score,
    min: -10,
    max: 10,
    label: scoreToLabel(score, 10),
    reason
  };
}

function scoreStablecoinDominance(global: GlobalSnapshot, history: GlobalHistoryPoint[]): ScoreComponent {
  const currentStableDom = global.stablecoinDominancePct;

  if (currentStableDom === null || history.length < 3) {
    return neutralComponent("Stablecoin dominance", -10, 10, "Need more saved global history before stablecoin dominance can be judged.");
  }

  const recent = history.slice(-7);
  const avgStableDom = average(recent.map((point) => point.stablecoinDominancePct).filter((value): value is number => value !== null));

  if (avgStableDom === null) {
    return neutralComponent("Stablecoin dominance", -10, 10, "Saved history is missing stablecoin dominance data.");
  }

  const delta = currentStableDom - avgStableDom;
  let score = 0;

  if (delta <= -0.25) score = 10;
  else if (delta <= -0.1) score = 5;
  else if (delta >= 0.25) score = -10;
  else if (delta >= 0.1) score = -5;

  return {
    name: "Stablecoin dominance",
    score,
    min: -10,
    max: 10,
    label: scoreToLabel(score, 10),
    reason: `Stablecoin dominance change vs recent average: ${round(delta, 3)} pts. Falling is risk-on. Rising is risk-off.`
  };
}

function scoreRelativeStrength(name: string, candles: Candle[], maxAbs: 10 | 5): ScoreComponent {
  const closeValues = closes(candles);
  const lastClose = closeValues[closeValues.length - 1];
  const ema20 = latest(ema(closeValues, 20));
  const ema50 = latest(ema(closeValues, 50));
  const roc7 = rateOfChange(closeValues, 7);
  const structure = getStructure(candles, 3);

  let rawScore = 0;
  const reasons: string[] = [];

  if (ema20 !== null) {
    rawScore += lastClose > ema20 ? 3 : -3;
    reasons.push(lastClose > ema20 ? "above EMA20" : "below EMA20");
  }

  if (ema50 !== null) {
    rawScore += lastClose > ema50 ? 3 : -3;
    reasons.push(lastClose > ema50 ? "above EMA50" : "below EMA50");
  }

  if (ema20 !== null && ema50 !== null) {
    rawScore += ema20 > ema50 ? 2 : -2;
    reasons.push(ema20 > ema50 ? "EMA20 above EMA50" : "EMA20 below EMA50");
  }

  if (roc7 !== null) {
    rawScore += roc7 > 0 ? 2 : -2;
    reasons.push(roc7 > 0 ? `ROC7 positive ${round(roc7, 2)}%` : `ROC7 negative ${round(roc7, 2)}%`);
  }

  if (structure.event === "Bullish BOS") rawScore += 1;
  if (structure.event === "Bearish BOS") rawScore -= 1;

  const scaled = maxAbs === 5 ? rawScore * 0.5 : rawScore;
  const score = round(clamp(scaled, -maxAbs, maxAbs), 2);

  return {
    name,
    score,
    min: -maxAbs,
    max: maxAbs,
    label: relativeStrengthLabel(score, maxAbs),
    reason: reasons.join("; ") || "Not enough ratio data."
  };
}

function scoreVolumeConfirmation(candles: CandleBundle): ScoreComponent {
  const items: Array<{ name: string; candles: Candle[] }> = [
    { name: "BTC", candles: candles.btcUsdt },
    { name: "ETH", candles: candles.ethUsdt },
    { name: "SOL", candles: candles.solUsdt }
  ];

  let score = 0;
  const reasons: string[] = [];

  for (const item of items) {
    const latestCandle = item.candles[item.candles.length - 1];
    const ratio = averageVolumeRatio(item.candles, 20);
    if (!latestCandle || ratio === null) continue;

    const green = latestCandle.close > latestCandle.open;
    const red = latestCandle.close < latestCandle.open;

    if (green && ratio >= 1.2) {
      score += 1.67;
      reasons.push(`${item.name} green candle with ${round(ratio, 2)}x volume`);
    } else if (red && ratio >= 1.2) {
      score -= 1.67;
      reasons.push(`${item.name} red candle with ${round(ratio, 2)}x volume`);
    } else {
      reasons.push(`${item.name} volume normal at ${round(ratio, 2)}x`);
    }
  }

  const clipped = round(clamp(score, -5, 5), 2);
  return {
    name: "Volume confirmation",
    score: clipped,
    min: -5,
    max: 5,
    label: clipped > 1 ? "Expanding" : clipped < -1 ? "Distribution" : "Normal",
    reason: reasons.join("; ")
  };
}

function classifyRegime(score: number): RegimeName {
  if (score <= 25) return "Risk-Off";
  if (score <= 45) return "Defensive";
  if (score <= 60) return "Neutral / Chop";
  if (score <= 75) return "Risk-On";
  return "Strong Risk-On / Rotation";
}

function classifyLeader(score: number, components: ScoreComponent[]): LeaderName {
  const btcTrend = getComponentScore(components, "BTC trend / structure");
  const btcDom = getComponentScore(components, "BTC dominance behavior");
  const ethBtc = getComponentScore(components, "ETH/BTC relative strength");
  const solBtc = getComponentScore(components, "SOL/BTC relative strength");
  const solEth = getComponentScore(components, "SOL/ETH relative strength");

  if (score <= 45) return "Defensive";
  if (solBtc >= 6 && solEth >= 2) return "SOL-led";
  if (ethBtc >= 6 && solBtc < 6) return "ETH-led";
  if (btcTrend >= 7 && btcDom < 0 && ethBtc <= 2 && solBtc <= 2) return "BTC-led";
  if (btcDom > 4 && (ethBtc > 2 || solBtc > 2)) return "Alt rotation";
  return "Mixed";
}

function classifyMemeCondition(score: number, components: ScoreComponent[]): string {
  const solBtc = getComponentScore(components, "SOL/BTC relative strength");
  const solEth = getComponentScore(components, "SOL/ETH relative strength");
  const stable = getComponentScore(components, "Stablecoin dominance");
  const volume = getComponentScore(components, "Volume confirmation");

  if (score >= 76 && solBtc >= 6 && solEth >= 2 && stable >= 0 && volume >= 0) return "Excellent for selective SOL rotation";
  if (score >= 61 && solBtc >= 3 && stable >= -3) return "Good, but still selective";
  if (score >= 46) return "Choppy, use caution";
  if (score <= 25) return "Very bad for speculation";
  return "Bad / defensive";
}

function classifyResearchBias(regime: RegimeName, leader: LeaderName, memeCondition: string): string {
  if (regime === "Risk-Off") return "Stables / capital protection favored";
  if (regime === "Defensive") return "Defensive positioning favored";
  if (regime === "Neutral / Chop") return "Wait for cleaner confirmation";
  if (leader === "SOL-led") return `SOL ecosystem favored. ${memeCondition}`;
  if (leader === "ETH-led") return "ETH / large-cap alt strength favored";
  if (leader === "BTC-led") return "BTC strength favored over alts";
  return "Crypto exposure favored, but leadership is mixed";
}

function buildReason(score: number, regime: RegimeName, leader: LeaderName, memeCondition: string, components: ScoreComponent[]): string {
  const strongest = [...components].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3);
  const parts = strongest.map((component) => `${component.name}: ${component.label} (${component.score})`);
  return `Score ${score}/100 = ${regime}. Leader: ${leader}. Meme conditions: ${memeCondition}. Main drivers: ${parts.join(" | ")}.`;
}

function getComponentScore(components: ScoreComponent[], name: string): number {
  return components.find((component) => component.name === name)?.score ?? 0;
}

function scoreToLabel(score: number, maxAbs: number): string {
  if (score >= maxAbs * 0.6) return "Bullish";
  if (score >= maxAbs * 0.2) return "Improving";
  if (score <= -maxAbs * 0.6) return "Bearish";
  if (score <= -maxAbs * 0.2) return "Weakening";
  return "Neutral";
}

function relativeStrengthLabel(score: number, maxAbs: number): string {
  if (score >= maxAbs * 0.6) return "Rising";
  if (score >= maxAbs * 0.2) return "Improving";
  if (score <= -maxAbs * 0.6) return "Falling";
  if (score <= -maxAbs * 0.2) return "Weakening";
  return "Neutral";
}

function neutralComponent(name: string, min: number, max: number, reason: string): ScoreComponent {
  return {
    name,
    score: 0,
    min,
    max,
    label: "Neutral / warming up",
    reason
  };
}
