import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logSnapshot } from "./logger";
import type { BotConfig, RegimeScoreResult, AccuracySnapshotFields } from "./types";

function runTests() {
  console.log("Running logger.test.ts...");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));
  const snapshotJsonl = path.join(tempDir, "snapshots.jsonl");

  try {
    const config = { paths: { snapshotJsonl } } as BotConfig;
    const result = {
      timestamp: new Date().toISOString(),
      score: 50,
      regime: "Neutral / Chop",
      leader: "Mixed",
      memeCondition: "Mixed",
      researchBias: "Neutral",
      components: [],
      reason: "test",
      global: {
        totalCryptoMarketCap: 1000,
        btcDominance: 50,
        stablecoinDominance: 10,
        volatilityIndex: 50,
        onchainActivity: 50,
        memeDominance: 5,
        altcoinVolume: 100
      }
    } as unknown as RegimeScoreResult;

    const fields: AccuracySnapshotFields = {
      marketDataQuality: "FRESH",
      marketDataFresh: true,
      livePriceFresh: true,
      historicalDataFresh: true,
      actionMode: "NORMAL",
      confidence: "Neutral",
      regimeConfidence: "Neutral",
      defiStatus: "CONFIRMED",
      derivativesHeatStatus: "NEUTRAL",
      derivativesHeatLabel: "Neutral",
      derivativesHeatSummary: "Neutral",
      btcHeatLabel: "Neutral",
      ethHeatLabel: "Neutral",
      solHeatLabel: "Neutral",
      btcFundingZScore: null,
      ethFundingZScore: null,
      solFundingZScore: null,
      btcOiChange24hPct: null,
      ethOiChange24hPct: null,
      solOiChange24hPct: null,
      btcPrice: 60000,
      ethPrice: 2000,
      solPrice: 100,
      ethBtcRatio: 0.033,
      solBtcRatio: 0.0016,
      solEthRatio: 0.05,
      historicalBtcPrice: 60000,
      historicalEthPrice: 2000,
      historicalSolPrice: 100,
      historicalEthBtcRatio: 0.033,
      historicalSolBtcRatio: 0.0016,
      historicalSolEthRatio: 0.05,
      sessionPhase: "LONDON",
      sessionElapsedMinutes: 100,
      activityState: "ACTIVE",
      activityReason: "test",
      tempo: "test",
      tapeState: "test",
      nextScanAt: new Date().toISOString(),
      outlookState: "SELECTIVE",
      nowPosture: "WAIT / NO CLEAN LANE"
    } as any;

    logSnapshot(config, result, fields);

    const row = JSON.parse(fs.readFileSync(snapshotJsonl, "utf8"));
    assert.equal(row.outlookState, "SELECTIVE");
    assert.equal(row.nowPosture, "WAIT / NO CLEAN LANE");
    console.log("PASS: Snapshot field assertion");

  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

runTests();
