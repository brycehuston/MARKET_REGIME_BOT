import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  DEFAULT_INPUTS,
  analyze,
  buildMarginThresholds,
  collectPreEventEvidence,
  determineReadiness,
  deriveLeader,
  enrichSnapshots,
  loadSnapshotLines,
  parseCliArgs,
  preliminaryLabel,
  renderCsv,
  renderMarkdown,
  resolveInputPath,
  type Lane,
  type NormalizedSnapshot,
} from "./laneRotationForensics";

let assertions = 0;

function check(condition: unknown, message: string): asserts condition {
  assertions += 1;
  assert.ok(condition, message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function rawFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    timestamp: "2026-07-20T00:00:00.000Z",
    score: 50,
    regime: "Balanced",
    leader: "Balanced",
    bestLane: "BTC",
    bestLaneLabel: "BTC leading",
    laneConfidence: "Caution",
    laneScoreBtc: 60,
    laneScoreEth: 50,
    laneScoreSol: 40,
    laneScoreStables: 30,
    laneMargin: 10,
    timeframeRead: "4H: BTC | 12H: BTC | 1D: BTC",
    chopState: "Clean",
    marketDataQuality: "FRESH",
    marketDataFresh: true,
    livePriceFresh: true,
    historicalDataFresh: true,
    btcPrice: 60_000,
    ethPrice: 2_000,
    solPrice: 100,
    ethBtcRatio: 0.033333,
    solBtcRatio: 0.001667,
    solEthRatio: 0.05,
    retBtc4h: 1,
    retEth4h: 0,
    retSol4h: -1,
    retBtc12h: 2,
    retEth12h: 1,
    retSol12h: 0,
    retBtc1d: 3,
    retEth1d: 2,
    retSol1d: 1,
    marketMoveWanted: false,
    marketMoveSent: false,
    marketMoveReason: "No move",
    previousScore: 49,
    currentScore: 50,
    previousMode: "Balanced",
    currentMode: "Balanced",
    previousConfidence: "Caution",
    currentConfidence: "Caution",
    laneReason: "BTC is leading.",
    riskStyle: "Hold winners",
    ifInAction: "Trail",
    ifFlatAction: "Wait",
    invalidIf: "Leader flips",
    suppressionNote: null,
    historicalInterval: "1d",
    ...overrides,
  };
}

function loadRaw(rows: Array<Record<string, unknown>>) {
  return loadSnapshotLines(rows.map((row) => JSON.stringify(row)), "fixture.jsonl");
}

function snapshotAt(
  minute: number,
  scores: { BTC: number; ETH: number; SOL: number; STABLES?: number | null },
  overrides: Record<string, unknown> = {},
): NormalizedSnapshot {
  const timestamp = new Date(Date.UTC(2026, 6, 20, 0, minute)).toISOString();
  const loaded = loadRaw([
    rawFixture({
      timestamp,
      laneScoreBtc: scores.BTC,
      laneScoreEth: scores.ETH,
      laneScoreSol: scores.SOL,
      laneScoreStables: scores.STABLES ?? null,
      ...overrides,
    }),
  ]);
  equal(loaded.validRows.length, 1, "synthetic row must normalize");
  return loaded.validRows[0];
}

function scoresFor(leader: Lane, margin = 10): { BTC: number; ETH: number; SOL: number; STABLES: number } {
  const scores = { BTC: 40, ETH: 40, SOL: 40, STABLES: 40 };
  if (leader === "NO_CLEAR_LANE") {
    scores.BTC = 60;
    scores.ETH = 60;
  } else {
    scores[leader] = 60 + margin;
  }
  return scores;
}

function transitionSequence(leaders: Lane[]): NormalizedSnapshot[] {
  return leaders.map((leader, index) => snapshotAt(index * 15, scoresFor(leader), {
    bestLane: leader,
    bestLaneLabel: `${leader} leading`,
  }));
}

