import {
  BestLane,
  ChopState,
  LaneConfidence,
  LaneExplainerHistoryPoint,
  LaneExplainerInput,
  LaneExplainerResult,
  RiskStyle
} from "./types";
import { pctChange, round } from "./utils";

type AssetLane = "BTC" | "ETH" | "SOL";
type ReturnWindow = "4h" | "12h" | "1d";

interface ReturnSet {
  retBtc4h: number | null;
  retEth4h: number | null;
  retSol4h: number | null;
  retBtc12h: number | null;
  retEth12h: number | null;
  retSol12h: number | null;
  retBtc1d: number | null;
  retEth1d: number | null;
  retSol1d: number | null;
  retEthBtc4h: number | null;
  retSolBtc4h: number | null;
  retSolEth4h: number | null;
  retEthBtc1d: number | null;
  retSolBtc1d: number | null;
  retSolEth1d: number | null;
}

interface LaneRankingResult {
  bestLane: BestLane;
  bestLaneLabel: string;
  laneConfidence: LaneConfidence;
  laneReason: string;
  laneMargin: number | null;
  laneRank1: BestLane;
  laneRank2: BestLane;
  laneScoreBtc: number | null;
  laneScoreEth: number | null;
  laneScoreSol: number | null;
  laneScoreStables: number | null;
  leaderPersistenceScans: number | null;
  btcRepairFlag: boolean | null;
  returns: ReturnSet;
}

interface ChopProxyResult {
  chopState: ChopState;
  shortTermState: string;
  suppressionNote: string | null;
  scoreFlipCount6h: number | null;
  scoreRange6h: number | null;
}

const ASSET_LANES: AssetLane[] = ["BTC", "ETH", "SOL"];
const ALL_LANES: BestLane[] = ["BTC", "ETH", "SOL", "STABLES", "NO_CLEAR_LANE"];

export function deriveLaneExplainer(input: LaneExplainerInput): LaneExplainerResult {
  const ranking = deriveBestLane(input);
  const chop = deriveChopProxy(input, ranking.laneMargin);
  const riskStyle = deriveRiskStyle(input, ranking, chop);
  const ifInAction = deriveIfInAction(input, ranking, chop);
  const ifFlatAction = deriveIfFlatAction(input, ranking, chop);
  const invalidIf = deriveInvalidIf(input, ranking, chop);
  const timeframeRead = deriveTimeframeRead(input, ranking);

  return {
    bestLane: ranking.bestLane,
    bestLaneLabel: ranking.bestLaneLabel,
    laneConfidence: ranking.laneConfidence,
    laneReason: ranking.laneReason,
    laneMargin: ranking.laneMargin,
    laneRank1: ranking.laneRank1,
    laneRank2: ranking.laneRank2,
    laneScoreBtc: ranking.laneScoreBtc,
    laneScoreEth: ranking.laneScoreEth,
    laneScoreSol: ranking.laneScoreSol,
    laneScoreStables: ranking.laneScoreStables,
    leaderPersistenceScans: ranking.leaderPersistenceScans,
    riskStyle,
    ifInAction,
    ifFlatAction,
    invalidIf,
    btcRepairFlag: ranking.btcRepairFlag,
    timeframeRead,
    shortTermState: chop.shortTermState,
    chopState: chop.chopState,
    suppressionNote: chop.suppressionNote,
    scoreFlipCount6h: chop.scoreFlipCount6h,
    scoreRange6h: chop.scoreRange6h,
    ...ranking.returns
  };
}

