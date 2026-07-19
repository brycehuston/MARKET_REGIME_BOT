import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deriveLaneExplainer } from "./laneExplainer";
import { logSnapshot } from "./logger";
import { assessMarketDataFreshness, normalizeMarketDataQuality } from "./marketDataFreshness";
import {
  AccuracySnapshotFields,
  BotConfig,
  LaneExplainerHistoryPoint,
  MarketDataFreshnessFields,
  RegimeScoreResult
} from "./types";

function historyPoint(input: {
  timestamp: string;
  livePriceTimestamp: string;
  btcPrice?: number;
  ethPrice?: number;
  solPrice?: number;
  historicalBtcPrice?: number;
  historicalEthPrice?: number;
  historicalSolPrice?: number;
}): LaneExplainerHistoryPoint {
  const btcPrice = input.btcPrice ?? 64000;
  const ethPrice = input.ethPrice ?? 1900;
  const solPrice = input.solPrice ?? 75;
  const historicalBtcPrice = input.historicalBtcPrice ?? 63000;
  const historicalEthPrice = input.historicalEthPrice ?? 1841;
  const historicalSolPrice = input.historicalSolPrice ?? 74;
  return {
    timestamp: input.timestamp,
    timestampMs: Date.parse(input.timestamp),
    score: 50,
    regime: "Neutral / Chop",
    leader: "Mixed",
    regimeConfidence: "Noisy",
    marketMoveReason: null,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: ethPrice / btcPrice,
    solBtcRatio: solPrice / btcPrice,
    solEthRatio: solPrice / ethPrice,
    livePriceTimestamp: input.livePriceTimestamp,
    historicalBtcPrice,
    historicalEthPrice,
    historicalSolPrice,
    historicalEthBtcRatio: historicalEthPrice / historicalBtcPrice,
    historicalSolBtcRatio: historicalSolPrice / historicalBtcPrice,
    historicalSolEthRatio: historicalSolPrice / historicalEthPrice,
    bestLane: "NO_CLEAR_LANE"
  };
}

function assess(overrides: Partial<Parameters<typeof assessMarketDataFreshness>[0]> = {}): MarketDataFreshnessFields {
  return assessMarketDataFreshness({
    timestamp: "2026-07-19T12:30:00.000Z",
    historicalInterval: "1d",
    historicalProvider: "coingecko",
    historicalTimestamp: "2026-07-18T23:59:59.999Z",
    historicalProviderErrors: [],
    liveProvider: "coingecko",
    liveTimestamp: "2026-07-19T12:29:30.000Z",
    liveProviderErrors: [],
    btcPrice: 64000,
    ethPrice: 1919,
    solPrice: 75,
    history: [],
    ...overrides
  });
}

function testUnchangedValidDailyCandleIsNotFrozen(): void {
  const history = [
    historyPoint({ timestamp: "2026-07-19T12:00:00.000Z", livePriceTimestamp: "2026-07-19T11:59:30.000Z" }),
    historyPoint({ timestamp: "2026-07-19T12:15:00.000Z", livePriceTimestamp: "2026-07-19T12:14:30.000Z" })
  ];
  const result = assess({ history });
  assert.equal(result.historicalInterval, "1d");
  assert.equal(result.historicalDataFresh, true);
  assert.equal(result.marketDataQuality, "FRESH");
}

function testUnchangedValidFourHourCandleBeforeNextCloseIsNotFrozen(): void {
  const result = assess({
    historicalInterval: "4h",
    historicalTimestamp: "2026-07-19T11:59:59.999Z",
    history: [
      historyPoint({ timestamp: "2026-07-19T12:00:00.000Z", livePriceTimestamp: "2026-07-19T11:59:30.000Z" }),
      historyPoint({ timestamp: "2026-07-19T12:15:00.000Z", livePriceTimestamp: "2026-07-19T12:14:30.000Z" })
    ]
  });
  assert.equal(result.historicalDataFresh, true);
  assert.equal(result.marketDataQuality, "FRESH");
}

