import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildEventContextAccuracyReport, writeEventContextAccuracyReport } from "./eventContextAccuracyReport";

function tempPaths(): {
  dir: string;
  snapshotsPath: string;
  accuracyResultsPath: string;
  coachEvaluationsPath: string;
  reportJsonPath: string;
  reportMdPath: string;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "event-context-report-test-"));
  return {
    dir,
    snapshotsPath: path.join(dir, "regime_snapshots.jsonl"),
    accuracyResultsPath: path.join(dir, "accuracy_results.csv"),
    coachEvaluationsPath: path.join(dir, "accuracy_coach_evaluations.csv"),
    reportJsonPath: path.join(dir, "event_context_accuracy_report.json"),
    reportMdPath: path.join(dir, "event_context_accuracy_report.md")
  };
}

function writeJsonl(filePath: string, rows: unknown[]): void {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

function testMissingFilesGraceful(): void {
  const paths = tempPaths();
  const report = buildEventContextAccuracyReport(paths);

  assert.equal(report.inputFiles.snapshots.exists, false);
  assert.equal(report.datasetSummary.snapshotsRead, 0);
  assert.ok(report.inputFiles.snapshots.missingColumns.includes("eventContext"));
  assert.match(report.behaviorStatement, /does not prove profitability/);
}

function testMissingEventContextFieldsGraceful(): void {
  const paths = tempPaths();
  writeJsonl(paths.snapshotsPath, [{ timestamp: "2026-07-01T00:00:00Z", marketMoveWanted: false }]);

  const report = buildEventContextAccuracyReport(paths);
  assert.equal(report.datasetSummary.snapshotsRead, 1);
  assert.equal(report.eventContextCoverage.eventRiskLevel.knownRows, 0);
  assert.equal(report.eventContextCoverage.eventRiskLevel.unknownRows, 1);
  assert.equal(report.groupedMetrics.find((group) => group.field === "eventRiskLevel")?.values[0]?.value, "UNKNOWN");
}

function testFlatEventContextFieldsGrouped(): void {
  const paths = tempPaths();
  writeJsonl(paths.snapshotsPath, [{
    timestamp: "2026-07-01T00:00:00Z",
    eventRiskLevel: "HIGH",
    eventType: "MACRO",
    eventImpactClass: "TIER_A",
    calendarRiskState: "PRE_EVENT",
    liquidityContext: "NORMAL",
    confirmationRequirement: "TWO_SCAN",
    marketMoveEventMode: "SUPPRESS_WEAK",
    eventContextOperational: false,
    moonResearchOnly: true,
    moonPhase: "Full moon",
    marketMoveWanted: true,
    heartbeatSent: true
  }]);
  fs.writeFileSync(paths.accuracyResultsPath, [
    "source_timestamp,horizon,correct,btc_return_pct,eth_return_pct,sol_return_pct",
    "2026-07-01T00:00:00Z,1D,yes,1,2,3"
  ].join("\n") + "\n", "utf8");

  const report = buildEventContextAccuracyReport(paths);
  const calendar = report.groupedMetrics.find((group) => group.field === "calendarRiskState");
  const preEvent = calendar?.values.find((row) => row.value === "PRE_EVENT");
  assert.equal(preEvent?.snapshotRows, 1);
  assert.equal(preEvent?.marketMoveWantedRows, 1);
  assert.equal(preEvent?.heartbeatSentRows, 1);
  assert.equal(preEvent?.accuracyByHorizon["1D"].correctPct, 100);
}

function testNestedEventContextFallback(): void {
  const paths = tempPaths();
  writeJsonl(paths.snapshotsPath, [{
    timestamp: "2026-07-01T00:00:00Z",
    eventContext: {
      eventRiskLevel: "MEDIUM",
      calendarRiskState: "POST_EVENT",
      liquidityContext: "THIN_WEEKEND",
      confirmationRequirement: "ONE_CLOSE",
      marketMoveEventMode: "CAUTION",
      eventContextOperational: false,
      moonPhaseContext: { phase: "New moon", researchOnly: true },
      macroContext: { dxyTrend: "UP" },
      macroLiquidityContext: { netLiquidityTrend: "CONTRACTING" }
    }
  }]);

  const report = buildEventContextAccuracyReport(paths);
  assert.equal(report.groupedMetrics.find((group) => group.field === "calendarRiskState")?.values[0]?.value, "POST_EVENT");
  assert.equal(report.groupedMetrics.find((group) => group.field === "liquidityContext")?.values[0]?.value, "THIN_WEEKEND");
  assert.equal(report.groupedMetrics.find((group) => group.field === "macroContext.dxyTrend")?.values[0]?.value, "UP");
  assert.equal(report.groupedMetrics.find((group) => group.field === "macroLiquidityContext.netLiquidityTrend")?.values[0]?.value, "CONTRACTING");
}

function testMoonResearchOnlyMarkdownAndWrites(): void {
  const paths = tempPaths();
  writeJsonl(paths.snapshotsPath, [{
    timestamp: "2026-07-01T00:00:00Z",
    moonResearchOnly: true,
    moonPhase: "Full moon"
  }]);

  const report = buildEventContextAccuracyReport(paths);
  writeEventContextAccuracyReport(report, paths);
  const markdown = fs.readFileSync(paths.reportMdPath, "utf8");

  assert.equal(report.moonAnomalySection.researchOnly, true);
  assert.match(report.moonAnomalySection.statement, /research-only metadata/);
  assert.match(markdown, /does not imply predictive value/);
  assert.ok(fs.existsSync(paths.reportJsonPath));
}

function testRuntimeDecisionFunctionsNotImported(): void {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "eventContextAccuracyReport.ts"), "utf8");
  assert.doesNotMatch(source, /from "\.\/alerts"/);
  assert.doesNotMatch(source, /from "\.\/laneExplainer"/);
  assert.doesNotMatch(source, /from "\.\/scorer"/);
  assert.doesNotMatch(source, /from "\.\/telegram"/);
}

testMissingFilesGraceful();
testMissingEventContextFieldsGraceful();
testFlatEventContextFieldsGrouped();
testNestedEventContextFallback();
testMoonResearchOnlyMarkdownAndWrites();
testRuntimeDecisionFunctionsNotImported();

console.log("EventContext accuracy report tests passed.");