export function deriveBestLane(input: LaneExplainerInput): LaneRankingResult {
  const returns = deriveReturns(input);
  const usableReturnCount = Object.values(returns).filter((value) => value !== null).length;

  if (!hasCurrentMarketFields(input) && usableReturnCount === 0) {
    return unavailableRanking(returns);
  }

  const absoluteScores = absoluteReturnScores(returns);
  const pairScores = pairStrengthScores(input, returns);
  const persistenceScores = persistenceScoresByLane(input);
  const assetScores = new Map<AssetLane, number>();

  for (const lane of ASSET_LANES) {
    assetScores.set(
      lane,
      round((absoluteScores.get(lane) ?? 0) + (pairScores.get(lane) ?? 0) + (persistenceScores.get(lane) ?? 0), 2)
    );
  }

  const strongestAssetScore = Math.max(...ASSET_LANES.map((lane) => assetScores.get(lane) ?? 0));
  const stablesScore = deriveStablesScore(input, strongestAssetScore, returns);
  const scored = [
    { lane: "BTC" as BestLane, score: assetScores.get("BTC") ?? null },
    { lane: "ETH" as BestLane, score: assetScores.get("ETH") ?? null },
    { lane: "SOL" as BestLane, score: assetScores.get("SOL") ?? null },
    { lane: "STABLES" as BestLane, score: stablesScore }
  ].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || laneSort(a.lane) - laneSort(b.lane));

  const rank1 = scored[0];
  const rank2 = scored[1];
  const margin = rank1.score !== null && rank2.score !== null ? round(rank1.score - rank2.score, 2) : null;
  const bestLane = margin !== null && margin < 5 && rank1.lane !== "STABLES" ? "NO_CLEAR_LANE" : rank1.lane;
  const leaderPersistenceScans = bestLane === "NO_CLEAR_LANE" ? 0 : persistenceCount(input, bestLane);
  const btcRepairFlag = deriveBtcRepairFlag(input, returns);
  const laneConfidence = deriveLaneConfidence(input, bestLane, margin, leaderPersistenceScans, returns, usableReturnCount);

  return {
    bestLane,
    bestLaneLabel: labelForLane(bestLane, laneConfidence),
    laneConfidence,
    laneReason: reasonForLane(input, bestLane, margin, returns, leaderPersistenceScans),
    laneMargin: margin,
    laneRank1: bestLane,
    laneRank2: rank2?.lane ?? "NO_CLEAR_LANE",
    laneScoreBtc: assetScores.get("BTC") ?? null,
    laneScoreEth: assetScores.get("ETH") ?? null,
    laneScoreSol: assetScores.get("SOL") ?? null,
    laneScoreStables: stablesScore,
    leaderPersistenceScans,
    btcRepairFlag,
    returns
  };
}

export function deriveRiskStyle(
  input: LaneExplainerInput,
  ranking: Pick<LaneRankingResult, "bestLane" | "laneConfidence">,
  chop: Pick<ChopProxyResult, "chopState"> = deriveChopProxy(input)
): RiskStyle {
  if (input.regime === "Risk-Off" && (ranking.bestLane === "STABLES" || ranking.bestLane === "NO_CLEAR_LANE")) return "No trade";
  if (chop.chopState === "Choppy") return "Hold winners";
  if ((input.regime === "Defensive" || input.regime === "Neutral / Chop") && ranking.bestLane === "SOL") {
    return ranking.laneConfidence === "Clear" ? "Hold winners" : "Scout only";
  }
  if (input.regime === "Neutral / Chop" && ranking.bestLane !== "NO_CLEAR_LANE") return "Scout only";
  if ((input.regime === "Risk-On" || input.regime === "Strong Risk-On / Rotation") && ranking.laneConfidence === "Clear") return "Risk-on allowed";
  if (ranking.bestLane === "NO_CLEAR_LANE" || ranking.bestLane === "STABLES") return "No trade";
  return "Add only on confirmation";
}

export function deriveIfInAction(
  input: LaneExplainerInput,
  ranking: Pick<LaneRankingResult, "bestLane" | "laneConfidence">,
  chop: Pick<ChopProxyResult, "chopState"> = deriveChopProxy(input)
): string {
  if (input.regime === "Risk-Off") {
    return ranking.bestLane === "SOL" ? "Hold cautiously / protect gains" : "Protect capital";
  }
  if (ranking.bestLane === "NO_CLEAR_LANE" || ranking.bestLane === "STABLES") return "Trim if lane fades";
  if (chop.chopState === "Choppy" || input.regimeConfidence === "Noisy") return "Trail, don't chase";
  if (ranking.laneConfidence === "Clear" || ranking.laneConfidence === "Mixed") return "Hold winner / trail risk";
  return "Hold cautiously";
}

