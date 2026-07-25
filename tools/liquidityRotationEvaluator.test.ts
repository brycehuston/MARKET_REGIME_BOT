import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  analyze,
  deriveCandidateRules,
  loadSnapshotLines,
  renderCandidateMetricsCsv,
  renderSummary,
  renderTransitionsCsv,
  segmentSnapshots,
  temporalSplit,
  writeReports,
  type NormalizedSnapshot
} from "./liquidityRotationEvaluator";

let assertions = 0;

function equal<T>(actual: T, expected: T, message: string): void {
  assertions += 1;
  assert.equal(actual, expected, message);
}

function check(condition: unknown, message: string): asserts condition {
  assertions += 1;
  assert.ok(condition, message);
}

function deepEqual(actual: unknown, expected: unknown, message: string): void {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function rawAt(minute: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const btcPrice = 60_000 + minute * 20;
  const ethPrice = 2_000 + minute * 2;
  const solPrice = 100 + minute * 0.2;
  return {
    timestamp: new Date(Date.UTC(2026, 6, 20, 0, minute)).toISOString(),
    score: 50,
    marketDataQuality: "FRESH",
    marketDataFresh: true,
    livePriceFresh: true,
    historicalDataFresh: true,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: ethPrice / btcPrice,
    solBtcRatio: solPrice / btcPrice,
    solEthRatio: solPrice / ethPrice,
    laneScoreBtc: 60,
    laneScoreEth: 50,
    laneScoreSol: 40,
    global: { btcDominancePct: 57 },
    ...overrides
  };
}

function loadRaw(rows: Array<Record<string, unknown>>, prefix: string[] = []) {
  return loadSnapshotLines([...prefix, ...rows.map((row) => JSON.stringify(row))], "fixture.jsonl");
}

function baseTwoSegmentRows(holdoutOverrides: Record<string, unknown> = {}): Array<Record<string, unknown>> {
  const development = Array.from({ length: 12 }, (_, index) => {
    const minute = index * 15;
    const cycle = index % 4;
    return rawAt(minute, {
      score: cycle === 0 ? 35 : cycle === 2 ? 75 : 55,
      btcPrice: 60_000 + (cycle === 0 ? -index * 30 : index * 80),
      laneScoreBtc: cycle < 2 ? 65 : 45,
      laneScoreEth: cycle >= 2 ? 70 : 50,
      laneScoreSol: 40
    });
  });
  const holdout = Array.from({ length: 8 }, (_, index) => rawAt(600 + index * 15, {
    score: index % 2 ? 70 : 40,
    laneScoreBtc: index < 2 ? 65 : 45,
    laneScoreEth: index >= 2 ? 70 : 50,
    laneScoreSol: 40,
    ...holdoutOverrides
  }));
  return [...development, ...holdout];
}

function testEligibilityAndDeduplication(): void {
  const valid = rawAt(0);
  const stale = rawAt(15, { marketDataQuality: "STALE", marketDataFresh: false });
  const legacy = rawAt(30, {
    marketDataQuality: undefined,
    marketDataFresh: undefined,
    livePriceFresh: undefined,
    historicalDataFresh: undefined
  });
  const missing = rawAt(45, { laneScoreSol: null });
  const duplicateFirst = rawAt(60, { score: 40 });
  const duplicateLast = rawAt(60, { score: 70 });
  const loaded = loadRaw([valid, stale, legacy, missing, duplicateFirst, duplicateLast], ["{bad"]);
  equal(loaded.rowsRead, 7, "counts every non-empty source row");
  equal(loaded.exclusions.malformed, 1, "excludes malformed JSON");
  equal(loaded.exclusions.staleOrBroken, 1, "excludes explicit freshness failure");
  equal(loaded.exclusions.legacy, 1, "excludes rows without explicit freshness");
  equal(loaded.exclusions.missingRequired, 1, "excludes fresh rows missing required fields");
  equal(loaded.eligibleBeforeDedup, 3, "counts eligible rows before timestamp deduplication");
  equal(loaded.duplicateTimestamps, 1, "counts duplicate timestamps");
  equal(loaded.eligibleRows.length, 2, "deduplicates eligible timestamps");
  equal(loaded.eligibleRows[1].score, 70, "deterministically keeps the last eligible duplicate");
}

function testContinuityAndSplit(): void {
  const rows = loadRaw([rawAt(0), rawAt(30), rawAt(61)]).eligibleRows;
  const segments = segmentSnapshots(rows);
  equal(segments.length, 2, "greater than 30 minutes starts a new segment");
  equal(segments[0].rows.length, 2, "exactly 30 minutes remains contiguous");
  equal(segments[1].rows.length, 1, "31-minute gap starts the second segment");

  const realShape = loadRaw([
    ...Array.from({ length: 5 }, (_, index) => rawAt(index * 15)),
    ...Array.from({ length: 3 }, (_, index) => rawAt(600 + index * 15))
  ]);
  const split = temporalSplit(segmentSnapshots(realShape.eligibleRows));
  equal(split.development[0].rows.length, 5, "earlier complete segment is development");
  equal(split.holdout[0].rows.length, 3, "final complete segment is holdout");
  equal(split.splitTimestamp, split.holdout[0].start, "split is temporal at holdout start");
}

function testNoOutcomesAcrossGapsAndRightCensoring(): void {
  const rows = [
    ...Array.from({ length: 5 }, (_, index) => rawAt(index * 15)),
    ...Array.from({ length: 5 }, (_, index) => rawAt(600 + index * 15))
  ];
  const result = analyze(loadRaw(rows));
  const developmentEnd = result.evaluatedRows.find((row) => row.timestamp === new Date(Date.UTC(2026, 6, 20, 1, 0)).toISOString());
  check(developmentEnd, "finds the last development row");
  equal(developmentEnd.rightCensored, true, "does not use holdout rows as forward outcomes across the gap");
  equal(developmentEnd.forwardReturnPct, null, "cross-gap forward return stays unavailable");
  check(result.metrics.some((metric) => metric.rightCensored > 0), "reports right-censored rows");
}

function testHoldoutExcludedFromTuning(): void {
  const first = analyze(loadRaw(baseTwoSegmentRows()));
  const mutatedHoldout = analyze(loadRaw(baseTwoSegmentRows({
    score: 99,
    laneScoreBtc: 1,
    laneScoreEth: 2,
    laneScoreSol: 100,
    btcPrice: 1_000_000
  })));
  deepEqual(first.candidateRules, mutatedHoldout.candidateRules, "holdout changes cannot alter development-derived rules");
  equal(first.split.holdoutUsedForTuning, false, "records untouched holdout explicitly");
  equal(first.candidateRules.tuningRows, first.split.development.rows, "tuning rows equal development rows only");
}

function testTransitionsPersistenceAndMetrics(): void {
  const result = analyze(loadRaw(baseTwoSegmentRows()));
  equal(result.metrics.length, 10, "emits five states for each split in deterministic order");
  deepEqual(result.metrics.slice(0, 5).map((metric) => metric.state), [
    "MAJOR_BREAKOUT",
    "ROTATION_SETUP",
    "ALT_ROTATION_CONFIRMED",
    "NO_CLEAR_ROTATION",
    "CASCADE_RISK"
  ], "uses the exact required state ordering");
  check(result.transitions.length > 0, "counts state transitions");
  check(result.transitions.every((transition) => transition.from !== transition.to), "does not count self-transitions");
  check(result.metrics.some((metric) => metric.maximumPersistenceScans >= 2), "calculates state persistence");
  check(result.metrics.every((metric) => typeof metric.falsePositives === "number"), "reports false positives in candidate metrics");
  check(result.metrics.every((metric) => "averageMaePct" in metric && "averageMfePct" in metric), "reports MAE and MFE");
  check(result.sessions.length > 0, "reports session-conditioned behavior");
}

function testCandidateRulesAndVerdictSafety(): void {
  const load = loadRaw(baseTwoSegmentRows());
  const segments = segmentSnapshots(load.eligibleRows);
  const split = temporalSplit(segments);
  const rules = deriveCandidateRules(split.development);
  equal(rules.tuningStart, split.development[0].start, "candidate tuning begins at development start");
  equal(rules.tuningEnd, split.development.at(-1)!.end, "candidate tuning ends before holdout");
  check(rules.altPersistenceScans >= 2 && rules.altPersistenceScans <= 4, "development derives bounded provisional persistence");

  const result = analyze(load);
  equal(result.candidateRuleSetCount, 1, "emits one provisional candidate rule set");
  check(["PROMISING_FOR_FORWARD_SHADOW", "INSUFFICIENT_EVIDENCE", "REJECT_UNSTABLE"].includes(result.verdict), "uses only an approved research verdict");
  equal(result.productionApproved, false, "never approves production");
  equal(result.nonAuthoritative, true, "keeps results non-authoritative");
  equal(result.total3State, "UNAVAILABLE", "keeps missing TOTAL3 explicit");
  equal(result.altBreadthState, "UNAVAILABLE", "keeps missing broad-alt breadth explicit");
  check(result.limitations.some((item) => item.includes("TOTAL3")), "reports the TOTAL3 limitation");
  check(result.limitations.some((item) => item.includes("breadth")), "reports the breadth limitation");
}

function testDeterministicOutputsAndSourceIsolation(): void {
  const rawRows = baseTwoSegmentRows();
  const lines = rawRows.map((row) => JSON.stringify(row));
  const originalLines = [...lines];
  const first = analyze(loadSnapshotLines(lines, "approved.jsonl"));
  const second = analyze(loadSnapshotLines(lines, "approved.jsonl"));
  equal(JSON.stringify(first), JSON.stringify(second), "evaluation output ordering is deterministic");
  equal(renderSummary(first), renderSummary(second), "summary ordering is deterministic");
  equal(renderCandidateMetricsCsv(first), renderCandidateMetricsCsv(second), "candidate CSV ordering is deterministic");
  equal(renderTransitionsCsv(first), renderTransitionsCsv(second), "transition CSV ordering is deterministic");
  deepEqual(lines, originalLines, "source JSONL lines are never modified");
  check(!renderSummary(first).includes("APPROVED_FOR_PRODUCTION"), "summary never emits a production approval verdict");
}

function testStablePersistentProvenance(): void {
  const transientDirectory = ["Creator", "Temp"].join("");
  const transientFilename = ["ap-lr1-approved-2521", "94ebe1c.jsonl"].join("-");
  const transientPath = ["C:\\Users\\Public\\Documents\\Wondershare", transientDirectory, transientFilename].join("\\");
  const sourceDataset = "/home/ubuntu/MARKET-REGIME-BOT/logs/regime_snapshots.jsonl";
  const evaluatedSlice = "rows 1-2521 through 2026-07-23T00:45:01.298Z";
  const load = loadSnapshotLines(baseTwoSegmentRows().map((row) => JSON.stringify(row)), transientPath);
  const baseline = analyze(load);
  const result = analyze(load, { sourceDataset, evaluatedSlice });
  const outputRoot = mkdtempSync(join(tmpdir(), "liquidity-rotation-provenance-"));

  try {
    writeReports(result, outputRoot);
    const summary = readFileSync(join(outputRoot, "reports", "liquidity_rotation_v1", "summary.md"), "utf8");
    const evaluation = readFileSync(join(outputRoot, "reports", "liquidity_rotation_v1", "evaluation.json"), "utf8");
    const persistentReports = `${summary}\n${evaluation}`;
    check(summary.includes(sourceDataset) && evaluation.includes(sourceDataset), "persistent reports contain the stable source dataset");
    check(summary.includes(evaluatedSlice) && evaluation.includes(evaluatedSlice), "persistent reports contain the evaluated slice");
    check(!persistentReports.includes(transientDirectory), "persistent reports exclude the Windows temporary directory");
    check(!persistentReports.includes(transientFilename), "persistent reports exclude the temporary input filename");
    check(!persistentReports.includes(transientPath), "persistent reports exclude the complete local transfer path");
    deepEqual(result.candidateRules, baseline.candidateRules, "provenance does not change candidate rules or thresholds");
    deepEqual(result.split, baseline.split, "provenance does not change development or holdout splits");
    deepEqual(result.metrics, baseline.metrics, "provenance does not change metrics");
    equal(result.verdict, baseline.verdict, "provenance does not change the verdict");
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
}

function testSingleSegmentTemporalFallback(): void {
  const loaded = loadRaw(Array.from({ length: 10 }, (_, index) => rawAt(index * 15)));
  const split = temporalSplit(segmentSnapshots(loaded.eligibleRows));
  equal(split.development[0].rows.length, 8, "single segment uses first 80% for development");
  equal(split.holdout[0].rows.length, 2, "single segment reserves final 20% for holdout");
  check(split.development[0].end < split.holdout[0].start, "fallback split remains strictly temporal");
}

function run(): void {
  testEligibilityAndDeduplication();
  testContinuityAndSplit();
  testNoOutcomesAcrossGapsAndRightCensoring();
  testHoldoutExcludedFromTuning();
  testTransitionsPersistenceAndMetrics();
  testCandidateRulesAndVerdictSafety();
  testDeterministicOutputsAndSourceIsolation();
  testStablePersistentProvenance();
  testSingleSegmentTemporalFallback();
  console.log(`Liquidity Rotation evaluator tests passed (${assertions} assertions).`);
}

run();