function testOldLiveTimestampIsStale(): void {
  const result = assess({ liveTimestamp: "2026-07-19T12:20:00.000Z" });
  assert.equal(result.livePriceFresh, false);
  assert.equal(result.livePriceAgeMinutes, 10);
  assert.equal(result.marketDataQuality, "STALE");
}

function testRepeatedLiveValuesWithFreshTimestampsRemainValid(): void {
  const result = assess({
    history: [
      historyPoint({ timestamp: "2026-07-19T12:00:00.000Z", livePriceTimestamp: "2026-07-19T11:59:30.000Z", ethPrice: 1919 }),
      historyPoint({ timestamp: "2026-07-19T12:15:00.000Z", livePriceTimestamp: "2026-07-19T12:14:30.000Z", ethPrice: 1919 })
    ]
  });
  assert.equal(result.livePriceUnchangedScanCount, 3);
  assert.equal(result.livePriceFresh, true);
  assert.equal(result.marketDataQuality, "FRESH");
}

function testRepeatedLiveValuesWithOldRepeatedTimestampAreFrozen(): void {
  const oldTimestamp = "2026-07-19T11:00:00.000Z";
  const result = assess({
    liveTimestamp: oldTimestamp,
    history: [
      historyPoint({ timestamp: "2026-07-19T12:00:00.000Z", livePriceTimestamp: oldTimestamp, ethPrice: 1919 }),
      historyPoint({ timestamp: "2026-07-19T12:15:00.000Z", livePriceTimestamp: oldTimestamp, ethPrice: 1919 })
    ]
  });
  assert.equal(result.livePriceFresh, false);
  assert.equal(result.marketDataQuality, "FROZEN");
  assert.match(result.marketDataStaleReason ?? "", /timestamp stopped updating/);
}

function testFallbackErrorsDoNotPoisonCurrentData(): void {
  const result = assess({
    liveProvider: "binance",
    liveProviderErrors: ["coingecko: HTTP 502", "bybit: HTTP 403"],
    historicalProvider: "binance",
    historicalProviderErrors: ["coingecko: HTTP 502"]
  });
  assert.equal(result.marketDataQuality, "FRESH");
  assert.equal(result.marketDataFresh, true);
  assert.equal(result.marketDataProvider, "binance");
}

function testOldSnapshotQualityDefaultsToUnknown(): void {
  assert.equal(normalizeMarketDataQuality(undefined), "UNKNOWN");
  assert.equal(normalizeMarketDataQuality("legacy-value"), "UNKNOWN");
}

function testStaleLivePricesDegradeLane(): void {
  const lane = deriveLaneExplainer({
    timestamp: "2026-07-19T12:30:00.000Z",
    score: 65,
    regime: "Risk-On",
    leader: "SOL-led",
    regimeConfidence: "Confirmed",
    defiStatus: "Strong",
    sessionPhase: "US",
    activityState: "Active",
    marketMoveReason: "Score improved",
    btcPrice: 64000,
    ethPrice: 1919,
    solPrice: 75,
    ethBtcRatio: 1919 / 64000,
    solBtcRatio: 75 / 64000,
    solEthRatio: 75 / 1919,
    historicalBtcPrice: 63000,
    historicalEthPrice: 1841,
    historicalSolPrice: 74,
    marketDataFresh: false,
    marketDataStaleReason: "Live spot quote is stale",
    history: []
  });
  assert.equal(lane.bestLaneLabel, "Data stale");
  assert.equal(lane.laneConfidence, "Unavailable");
  assert.equal(lane.riskStyle, "Defensive / degraded");
  assert.equal(lane.ifFlatAction, "Wait — data stale");
}

