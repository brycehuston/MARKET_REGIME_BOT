import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { loadConfig } from "./config";
import { ensureDirForFile, round, writeJsonFile } from "./utils";

dotenv.config();

type InputFileKey = "snapshots" | "accuracyResults" | "coachEvaluations";

interface ReportPaths {
  snapshotsPath: string;
  accuracyResultsPath: string;
  coachEvaluationsPath: string;
  reportJsonPath: string;
  reportMdPath: string;
}

interface InputFileSummary {
  path: string;
  exists: boolean;
  rowsRead: number;
  availableColumns: string[];
  missingColumns: string[];
  malformedRows: number;
}

interface SnapshotRecord {
  timestamp: string | null;
  raw: Record<string, unknown>;
  context: Record<string, string>;
  marketMoveWanted: boolean | null;
  heartbeatSent: boolean | null;
}

interface AccuracyOutcome {
  sourceTimestamp: string;
  horizon: string;
  correct: boolean | null;
  returns: Record<string, number | null>;
}

interface CoachOutcome {
  sourceTimestamp: string;
  window: string;
  useful: boolean | null;
  returns: Record<string, number | null>;
}

interface OutcomeMetric {
  count: number;
  correctPct?: number;
  usefulPct?: number;
  avgBtcReturnPct: number | null;
  avgEthReturnPct: number | null;
  avgSolReturnPct: number | null;
}

interface GroupValueMetric {
  value: string;
  snapshotRows: number;
  marketMoveWantedRows: number | null;
  heartbeatSentRows: number | null;
  accuracyByHorizon: Record<string, OutcomeMetric>;
  coachUsefulnessByWindow: Record<string, OutcomeMetric>;
  marketMoveCandidates: {
    firedButShouldHaveSuppressed: number | null;
    suppressedButShouldHaveFired: number | null;
    note: string;
  };
  sampleSizeWarning: string | null;
}

interface GroupedMetric {
  field: string;
  values: GroupValueMetric[];
}

export interface EventContextAccuracyReport {
  generatedAt: string;
  behaviorStatement: string;
  inputFiles: Record<InputFileKey, InputFileSummary>;
  datasetSummary: {
    snapshotsRead: number;
    validSnapshotTimestamps: number;
    accuracyRowsRead: number;
    coachEvaluationRowsRead: number;
    dateRange: { start: string | null; end: string | null };
  };
  eventContextCoverage: Record<string, { knownRows: number; unknownRows: number; knownPct: number }>;
  groupedMetrics: GroupedMetric[];
  moonAnomalySection: {
    researchOnly: true;
    statement: string;
    groups: GroupedMetric[];
  };
  unavailableMetrics: string[];
  leakageWarnings: string[];
  candidateObservationsOnly: string[];
}

const DEFAULT_REPORT_JSON = "logs/event_context_accuracy_report.json";
const DEFAULT_REPORT_MD = "logs/event_context_accuracy_report.md";
const DEFAULT_ACCURACY_RESULTS = "logs/accuracy_results.csv";
const DEFAULT_COACH_EVALUATIONS = "logs/accuracy_coach_evaluations.csv";
const BEHAVIOR_STATEMENT = "This report does not prove profitability and does not change runtime behavior.";
const SMALL_SAMPLE_THRESHOLD = 20;

const GROUP_FIELDS = [
  "eventRiskLevel",
  "eventType",
  "eventImpactClass",
  "calendarRiskState",
  "liquidityContext",
  "confirmationRequirement",
  "marketMoveEventMode",
  "eventContextOperational",
  "eventStackCount",
  "eventStackTags",
  "eventConfluenceLevel",
  "hiddenObservedEventsCount",
  "btcHalvingDisplayWindow",
  "moonResearchOnly",
  "moonPhase",
  "macroContext.dxyTrend",
  "macroContext.tenYearYieldTrend",
  "macroContext.realYieldTrend",
  "macroContext.equityRiskState",
  "macroContext.volRegime",
  "macroLiquidityContext.netLiquidityTrend"
];