export function deriveIfFlatAction(
  input: LaneExplainerInput,
  ranking: Pick<LaneRankingResult, "bestLane" | "laneConfidence" | "btcRepairFlag">,
  chop: Pick<ChopProxyResult, "chopState"> = deriveChopProxy(input)
): string {
  if (input.regime === "Risk-Off") return "No fresh risk";
  if (ranking.bestLane === "NO_CLEAR_LANE" || ranking.bestLane === "STABLES") return "Wait";
  if (ranking.bestLane === "SOL" && (isMessyMacro(input) || ranking.btcRepairFlag === false)) return "Wait for BTC repair";
  if (chop.chopState === "Choppy" || input.regimeConfidence === "Noisy") return "Wait for cleaner lane";
  if (ranking.laneConfidence === "Clear") return "Scout only on confirmation";
  return "Wait";
}

export function deriveInvalidIf(
  input: LaneExplainerInput,
  ranking: Pick<LaneRankingResult, "bestLane">,
  chop: Pick<ChopProxyResult, "scoreFlipCount6h"> = deriveChopProxy(input)
): string {
  if ((chop.scoreFlipCount6h ?? 0) >= 3) return "Leader flips";
  if (input.regime === "Risk-Off" || ranking.bestLane === "STABLES") return "Risk-Off deepens";
  if (ranking.bestLane === "SOL") return "SOL lead fades / BTC rejects";
  if (ranking.bestLane === "BTC") return "BTC loses structure";
  if (ranking.bestLane === "ETH") return "ETH/BTC fades";
  return "No clean lane persists";
}

export function deriveTimeframeRead(input: LaneExplainerInput, ranking: Pick<LaneRankingResult, "bestLane" | "returns"> = deriveBestLane(input)): string {
  const fourHour = windowLeader(ranking.returns, "4h");
  const twelveHour = windowLeader(ranking.returns, "12h");
  const oneDay = windowLeader(ranking.returns, "1d");
  return `4H: snapshot proxy ${fourHour ?? "unavailable"} | 12H: ${twelveHour ?? "insufficient data"} | 1D: ${oneDay ?? "insufficient data"}`;
}

