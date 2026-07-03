import assert from "node:assert/strict";
import { decideAlert } from "./alerts";
import { buildEventContext } from "./eventContext";
import { deriveBestLane } from "./laneExplainer";
import { scoreMarketRegime } from "./scorer";
import {
  BotConfig,
  Candle,
  CandleBundle,
  DefiConfirmation,
  GlobalSnapshot,
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
  assert.equal(fullMoon.moonPhaseContext?.phase, "Full moon");
  assert.equal(fullMoon.eventRiskLevel, "LOW");
  assert.equal(fullMoon.marketMoveEventMode, "NORMAL");
  assert.equal(fullMoon.confirmationRequirement, "NORMAL");

  const newMoon = buildEventContext(utc("2026-07-14T12:00:00Z"));
  assert.equal(newMoon.moonPhaseContext?.researchOnly, true);
  assert.equal(newMoon.moonPhaseContext?.phase, "New moon");
  assert.equal(newMoon.eventRiskLevel, "LOW");
}

function testBehaviorPreservation(): void {
  const config = fixtureConfig();
  const state = fixtureState();
  const candles = fixtureCandles();
  const global = fixtureGlobal();
  const scoredA = scoreMarketRegime({ timeframe: "1h", candles, global, state, config });
  buildEventContext(utc("2026-07-10T12:00:00Z"), {
    scheduledEvents: [{ name: "CPI", type: "MACRO", impactClass: "TIER_A", scheduledUtc: "2026-07-10T12:30:00Z" }]
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
  assert.deepEqual(deriveBestLane(laneInput), deriveBestLane(laneInput));

  const previous = { ...scoredA, score: scoredA.score - 10, regime: scoredA.regime } as RegimeScoreResult;
  const alertState: SavedState = { ...state, lastScore: previous.score, lastRegime: previous.regime, currentResult: previous };
  const decisionA = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  buildEventContext(utc("2026-07-10T12:00:00Z"));
  const decisionB = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  assert.deepEqual(decisionB, decisionA);
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

testDefaultSafety();
testTierAWindows();
testTierBAndStacking();
testCalendarLiquidity();
testMoonSafety();
testBehaviorPreservation();

console.log("EventContext tests passed.");