const SNAPSHOT_EXPECTED_COLUMNS = [
  "timestamp",
  "eventContext",
  "eventRiskLevel",
  "eventType",
  "eventImpactClass",
  "calendarRiskState",
  "liquidityContext",
  "confirmationRequirement",
  "marketMoveEventMode",
  "eventContextOperational",
  "eventStackCount",
  "eventStackTags",
  "eventConfluenceLevel",
  "eventDisplayReasons",
  "displayRelevantEvents",
  "hiddenObservedEventsCount",
  "btcHalvingContext",
  "btcHalvingDisplayWindow",
  "moonResearchOnly",
  "moonPhase",
  "marketMoveWanted",
  "heartbeatSent"
];

const ACCURACY_EXPECTED_COLUMNS = ["source_timestamp", "horizon", "correct"];
const COACH_EXPECTED_COLUMNS = ["sourceTimestamp", "window", "useful"];

export function defaultEventContextAccuracyReportPaths(): ReportPaths {
  const config = loadConfig();
  return {
    snapshotsPath: config.paths.snapshotJsonl,
    accuracyResultsPath: DEFAULT_ACCURACY_RESULTS,
    coachEvaluationsPath: DEFAULT_COACH_EVALUATIONS,
    reportJsonPath: DEFAULT_REPORT_JSON,
    reportMdPath: DEFAULT_REPORT_MD
  };
}

export function buildEventContextAccuracyReport(paths: ReportPaths): EventContextAccuracyReport {
  const snapshotsInput = loadSnapshotRows(paths.snapshotsPath);
  const accuracyInput = loadCsvRows(paths.accuracyResultsPath, ACCURACY_EXPECTED_COLUMNS);
  const coachInput = loadCsvRows(paths.coachEvaluationsPath, COACH_EXPECTED_COLUMNS);

  const snapshots = snapshotsInput.rows.map(normalizeSnapshot);
  const accuracyOutcomes = accuracyInput.rows.map(normalizeAccuracyOutcome).filter((row): row is AccuracyOutcome => row !== null);
  const coachOutcomes = coachInput.rows.map(normalizeCoachOutcome).filter((row): row is CoachOutcome => row !== null);
  const accuracyByTimestamp = groupBy(accuracyOutcomes, (row) => row.sourceTimestamp);
  const coachByTimestamp = groupBy(coachOutcomes, (row) => row.sourceTimestamp);

  return {
    generatedAt: new Date().toISOString(),
    behaviorStatement: BEHAVIOR_STATEMENT,
    inputFiles: {
      snapshots: summarizeJsonlInput(paths.snapshotsPath, snapshotsInput, SNAPSHOT_EXPECTED_COLUMNS),
      accuracyResults: accuracyInput.summary,
      coachEvaluations: coachInput.summary
    },
    datasetSummary: buildDatasetSummary(snapshots, accuracyInput.summary.rowsRead, coachInput.summary.rowsRead),
    eventContextCoverage: buildCoverage(snapshots),
    groupedMetrics: GROUP_FIELDS.map((field) => buildGroupedMetric(field, snapshots, accuracyByTimestamp, coachByTimestamp)),
    moonAnomalySection: {
      researchOnly: true,
      statement: "Moon/anomaly fields are research-only metadata. This section reports sample sizes only and does not imply predictive value.",
      groups: [
        buildGroupedMetric("moonPhase", snapshots, accuracyByTimestamp, coachByTimestamp),
        buildGroupedMetric("moonResearchOnly", snapshots, accuracyByTimestamp, coachByTimestamp)
      ]
    },
    unavailableMetrics: unavailableMetrics(accuracyInput.summary, coachInput.summary),
    leakageWarnings: [
      "Use only EventContext values logged on each source snapshot timestamp.",
      "Do not use future outcome fields as entry-time features.",
      "Candidate observations are diagnostics only and must not be treated as suppression rules."
    ],
    candidateObservationsOnly: [
      "Market Move false-positive and false-negative labels are not present in current logs.",
      "Fired/suppressed candidate counts are conservative outcome diagnostics only.",
      BEHAVIOR_STATEMENT
    ]
  };
}