export function deriveChopProxy(input: LaneExplainerInput, laneMargin: number | null = null): ChopProxyResult {
  const currentMs = timestampMs(input.timestamp);
  if (currentMs === null) {
    return {
      chopState: "Unavailable",
      shortTermState: "Short-term: unavailable",
      suppressionNote: null,
      scoreFlipCount6h: null,
      scoreRange6h: null
    };
  }

  const recent = [...input.history.filter((point) => currentMs - point.timestampMs <= 6 * 60 * 60 * 1000), currentPoint(input)]
    .filter((point) => point.score !== null && point.timestampMs <= currentMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (recent.length < 3) {
    return {
      chopState: input.regimeConfidence === "Noisy" ? "Choppy" : "Unavailable",
      shortTermState: input.regimeConfidence === "Noisy" ? "Short-term: Choppy" : "Short-term: insufficient data",
      suppressionNote: input.regimeConfidence === "Noisy" ? "Noisy confidence with limited scan history" : null,
      scoreFlipCount6h: null,
      scoreRange6h: null
    };
  }

  const scores = recent.map((point) => point.score).filter((score): score is number => score !== null);
  const deltas = scores.slice(1).map((score, index) => score - scores[index]).filter((delta) => delta !== 0);
  let flipCount = 0;
  for (let i = 1; i < deltas.length; i += 1) {
    if (Math.sign(deltas[i]) !== Math.sign(deltas[i - 1])) flipCount += 1;
  }

  const scoreRange = round(Math.max(...scores) - Math.min(...scores), 2);
  const repeatedSlipRecovery = recent.filter((point) => /Score (Slip|Recovery)|Score (dropped|rose)/i.test(point.marketMoveReason ?? "")).length >= 2;
  const sameRegimeMovement = sameRegimeScoreMovement(recent);
  const lowLaneMargin = laneMargin !== null && laneMargin < 8;
  const choppy = flipCount >= 2 || repeatedSlipRecovery || (input.regimeConfidence === "Noisy" && (lowLaneMargin || sameRegimeMovement));
  const mixed = input.regimeConfidence === "Noisy" || lowLaneMargin || scoreRange >= 10 || sameRegimeMovement;
  const suppressionNote = choppy
    ? input.regime === "Neutral / Chop"
      ? "score whipsawing inside Neutral"
      : "score whipsawing inside current regime"
    : mixed
      ? "mixed scan-history pressure"
      : null;

  return {
    chopState: choppy ? "Choppy" : mixed ? "Mixed" : "Clean",
    shortTermState: choppy ? "Short-term: Choppy" : mixed ? "Short-term: Mixed" : "Short-term: Clean",
    suppressionNote,
    scoreFlipCount6h: flipCount,
    scoreRange6h: scoreRange
  };
}

function deriveReturns(input: LaneExplainerInput): ReturnSet {
  const currentMs = timestampMs(input.timestamp);
  const point4h = nearestAtOrBefore(input.history, currentMs, 4);
  const point12h = nearestAtOrBefore(input.history, currentMs, 12);
  const point1d = nearestAtOrBefore(input.history, currentMs, 24);

  return {
    retBtc4h: roundNullable(pctChange(input.btcPrice, point4h?.btcPrice ?? null)),
    retEth4h: roundNullable(pctChange(input.ethPrice, point4h?.ethPrice ?? null)),
    retSol4h: roundNullable(pctChange(input.solPrice, point4h?.solPrice ?? null)),
    retBtc12h: roundNullable(pctChange(input.btcPrice, point12h?.btcPrice ?? null)),
    retEth12h: roundNullable(pctChange(input.ethPrice, point12h?.ethPrice ?? null)),
    retSol12h: roundNullable(pctChange(input.solPrice, point12h?.solPrice ?? null)),
    retBtc1d: roundNullable(pctChange(input.btcPrice, point1d?.btcPrice ?? null)),
    retEth1d: roundNullable(pctChange(input.ethPrice, point1d?.ethPrice ?? null)),
    retSol1d: roundNullable(pctChange(input.solPrice, point1d?.solPrice ?? null)),
    retEthBtc4h: roundNullable(pctChange(input.ethBtcRatio, point4h?.ethBtcRatio ?? null)),
    retSolBtc4h: roundNullable(pctChange(input.solBtcRatio, point4h?.solBtcRatio ?? null)),
    retSolEth4h: roundNullable(pctChange(input.solEthRatio, point4h?.solEthRatio ?? null)),
    retEthBtc1d: roundNullable(pctChange(input.ethBtcRatio, point1d?.ethBtcRatio ?? null)),
    retSolBtc1d: roundNullable(pctChange(input.solBtcRatio, point1d?.solBtcRatio ?? null)),
    retSolEth1d: roundNullable(pctChange(input.solEthRatio, point1d?.solEthRatio ?? null))
  };
}

function absoluteReturnScores(returns: ReturnSet): Map<AssetLane, number> {
  const values = ASSET_LANES.map((lane) => ({ lane, value: weightedAssetReturn(lane, returns) })).filter((item) => item.value !== null) as Array<{ lane: AssetLane; value: number }>;
  const scores = new Map<AssetLane, number>(ASSET_LANES.map((lane) => [lane, 12]));
  if (values.length === 0) return scores;

  const sorted = values.sort((a, b) => b.value - a.value);
  sorted.forEach((item, index) => {
    const rankScore = sorted.length === 1 ? 24 : index === 0 ? 40 : index === 1 ? 22 : 6;
    const trendBonus = item.value > 0 ? 4 : item.value < -2 ? -4 : 0;
    scores.set(item.lane, clampScore(rankScore + trendBonus, 0, 44));
  });
  return scores;
}

function pairStrengthScores(input: LaneExplainerInput, returns: ReturnSet): Map<AssetLane, number> {
  const ethPair = averageNullable([returns.retEthBtc4h, returns.retEthBtc1d]);
  const solBtc = averageNullable([returns.retSolBtc4h, returns.retSolBtc1d]);
  const solEth = averageNullable([returns.retSolEth4h, returns.retSolEth1d]);
  const btcRelative = averageNullable([
    relativeReturn(returns.retBtc4h, returns.retEth4h),
    relativeReturn(returns.retBtc4h, returns.retSol4h),
    relativeReturn(returns.retBtc1d, returns.retEth1d),
    relativeReturn(returns.retBtc1d, returns.retSol1d)
  ]);

  return new Map<AssetLane, number>([
    ["BTC", clampScore(20 + scaled(btcRelative, 3, 14) + (input.regime === "Risk-On" || input.regime === "Strong Risk-On / Rotation" ? 4 : 0), 0, 40)],
    ["ETH", clampScore(20 + scaled(ethPair, 3, 16), 0, 40)],
    ["SOL", clampScore(20 + scaled(averageNullable([solBtc, solEth]), 3, 16), 0, 40)]
  ]);
}

function persistenceScoresByLane(input: LaneExplainerInput): Map<AssetLane, number> {
  return new Map<AssetLane, number>(ASSET_LANES.map((lane) => [lane, Math.min(20, persistenceCount(input, lane) * 5)]));
}

function deriveStablesScore(input: LaneExplainerInput, strongestAssetScore: number, returns: ReturnSet): number {
  const bestAssetReturn = Math.max(...[weightedAssetReturn("BTC", returns), weightedAssetReturn("ETH", returns), weightedAssetReturn("SOL", returns)].map((value) => value ?? -Infinity));
  if (input.regime === "Risk-Off") return strongestAssetScore >= 82 && bestAssetReturn > 2 ? 68 : 82;
  if (input.regime === "Defensive") return strongestAssetScore >= 72 && bestAssetReturn > 1 ? 48 : 58;
  if (input.regime === "Neutral / Chop") return strongestAssetScore >= 65 ? 36 : 46;
  return 18;
}

function deriveLaneConfidence(
  input: LaneExplainerInput,
  bestLane: BestLane,
  margin: number | null,
  persistence: number | null,
  returns: ReturnSet,
  usableReturnCount: number
): LaneConfidence {
  if (bestLane === "NO_CLEAR_LANE" || usableReturnCount === 0 || margin === null) return usableReturnCount === 0 ? "Unavailable" : "Weak";
  if (bestLane === "SOL" && !solLeadershipConfirmed(input, returns, persistence)) return margin >= 10 ? "Mixed" : "Weak";
  if (margin < 8 || (persistence ?? 0) <= 1) return "Weak";
  if (input.regimeConfidence === "Noisy" || input.regime === "Risk-Off" || isMessyMacro(input)) return "Mixed";
  if (margin >= 15 && (persistence ?? 0) > 1) return "Clear";
  return "Mixed";
}

function solLeadershipConfirmed(input: LaneExplainerInput, returns: ReturnSet, persistence: number | null): boolean {
  const solWins = [
    returns.retSol4h !== null && returns.retBtc4h !== null && returns.retEth4h !== null && returns.retSol4h > returns.retBtc4h && returns.retSol4h > returns.retEth4h,
    returns.retSol12h !== null && returns.retBtc12h !== null && returns.retEth12h !== null && returns.retSol12h > returns.retBtc12h && returns.retSol12h > returns.retEth12h,
    returns.retSol1d !== null && returns.retBtc1d !== null && returns.retEth1d !== null && returns.retSol1d > returns.retBtc1d && returns.retSol1d > returns.retEth1d
  ].filter(Boolean).length;
  const pairImproving = [returns.retSolBtc4h, returns.retSolBtc1d].some((value) => (value ?? 0) > 0) && [returns.retSolEth4h, returns.retSolEth1d].some((value) => (value ?? 0) > 0);
  const defiOk = input.defiStatus !== "Weak";
  return solWins > 0 && pairImproving && defiOk && (persistence ?? 0) > 1;
}

function deriveBtcRepairFlag(input: LaneExplainerInput, returns: ReturnSet): boolean | null {
  const btcReturn = averageNullable([returns.retBtc4h, returns.retBtc12h, returns.retBtc1d]);
  if (btcReturn === null && input.score === null) return null;
  return input.score >= 45 && input.regime !== "Risk-Off" && input.regime !== "Defensive" && (btcReturn === null || btcReturn >= 0);
}

function reasonForLane(input: LaneExplainerInput, bestLane: BestLane, margin: number | null, returns: ReturnSet, persistence: number | null): string {
  if (bestLane === "NO_CLEAR_LANE") return "No lane has enough separation.";
  if (bestLane === "STABLES") return input.regime === "Risk-Off" ? "Macro risk budget favors defense." : "Risk budget is not clean enough.";
  if (bestLane === "SOL") {
    const pairText = [returns.retSolBtc4h, returns.retSolBtc1d].some((value) => (value ?? 0) > 0) && [returns.retSolEth4h, returns.retSolEth1d].some((value) => (value ?? 0) > 0)
      ? "SOL/BTC and SOL/ETH improving"
      : "SOL relative strength is mixed";
    return `${pairText}; margin ${formatNullable(margin)}; persistence ${persistence ?? 0}`;
  }
  if (bestLane === "ETH") return `ETH/BTC is the cleaner relative lane; margin ${formatNullable(margin)}.`;
  return `BTC is holding up best versus ETH/SOL; margin ${formatNullable(margin)}.`;
}

function labelForLane(bestLane: BestLane, confidence: LaneConfidence): string {
  if (bestLane === "BTC") return "BTC only";
  if (bestLane === "ETH") return confidence === "Clear" ? "ETH improving" : "ETH watch";
  if (bestLane === "SOL") return "SOL leading";
  if (bestLane === "STABLES") return "Stables safest";
  return "No clean lane";
}

function windowLeader(returns: ReturnSet, window: ReturnWindow): string | null {
  const suffix = window === "4h" ? "4h" : window === "12h" ? "12h" : "1d";
  const values = [
    ["BTC", returns[`retBtc${suffix}` as keyof ReturnSet]],
    ["ETH", returns[`retEth${suffix}` as keyof ReturnSet]],
    ["SOL", returns[`retSol${suffix}` as keyof ReturnSet]]
  ] as Array<[AssetLane, number | null]>;
  if (values.some(([, value]) => value === null)) return null;
  const sorted = values.sort((a, b) => (b[1] ?? -Infinity) - (a[1] ?? -Infinity));
  if ((sorted[0][1] ?? 0) - (sorted[1][1] ?? 0) < 0.5) return "no clear lane";
  return `${sorted[0][0]} leading`;
}

function unavailableRanking(returns: ReturnSet): LaneRankingResult {
  return {
    bestLane: "NO_CLEAR_LANE",
    bestLaneLabel: "No clean lane",
    laneConfidence: "Unavailable",
    laneReason: "Not enough price or snapshot history for lane ranking.",
    laneMargin: null,
    laneRank1: "NO_CLEAR_LANE",
    laneRank2: "NO_CLEAR_LANE",
    laneScoreBtc: null,
    laneScoreEth: null,
    laneScoreSol: null,
    laneScoreStables: null,
    leaderPersistenceScans: null,
    btcRepairFlag: null,
    returns
  };
}

function currentPoint(input: LaneExplainerInput): LaneExplainerHistoryPoint {
  return {
    timestamp: input.timestamp,
    timestampMs: timestampMs(input.timestamp) ?? Date.now(),
    score: input.score,
    regime: input.regime,
    leader: input.leader,
    regimeConfidence: input.regimeConfidence,
    marketMoveReason: input.marketMoveReason,
    btcPrice: input.btcPrice,
    ethPrice: input.ethPrice,
    solPrice: input.solPrice,
    ethBtcRatio: input.ethBtcRatio,
    solBtcRatio: input.solBtcRatio,
    solEthRatio: input.solEthRatio
  };
}

function nearestAtOrBefore(history: LaneExplainerHistoryPoint[], currentMs: number | null, hoursBack: number): LaneExplainerHistoryPoint | null {
  if (currentMs === null) return null;
  const targetMs = currentMs - hoursBack * 60 * 60 * 1000;
  return history
    .filter((point) => point.timestampMs <= targetMs)
    .sort((a, b) => b.timestampMs - a.timestampMs)[0] ?? null;
}

function persistenceCount(input: LaneExplainerInput, lane: BestLane): number {
  if (lane === "NO_CLEAR_LANE") return 0;
  const recent = [...input.history, currentPoint(input)].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 8);
  let count = 0;
  for (const point of recent) {
    if (pointLane(point) !== lane) break;
    count += 1;
  }
  return count;
}

