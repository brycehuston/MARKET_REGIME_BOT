import { buildEventContext } from "./eventContext";
import {
  AlphaPulseMajorsInput,
  formatHeartbeatAlert,
  formatRegimeAlert,
} from "./telegram";
import {
  LaneExplainerResult,
  MarketDataFreshnessFields,
  RegimeName,
  RegimeScoreResult,
} from "./types";

function sampleResult(
  score: number,
  regime: RegimeName = "Neutral / Chop",
  timestamp = "2026-07-08T19:00:00Z",
): RegimeScoreResult {
  return {
    timestamp,
    timeframe: "1h",
    score,
    regime,
    leader: "SOL-led",
    memeCondition: "Mixed",
    researchBias: "Neutral",
    reason: "preview fixture",
    components: [],
    global: {
      timestamp,
      totalMarketCapUsd: 2000000000000,
      totalMarketCapChange24hPct: 2.5,
      btcDominancePct: 50.1,
      ethDominancePct: null,
      solDominancePct: null,
      stablecoinDominancePct: 10.2,
      rawSource: "unavailable",
    },
    defiConfirmation: {
      status: "Mixed",
      solanaActivity: "Mixed",
      liquidity: "Mixed",
      reason: "",
      components: {},
    },
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
  invalidIf: "SOL lead fades",
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
  retSolEth1d: null,
  retBtc7d: null,
  retEth7d: null,
  retSol7d: null,
};

const majorsInput: AlphaPulseMajorsInput = {
  timestamp: "2026-07-08T19:00:00Z",
  livePriceTimestamp: "2026-07-08T19:00:00Z",
  marketDataFresh: true,
  scanIntervalMinutes: 15,
  btcPrice: 60000,
  ethPrice: 3000,
  solPrice: 150,
  retBtc1h: 1.2,
  retEth1h: -0.5,
  retSol1h: 2.3,
  history: [],
};

const staleData = {
  marketDataFresh: false,
  livePriceFresh: false,
  marketDataStaleReason: "Provider unavailable",
  marketDataProvider: "coingecko",
  marketDataProviderErrors: ["Failed to fetch"],
} as unknown as MarketDataFreshnessFields;

const freshData = {
  marketDataFresh: true,
  livePriceFresh: true,
  marketDataStaleReason: null,
  marketDataProvider: "coingecko",
  marketDataProviderErrors: [],
} as unknown as MarketDataFreshnessFields;

function printScenario(name: string, text: string): void {
  console.log("==============================");
  console.log(`SCENARIO: ${name}`);
  console.log("==============================");
  console.log(text);
  console.log();
}

function runPreviews() {
  const nextScanIso = new Date(Date.now() + 15 * 60_000).toISOString();

  // 1. Market Move score recovery
  const res3a = sampleResult(50, "Neutral / Chop");
  const res3b = sampleResult(60, "Neutral / Chop");
  const moveUp = formatRegimeAlert(
    res3b,
    "score improved",
    nextScanIso,
    res3a,
    laneExplainer,
    undefined,
    freshData,
    majorsInput,
  );
  printScenario("1. Market Move score recovery", moveUp);

  // 2. Market Move regime change
  const res5a = sampleResult(30, "Risk-Off");
  const res5b = sampleResult(45, "Neutral / Chop");
  const regimeChange = formatRegimeAlert(
    res5b,
    "regime changed",
    nextScanIso,
    res5a,
    laneExplainer,
    undefined,
    freshData,
    majorsInput,
  );
  printScenario("2. Market Move regime change", regimeChange);
}

runPreviews();
