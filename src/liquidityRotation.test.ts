import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decideAlert } from "./alerts";
import { deriveLiquidityRotationTelemetry, classifyLiquidityRotationSession } from "./liquidityRotation";
import { logSnapshot } from "./logger";
import { scoreMarketRegime } from "./scorer";
import {
  BotConfig,
  Candle,
  CandleBundle,
  GlobalSnapshot,
  LaneExplainerHistoryPoint,
  MarketDataFreshnessFields,
  RegimeScoreResult,
  SavedState
} from "./types";

let assertions = 0;

function equal<T>(actual: T, expected: T, message: string): void {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function check(condition: unknown, message: string): asserts condition {
  assertions += 1;
  assert.ok(condition, message);
}

const timestamp = "2026-07-22T12:00:00.000Z";
const global: GlobalSnapshot = {
  timestamp,
  totalMarketCapUsd: 2_000_000_000_000,
  totalMarketCapChange24hPct: 1.5,
  btcDominancePct: 58,
  ethDominancePct: 10,
  solDominancePct: 3,
  stablecoinDominancePct: 6,
  rawSource: "coingecko"
};

function freshness(overrides: Partial<MarketDataFreshnessFields> = {}): MarketDataFreshnessFields {
  return {
    marketDataFresh: true,
    marketDataStaleReason: null,
    marketDataProvider: "coingecko",
    marketDataProviderErrors: [],
    livePriceFresh: true,
    livePriceAgeMinutes: 1,
    livePriceTimestamp: timestamp,
    livePriceProvider: "coingecko",
    livePriceProviderErrors: [],
    livePriceUnchangedScanCount: 0,
    historicalDataFresh: true,
    historicalDataAgeMinutes: 15,
    historicalDataTimestamp: timestamp,
    historicalDataProvider: "coingecko",
    historicalDataProviderErrors: [],
    historicalInterval: "1h",
    btcPriceChanged: true,
    ethPriceChanged: true,
    solPriceChanged: true,
    marketDataQuality: "FRESH",
    ...overrides
  };
}

function historyPoint(at: string, overrides: Partial<LaneExplainerHistoryPoint> = {}): LaneExplainerHistoryPoint {
  return {
    timestamp: at,
    timestampMs: Date.parse(at),
    score: 50,
    regime: "Neutral / Chop",
    leader: "BTC-led",
    regimeConfidence: "Caution",
    marketMoveReason: null,
    btcPrice: 100_000,
    ethPrice: 3_000,
    solPrice: 150,
    ethBtcRatio: 0.03,
    solBtcRatio: 0.0015,
    solEthRatio: 0.05,
    btcDominancePct: 57,
    marketDataFresh: true,
    rotationState: "NO_CLEAR_ROTATION",
    ...overrides
  };
}

function derive(overrides: Partial<Parameters<typeof deriveLiquidityRotationTelemetry>[0]> = {}) {
  return deriveLiquidityRotationTelemetry({
    timestamp,
    global,
    freshness: freshness(),
    ethBtcRatio: 0.031,
    solBtcRatio: 0.0016,
    solEthRatio: 0.051,
    history: [historyPoint("2026-07-22T11:45:00.000Z")],
    ...overrides
  });
}

// Contract, unavailable-input, and freshness behavior.
const telemetry = derive();
equal(telemetry.rotationSchemaVersion, "liquidity-rotation-v1", "serializes the V1 schema label");
equal(telemetry.rotationState, "NO_CLEAR_ROTATION", "keeps V1 production state non-authoritative");
equal(telemetry.rotationAuthoritative, false, "labels V1 telemetry non-authoritative");
equal(telemetry.total3Trend, "UNAVAILABLE", "does not fabricate TOTAL3");
equal(telemetry.altBreadthState, "UNAVAILABLE", "does not fabricate breadth from BTC/ETH/SOL");
equal(telemetry.rotationConfidence, "INSUFFICIENT_DATA", "reports explicit insufficient data");
equal(telemetry.rotationDataQuality, "FRESH_BUT_INSUFFICIENT", "keeps fresh but incomplete evidence explicit");
equal(telemetry.btcDominanceTrend, "UP", "derives BTC dominance direction from fresh history");
equal(telemetry.ethBtcTrend, "UP", "derives ETH/BTC direction from fresh history");
equal(telemetry.majorExpansionState, "EXPANDING", "derives supported total-market expansion direction");
const staleTelemetry = derive({ freshness: freshness({ marketDataFresh: false, livePriceFresh: false, marketDataQuality: "STALE" }) });
equal(staleTelemetry.rotationDataQuality, "STALE_SOURCE", "marks stale source data explicitly");
equal(staleTelemetry.rotationPersistenceScans, 0, "does not persist stale source telemetry");

// DST-safe IANA session windows, including the London/New York overlap.
equal(classifyLiquidityRotationSession("2026-03-30T07:30:00.000Z").sessionWindow, "LONDON", "London BST opens at the DST-adjusted UTC time");
equal(classifyLiquidityRotationSession("2026-03-09T20:30:00.000Z").sessionWindow, "NEW_YORK", "New York EDT remains correctly classified after DST");
const overlap = classifyLiquidityRotationSession("2026-07-01T13:00:00.000Z");
equal(overlap.sessionWindow, "LONDON_NEW_YORK_OVERLAP", "classifies the DST-adjusted London/New York overlap");
equal(overlap.sessionOverlap, true, "marks the overlap context explicitly");
equal(classifyLiquidityRotationSession("2026-01-15T01:00:00.000Z").sessionWindow, "ASIA", "classifies Asia context separately");

// Continuity is data-only bookkeeping: a 600-minute gap resets the count.
const contiguous = derive({ history: [
  historyPoint("2026-07-22T11:30:00.000Z"),
  historyPoint("2026-07-22T11:45:00.000Z")
] });
equal(contiguous.rotationPersistenceScans, 3, "counts contiguous fresh snapshot telemetry");
const afterGap = derive({ history: [
  historyPoint("2026-07-22T01:45:00.000Z"),
  historyPoint("2026-07-22T11:45:00.000Z")
] });
equal(afterGap.rotationPersistenceScans, 2, "resets persistence across a 600-minute gap");
const firstAfterGap = derive({ history: [historyPoint("2026-07-22T02:00:00.000Z")] });
equal(firstAfterGap.btcDominanceTrend, "UNAVAILABLE", "does not derive BTC dominance trend across a 600-minute gap");
equal(firstAfterGap.ethBtcTrend, "UNAVAILABLE", "does not derive ETH/BTC trend across a 600-minute gap");
equal(firstAfterGap.solBtcTrend, "UNAVAILABLE", "does not derive SOL/BTC trend across a 600-minute gap");
equal(firstAfterGap.solEthTrend, "UNAVAILABLE", "does not derive SOL/ETH trend across a 600-minute gap");
equal(firstAfterGap.rotationPersistenceScans, 1, "starts a new persistence segment after a 600-minute gap");
const exactlyAtContinuityLimit = derive({ history: [historyPoint("2026-07-22T11:30:00.000Z")] });
equal(exactlyAtContinuityLimit.ethBtcTrend, "UP", "allows a previous point exactly 30 minutes old");
equal(exactlyAtContinuityLimit.rotationPersistenceScans, 2, "keeps persistence contiguous at exactly 30 minutes");
const beyondContinuityLimit = derive({ history: [historyPoint("2026-07-22T11:29:00.000Z")] });
equal(beyondContinuityLimit.ethBtcTrend, "UNAVAILABLE", "rejects a previous point older than 30 minutes");
equal(beyondContinuityLimit.rotationPersistenceScans, 1, "breaks persistence beyond 30 minutes");

// Snapshot serialization flattens the telemetry and changes no score or alert input.
const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "liquidity-rotation-test-"));
try {
  const snapshotPath = path.join(tempDirectory, "snapshots.jsonl");
  const config = { paths: { snapshotJsonl: snapshotPath } } as BotConfig;
  const result = resultFixture();
  logSnapshot(config, result, undefined, undefined, undefined, undefined, telemetry);
  const serialized = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Record<string, unknown>;
  equal(serialized.rotationState, "NO_CLEAR_ROTATION", "serializes the rotation state into snapshots");
  equal(serialized.rotationSchemaVersion, "liquidity-rotation-v1", "serializes the telemetry schema version");
  check(Array.isArray(serialized.rotationReasons), "serializes telemetry reasons as an array");
} finally {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

const scoreConfig = { alertRules: { enabled: true } } as BotConfig;
const scoreState = stateFixture();
const candles = candleBundle();
const scoreBefore = scoreMarketRegime({ timeframe: "1h", candles, global, state: scoreState, config: scoreConfig });
derive();
const scoreAfter = scoreMarketRegime({ timeframe: "1h", candles, global, state: scoreState, config: scoreConfig });
equal(scoreAfter.score, scoreBefore.score, "research telemetry does not alter production score output");
equal(scoreAfter.regime, scoreBefore.regime, "research telemetry does not alter production regime output");
const alertBefore = decideAlert(scoreConfig, scoreState, scoreBefore, "Caution", "Caution");
const alertAfter = decideAlert(scoreConfig, scoreState, scoreAfter, "Caution", "Caution");
equal(alertAfter.shouldSend, alertBefore.shouldSend, "research telemetry does not alter alert decisions");
equal(alertAfter.reason, alertBefore.reason, "research telemetry does not alter alert reasons");

console.log(`Liquidity Rotation telemetry tests passed (${assertions} assertions).`);

function candleBundle(): CandleBundle {
  const series = (symbol: string, base: number): Candle[] => Array.from({ length: 220 }, (_, index) => ({
    symbol,
    interval: "1h",
    openTime: index * 3_600_000,
    closeTime: (index + 1) * 3_600_000,
    open: base + index,
    high: base + index + 2,
    low: base + index - 2,
    close: base + index + 1,
    volume: 1_000 + index,
    quoteVolume: 100_000 + index
  }));
  return {
    btcUsdt: series("BTCUSDT", 100_000),
    ethUsdt: series("ETHUSDT", 3_000),
    solUsdt: series("SOLUSDT", 150),
    ethBtc: series("ETHBTC", 0.03),
    solBtc: series("SOLBTC", 0.0015),
    solEth: series("SOLETH", 0.05)
  };
}

function stateFixture(): SavedState {
  return {
    version: "1.0.0",
    lastRunAt: null,
    lastAlertAt: null,
    lastHeartbeatAt: null,
    lastAlertReason: null,
    lastScore: 50,
    lastRegime: "Neutral / Chop",
    lastLeader: "BTC-led",
    globalHistory: [],
    currentResult: null
  };
}

function resultFixture(): RegimeScoreResult {
  return {
    timestamp,
    timeframe: "1h",
    score: 50,
    regime: "Neutral / Chop",
    leader: "BTC-led",
    memeCondition: "Neutral",
    researchBias: "Research only",
    components: [],
    reason: "fixture",
    global
  };
}