function testFreshnessAndLegacyCompatibility(): void {
  const rows = [
    rawFixture(),
    rawFixture({ timestamp: "2026-07-20T00:15:00Z", marketDataQuality: "STALE", marketDataFresh: false }),
    rawFixture({ timestamp: "2026-07-20T00:30:00Z", livePriceFresh: false }),
    rawFixture({ timestamp: "2026-07-20T00:45:00Z", historicalDataFresh: false }),
    rawFixture({ timestamp: "2026-07-20T01:00:00Z", marketDataQuality: undefined, marketDataFresh: undefined, livePriceFresh: undefined, historicalDataFresh: undefined }),
    rawFixture({ timestamp: "2026-07-20T01:15:00Z", laneScoreEth: null }),
  ];
  const loaded = loadSnapshotLines(["{bad", ...rows.map((row) => JSON.stringify(row))]);
  equal(loaded.validRows.length, 1, "only explicit fully fresh rows are evidence");
  equal(loaded.exclusions.malformed, 1, "malformed rows are counted");
  equal(loaded.exclusions.legacy, 1, "legacy rows are compatible and excluded");
  equal(loaded.exclusions.staleOrBroken, 3, "all explicit freshness failures are excluded");
  equal(loaded.exclusions.missingRequired, 1, "fresh rows missing required scores are excluded");
  equal(loaded.validRows[0].laneScores.STABLES, 30, "finite STABLES score remains available");

  const withoutOptional = loadRaw([rawFixture({ laneScoreStables: null, laneMargin: null, retEth4h: null })]);
  equal(withoutOptional.validRows[0].laneScores.STABLES, null, "missing optional scores stay null, never zero");
  equal(withoutOptional.validRows[0].laneMargin, null, "missing optional numbers stay null");
  const derivedRatios = loadRaw([rawFixture({ ethBtcRatio: null, solBtcRatio: null, solEthRatio: null })]);
  equal(derivedRatios.validRows[0].ethBtcRatio, 2_000 / 60_000, "ETH/BTC is derived from valid live prices when absent");
}

function testSourcePriorityAndCli(): void {
  const cwd = resolve("virtual-root");
  const first = resolve(cwd, DEFAULT_INPUTS[0]);
  const third = resolve(cwd, DEFAULT_INPUTS[2]);
  const selected = resolveInputPath(cwd, undefined, (candidate) => candidate === first || candidate === third);
  equal(selected, first, "default source priority selects post-f75e087 first");
  const explicit = resolveInputPath(cwd, "custom.jsonl", (candidate) => candidate === resolve(cwd, "custom.jsonl"));
  equal(explicit, resolve(cwd, "custom.jsonl"), "explicit input overrides defaults");
  assert.throws(() => resolveInputPath(cwd, "custom.csv", () => true), /must be JSONL/);
  assertions += 1;
  assert.deepEqual(parseCliArgs(["--input", "x.jsonl"]), { input: "x.jsonl" });
  assertions += 1;
  assert.throws(() => parseCliArgs(["--output", "elsewhere"]), /Only --input/);
  assertions += 1;
}

function testLeaderRulesAndTransitions(): void {
  equal(deriveLeader({ BTC: 60, ETH: 60 + 5e-10, SOL: 40, STABLES: null }).leader, "NO_CLEAR_LANE", "ties within epsilon produce no clear lane");
  equal(deriveLeader({ BTC: 60, ETH: 50, SOL: 40, STABLES: 70 }).leader, "STABLES", "STABLES participates when finite");
  equal(deriveLeader({ BTC: 60, ETH: 50, SOL: 40, STABLES: null }).leader, "BTC", "missing STABLES is ignored");

  const transitions: Array<[Lane, Lane]> = [
    ["BTC", "ETH"], ["BTC", "SOL"], ["ETH", "BTC"], ["ETH", "SOL"], ["SOL", "BTC"], ["SOL", "ETH"],
    ["NO_CLEAR_LANE", "BTC"], ["NO_CLEAR_LANE", "ETH"], ["NO_CLEAR_LANE", "SOL"],
    ["BTC", "STABLES"], ["ETH", "STABLES"], ["SOL", "STABLES"],
    ["STABLES", "BTC"], ["STABLES", "ETH"], ["STABLES", "SOL"],
  ];
  for (const [from, to] of transitions) {
    const result = analyze(loadRaw(transitionSequence([from, to]).map((row) => ({
      ...rawFixture(),
      timestamp: row.timestamp,
      laneScoreBtc: row.laneScores.BTC,
      laneScoreEth: row.laneScores.ETH,
      laneScoreSol: row.laneScores.SOL,
      laneScoreStables: row.laneScores.STABLES,
    }))));
    equal(result.leadership.transitionCounts[`${from}->${to}`], 1, `transition ${from}->${to} is counted generically`);
  }
}