export function writeEventContextAccuracyReport(report: EventContextAccuracyReport, paths: Pick<ReportPaths, "reportJsonPath" | "reportMdPath">): void {
  writeJsonFile(paths.reportJsonPath, report);
  ensureDirForFile(paths.reportMdPath);
  fs.writeFileSync(paths.reportMdPath, renderMarkdown(report), "utf8");
}

function loadSnapshotRows(filePath: string): { exists: boolean; rows: Record<string, unknown>[]; malformedRows: number; columns: Set<string> } {
  if (!fs.existsSync(filePath)) return { exists: false, rows: [], malformedRows: 0, columns: new Set() };

  const rows: Record<string, unknown>[] = [];
  const columns = new Set<string>();
  let malformedRows = 0;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as Record<string, unknown>;
      rows.push(row);
      collectColumns(row, columns);
    } catch {
      malformedRows += 1;
    }
  }
  return { exists: true, rows, malformedRows, columns };
}

function summarizeJsonlInput(pathLabel: string, input: { exists: boolean; rows: Record<string, unknown>[]; malformedRows: number; columns: Set<string> }, expected: string[]): InputFileSummary {
  const availableColumns = [...input.columns].sort();
  return {
    path: pathLabel,
    exists: input.exists,
    rowsRead: input.rows.length,
    availableColumns,
    missingColumns: expected.filter((column) => !availableColumns.includes(column)),
    malformedRows: input.malformedRows
  };
}

function collectColumns(row: Record<string, unknown>, columns: Set<string>, prefix = ""): void {
  for (const [key, value] of Object.entries(row)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    columns.add(fullKey);
    if (isRecord(value)) collectColumns(value, columns, fullKey);
  }
}

function loadCsvRows(filePath: string, expected: string[]): { rows: Record<string, string>[]; summary: InputFileSummary } {
  if (!fs.existsSync(filePath)) {
    return {
      rows: [],
      summary: { path: filePath, exists: false, rowsRead: 0, availableColumns: [], missingColumns: expected, malformedRows: 0 }
    };
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) {
    return {
      rows: [],
      summary: { path: filePath, exists: true, rowsRead: 0, availableColumns: [], missingColumns: expected, malformedRows: 0 }
    };
  }

  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  let malformedRows = 0;
  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    if (values.length > header.length) {
      malformedRows += 1;
      continue;
    }
    rows.push(Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""])));
  }

  return {
    rows,
    summary: {
      path: filePath,
      exists: true,
      rowsRead: rows.length,
      availableColumns: header,
      missingColumns: expected.filter((column) => !header.includes(column)),
      malformedRows
    }
  };
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function normalizeSnapshot(raw: Record<string, unknown>): SnapshotRecord {
  const context = Object.fromEntries(GROUP_FIELDS.map((field) => [field, readContextField(raw, field)]));
  return {
    timestamp: stringOrNull(raw.timestamp),
    raw,
    context,
    marketMoveWanted: booleanOrNull(raw.marketMoveWanted),
    heartbeatSent: booleanOrNull(raw.heartbeatSent)
  };
}

function normalizeAccuracyOutcome(row: Record<string, string>): AccuracyOutcome | null {
  const sourceTimestamp = row.source_timestamp;
  if (!sourceTimestamp) return null;
  return {
    sourceTimestamp,
    horizon: row.horizon || "UNKNOWN",
    correct: booleanOrNull(row.correct),
    returns: {
      btc: numberOrNull(row.btc_return_pct),
      eth: numberOrNull(row.eth_return_pct),
      sol: numberOrNull(row.sol_return_pct)
    }
  };
}

function normalizeCoachOutcome(row: Record<string, string>): CoachOutcome | null {
  const sourceTimestamp = row.sourceTimestamp;
  if (!sourceTimestamp) return null;
  return {
    sourceTimestamp,
    window: row.window || "UNKNOWN",
    useful: booleanOrNull(row.useful),
    returns: {
      btc: numberOrNull(row.btcReturnPct),
      eth: numberOrNull(row.ethReturnPct),
      sol: numberOrNull(row.solReturnPct)
    }
  };
}

