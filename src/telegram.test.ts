import assert from "node:assert/strict";
import { buildEventContext } from "./eventContext";
import {
  formatFooter,
  formatHeader,
  formatHeartbeatAlert,
  formatRegimeAlert,
  selectMarketMoveHeaderEmoji,
  titleCaseDisplay
} from "./telegram";
import { LaneExplainerResult, RegimeScoreResult } from "./types";

function sampleResult(score: number): RegimeScoreResult {
  return {
    timestamp: "2026-07-03T09:00:00Z",
    timeframe: "1h",
    score,
    regime: "Neutral / Chop",
    leader: "SOL-led",
    memeCondition: "Mixed",
    researchBias: "Neutral",
    reason: "test fixture",
    components: [
      { name: "BTC trend / structure", score: 0, min: -20, max: 20, label: "Flat", reason: "fixture" },
      { name: "ETH/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/ETH relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" }
    ],
    global: {
      timestamp: "2026-07-03T09:00:00Z",
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

function testAlphaPulseHeader(): void {
  const alert = formatHeartbeatAlert(sampleResult(60), "2026-07-03T09:15:00Z", sampleResult(60), laneExplainer);
  const lines = alert.split("\n");
  assert.equal(lines[0], "\u2501".repeat(22));
  assert.equal(lines[1], "\u2022  <b>ALPHA \u2764\uFE0F\u200D\u{1F525} PULSE</b>  \u2022");
  assert.equal(lines[2], "\u2501".repeat(22));
}

function testMarketMoveHeaderEmojis(): void {
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(4), "MOVE")[1], "\u2022  <b>MARKET \u{1F4C8} MOVE</b>  \u2022");
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(-4), "MOVE")[1], "\u2022  <b>MARKET \u{1F4C9} MOVE</b>  \u2022");
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(10), "MOVE")[1], "\u2022  <b>MARKET \u{1F6A8} MOVE</b>  \u2022");
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(0), "MOVE")[1], "\u2022  <b>MARKET \u26A1 MOVE</b>  \u2022");
}

function testContextAndExpiryRowsAreSeparate(): void {
  const context = buildEventContext(new Date("2026-07-03T09:00:00Z"));
  const pulseAlert = formatHeartbeatAlert(sampleResult(60), "2026-07-03T09:15:00Z", sampleResult(60), laneExplainer, context);
  const moveAlert = formatRegimeAlert(sampleResult(64), "Score rose 60 -> 64", "2026-07-03T09:30:00Z", sampleResult(60), laneExplainer, context);

  for (const alert of [pulseAlert, moveAlert]) {
    assert.match(alert, /<b>Context Only:<\/b> Liquidity: US Holiday/);
    assert.match(alert, /<b>Expiry:<\/b> Weekly Options - Context Only/);
    assert.doesNotMatch(alert, /<b>Context Only:<\/b>[^\n]*- Context Only/);
    assert.doesNotMatch(alert, /Liquidity: US Holiday - Context Only \| Expiry:/);
  }
}

function testFooterSeparatorMatchesHeader(): void {
  const alert = formatRegimeAlert(sampleResult(64), "Score rose 60 -> 64", "2026-07-03T09:30:00Z", sampleResult(60), laneExplainer);
  const lines = alert.split("\n");
  assert.equal(lines[0], lines[lines.length - 2]);
  assert.equal(formatFooter()[0], lines[0]);
}

function testDisplayCapitalization(): void {
  assert.equal(titleCaseDisplay("btc and sol repair by 09:15 utc during us holiday"), "BTC And SOL Repair By 09:15 UTC During US Holiday");
  assert.equal(titleCaseDisplay("liquidity: us holiday - context only"), "Liquidity: US Holiday - Context Only");
  assert.equal(titleCaseDisplay("09:15 utc (~15m)"), "09:15 UTC (~15m)");
}

testAlphaPulseHeader();
testMarketMoveHeaderEmojis();
testContextAndExpiryRowsAreSeparate();
testFooterSeparatorMatchesHeader();
testDisplayCapitalization();

console.log("Telegram formatter tests passed.");