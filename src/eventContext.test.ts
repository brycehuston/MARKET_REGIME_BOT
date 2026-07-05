import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decideAlert } from "./alerts";
import { buildEventContext, formatEventContextSummary } from "./eventContext";
import { deriveBestLane } from "./laneExplainer";
import { logSnapshot } from "./logger";
import { scoreMarketRegime } from "./scorer";
import {
  BotConfig,
  Candle,
  CandleBundle,
  DefiConfirmation,
  EventContext,
  GlobalSnapshot,
  MacroContext,
  MacroLiquidityContext,
  RegimeScoreResult,
  SavedState
} from "./types";

function utc(value: string): Date {
  return new Date(value);
}

function testDefaultSafety(): void {
  const context = buildEventContext(utc("2026-07-07T12:00:00Z"));
  assert.equal(context.eventRiskLevel, "LOW");
  assert.equal(context.eventType, "NONE");
  assert.equal(context.eventImpactClass, "NONE");
  assert.equal(context.calendarRiskState, "CLEAR");
  assert.equal(context.liquidityContext, "NORMAL");
  assert.equal(context.expiryContext, "NONE");
  assert.equal(context.newsRiskState, "NONE");
  assert.equal(context.eventSuppressionReason, null);
  assert.equal(context.confirmationRequirement, "NORMAL");
  assert.equal(context.marketMoveEventMode, "NORMAL");
  assert.equal(context.backtestDataStatus, "KNOWN_AHEAD");
  assert.equal(context.eventContextOperational, false);
  assert.equal(context.moonPhaseContext?.researchOnly, true);
}

function testTierAWindows(): void {
  const events = [{ name: "CPI", type: "MACRO" as const, impactClass: "TIER_A" as const, scheduledUtc: "2026-07-10T12:30:00Z" }];
  const pre = buildEventContext(utc("2026-07-10T11:45:00Z"), { scheduledEvents: events });
  assert.equal(pre.eventRiskLevel, "HIGH");
  assert.equal(pre.calendarRiskState, "PRE_EVENT");
  assert.equal(pre.minutesToEvent, 45);
  assert.equal(pre.marketMoveEventMode, "SUPPRESS_WEAK");
  assert.equal(pre.confirmationRequirement, "TWO_SCAN");
  assert.match(pre.eventSuppressionReason ?? "", /^Advisory only:/);
  assert.equal(pre.eventContextOperational, false);

  const post = buildEventContext(utc("2026-07-10T13:15:00Z"), { scheduledEvents: events });
  assert.equal(post.eventRiskLevel, "HIGH");
  assert.equal(post.calendarRiskState, "POST_EVENT");
  assert.equal(post.minutesSinceEvent, 45);
  assert.equal(post.marketMoveEventMode, "POST_EVENT_CONFIRM");
  assert.equal(post.confirmationRequirement, "POST_EVENT_WAIT");
}

function testTierBAndStacking(): void {
  const tierB = [{ name: "GDP", type: "MACRO" as const, impactClass: "TIER_B" as const, scheduledUtc: "2026-07-10T14:00:00Z" }];
  const context = buildEventContext(utc("2026-07-10T12:30:00Z"), { scheduledEvents: tierB });
  assert.equal(context.eventRiskLevel, "MEDIUM");
  assert.equal(context.calendarRiskState, "PRE_EVENT");
  assert.equal(context.marketMoveEventMode, "CAUTION");
  assert.equal(context.confirmationRequirement, "ONE_CLOSE");

  const stacked = buildEventContext(utc("2026-07-10T12:00:00Z"), {
    scheduledEvents: [
      { name: "CPI", type: "MACRO" as const, impactClass: "TIER_A" as const, scheduledUtc: "2026-07-10T12:30:00Z" },
      { name: "Powell Speech", type: "FED" as const, impactClass: "TIER_B" as const, scheduledUtc: "2026-07-10T13:00:00Z" }
    ]
  });
  assert.equal(stacked.calendarRiskState, "STACKED_EVENTS");
}