function readContextField(raw: Record<string, unknown>, field: string): string {
  const flat = raw[field];
  if (flat !== null && flat !== undefined && String(flat).trim()) return String(flat);

  if (field.startsWith("macroContext.")) {
    return stringFromPath(raw, field) ?? stringFromPath(raw, `eventContext.${field}`) ?? "UNKNOWN";
  }
  if (field.startsWith("macroLiquidityContext.")) {
    return stringFromPath(raw, field) ?? stringFromPath(raw, `eventContext.${field}`) ?? "UNKNOWN";
  }

  if (field === "moonPhase") {
    return stringFromPath(raw, "eventContext.moonPhaseContext.phase") ?? "UNKNOWN";
  }
  if (field === "btcHalvingDisplayWindow") {
    return stringFromPath(raw, "eventContext.btcHalvingContext.btcHalvingDisplayWindow") ?? "UNKNOWN";
  }

  return stringFromPath(raw, `eventContext.${field}`) ?? "UNKNOWN";
}

function stringFromPath(raw: Record<string, unknown>, dottedPath: string): string | null {
  let current: unknown = raw;
  for (const part of dottedPath.split(".")) {
    if (!isRecord(current) || !(part in current)) return null;
    current = current[part];
  }
  if (current === null || current === undefined || !String(current).trim()) return null;
  return String(current);
}