function testSpacingDeltasAndContinuity(): void {
  const rows = [
    snapshotAt(0, { BTC: 60, ETH: 50, SOL: 40 }),
    snapshotAt(15, { BTC: 58, ETH: 53, SOL: 40 }),
    snapshotAt(30, { BTC: 55, ETH: 58, SOL: 40 }),
    snapshotAt(120, { BTC: 54, ETH: 59, SOL: 40 }),
  ];
  const { scans, spacing, breakMinutes } = enrichSnapshots(rows);
  equal(spacing.buckets["10-<20"], 2, "15-minute gaps are bucketed");
  equal(spacing.buckets[">=60"], 1, "long gaps are bucketed");
  equal(breakMinutes, 30, "continuity threshold is max of 30m and twice median");
  equal(scans[1].laneScoreDelta.ETH, 3, "per-lane delta is derived");
  equal(scans[2].laneScoreDelta.ETH, 5, "next per-lane delta is derived");
  equal(scans[2].challengerAcceleration, 2, "challenger acceleration is the delta change");
  check(scans[3].continuityBreak, "long gaps break continuity");
  equal(scans[3].priorLeader, null, "continuity break clears the prior leader");
  equal(scans[3].laneScoreDelta.ETH, null, "continuity break suppresses scan delta");
}

function testPairAndWindowSupport(): void {
  const first = snapshotAt(0, { BTC: 60, ETH: 50, SOL: 40 }, {
    ethBtcRatio: 0.03, solBtcRatio: 0.0015, solEthRatio: 0.05,
  });
  const oneWindowOnly = snapshotAt(15, { BTC: 59, ETH: 55, SOL: 40 }, {
    ethBtcRatio: 0.031, solBtcRatio: 0.0015, solEthRatio: 0.049,
    retBtc4h: 1, retEth4h: 2, retSol4h: 0,
    retBtc12h: 3, retEth12h: 2, retSol12h: 1,
    retBtc1d: 4, retEth1d: 3, retSol1d: 2,
  });
  const firstEnriched = enrichSnapshots([first, oneWindowOnly]).scans[1];
  check(firstEnriched.pairImprovement, "ETH pair improvement requires ETH/BTC rising and SOL/ETH falling together");
  equal(firstEnriched.multiWindowSupport, false, "one supported window is not multi-window support");

  const allWindows = snapshotAt(15, { BTC: 59, ETH: 55, SOL: 40 }, {
    ethBtcRatio: 0.031, solBtcRatio: 0.0015, solEthRatio: 0.049,
    retBtc4h: 1, retEth4h: 2, retSol4h: 0,
    retBtc12h: 1, retEth12h: 2, retSol12h: 0,
    retBtc1d: 1, retEth1d: 2, retSol1d: 0,
  });
  equal(enrichSnapshots([first, allWindows]).scans[1].multiWindowSupport, true, "challenger must beat both peers in every available window");
}