function testCalendarLiquidity(): void {
  assert.equal(buildEventContext(utc("2026-07-11T12:00:00Z")).liquidityContext, "THIN_WEEKEND");
  assert.equal(buildEventContext(utc("2026-08-31T12:00:00Z")).liquidityContext, "MONTH_END");
  assert.equal(buildEventContext(utc("2026-06-30T12:00:00Z")).liquidityContext, "QUARTER_END");

  const weekly = buildEventContext(utc("2026-07-10T12:00:00Z"));
  assert.equal(weekly.expiryContext, "WEEKLY_OPTIONS");
  assert.equal(weekly.liquidityContext, "EXPIRY_DAY");

  const quarterly = buildEventContext(utc("2026-09-18T12:00:00Z"));
  assert.equal(quarterly.expiryContext, "QUARTERLY_EXPIRY");
  assert.equal(quarterly.liquidityContext, "EXPIRY_DAY");

  const holiday = buildEventContext(utc("2026-07-03T12:00:00Z"));
  assert.equal(holiday.liquidityContext, "US_HOLIDAY");
  assert.deepEqual(holiday.holidayContext, ["Independence Day"]);
}

function testMoonSafety(): void {
  const fullMoon = buildEventContext(utc("2026-07-29T12:00:00Z"));
  assert.equal(fullMoon.moonPhaseContext?.researchOnly, true);
  assert.equal(fullMoon.moonPhaseContext?.phase, "FULL_MOON_WINDOW");
  assert.equal(fullMoon.eventType, "NONE");
  assert.equal(fullMoon.eventImpactClass, "NONE");
  assert.equal(fullMoon.eventRiskLevel, "LOW");
  assert.equal(fullMoon.marketMoveEventMode, "NORMAL");
  assert.equal(fullMoon.confirmationRequirement, "NORMAL");

  const newMoon = buildEventContext(utc("2026-07-14T12:00:00Z"));
  assert.equal(newMoon.moonPhaseContext?.researchOnly, true);
  assert.equal(newMoon.moonPhaseContext?.phase, "NEW_MOON_WINDOW");
  assert.equal(newMoon.eventType, "NONE");
  assert.equal(newMoon.eventImpactClass, "NONE");
  assert.equal(newMoon.eventRiskLevel, "LOW");
}


function testDisplayRelevancePolicy(): void {
  const farMoon = buildEventContext(utc("2026-07-07T12:00:00Z"));
  assert.equal(farMoon.moonPhaseContext?.phase, "NONE");
  assert.equal(farMoon.displayRelevantEvents.some((event) => event.tag.includes("MOON")), false);
  assert.doesNotMatch(formatEventContextSummary(farMoon) ?? "", /moon/i);
  assert.ok(farMoon.hiddenObservedEventsCount >= 1);

  const fullMoon = buildEventContext(utc("2026-07-29T12:00:00Z"));
  assert.equal(fullMoon.moonPhaseContext?.phase, "FULL_MOON_WINDOW");
  assert.match(formatEventContextSummary(fullMoon) ?? "", /research-only/);
  assert.match(formatEventContextSummary(fullMoon) ?? "", /full moon/i);

  const farHalving = buildEventContext(utc("2026-07-08T12:00:00Z"), {
    btcHalvingContext: { daysToNextBtcHalving: 602, blocksToNextBtcHalving: 86688 }
  });
  assert.equal(farHalving.btcHalvingContext.nextBtcHalvingBlockHeight, 1050000);
  assert.equal(farHalving.btcHalvingContext.daysToNextBtcHalving, 602);
  assert.equal(farHalving.btcHalvingContext.btcHalvingDisplayWindow, null);
  assert.doesNotMatch(formatEventContextSummary(farHalving) ?? "", /halving/i);
  assert.ok(farHalving.hiddenObservedEventsCount >= 1);

  const nearHalving = buildEventContext(utc("2026-07-08T12:00:00Z"), {
    btcHalvingContext: { daysToNextBtcHalving: 30, blocksToNextBtcHalving: 4320 }
  });
  assert.equal(nearHalving.btcHalvingContext.btcHalvingDisplayWindow, "T-30d");
  assert.match(formatEventContextSummary(nearHalving) ?? "", /BTC halving window: 30d estimate - structural context only/);
}