function pointLane(point: LaneExplainerHistoryPoint): BestLane {
  if (point.bestLane && ALL_LANES.includes(point.bestLane as BestLane)) return point.bestLane as BestLane;
  if (/SOL/i.test(point.leader)) return "SOL";
  if (/ETH/i.test(point.leader)) return "ETH";
  if (/BTC/i.test(point.leader)) return "BTC";
  if (/Defensive|Risk-Off/i.test(point.regime) || /Defensive/i.test(point.leader)) return "STABLES";
  return "NO_CLEAR_LANE";
}

function sameRegimeScoreMovement(recent: LaneExplainerHistoryPoint[]): boolean {
  if (recent.length < 3) return false;
  const regimes = new Set(recent.map((point) => point.regime));
  if (regimes.size !== 1) return false;
  const scores = recent.map((point) => point.score).filter((score): score is number => score !== null);
  return Math.max(...scores) - Math.min(...scores) >= 6;
}

function weightedAssetReturn(lane: AssetLane, returns: ReturnSet): number | null {
  const values = lane === "BTC"
    ? [[returns.retBtc4h, 1], [returns.retBtc12h, 0.8], [returns.retBtc1d, 0.6]]
    : lane === "ETH"
      ? [[returns.retEth4h, 1], [returns.retEth12h, 0.8], [returns.retEth1d, 0.6]]
      : [[returns.retSol4h, 1], [returns.retSol12h, 0.8], [returns.retSol1d, 0.6]];
  const clean = values.filter((item): item is [number, number] => item[0] !== null);
  if (clean.length === 0) return null;
  const weightSum = clean.reduce((sum, [, weight]) => sum + weight, 0);
  return clean.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightSum;
}

function hasCurrentMarketFields(input: LaneExplainerInput): boolean {
  return [input.btcPrice, input.ethPrice, input.solPrice, input.ethBtcRatio, input.solBtcRatio, input.solEthRatio].every((value) => value !== null && Number.isFinite(value));
}

function isMessyMacro(input: LaneExplainerInput): boolean {
  return input.regime === "Defensive" || input.regime === "Neutral / Chop" || input.regimeConfidence === "Noisy";
}

function relativeReturn(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return left - right;
}

function averageNullable(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function scaled(value: number | null, unit: number, maxAbs: number): number {
  if (value === null) return 0;
  return Math.max(-maxAbs, Math.min(maxAbs, (value / unit) * maxAbs));
}

function clampScore(value: number, min: number, max: number): number {
  return round(Math.max(min, Math.min(max, value)), 2);
}

function roundNullable(value: number | null): number | null {
  return value === null ? null : round(value, 4);
}

function timestampMs(timestamp: string): number | null {
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function laneSort(lane: BestLane): number {
  return ALL_LANES.indexOf(lane);
}

function formatNullable(value: number | null): string {
  return value === null ? "n/a" : String(value);
}