function testLaneLongWindowReturnsUseHistoricalCloses(): void {
  const lane = deriveLaneExplainer({
    timestamp: "2026-07-19T12:30:00.000Z",
    score: 65,
    regime: "Risk-On",
    leader: "ETH-led",
    regimeConfidence: "Confirmed",
    defiStatus: "Strong",
    sessionPhase: "US",
    activityState: "Active",
    marketMoveReason: null,
    btcPrice: 64000,
    ethPrice: 1919,
    solPrice: 75,
    ethBtcRatio: 1919 / 64000,
    solBtcRatio: 75 / 64000,
    solEthRatio: 75 / 1919,
    historicalBtcPrice: 63000,
    historicalEthPrice: 1841,
    historicalSolPrice: 74,
    historicalEthBtcRatio: 1841 / 63000,
    historicalSolBtcRatio: 74 / 63000,
    historicalSolEthRatio: 74 / 1841,
    marketDataFresh: true,
    history: [historyPoint({
      timestamp: "2026-07-19T08:30:00.000Z",
      livePriceTimestamp: "2026-07-19T08:29:30.000Z",
      btcPrice: 62000,
      ethPrice: 1750,
      solPrice: 70,
      historicalBtcPrice: 63000,
      historicalEthPrice: 1841,
      historicalSolPrice: 74
    })]
  });
  assert.equal(lane.retBtc4h, 0);
  assert.equal(lane.retEth4h, 0);
  assert.equal(lane.retSol4h, 0);
}

function testLivePricesUpdateIndependentlyFromHistoricalCandlesInSnapshot(): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "market-data-freshness-"));
  const snapshotJsonl = path.join(tempDir, "snapshots.jsonl");
  try {
    const freshness = assess();
    const fields = {
      ...freshness,
      btcPrice: 64000,
      ethPrice: 1919,
      solPrice: 75,
      ethBtcRatio: 1919 / 64000,
      solBtcRatio: 75 / 64000,
      solEthRatio: 75 / 1919,
      historicalBtcPrice: 63925.50933708712,
      historicalEthPrice: 1841.3562888357803,
      historicalSolPrice: 74.99495561093624
    } as AccuracySnapshotFields;
    logSnapshot({ paths: { snapshotJsonl } } as BotConfig, sampleResult(), fields);
    const row = JSON.parse(fs.readFileSync(snapshotJsonl, "utf8")) as Record<string, unknown>;
    assert.equal(row.ethPrice, 1919);
    assert.equal(row.historicalEthPrice, 1841.3562888357803);
    assert.notEqual(row.ethPrice, row.historicalEthPrice);
    assert.equal(row.livePriceFresh, true);
    assert.equal(row.historicalDataFresh, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function sampleResult(): RegimeScoreResult {
  return {
    timestamp: "2026-07-19T12:30:00.000Z",
    timeframe: "1d",
    score: 50,
    regime: "Neutral / Chop",
    leader: "Mixed",
    memeCondition: "Mixed",
    researchBias: "Neutral",
    components: [],
    reason: "fixture",
    global: {
      timestamp: "2026-07-19T12:30:00.000Z",
      totalMarketCapUsd: null,
      totalMarketCapChange24hPct: null,
      btcDominancePct: null,
      ethDominancePct: null,
      solDominancePct: null,
      stablecoinDominancePct: null,
      rawSource: "unavailable"
    }
  };
}

testUnchangedValidDailyCandleIsNotFrozen();
testUnchangedValidFourHourCandleBeforeNextCloseIsNotFrozen();
testOldLiveTimestampIsStale();
testRepeatedLiveValuesWithFreshTimestampsRemainValid();
testRepeatedLiveValuesWithOldRepeatedTimestampAreFrozen();
testFallbackErrorsDoNotPoisonCurrentData();
testOldSnapshotQualityDefaultsToUnknown();
testStaleLivePricesDegradeLane();
testLaneLongWindowReturnsUseHistoricalCloses();
testLivePricesUpdateIndependentlyFromHistoricalCandlesInSnapshot();

console.log("Market data freshness tests passed.");