function testDisplayStackingPolicy(): void {
  const stacked = buildEventContext(utc("2026-07-10T12:00:00Z"), {
    scheduledEvents: [
      { name: "FOMC", type: "FED", impactClass: "TIER_A", scheduledUtc: "2026-07-10T12:30:00Z" },
      { name: "Powell Speech", type: "FED", impactClass: "TIER_B", scheduledUtc: "2026-07-10T13:00:00Z" }
    ]
  });

  assert.equal(stacked.eventStackCount, 3);
  assert.deepEqual(stacked.eventStackTags, ["FOMC", "FED", "EXPIRY"]);
  assert.equal(stacked.eventConfluenceLevel, "HIGH");
  assert.equal(stacked.eventDisplayReasons.length, 1);
  assert.match(stacked.eventDisplayReasons[0], /^Event Stack:/);
  assert.match(stacked.eventDisplayReasons[0], /FOMC today/);
  assert.match(stacked.eventDisplayReasons[0], /expiry/);

  const hiddenOnly = buildEventContext(utc("2026-07-08T12:00:00Z"), {
    scheduledEvents: [{ name: "CPI", type: "MACRO", impactClass: "TIER_A", scheduledUtc: "2026-12-10T12:30:00Z" }],
    btcHalvingContext: { daysToNextBtcHalving: 602 }
  });
  assert.deepEqual(hiddenOnly.eventDisplayReasons, []);
  assert.equal(hiddenOnly.displayRelevantEvents.length, 0);
  assert.ok(hiddenOnly.hiddenObservedEventsCount >= 3);
}
function testMissingEventSourceDataDoesNotCrash(): void {
  const context = buildEventContext(utc("2026-07-10T12:00:00Z"), {
    scheduledEvents: [
      { name: "CPI", type: "MACRO", impactClass: "TIER_A", scheduledUtc: "not-a-date" }
    ]
  });

  assert.equal(context.eventRiskLevel, "LOW");
  assert.equal(context.eventType, "NONE");
  assert.equal(context.calendarRiskState, "CLEAR");
  assert.equal(context.marketMoveEventMode, "NORMAL");
}
function testFredMacroContextSafety(): void {
  const context = buildEventContext(utc("2026-07-10T12:00:00Z"), {
    macroContext: fixtureMacroContext(),
    macroLiquidityContext: fixtureMacroLiquidityContext()
  });

  assert.equal(context.eventContextOperational, false);
  assert.equal(context.eventRiskLevel, "LOW");
  assert.equal(context.marketMoveEventMode, "NORMAL");
  assert.equal(context.confirmationRequirement, "NORMAL");
  assert.equal(context.macroContext?.fredEnabled, true);
  assert.equal(context.macroContext?.backtestDataStatus, "REAL_TIME");
  assert.equal(context.macroLiquidityContext?.netLiquidityTrend, "EXPANDING");
  assert.match(formatEventContextSummary(context) ?? "", /data context only; no score impact/);
}
function testBehaviorPreservation(): void {
  const config = fixtureConfig();
  const state = fixtureState();
  const candles = fixtureCandles();
  const global = fixtureGlobal();
  const scoredA = scoreMarketRegime({ timeframe: "1h", candles, global, state, config });
  buildEventContext(utc("2026-07-10T12:00:00Z"), {
    scheduledEvents: [{ name: "CPI", type: "MACRO", impactClass: "TIER_A", scheduledUtc: "2026-07-10T12:30:00Z" }],
    macroContext: fixtureMacroContext(),
    macroLiquidityContext: fixtureMacroLiquidityContext()
  });
  const scoredB = scoreMarketRegime({ timeframe: "1h", candles, global, state, config });
  const { timestamp: timestampA, ...scoredComparableA } = scoredA;
  const { timestamp: timestampB, ...scoredComparableB } = scoredB;
  assert.ok(timestampA);
  assert.ok(timestampB);
  assert.deepEqual(scoredComparableB, scoredComparableA);

  const laneInput = {
    timestamp: "2026-07-10T12:00:00Z",
    score: scoredA.score,
    regime: scoredA.regime,
    leader: scoredA.leader,
    regimeConfidence: "Confirmed" as const,
    defiStatus: "Strong" as const,
    sessionPhase: "London/NY overlap",
    activityState: "steady activity",
    marketMoveReason: "No market move",
    btcPrice: 110,
    ethPrice: 120,
    solPrice: 135,
    ethBtcRatio: 1.09,
    solBtcRatio: 1.23,
    solEthRatio: 1.13,
    history: []
  };
  const laneA = deriveBestLane(laneInput);
  buildEventContext(utc("2026-07-10T12:00:00Z"), { macroContext: fixtureMacroContext() });
  const laneB = deriveBestLane(laneInput);
  assert.deepEqual(laneB, laneA);

  const previous = { ...scoredA, score: scoredA.score - 10, regime: scoredA.regime } as RegimeScoreResult;
  const alertState: SavedState = { ...state, lastScore: previous.score, lastRegime: previous.regime, currentResult: previous };
  const decisionA = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  buildEventContext(utc("2026-07-10T12:00:00Z"), { macroContext: fixtureMacroContext() });
  const decisionB = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  assert.deepEqual(decisionB, decisionA);
}