function buildDatasetSummary(snapshots: SnapshotRecord[], accuracyRowsRead: number, coachRowsRead: number): EventContextAccuracyReport["datasetSummary"] {
  const timestamps = snapshots
    .map((snapshot) => snapshot.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort();
  return {
    snapshotsRead: snapshots.length,
    validSnapshotTimestamps: timestamps.length,
    accuracyRowsRead,
    coachEvaluationRowsRead: coachRowsRead,
    dateRange: { start: timestamps[0] ?? null, end: timestamps[timestamps.length - 1] ?? null }
  };
}

function buildCoverage(snapshots: SnapshotRecord[]): Record<string, { knownRows: number; unknownRows: number; knownPct: number }> {
  return Object.fromEntries(GROUP_FIELDS.map((field) => {
    const knownRows = snapshots.filter((snapshot) => snapshot.context[field] !== "UNKNOWN").length;
    const unknownRows = snapshots.length - knownRows;
    return [field, { knownRows, unknownRows, knownPct: snapshots.length === 0 ? 0 : round((knownRows / snapshots.length) * 100, 2) }];
  }));
}

function buildGroupedMetric(
  field: string,
  snapshots: SnapshotRecord[],
  accuracyByTimestamp: Map<string, AccuracyOutcome[]>,
  coachByTimestamp: Map<string, CoachOutcome[]>
): GroupedMetric {
  const groups = groupBy(snapshots, (snapshot) => snapshot.context[field] ?? "UNKNOWN");
  const values = [...groups.entries()].map(([value, group]) => {
    const accuracy = group.flatMap((snapshot) => snapshot.timestamp ? accuracyByTimestamp.get(snapshot.timestamp) ?? [] : []);
    const coach = group.flatMap((snapshot) => snapshot.timestamp ? coachByTimestamp.get(snapshot.timestamp) ?? [] : []);
    return {
      value,
      snapshotRows: group.length,
      marketMoveWantedRows: countKnownBooleans(group.map((snapshot) => snapshot.marketMoveWanted), true),
      heartbeatSentRows: countKnownBooleans(group.map((snapshot) => snapshot.heartbeatSent), true),
      accuracyByHorizon: outcomeMetrics(accuracy, (outcome) => outcome.horizon, "correct"),
      coachUsefulnessByWindow: outcomeMetrics(coach, (outcome) => outcome.window, "useful"),
      marketMoveCandidates: candidateCounts(group, coach),
      sampleSizeWarning: group.length < SMALL_SAMPLE_THRESHOLD ? "Insufficient sample size. Treat as directional only." : null
    };
  });

  values.sort((a, b) => b.snapshotRows - a.snapshotRows || a.value.localeCompare(b.value));
  return { field, values };
}

function outcomeMetrics<T extends AccuracyOutcome | CoachOutcome>(
  outcomes: T[],
  windowFn: (outcome: T) => string,
  booleanField: "correct" | "useful"
): Record<string, OutcomeMetric> {
  const groups = groupBy(outcomes, windowFn);
  return Object.fromEntries([...groups.entries()].map(([window, group]) => {
    const bools = group.map((outcome) => booleanField === "correct" ? (outcome as AccuracyOutcome).correct : (outcome as CoachOutcome).useful);
    const trueCount = bools.filter((value) => value === true).length;
    const knownCount = bools.filter((value) => value !== null).length;
    return [window, {
      count: group.length,
      ...(booleanField === "correct" ? { correctPct: knownCount === 0 ? 0 : round((trueCount / knownCount) * 100, 2) } : {}),
      ...(booleanField === "useful" ? { usefulPct: knownCount === 0 ? 0 : round((trueCount / knownCount) * 100, 2) } : {}),
      avgBtcReturnPct: average(group.map((outcome) => outcome.returns.btc)),
      avgEthReturnPct: average(group.map((outcome) => outcome.returns.eth)),
      avgSolReturnPct: average(group.map((outcome) => outcome.returns.sol))
    }];
  }));
}

function candidateCounts(group: SnapshotRecord[], coachOutcomes: CoachOutcome[]): GroupValueMetric["marketMoveCandidates"] {
  const hasMarketMoveWanted = group.some((snapshot) => snapshot.marketMoveWanted !== null);
  if (!hasMarketMoveWanted || coachOutcomes.length === 0) {
    return {
      firedButShouldHaveSuppressed: null,
      suppressedButShouldHaveFired: null,
      note: "Unavailable without marketMoveWanted and outcome usefulness data."
    };
  }

  const usefulByTimestamp = new Map<string, boolean>();
  for (const outcome of coachOutcomes) {
    if (outcome.useful !== null && !usefulByTimestamp.has(outcome.sourceTimestamp)) usefulByTimestamp.set(outcome.sourceTimestamp, outcome.useful);
  }

  let firedButShouldHaveSuppressed = 0;
  let suppressedButShouldHaveFired = 0;
  for (const snapshot of group) {
    if (!snapshot.timestamp || snapshot.marketMoveWanted === null || !usefulByTimestamp.has(snapshot.timestamp)) continue;
    const useful = usefulByTimestamp.get(snapshot.timestamp);
    if (snapshot.marketMoveWanted && useful === false) firedButShouldHaveSuppressed += 1;
    if (!snapshot.marketMoveWanted && useful === true) suppressedButShouldHaveFired += 1;
  }

  return {
    firedButShouldHaveSuppressed,
    suppressedButShouldHaveFired,
    note: "Candidate observations only; not false-positive/false-negative labels."
  };
}

function unavailableMetrics(accuracySummary: InputFileSummary, coachSummary: InputFileSummary): string[] {
  const unavailable = [
    "Market Move false positives: unavailable without explicit labels.",
    "Market Move false negatives: unavailable without explicit labels.",
    "Max adverse excursion: unavailable unless source logs include MAE columns.",
    "Max favorable excursion: unavailable unless source logs include MFE columns.",
    "Regime follow-through: unavailable unless source logs include explicit follow-through labels.",
    "Score transition quality: unavailable unless source logs include explicit transition labels."
  ];
  if (!accuracySummary.availableColumns.includes("horizon")) unavailable.push("Accuracy horizons from accuracy_results.csv unavailable.");
  if (!coachSummary.availableColumns.includes("window")) unavailable.push("Coach evaluation windows unavailable.");
  for (const missingWindow of ["4H", "12H"]) unavailable.push(`${missingWindow} lane accuracy: unavailable unless present in current logs.`);
  return unavailable;
}

function renderMarkdown(report: EventContextAccuracyReport): string {
  const lines: string[] = [
    "# EventContext Accuracy Report",
    "",
    report.behaviorStatement,
    "",
    "## Dataset Summary",
    `- snapshots read: ${report.datasetSummary.snapshotsRead}`,
    `- valid snapshot timestamps: ${report.datasetSummary.validSnapshotTimestamps}`,
    `- accuracy rows read: ${report.datasetSummary.accuracyRowsRead}`,
    `- coach evaluation rows read: ${report.datasetSummary.coachEvaluationRowsRead}`,
    `- date range: ${report.datasetSummary.dateRange.start ?? "n/a"} to ${report.datasetSummary.dateRange.end ?? "n/a"}`,
    "",
    "## Input Files"
  ];

  for (const [key, summary] of Object.entries(report.inputFiles)) {
    lines.push(`- ${key}: ${summary.exists ? "present" : "missing"} | rows ${summary.rowsRead} | malformed ${summary.malformedRows}`);
    lines.push(`  - available columns: ${summary.availableColumns.length === 0 ? "none" : summary.availableColumns.join(", ")}`);
    lines.push(`  - missing columns: ${summary.missingColumns.length === 0 ? "none" : summary.missingColumns.join(", ")}`);
  }

  lines.push("", "## EventContext Coverage");
  for (const [field, coverage] of Object.entries(report.eventContextCoverage)) {
    lines.push(`- ${field}: ${coverage.knownRows}/${coverage.knownRows + coverage.unknownRows} known (${coverage.knownPct}%)`);
  }

  lines.push("", "## Grouped Metrics");
  for (const metric of report.groupedMetrics) {
    lines.push(`### ${metric.field}`);
    for (const row of metric.values.slice(0, 12)) {
      lines.push(`- ${row.value}: snapshots ${row.snapshotRows}, marketMoveWanted ${row.marketMoveWantedRows ?? "n/a"}, heartbeatSent ${row.heartbeatSentRows ?? "n/a"}${row.sampleSizeWarning ? ` | ${row.sampleSizeWarning}` : ""}`);
    }
  }

  lines.push("", "## Moon / Anomaly Section", report.moonAnomalySection.statement);
  for (const group of report.moonAnomalySection.groups) {
    lines.push(`### ${group.field}`);
    for (const row of group.values) lines.push(`- ${row.value}: ${row.snapshotRows} rows${row.sampleSizeWarning ? ` | ${row.sampleSizeWarning}` : ""}`);
  }

  lines.push("", "## Unavailable Metrics");
  for (const item of report.unavailableMetrics) lines.push(`- ${item}`);

  lines.push("", "## Leakage Warnings");
  for (const item of report.leakageWarnings) lines.push(`- ${item}`);

  lines.push("", "## Candidate Observations Only");
  for (const item of report.candidateObservationsOnly) lines.push(`- ${item}`);

  return `${lines.join("\n")}\n`;
}

function countKnownBooleans(values: Array<boolean | null>, target: boolean): number | null {
  if (values.every((value) => value === null)) return null;
  return values.filter((value) => value === target).length;
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function average(values: Array<number | null>): number | null {
  const clean = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (clean.length === 0) return null;
  return round(clean.reduce((sum, value) => sum + value, 0) / clean.length, 4);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function main(): void {
  const paths = defaultEventContextAccuracyReportPaths();
  const report = buildEventContextAccuracyReport(paths);
  writeEventContextAccuracyReport(report, paths);
  console.log("EventContext Accuracy Report");
  console.log(`- snapshots read: ${report.datasetSummary.snapshotsRead}`);
  console.log(`- accuracy rows read: ${report.datasetSummary.accuracyRowsRead}`);
  console.log(`- coach evaluation rows read: ${report.datasetSummary.coachEvaluationRowsRead}`);
  console.log(`- output: ${paths.reportJsonPath}, ${paths.reportMdPath}`);
  console.log(BEHAVIOR_STATEMENT);
}

if (require.main === module) {
  main();
}
