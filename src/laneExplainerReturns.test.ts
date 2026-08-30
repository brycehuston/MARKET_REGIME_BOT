/**
 * laneExplainerReturns.test.ts
 *
 * Focused deterministic tests for the Alpha Pulse 7D major-return snapshot
 * telemetry patch.  Six test groups (A-F) as specified by the task brief.
 *
 * Run: npx tsx src/laneExplainerReturns.test.ts
 *
 * No provider contacts, no Telegram, no PM2, no runtime log mutation.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { deriveLaneExplainer, deriveBestLane } from "./laneExplainer";
import { loadLaneExplainerHistory, logSnapshot } from "./logger";
import type { LaneExplainerHistoryPoint, LaneExplainerInput, BotConfig, RegimeScoreResult } from "./types";

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

const BASE_TIMESTAMP = "2026-08-29T20:00:00.000Z";
const BASE_MS = new Date(BASE_TIMESTAMP).getTime();

function msAt(hoursBack: number): number {
  return BASE_MS - hoursBack * 60 * 60 * 1000;
}

function isoAt(hoursBack: number): string {
  return new Date(msAt(hoursBack)).toISOString();
}

function makeHistoryPoint(hoursBack: number, btc: number, eth: number, sol: number): LaneExplainerHistoryPoint {
  return {
    timestamp: isoAt(hoursBack),
    timestampMs: msAt(hoursBack),
    score: 55,
    regime: "Risk-On",
    leader: "BTC-led",
    regimeConfidence: "Confirmed",
    marketMoveReason: null,
    btcPrice: btc,
    ethPrice: eth,
    solPrice: sol,
    ethBtcRatio: eth / btc,
    solBtcRatio: sol / btc,
    solEthRatio: sol / eth,
    historicalBtcPrice: btc,
    historicalEthPrice: eth,
    historicalSolPrice: sol,
    historicalEthBtcRatio: eth / btc,
    historicalSolBtcRatio: sol / btc,
    historicalSolEthRatio: sol / eth,
    bestLane: "BTC",
    laneMargin: null
  };
}

function makeFullInput(overrides: Partial<LaneExplainerInput> = {}): LaneExplainerInput {
  const history: LaneExplainerHistoryPoint[] = [
    makeHistoryPoint(168.5, 55_000, 2_500, 100),
    makeHistoryPoint(24.5, 58_000, 2_600, 105),
    makeHistoryPoint(12.5, 60_000, 2_700, 108),
    makeHistoryPoint(4.5, 61_000, 2_750, 110),
  ];
  return {
    timestamp: BASE_TIMESTAMP,
    score: 62,
    regime: "Risk-On",
    leader: "BTC-led",
    regimeConfidence: "Confirmed",
    defiStatus: "Strong",
    sessionPhase: "NEW_YORK",
    activityState: "Active",
    marketMoveReason: null,
    btcPrice: 62_000,
    ethPrice: 2_800,
    solPrice: 112,
    ethBtcRatio: 2_800 / 62_000,
    solBtcRatio: 112 / 62_000,
    solEthRatio: 112 / 2_800,
    historicalBtcPrice: 62_000,
    historicalEthPrice: 2_800,
    historicalSolPrice: 112,
    historicalEthBtcRatio: 2_800 / 62_000,
    historicalSolBtcRatio: 112 / 62_000,
    historicalSolEthRatio: 112 / 2_800,
    history,
    ...overrides,
  };
}

function expectedPct(current: number, previous: number): number {
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// TEST A — VALID 7D RETURN
// ---------------------------------------------------------------------------

{
  const input = makeFullInput();
  const result = deriveLaneExplainer(input);
  const expBtc = expectedPct(62_000, 55_000);
  const expEth = expectedPct(2_800, 2_500);
  const expSol = expectedPct(112, 100);

  assert.strictEqual(result.retBtc7d, expBtc, `TEST A: retBtc7d expected ${expBtc}, got ${result.retBtc7d}`);
  assert.strictEqual(result.retEth7d, expEth, `TEST A: retEth7d expected ${expEth}, got ${result.retEth7d}`);
  assert.strictEqual(result.retSol7d, expSol, `TEST A: retSol7d expected ${expSol}, got ${result.retSol7d}`);
  assert.notEqual(result.retBtc7d, null, "TEST A: retBtc7d must not be null when 168H history exists");
  assert.notEqual(result.retEth7d, null, "TEST A: retEth7d must not be null when 168H history exists");
  assert.notEqual(result.retSol7d, null, "TEST A: retSol7d must not be null when 168H history exists");
  console.log(`TEST A PASS: retBtc7d=${result.retBtc7d} retEth7d=${result.retEth7d} retSol7d=${result.retSol7d}`);
}

// ---------------------------------------------------------------------------
// TEST B — MISSING 7D HISTORY → null
// ---------------------------------------------------------------------------

{
  const input = makeFullInput({
    history: [
      makeHistoryPoint(24.5, 58_000, 2_600, 105),
      makeHistoryPoint(12.5, 60_000, 2_700, 108),
      makeHistoryPoint(4.5, 61_000, 2_750, 110),
    ],
  });
  const result = deriveLaneExplainer(input);
  assert.strictEqual(result.retBtc7d, null, `TEST B: retBtc7d must be null, got ${result.retBtc7d}`);
  assert.strictEqual(result.retEth7d, null, `TEST B: retEth7d must be null, got ${result.retEth7d}`);
  assert.strictEqual(result.retSol7d, null, `TEST B: retSol7d must be null, got ${result.retSol7d}`);
  assert.notEqual(result.retBtc1d, null, "TEST B: retBtc1d must NOT be null when 24H history exists");
  console.log("TEST B PASS: retBtc7d/retEth7d/retSol7d are null when 168H history unavailable");
}

// ---------------------------------------------------------------------------
// TEST C — 1D REGRESSION
// ---------------------------------------------------------------------------

{
  const input = makeFullInput();
  const result = deriveLaneExplainer(input);
  const expBtc1d = expectedPct(62_000, 58_000);
  const expEth1d = expectedPct(2_800, 2_600);
  const expSol1d = expectedPct(112, 105);
  assert.strictEqual(result.retBtc1d, expBtc1d, `TEST C: retBtc1d expected ${expBtc1d}, got ${result.retBtc1d}`);
  assert.strictEqual(result.retEth1d, expEth1d, `TEST C: retEth1d expected ${expEth1d}, got ${result.retEth1d}`);
  assert.strictEqual(result.retSol1d, expSol1d, `TEST C: retSol1d expected ${expSol1d}, got ${result.retSol1d}`);
  console.log(`TEST C PASS: retBtc1d=${result.retBtc1d} retEth1d=${result.retEth1d} retSol1d=${result.retSol1d}`);
}

// ---------------------------------------------------------------------------
// TEST D — LANE ISOLATION
// ---------------------------------------------------------------------------

{
  const inputNo7d = makeFullInput({
    history: [
      makeHistoryPoint(24.5, 58_000, 2_600, 105),
      makeHistoryPoint(12.5, 60_000, 2_700, 108),
      makeHistoryPoint(4.5, 61_000, 2_750, 110),
    ],
  });
  const inputWith7d = makeFullInput();

  const rankingNo7d = deriveBestLane(inputNo7d);
  const rankingWith7d = deriveBestLane(inputWith7d);

  assert.strictEqual(rankingNo7d.bestLane, rankingWith7d.bestLane, "TEST D: bestLane must be identical");
  assert.strictEqual(rankingNo7d.laneScoreBtc, rankingWith7d.laneScoreBtc, "TEST D: laneScoreBtc must be identical");
  assert.strictEqual(rankingNo7d.laneScoreEth, rankingWith7d.laneScoreEth, "TEST D: laneScoreEth must be identical");
  assert.strictEqual(rankingNo7d.laneScoreSol, rankingWith7d.laneScoreSol, "TEST D: laneScoreSol must be identical");
  assert.strictEqual(rankingNo7d.laneScoreStables, rankingWith7d.laneScoreStables, "TEST D: laneScoreStables must be identical");
  assert.strictEqual(rankingNo7d.laneConfidence, rankingWith7d.laneConfidence, "TEST D: laneConfidence must be identical");
  assert.strictEqual(rankingNo7d.laneMargin, rankingWith7d.laneMargin, "TEST D: laneMargin must be identical");
  console.log(`TEST D PASS: bestLane=${rankingNo7d.bestLane} unchanged with/without 7D history`);
}

// ---------------------------------------------------------------------------
// TEST E — REAL HISTORY RETENTION (time-window, not row-count)
// ---------------------------------------------------------------------------

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap7d-test-"));
  const snapshotPath = path.join(tmpDir, "regime_snapshots.jsonl");

  // Dense cadence: 5-minute spacing over 171 hours = 2,052 rows.
  // This directly exercises the original failure mode:
  //   old .slice(-500) at 5-min cadence → only ~42H covered (168H denominator lost)
  //   time-window rule               → all rows within 169H kept (168H denominator survives)
  const intervalMinutes = 5;
  const spanHours = 171;           // longer than the 169H window
  const totalRows = Math.ceil((spanHours * 60) / intervalMinutes) + 1; // ~2,053
  const lines: string[] = [];

  for (let i = 0; i < totalRows; i++) {
    const hoursBack = (totalRows - 1 - i) * (intervalMinutes / 60);
    const ts = new Date(BASE_MS - hoursBack * 60 * 60 * 1000).toISOString();
    const row = {
      timestamp: ts,
      score: 55,
      regime: "Risk-On",
      leader: "BTC-led",
      regimeConfidence: "Confirmed",
      marketMoveReason: null,
      btcPrice: 60_000 + i,
      ethPrice: 2_700 + i,
      solPrice: 100 + i * 0.1,
      ethBtcRatio: (2_700 + i) / (60_000 + i),
      solBtcRatio: (100 + i * 0.1) / (60_000 + i),
      solEthRatio: (100 + i * 0.1) / (2_700 + i),
      historicalBtcPrice: 60_000 + i,
      historicalEthPrice: 2_700 + i,
      historicalSolPrice: 100 + i * 0.1,
    };
    lines.push(JSON.stringify(row));
  }

  fs.writeFileSync(snapshotPath, lines.join("\n") + "\n");

  const config = { paths: { snapshotJsonl: snapshotPath } } as unknown as BotConfig;
  const loaded = loadLaneExplainerHistory(config);

  // 1. Must retain far more than 500 rows (old slice limit would have cut here).
  //    At 5-min cadence, 169H = ~2,028 rows; the old 500-row cap would only cover ~42H.
  assert.ok(loaded.length > 500, `TEST E: must retain more than 500 rows; got ${loaded.length} (old cap failure mode)`);

  // 2. The retained span must not exceed 169H + a small tolerance (max 1 interval).
  const newestMs = loaded[loaded.length - 1].timestampMs;
  const oldestMs = loaded[0].timestampMs;
  const retentionHours = (newestMs - oldestMs) / (60 * 60 * 1000);
  const toleranceHours = intervalMinutes / 60 + 0.01;
  assert.ok(
    retentionHours <= 169 + toleranceHours,
    `TEST E: retained window must be <=169H + tolerance, got ${retentionHours.toFixed(2)}H`
  );

  // 3. A valid 168H denominator point must exist in the retained history.
  const target168H = newestMs - 168 * 60 * 60 * 1000;
  const has168Point = loaded.some((p) => p.timestampMs <= target168H);
  assert.ok(has168Point, "TEST E: must have at least one point at or before the 168H mark");

  // 4. Explicitly verify the old 500-row slice would have FAILED (its coverage < 168H).
  const oldSlice500Coverage = (500 - 1) * intervalMinutes / 60;
  assert.ok(
    oldSlice500Coverage < 168,
    `TEST E: old 500-row cap at ${intervalMinutes}-min cadence covered only ${oldSlice500Coverage.toFixed(1)}H — confirms the failure mode was real`
  );

  fs.rmSync(tmpDir, { recursive: true });
  console.log(
    `TEST E PASS: ${totalRows} rows written; ${loaded.length} retained; ` +
    `window ${retentionHours.toFixed(1)}H; 168H point available; ` +
    `old-500-cap would have covered only ${oldSlice500Coverage.toFixed(1)}H`
  );
}

// ---------------------------------------------------------------------------
// TEST F — REAL SNAPSHOT OUTPUT CONTRACT
// ---------------------------------------------------------------------------

{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ap7d-output-"));
  const snapshotPath = path.join(tmpDir, "regime_snapshots.jsonl");
  const config = { paths: { snapshotJsonl: snapshotPath } } as unknown as BotConfig;

  const fakeResult: RegimeScoreResult = {
    timestamp: BASE_TIMESTAMP,
    timeframe: "1d",
    score: 62,
    regime: "Risk-On",
    leader: "BTC-led",
    memeCondition: "None",
    researchBias: "Neutral",
    components: [],
    reason: "test",
    global: {
      timestamp: BASE_TIMESTAMP,
      totalMarketCapUsd: 2_000_000_000_000,
      totalMarketCapChange24hPct: 1.5,
      btcDominancePct: 55,
      ethDominancePct: 18,
      solDominancePct: 3,
      stablecoinDominancePct: 8,
      rawSource: "coingecko",
    },
  };

  const inputWith7d = makeFullInput();
  const laneFieldsWith7d = deriveLaneExplainer(inputWith7d);
  logSnapshot(config, fakeResult, undefined, undefined, laneFieldsWith7d);

  const inputNo7d = makeFullInput({
    history: [
      makeHistoryPoint(24.5, 58_000, 2_600, 105),
      makeHistoryPoint(12.5, 60_000, 2_700, 108),
      makeHistoryPoint(4.5, 61_000, 2_750, 110),
    ],
  });
  const laneFieldsNo7d = deriveLaneExplainer(inputNo7d);
  logSnapshot(config, fakeResult, undefined, undefined, laneFieldsNo7d);

  const fileLines = fs.readFileSync(snapshotPath, "utf8").trim().split("\n");
  assert.strictEqual(fileLines.length, 2, "TEST F: expected 2 snapshot lines");

  const row1 = JSON.parse(fileLines[0]);
  const row2 = JSON.parse(fileLines[1]);

  assert.ok("retBtc7d" in row1, "TEST F row1: retBtc7d key must exist");
  assert.ok("retEth7d" in row1, "TEST F row1: retEth7d key must exist");
  assert.ok("retSol7d" in row1, "TEST F row1: retSol7d key must exist");
  assert.ok(typeof row1.retBtc7d === "number", `TEST F row1: retBtc7d must be number, got ${row1.retBtc7d}`);
  assert.ok(typeof row1.retEth7d === "number", `TEST F row1: retEth7d must be number, got ${row1.retEth7d}`);
  assert.ok(typeof row1.retSol7d === "number", `TEST F row1: retSol7d must be number, got ${row1.retSol7d}`);
  assert.ok("retBtc1d" in row1, "TEST F row1: retBtc1d must exist");
  assert.ok("retEth1d" in row1, "TEST F row1: retEth1d must exist");
  assert.ok("retSol1d" in row1, "TEST F row1: retSol1d must exist");

  assert.ok("retBtc7d" in row2, "TEST F row2: retBtc7d key must exist");
  assert.strictEqual(row2.retBtc7d, null, `TEST F row2: retBtc7d must be null, got ${row2.retBtc7d}`);
  assert.strictEqual(row2.retEth7d, null, `TEST F row2: retEth7d must be null, got ${row2.retEth7d}`);
  assert.strictEqual(row2.retSol7d, null, `TEST F row2: retSol7d must be null, got ${row2.retSol7d}`);

  const excerpt = {
    retBtc1h: row1.retBtc1h ?? null,
    retEth1h: row1.retEth1h ?? null,
    retSol1h: row1.retSol1h ?? null,
    retBtc1d: row1.retBtc1d,
    retEth1d: row1.retEth1d,
    retSol1d: row1.retSol1d,
    retBtc7d: row1.retBtc7d,
    retEth7d: row1.retEth7d,
    retSol7d: row1.retSol7d,
  };

  console.log("TEST F PASS: snapshot output contract verified.");
  console.log("SNAPSHOT EXCERPT:", JSON.stringify(excerpt, null, 2));

  fs.rmSync(tmpDir, { recursive: true });
}

console.log("\nAll 6 tests passed (A-F).");