function testSnapshotAuditRowsIncludeEventContextFields(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "event-context-test-"));
  const snapshotJsonl = path.join(dir, "regime_snapshots.jsonl");
  const baseConfig = fixtureConfig();
  const config: BotConfig = {
    ...baseConfig,
    paths: { ...baseConfig.paths, snapshotJsonl }
  };
  const scored = scoreMarketRegime({
    timeframe: "1h",
    candles: fixtureCandles(),
    global: fixtureGlobal(),
    state: fixtureState(),
    config
  });
  const eventContext = buildEventContext(utc("2026-07-10T11:45:00Z"), {
    scheduledEvents: [{ name: "CPI", type: "MACRO", impactClass: "TIER_A", scheduledUtc: "2026-07-10T12:30:00Z" }]
  });
  const auditFields = {
    marketMoveWanted: false,
    marketMoveSent: false,
    marketMoveReason: "No market move",
    heartbeatWanted: true,
    heartbeatSent: false,
    telegramConfigured: false,
    telegramSendError: null,
    previousScore: 50,
    currentScore: scored.score,
    previousMode: "Neutral / Chop" as const,
    currentMode: scored.regime,
    previousConfidence: "Confirmed" as const,
    currentConfidence: "Confirmed" as const,
    eventRiskLevel: eventContext.eventRiskLevel,
    eventCalendarRiskState: eventContext.calendarRiskState,
    eventLiquidityContext: eventContext.liquidityContext,
    eventExpiryContext: eventContext.expiryContext,
    eventMarketMoveMode: eventContext.marketMoveEventMode,
    eventContextOperational: eventContext.eventContextOperational
  };

  logSnapshot(config, scored, undefined, auditFields, undefined, eventContext);
  const row = JSON.parse(fs.readFileSync(snapshotJsonl, "utf8").trim()) as Record<string, unknown>;

  assert.equal(row.eventContextOperational, false);
  assert.equal(row.eventStackCount, eventContext.eventStackCount);
  assert.deepEqual(row.eventStackTags, eventContext.eventStackTags);
  assert.equal(row.eventConfluenceLevel, eventContext.eventConfluenceLevel);
  assert.deepEqual(row.eventDisplayReasons, eventContext.eventDisplayReasons);
  assert.deepEqual(row.displayRelevantEvents, eventContext.displayRelevantEvents);
  assert.equal(row.hiddenObservedEventsCount, eventContext.hiddenObservedEventsCount);
  assert.equal(row.nextBtcHalvingBlockHeight, 1050000);
  assert.equal(row.eventContextVersion, eventContext.eventContextVersion);
  assert.equal(row.eventRiskLevel, "HIGH");
  assert.equal(row.eventType, "MACRO");
  assert.equal(row.eventImpactClass, "TIER_A");
  assert.equal(row.calendarRiskState, eventContext.calendarRiskState);
  assert.equal(row.calendarRiskState, "PRE_EVENT");
  assert.equal(row.liquidityContext, eventContext.liquidityContext);
  assert.notEqual(row.liquidityContext, null);
  assert.equal(row.confirmationRequirement, eventContext.confirmationRequirement);
  assert.equal(row.confirmationRequirement, "TWO_SCAN");
  assert.equal(row.marketMoveEventMode, eventContext.marketMoveEventMode);
  assert.equal(row.marketMoveEventMode, "SUPPRESS_WEAK");
  assert.equal(row.eventSuppressionReason, eventContext.eventSuppressionReason);
  assert.equal(row.eventCalendarRiskState, "PRE_EVENT");
  assert.equal(row.eventMarketMoveMode, "SUPPRESS_WEAK");
  assert.equal(row.eventConfirmationRequirement, "TWO_SCAN");
  assert.equal(row.marketMoveWanted, false);
  assert.equal(row.heartbeatWanted, true);
  assert.equal(row.moonResearchOnly, true);
  assert.equal(row.moonPhase, eventContext.moonPhaseContext?.phase);
  assert.equal(row.daysFromFullMoon, eventContext.moonPhaseContext?.daysFromFullMoon);
  assert.equal(row.daysFromNewMoon, eventContext.moonPhaseContext?.daysFromNewMoon);
  assert.equal((row.eventContext as EventContext).eventContextOperational, false);
}
function fixtureConfig(): BotConfig {
  return {
    scanIntervalMinutes: 15,
    primaryTimeframe: "1h",
    confirmationTimeframe: "4h",
    timingTimeframe: "1h",
    candleLimit: 60,
    providers: { marketDataPrimary: "binance", binanceBaseUrls: [], bybitBaseUrl: "", coingeckoBaseUrl: "" },
    defiLlama: { confirmationEnabled: false, baseUrl: "", timeoutMs: 1000 },
    derivativesHeat: { enabled: false, provider: "coinalyze", coinalyzeApiKey: "", coinalyzeBaseUrl: "", timeoutMs: 1000, assets: ["BTC", "ETH", "SOL"], interval: "1hour", historyHours: 24 },
    assets: { btcUsdt: "BTCUSDT", ethUsdt: "ETHUSDT", solUsdt: "SOLUSDT", ethBtc: "ETHBTC", solBtc: "SOLBTC" },
    stablecoinDominanceSymbols: [],
    alertRules: { enabled: true, minScoreDelta: 3, cooldownMinutes: 0, criticalCooldownMinutes: 0, sendStartupAlert: false, telegramHeartbeatEnabled: false, telegramHeartbeatIntervalMinutes: 60 },
    paths: { stateFile: "", scoreCsv: "", alertCsv: "", snapshotJsonl: "", derivativesHeatCsv: "", derivativesHeatJsonl: "", errorLog: "" }
  };
}

