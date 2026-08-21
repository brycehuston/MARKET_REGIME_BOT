import { buildEventContext } from "./eventContext";
import { AlphaPulseMajorsInput, formatHeartbeatAlert } from "./telegram";
import { LaneExplainerHistoryPoint, LaneExplainerResult, MarketDataFreshnessFields, RegimeName, RegimeScoreResult } from "./types";

function sampleResult(score: number, regime: RegimeName = "Neutral / Chop", timestamp = "2026-07-08T19:00:00Z"): RegimeScoreResult {
  return {
    timestamp,
    timeframe: "1h",
    score,
    regime,
    leader: "SOL-led",
    memeCondition: "Mixed",
    researchBias: "Neutral",
    reason: "preview fixture",
    components: [
      { name: "BTC trend / structure", score: 0, min: -20, max: 20, label: "Flat", reason: "fixture" },
      { name: "ETH/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/ETH relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" }
    ],
    global: {
      timestamp,
      totalMarketCapUsd: null,
      totalMarketCapChange24hPct: null,
      btcDominancePct: null,
      ethDominancePct: null,
      solDominancePct: null,
      stablecoinDominancePct: null,
      rawSource: "unavailable"
    },
    defiConfirmation: {
      status: "Mixed",
      solanaActivity: "Mixed",
      liquidity: "Mixed",
      reason: "fixture",
      components: {}
    }
  };
}

const laneExplainer: LaneExplainerResult = {
  bestLane: "SOL",
  bestLaneLabel: "SOL leading",
  laneConfidence: "Mixed",
  laneReason: "fixture",
  laneMargin: null,
  laneRank1: "SOL",
  laneRank2: "BTC",
  laneScoreBtc: null,
  laneScoreEth: null,
  laneScoreSol: null,
  laneScoreStables: null,
  leaderPersistenceScans: null,
  riskStyle: "Hold winners",
  ifInAction: "trail, don't chase",
  ifFlatAction: "wait for BTC repair",
  invalidIf: "SOL lead fades / BTC rejects",
  btcRepairFlag: null,
  timeframeRead: "fixture",
  shortTermState: "fixture",
  chopState: "Choppy",
  suppressionNote: null,
  scoreFlipCount6h: null,
  scoreRange6h: null,
  retBtc4h: null,
  retEth4h: null,
  retSol4h: null,
  retBtc12h: null,
  retEth12h: null,
  retSol12h: null,
  retBtc1d: null,
  retEth1d: null,
  retSol1d: null,
  retEthBtc4h: null,
  retSolBtc4h: null,
  retSolEth4h: null,
  retEthBtc1d: null,
  retSolBtc1d: null,
  retSolEth1d: null
};

function printScenario(name: string, text: string): void {
  const lines = text.split("\n");
  console.log("==============================");
  console.log(`SCENARIO: ${name}`);
  console.log("==============================");
  console.log("--- IPHONE PREVIEW FIRST 3 LINES ---");
  console.log(lines.slice(0, 3).join("\n"));
  console.log("--- FULL TELEGRAM TEXT ---");
  console.log(text);
  console.log("--- METRICS ---");
  console.log(`chars: ${text.length}`);
  console.log(`lines: ${lines.length}`);
  console.log();
}

function previewNextScanIso(): string {
  return new Date(Date.now() + 15 * 60_000).toISOString();
}

function freshness(timestamp: string, fresh: boolean): MarketDataFreshnessFields {
  return {
    marketDataFresh: fresh,
    marketDataStaleReason: fresh ? null : "Live BTC/ETH/SOL prices stopped updating",
    marketDataProvider: "coingecko",
    marketDataProviderErrors: [],
    livePriceFresh: fresh,
    livePriceAgeMinutes: fresh ? 0 : 240,
    livePriceTimestamp: timestamp,
    livePriceProvider: "coingecko",
    livePriceProviderErrors: [],
    livePriceUnchangedScanCount: fresh ? 0 : 4,
    historicalDataFresh: true,
    historicalDataAgeMinutes: 60,
    historicalDataTimestamp: new Date(Date.parse(timestamp) - 60 * 60_000).toISOString(),
    historicalDataProvider: "coingecko",
    historicalDataProviderErrors: [],
    historicalInterval: "1d",
    btcPriceChanged: fresh,
    ethPriceChanged: fresh,
    solPriceChanged: fresh,
    marketDataQuality: fresh ? "FRESH" : "FROZEN"
  };
}

function historyPoint(timestamp: string, btcPrice: number, ethPrice: number, solPrice: number): LaneExplainerHistoryPoint {
  return {
    timestamp,
    timestampMs: Date.parse(timestamp),
    score: 60,
    regime: "Neutral / Chop",
    leader: "SOL-led",
    regimeConfidence: "Noisy",
    marketMoveReason: null,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: null,
    solBtcRatio: null,
    solEthRatio: null,
    livePriceTimestamp: timestamp,
    bestLane: "SOL",
    marketDataFresh: true
  };
}

function majors(timestamp: string, current: [number, number, number], prior: [number, number, number], fresh = true): AlphaPulseMajorsInput {
  const priorTimestamp = new Date(Date.parse(timestamp) - 60 * 60_000).toISOString();
  return {
    timestamp,
    livePriceTimestamp: timestamp,
    marketDataFresh: fresh,
    scanIntervalMinutes: 15,
    btcPrice: current[0],
    ethPrice: current[1],
    solPrice: current[2],
    history: [historyPoint(priorTimestamp, prior[0], prior[1], prior[2])]
  };
}

const normalTimestamp = "2026-07-08T19:00:00Z";
const normal = sampleResult(70, "Risk-On", normalTimestamp);
printScenario("ALPHA PULSE / RISK-ON / NORMAL CONTEXT", formatHeartbeatAlert(
  normal,
  previewNextScanIso(),
  normal,
  laneExplainer,
  buildEventContext(new Date(normalTimestamp)),
  freshness(normalTimestamp, true),
  majors(normalTimestamp, [60_600, 2_016, 103.4], [60_000, 2_000, 100])
));

const weekendTimestamp = "2026-07-11T19:00:00Z";
const weekend = sampleResult(58, "Neutral / Chop", weekendTimestamp);
printScenario("ALPHA PULSE / CHOPPY / WEEKEND CONTEXT", formatHeartbeatAlert(
  weekend,
  previewNextScanIso(),
  weekend,
  laneExplainer,
  buildEventContext(new Date(weekendTimestamp)),
  freshness(weekendTimestamp, true),
  majors(weekendTimestamp, [59_700, 1_984, 98.3], [60_000, 2_000, 100])
));

const degradedTimestamp = "2026-07-08T19:00:00Z";
const degraded = sampleResult(42, "Risk-Off", degradedTimestamp);
const degradedLane = {
  ...laneExplainer,
  bestLane: "NO_CLEAR_LANE" as const,
  bestLaneLabel: "Data stale",
  ifInAction: "Protect gains / verify manually",
  ifFlatAction: "Wait — data stale"
};
printScenario("ALPHA PULSE / DEGRADED OPTIONAL DATA", formatHeartbeatAlert(
  degraded,
  previewNextScanIso(),
  degraded,
  degradedLane,
  undefined,
  freshness(degradedTimestamp, false),
  majors(degradedTimestamp, [60_000, 2_000, 100], [60_000, 2_000, 100], false)
));
