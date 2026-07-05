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

function sampleResult(score: number, overrides: Partial<RegimeScoreResult> = {}): RegimeScoreResult {
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
      { name: "SOL/ETH relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "Volume confirmation", score: 0, min: -5, max: 5, label: "Flat", reason: "fixture" }
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
    },
    ...overrides
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
  ifInAction: "Hold winners; tighten if score loses 60",
  ifFlatAction: "Wait for clean SOL/ETH follow-through",
  invalidIf: "SOL lead fades / BTC rejects",
  btcRepairFlag: null,
  timeframeRead: "fixture",
  shortTermState: "fixture",
  chopState: "Clean",
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

function riskOnResult(score: number): RegimeScoreResult {
  return sampleResult(score, { regime: "Risk-On", leader: "SOL-led" });
}

function assertIncreasingOrder(text: string, parts: string[]): void {
  let lastIndex = -1;
  for (const part of parts) {
    const index = text.indexOf(part);
    assert.ok(index > lastIndex, `Expected ${part} after previous section.`);
    lastIndex = index;
  }
}

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

function testMarketMovePremiumCompactLayout(): void {
  const alert = formatRegimeAlert(
    riskOnResult(62),
    "Score crossed above 60",
    "2026-07-05T08:45:00Z",
    sampleResult(59),
    laneExplainer,
    buildEventContext(new Date("2026-07-05T08:30:00Z"))
  );

  assert.match(alert, /<b>ALPHA ❤️‍🔥 PULSE<\/b>/u);
  assert.match(alert, /<b>MARKET 📈 MOVE<\/b>/u);
  assertIncreasingOrder(alert, [
    "<b>ALPHA ❤️‍🔥 PULSE</b>",
    "<b>MARKET 📈 MOVE</b>",
    "🟢 Risk-On · SOL-led",
    "├─ <b>Score:</b> 62/100",
    "├─ <b>Trigger:</b> Score crossed above 60",
    "├─ <b>Read:</b> SOL leads; risk-on is selective",
    "├─ 🎯 <b>If Flat</b>",
    "│  └─ Wait for clean SOL/ETH follow-through",
    "├─ 🛡️ <b>If In</b>",
    "│  └─ Hold winners; tighten if score loses 60",
    "├─ ⚠️ <b>Context</b>",
    "Thin weekend liquidity · context only",
    "└─ <b>Next scan:</b> 08:45 UTC"
  ]);
}

function testHeartbeatPremiumCompactLayout(): void {
  const current = riskOnResult(62);
  const alert = formatHeartbeatAlert(current, "2026-07-05T08:45:00Z", current, laneExplainer, buildEventContext(new Date("2026-07-05T08:30:00Z")));

  assert.match(alert, /<b>ALPHA ❤️‍🔥 PULSE<\/b>/u);
  assert.doesNotMatch(alert, /<b>MARKET .* MOVE<\/b>/u);
  assertIncreasingOrder(alert, [
    "🫀 Status · no fresh Market Move",
    "├─ 🟢 Risk-On · SOL-led",
    "├─ <b>Score:</b> 62/100 · unchanged",
    "├─ <b>Read:</b> SOL still leads; stay selective",
    "├─ 🎯 <b>If Flat</b>",
    "│  └─ Wait for clean SOL/ETH follow-through",
    "├─ 🛡️ <b>If In</b>",
    "│  └─ Hold winners; tighten if score loses 60",
    "├─ ⚠️ <b>Context</b>",
    "Thin weekend liquidity · context only",
    "└─ <b>Next scan:</b> 08:45 UTC"
  ]);
}

function testHeartbeatScoreDelta(): void {
  const alert = formatHeartbeatAlert(riskOnResult(64), "2026-07-05T08:45:00Z", riskOnResult(62), laneExplainer);
  assert.match(alert, /<b>Score:<\/b> 64\/100 · \+2/);
}

function testNoRawDebugBooleansInTelegram(): void {
  const alert = formatHeartbeatAlert(riskOnResult(62), "2026-07-05T08:45:00Z", riskOnResult(62), laneExplainer);
  assert.doesNotMatch(alert, /Market Move wanted|Market Move sent|Heartbeat wanted|Heartbeat sent/i);
}

function testContextRowsUseDisplayGatedSummary(): void {
  const context = buildEventContext(new Date("2026-07-03T09:00:00Z"));
  const pulseAlert = formatHeartbeatAlert(sampleResult(60), "2026-07-03T09:15:00Z", sampleResult(60), laneExplainer, context);
  const moveAlert = formatRegimeAlert(sampleResult(64), "Score rose 60 -> 64", "2026-07-03T09:30:00Z", sampleResult(60), laneExplainer, context);

  for (const alert of [pulseAlert, moveAlert]) {
    assert.match(alert, /<b>Context<\/b>/);
    assert.match(alert, /Event Stack: US Holiday \+ Expiry · context only/);
    assert.doesNotMatch(alert, /hiddenObservedEventsCount|Hidden observed/i);
    assert.doesNotMatch(alert, /Liquidity: US Holiday - Context Only \| Expiry:/);
  }
}

function testFarAwayEventContextHiddenFromAlerts(): void {
  const context = buildEventContext(new Date("2026-07-08T09:00:00Z"), {
    btcHalvingContext: { daysToNextBtcHalving: 602 }
  });
  const alert = formatHeartbeatAlert(sampleResult(60), "2026-07-08T09:15:00Z", sampleResult(60), laneExplainer, context);

  assert.doesNotMatch(alert, /moon/i);
  assert.doesNotMatch(alert, /halving/i);
}

function testDisplayedMoonAndHalvingSafetyLabels(): void {
  const moonAlert = formatHeartbeatAlert(sampleResult(60), "2026-07-29T09:15:00Z", sampleResult(60), laneExplainer, buildEventContext(new Date("2026-07-29T12:00:00Z")));
  assert.match(moonAlert, /full moon/i);
  assert.match(moonAlert, /research-only/);

  const halvingAlert = formatHeartbeatAlert(sampleResult(60), "2026-07-08T09:15:00Z", sampleResult(60), laneExplainer, buildEventContext(new Date("2026-07-08T09:00:00Z"), {
    btcHalvingContext: { daysToNextBtcHalving: 30, blocksToNextBtcHalving: 4320 }
  }));
  assert.match(halvingAlert, /BTC halving window/i);
  assert.match(halvingAlert, /structural context only/);
}

function testHtmlEscapingForDataValues(): void {
  const unsafeLane: LaneExplainerResult = {
    ...laneExplainer,
    ifFlatAction: "Wait <clean> & confirm",
    ifInAction: "Hold > chase & tighten"
  };
  const alert = formatHeartbeatAlert(riskOnResult(62), "2026-07-05T08:45:00Z", riskOnResult(62), unsafeLane);

  assert.match(alert, /Wait &lt;clean&gt; &amp; confirm/);
  assert.match(alert, /Hold &gt; chase &amp; tighten/);
  assert.doesNotMatch(alert, /Wait <clean> & confirm/);
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
testMarketMovePremiumCompactLayout();
testHeartbeatPremiumCompactLayout();
testHeartbeatScoreDelta();
testNoRawDebugBooleansInTelegram();
testContextRowsUseDisplayGatedSummary();
testFarAwayEventContextHiddenFromAlerts();
testDisplayedMoonAndHalvingSafetyLabels();
testHtmlEscapingForDataValues();
testFooterSeparatorMatchesHeader();
testDisplayCapitalization();

console.log("Telegram formatter tests passed.");