function fixtureState(): SavedState {
  return {
    version: "1.0.0",
    lastRunAt: null,
    lastAlertAt: null,
    lastHeartbeatAt: null,
    lastAlertReason: null,
    lastScore: 50,
    lastRegime: "Neutral / Chop",
    lastLeader: "Mixed",
    globalHistory: [
      { timestamp: "2026-07-10T09:00:00Z", totalMarketCapUsd: 100, btcDominancePct: 50, stablecoinDominancePct: 8 },
      { timestamp: "2026-07-10T10:00:00Z", totalMarketCapUsd: 101, btcDominancePct: 49.8, stablecoinDominancePct: 7.9 },
      { timestamp: "2026-07-10T11:00:00Z", totalMarketCapUsd: 102, btcDominancePct: 49.6, stablecoinDominancePct: 7.8 }
    ],
    currentResult: null
  };
}

function fixtureGlobal(): GlobalSnapshot {
  return {
    timestamp: "2026-07-10T12:00:00Z",
    totalMarketCapUsd: 104,
    totalMarketCapChange24hPct: 1.2,
    btcDominancePct: 49.2,
    ethDominancePct: 18,
    solDominancePct: 3,
    stablecoinDominancePct: 7.4,
    rawSource: "coingecko"
  };
}

function fixtureCandles(): CandleBundle {
  const btc = makeCandles("BTCUSDT", 100, 1);
  const eth = makeCandles("ETHUSDT", 100, 1.2);
  const sol = makeCandles("SOLUSDT", 100, 1.4);
  return {
    btcUsdt: btc,
    ethUsdt: eth,
    solUsdt: sol,
    ethBtc: makeCandles("ETHBTC", 1, 0.01),
    solBtc: makeCandles("SOLBTC", 1, 0.015),
    solEth: makeCandles("SOLETH", 1, 0.012)
  };
}