function testScenariosAndEvidence(): void {
  const durable = transitionSequence(["BTC", "BTC", "ETH", "ETH", "ETH", "ETH", "ETH", "ETH", "ETH", "ETH"]);
  const durableResult = analyze(loadRaw(durable.map((row) => ({
    ...rawFixture(), timestamp: row.timestamp,
    laneScoreBtc: row.laneScores.BTC, laneScoreEth: row.laneScores.ETH,
    laneScoreSol: row.laneScores.SOL, laneScoreStables: row.laneScores.STABLES,
  }))));
  for (const persistence of [2, 3, 4]) {
    const matching = durableResult.scenarios.filter((result) => result.scenario.persistenceScans === persistence);
    check(matching.length > 0, `${persistence}-scan scenarios exist`);
    check(matching.every((result) => result.confirmedRotationCount === 1), `${persistence}-scan persistence confirms a durable transfer`);
  }
  check(durableResult.marginThresholds.length > 0, "percentile margin candidates are generated");
  equal(buildMarginThresholds(enrichSnapshots(durableResult.normalizedValidRows).scans)[0].label, "P25", "margin scenarios begin at P25");

  const reversed = transitionSequence(["BTC", "BTC", "ETH", "BTC", "BTC"]);
  const reversedResult = analyze(loadRaw(reversed.map((row) => ({
    ...rawFixture(), timestamp: row.timestamp,
    laneScoreBtc: row.laneScores.BTC, laneScoreEth: row.laneScores.ETH,
    laneScoreSol: row.laneScores.SOL, laneScoreStables: row.laneScores.STABLES,
  }))));
  check(reversedResult.scenarios.some((result) => result.failedOrFalsePositiveCount > 0), "one-scan reversal is failed");
  check(reversedResult.scenarios.flatMap((result) => result.attempts).some((attempt) => attempt.failureReason?.includes("one scan")), "one-scan spike gets an explicit reason");

  const censored = transitionSequence(["BTC", "BTC", "SOL"]);
  const censoredResult = analyze(loadRaw(censored.map((row) => ({
    ...rawFixture(), timestamp: row.timestamp,
    laneScoreBtc: row.laneScores.BTC, laneScoreEth: row.laneScores.ETH,
    laneScoreSol: row.laneScores.SOL, laneScoreStables: row.laneScores.STABLES,
  }))));
  check(censoredResult.scenarios.every((result) => result.rightCensoredCount >= 1), "dataset-end attempts are right-censored");
  check(censoredResult.scenarios.flatMap((result) => result.attempts).every((attempt) => attempt.outcome !== "CONFIRMED"), "right-censored attempt is not called a success");

  const evidence = collectPreEventEvidence(durableResult.normalizedValidRows, 5, "ETH");
  equal(evidence.length, 4, "pre-event evidence retains up to four prior scans");
  check(evidence.every((row) => Date.parse(row.timestamp) < durableResult.normalizedValidRows[5].timestampMs), "pre-event features strictly precede confirmation");
  check(evidence.every((row) => row.elapsedMinutes > 0), "pre-event lead uses actual positive elapsed minutes");
}

function testReportsAndCsv(): void {
  const rows = transitionSequence(["BTC", "SOL", "BTC"]);
  const result = analyze(loadRaw(rows.map((row) => ({
    ...rawFixture(), timestamp: row.timestamp,
    laneScoreBtc: row.laneScores.BTC, laneScoreEth: row.laneScores.ETH,
    laneScoreSol: row.laneScores.SOL, laneScoreStables: row.laneScores.STABLES,
    laneReason: 'Reason with comma, and "quote"',
  }))));
  equal(determineReadiness(39), "COLLECTING", "under 40 rows is collecting");
  equal(determineReadiness(46), "EXPLORATORY_READY", "40-99 rows is exploratory");
  equal(determineReadiness(100), "THRESHOLD_READY", "100 rows enables threshold comparison");
  equal(preliminaryLabel(46), "PRELIMINARY — 46 valid fresh snapshots only.", "preliminary label uses exact row count");
  check(!preliminaryLabel(100).startsWith("PRELIMINARY"), "100-row label is no longer preliminary");
  const markdown = renderMarkdown(result);
  check(markdown.includes("Recommended Telegram Rotation Format"), "report includes Telegram recommendation");
  check(markdown.includes("Candidate threshold — requires implementation and forward validation."), "candidate thresholds carry the required label");
  check(markdown.trimEnd().endsWith("Phase 2: **Implement Generic BTC/ETH/SOL Lane Rotation Detector V1**"), "report ends with the exact deferred Phase 2 name");

  const firstAttempt = result.scenarios.flatMap((scenario) => scenario.attempts)[0];
  check(firstAttempt !== undefined, "CSV fixture has an attempt");
  firstAttempt.failureReason = 'Failure, with "quoted" detail';
  const csv = renderCsv(result);
  check(csv.includes('"Failure, with ""quoted"" detail"'), "CSV escapes commas and quotes");
}

function run(): void {
  testFreshnessAndLegacyCompatibility();
  testSourcePriorityAndCli();
  testLeaderRulesAndTransitions();
  testSpacingDeltasAndContinuity();
  testPairAndWindowSupport();
  testScenariosAndEvidence();
  testReportsAndCsv();
  console.log(`Lane rotation forensic tests passed (${assertions} assertions).`);
}

run();
