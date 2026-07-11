import { buildEventContext } from "./eventContext";
import { formatHeartbeatAlert, formatRegimeAlert } from "./telegram";
import { LaneExplainerResult, RegimeName, RegimeScoreResult } from "./types";

function sampleResult(score: number, regime: RegimeName = "Neutral / Chop"): RegimeScoreResult {
  return {
    timestamp: "2026-07-08T19:00:00Z",
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
      timestamp: "2026-07-08T19:00:00Z",
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

const heartbeatScenarios = [
  ["HEARTBEAT / NORMAL DAY", "2026-07-08T19:00:00Z"],
  ["HEARTBEAT / WEEKEND", "2026-07-11T19:00:00Z"],
  ["HEARTBEAT / CANADA DAY WINDOW", "2026-07-01T19:00:00Z"],
  ["HEARTBEAT / JULY 4TH WINDOW", "2026-07-04T19:00:00Z"],
  ["HEARTBEAT / VALENTINE’S WINDOW", "2026-02-14T19:00:00Z"],
  ["HEARTBEAT / ST PATRICK’S WINDOW", "2026-03-17T19:00:00Z"],
  ["HEARTBEAT / EASTER WEEKEND", "2026-04-05T19:00:00Z"],
  ["HEARTBEAT / APRIL FOOLS WINDOW", "2026-04-01T19:00:00Z"],
  ["HEARTBEAT / CINCO DE MAYO WINDOW", "2026-05-05T19:00:00Z"],
  ["HEARTBEAT / HALLOWEEN WINDOW", "2026-10-31T19:00:00Z"],
  ["HEARTBEAT / BLACK FRIDAY CYBER MONDAY", "2026-11-27T19:00:00Z"]
] as const;

for (const [name, timestamp] of heartbeatScenarios) {
  const result = sampleResult(60);
  result.timestamp = timestamp;
  result.global.timestamp = timestamp;
  printScenario(
    name,
    formatHeartbeatAlert(result, previewNextScanIso(), result, laneExplainer, buildEventContext(new Date(timestamp)))
  );
}

const neutral = sampleResult(52, "Neutral / Chop");
const riskOn = sampleResult(68, "Risk-On");
printScenario(
  "MARKET MOVE / RISK-ON IMPROVEMENT",
  formatRegimeAlert(riskOn, "Score rose 52 -> 68", previewNextScanIso(), neutral, laneExplainer)
);

const stronger = sampleResult(70, "Risk-On");
const riskOff = sampleResult(34, "Risk-Off");
printScenario(
  "MARKET MOVE / RISK-OFF DETERIORATION",
  formatRegimeAlert(riskOff, "Score fell 70 -> 34", previewNextScanIso(), stronger, laneExplainer)
);