function makeCandles(symbol: string, start: number, step: number): Candle[] {
  return Array.from({ length: 60 }, (_, index) => {
    const open = start + index * step;
    const close = open + step * 0.8;
    return {
      symbol,
      interval: "1h",
      openTime: Date.UTC(2026, 6, 8, index),
      closeTime: Date.UTC(2026, 6, 8, index, 59),
      open,
      high: close + 1,
      low: open - 1,
      close,
      volume: 1000 + index * 10,
      quoteVolume: 100000 + index * 100
    };
  });
}


function fixtureMacroContext(): MacroContext {
  return {
    dxyTrend: "UP",
    tenYearYieldTrend: "UP",
    realYieldTrend: "DOWN",
    equityRiskState: "NEUTRAL",
    volRegime: "ELEVATED",
    tenYearYield: 4.12,
    twoYearYield: 3.9,
    tenYearRealYield: 1.83,
    vix: 24,
    highYieldSpread: 3.8,
    dollarProxy: 125.2,
    fredEnabled: true,
    fredSourceTimestamp: "2026-07-02",
    fredIngestTimestamp: "2026-07-03T12:00:00.000Z",
    fredSeriesDates: { DGS10: "2026-07-02" },
    fredError: null,
    backtestDataStatus: "REAL_TIME"
  };
}

function fixtureMacroLiquidityContext(): MacroLiquidityContext {
  return {
    walcl: 7000,
    walclPrior: 6900,
    rrp: 500,
    rrpPrior: 550,
    tga: 790,
    tgaFred: 800,
    tgaFredPrior: 750,
    tgaFiscalData: 790,
    tgaFiscalDataPrior: 760,
    tgaFiscalDataTrend: "EXPANDING",
    tgaFiscalDataRecordDate: "2026-07-02",
    tgaFiscalDataPriorRecordDate: "2026-07-01",
    netLiquidityProxy: 5710,
    netLiquidityTrend: "EXPANDING",
    liquiditySourceTimestamp: "2026-07-02",
    treasuryEnabled: true,
    treasurySourceTimestamp: "2026-07-02",
    treasuryIngestTimestamp: "2026-07-03T12:00:00.000Z",
    treasuryError: null,
    treasuryBacktestDataStatus: "REAL_TIME",
    treasurySeriesDates: { operating_cash_balance: "2026-07-02" },
    tgaPreferredSource: "TREASURY_FISCALDATA",
    liquidityUnits: "USD_MILLIONS",
    netLiquidityUnitWarning: null
  };
}
testDefaultSafety();
testTierAWindows();
testTierBAndStacking();
testCalendarLiquidity();
testMoonSafety();
testDisplayRelevancePolicy();
testDisplayStackingPolicy();
testMissingEventSourceDataDoesNotCrash();
testFredMacroContextSafety();
testBehaviorPreservation();
testSnapshotAuditRowsIncludeEventContextFields();

console.log("EventContext tests passed.");
