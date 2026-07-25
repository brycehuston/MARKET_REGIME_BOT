import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { classifyLiquidityRotationSession } from "../src/liquidityRotation";

export const CONTINUITY_BREAK_MINUTES = 30;
export const FORWARD_HORIZON_SCANS = 4;
export const REPORT_DIRECTORY = "reports/liquidity_rotation_v1";
export const DEFAULT_INPUTS = [
  "vps_logs/regime_snapshots_approved_2521.jsonl",
  "vps_logs/regime_snapshots_post_f75e087.jsonl",
  "logs/regime_snapshots.jsonl",
  "vps_logs/regime_snapshots_vps.jsonl"
] as const;

export const ROTATION_STATES = [
  "MAJOR_BREAKOUT",
  "ROTATION_SETUP",
  "ALT_ROTATION_CONFIRMED",
  "NO_CLEAR_ROTATION",
  "CASCADE_RISK"
] as const;

export type RotationState = typeof ROTATION_STATES[number];
export type ResearchVerdict = "PROMISING_FOR_FORWARD_SHADOW" | "INSUFFICIENT_EVIDENCE" | "REJECT_UNSTABLE";
export type Asset = "BTC" | "ETH" | "SOL";
export type SplitName = "DEVELOPMENT" | "HOLDOUT";

export interface NormalizedSnapshot {
  timestamp: string;
  timestampMs: number;
  score: number;
  btcPrice: number;
  ethPrice: number;
  solPrice: number;
  ethBtcRatio: number;
  solBtcRatio: number;
  solEthRatio: number;
  btcDominancePct: number | null;
  laneScoreBtc: number;
  laneScoreEth: number;
  laneScoreSol: number;
  sessionWindow: string;
}

export interface ExclusionCounts {
  malformed: number;
  legacy: number;
  staleOrBroken: number;
  missingRequired: number;
}

export interface LoadResult {
  sourcePath: string;
  rowsRead: number;
  parseableRows: number;
  eligibleBeforeDedup: number;
  duplicateTimestamps: number;
  eligibleRows: NormalizedSnapshot[];
  exclusions: ExclusionCounts;
}

export interface DatasetProvenance {
  sourceDataset: string;
  evaluatedSlice: string;
}

export interface SnapshotSegment {
  id: number;
  start: string;
  end: string;
  rows: NormalizedSnapshot[];
}

export interface TemporalSplit {
  development: SnapshotSegment[];
  holdout: SnapshotSegment[];
  splitTimestamp: string;
  policy: string;
}

export interface CandidateRules {
  scoreHigh: number;
  scoreLow: number;
  btcBreakoutReturnPct: number;
  btcCascadeReturnPct: number;
  altMargin: number;
  altPersistenceScans: number;
  persistenceSource: "DEVELOPMENT_RUNS" | "DEVELOPMENT_FALLBACK";
  tuningRows: number;
  tuningStart: string;
  tuningEnd: string;
}

export interface EvaluatedSnapshot extends NormalizedSnapshot {
  split: SplitName;
  segmentId: number;
  state: RotationState;
  statePersistenceScans: number;
  candidateAsset: Asset | null;
  leadTimeMinutes: number | null;
  forwardReturnPct: number | null;
  maePct: number | null;
  mfePct: number | null;
  outcomeSuccess: boolean | null;
  rightCensored: boolean;
}

export interface StateMetric {
  split: SplitName;
  state: RotationState;
  count: number;
  sharePct: number;
  matureOutcomes: number;
  successes: number;
  successRatePct: number | null;
  falsePositives: number;
  rightCensored: number;
  averageForwardReturnPct: number | null;
  averageMaePct: number | null;
  averageMfePct: number | null;
  averageLeadTimeMinutes: number | null;
  maximumPersistenceScans: number;
}

export interface TransitionMetric {
  split: SplitName;
  from: RotationState;
  to: RotationState;
  count: number;
}

export interface SessionMetric {
  split: SplitName;
  sessionWindow: string;
  count: number;
  candidateCount: number;
  matureCandidateOutcomes: number;
  candidateSuccessRatePct: number | null;
}

export interface EvaluatorResult {
  schemaVersion: "liquidity-rotation-evaluator-v1";
  nonAuthoritative: true;
  productionApproved: false;
  total3State: "UNAVAILABLE";
  altBreadthState: "UNAVAILABLE";
  dataset: {
    sourceDataset: string;
    evaluatedSlice: string;
    rowsRead: number;
    parseableRows: number;
    eligibleBeforeDedup: number;
    eligibleRows: number;
    duplicateTimestamps: number;
    exclusions: ExclusionCounts;
    segments: Array<{ id: number; start: string; end: string; rows: number }>;
    continuityBreakMinutes: 30;
  };
  split: {
    policy: string;
    splitTimestamp: string;
    development: { start: string; end: string; rows: number; segmentIds: number[] };
    holdout: { start: string; end: string; rows: number; segmentIds: number[] };
    holdoutUsedForTuning: false;
  };
  candidateRules: CandidateRules;
  candidateRuleSetCount: 1;
  candidateDefinitions: Array<{ state: RotationState; definition: string }>;
  metrics: StateMetric[];
  transitions: TransitionMetric[];
  sessions: SessionMetric[];
  verdict: ResearchVerdict;
  verdictReasons: string[];
  limitations: string[];
  evaluatedRows: EvaluatedSnapshot[];
}

interface FeatureSnapshot extends NormalizedSnapshot {
  oneScanBtcReturnPct: number | null;
  topAsset: Asset;
  topMargin: number;
  altCondition: boolean;
}

export function resolveInputPath(
  cwd: string,
  explicit?: string,
  exists: (path: string) => boolean = existsSync
): string {
  if (explicit) {
    const path = resolve(cwd, explicit);
    if (!path.toLowerCase().endsWith(".jsonl")) throw new Error("Liquidity Rotation evaluator input must be JSONL");
    if (!exists(path)) throw new Error(`Snapshot JSONL not found: ${path}`);
    return path;
  }
  for (const candidate of DEFAULT_INPUTS) {
    const path = resolve(cwd, candidate);
    if (exists(path)) return path;
  }
  throw new Error("No supported snapshot JSONL was found; pass --input <path>");
}

export function loadSnapshotLines(lines: string[], sourcePath = "fixture.jsonl"): LoadResult {
  const exclusions: ExclusionCounts = { malformed: 0, legacy: 0, staleOrBroken: 0, missingRequired: 0 };
  const eligible: NormalizedSnapshot[] = [];
  let parseableRows = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
      raw = parsed as Record<string, unknown>;
      parseableRows += 1;
    } catch {
      exclusions.malformed += 1;
      continue;
    }

    const freshness = explicitFreshness(raw);
    if (freshness === "LEGACY") {
      exclusions.legacy += 1;
      continue;
    }
    if (freshness === "BROKEN") {
      exclusions.staleOrBroken += 1;
      continue;
    }
    const normalized = normalizeSnapshot(raw);
    if (!normalized) {
      exclusions.missingRequired += 1;
      continue;
    }
    eligible.push(normalized);
  }

  const byTimestamp = new Map<string, NormalizedSnapshot>();
  let duplicateTimestamps = 0;
  for (const row of eligible) {
    if (byTimestamp.has(row.timestamp)) duplicateTimestamps += 1;
    byTimestamp.set(row.timestamp, row);
  }
  const eligibleRows = [...byTimestamp.values()].sort((a, b) =>
    a.timestampMs - b.timestampMs || a.timestamp.localeCompare(b.timestamp));

  return {
    sourcePath,
    rowsRead: lines.filter((line) => line.trim()).length,
    parseableRows,
    eligibleBeforeDedup: eligible.length,
    duplicateTimestamps,
    eligibleRows,
    exclusions
  };
}

export function loadSnapshots(path: string): LoadResult {
  return loadSnapshotLines(readFileSync(path, "utf8").split(/\r?\n/), path);
}

export function segmentSnapshots(rows: NormalizedSnapshot[]): SnapshotSegment[] {
  if (!rows.length) return [];
  const segments: SnapshotSegment[] = [];
  let current: NormalizedSnapshot[] = [];
  for (const row of rows) {
    const previous = current.at(-1);
    if (previous && (row.timestampMs - previous.timestampMs) / 60000 > CONTINUITY_BREAK_MINUTES) {
      segments.push(toSegment(segments.length + 1, current));
      current = [];
    }
    current.push(row);
  }
  if (current.length) segments.push(toSegment(segments.length + 1, current));
  return segments;
}

export function temporalSplit(segments: SnapshotSegment[]): TemporalSplit {
  const totalRows = segments.reduce((sum, segment) => sum + segment.rows.length, 0);
  if (totalRows < 2) throw new Error("At least two eligible rows are required for a temporal split");
  if (segments.length >= 2) {
    const holdout = [segments[segments.length - 1]];
    const development = segments.slice(0, -1);
    return {
      development,
      holdout,
      splitTimestamp: holdout[0].start,
      policy: "All complete earlier contiguous segments are development; the final contiguous segment is untouched holdout."
    };
  }

  const rows = segments[0].rows;
  const splitIndex = Math.max(1, Math.min(rows.length - 1, Math.floor(rows.length * 0.8)));
  const development = [toSegment(segments[0].id, rows.slice(0, splitIndex))];
  const holdout = [toSegment(segments[0].id + 1, rows.slice(splitIndex))];
  return {
    development,
    holdout,
    splitTimestamp: holdout[0].start,
    policy: "A single contiguous segment is split chronologically at 80%; the split boundary is treated as a hard evaluation boundary."
  };
}

export function deriveCandidateRules(development: SnapshotSegment[]): CandidateRules {
  const features = development.flatMap((segment) => deriveFeatures(segment.rows));
  if (!features.length) throw new Error("Development evidence is empty");
  const scores = features.map((row) => row.score);
  const positiveBtcReturns = features.map((row) => row.oneScanBtcReturnPct).filter(isPositiveNumber);
  const negativeBtcReturns = features.map((row) => row.oneScanBtcReturnPct).filter(isNegativeNumber);
  const altMargins = features.filter((row) => row.topAsset !== "BTC" && row.topMargin > 0).map((row) => row.topMargin);
  const altRunLengths = collectAltRunLengths(development);
  const observedPersistence = altRunLengths.filter((length) => length >= 2);
  const altPersistenceScans = observedPersistence.length
    ? clamp(Math.round(quantile(observedPersistence, 0.5)), 2, 4)
    : 3;

  return {
    scoreHigh: round(quantile(scores, 0.75), 6),
    scoreLow: round(quantile(scores, 0.25), 6),
    btcBreakoutReturnPct: round(positiveBtcReturns.length ? quantile(positiveBtcReturns, 0.75) : Number.POSITIVE_INFINITY, 6),
    btcCascadeReturnPct: round(negativeBtcReturns.length ? quantile(negativeBtcReturns, 0.25) : Number.NEGATIVE_INFINITY, 6),
    altMargin: round(altMargins.length ? quantile(altMargins, 0.5) : Number.POSITIVE_INFINITY, 6),
    altPersistenceScans,
    persistenceSource: observedPersistence.length ? "DEVELOPMENT_RUNS" : "DEVELOPMENT_FALLBACK",
    tuningRows: features.length,
    tuningStart: features[0].timestamp,
    tuningEnd: features.at(-1)!.timestamp
  };
}

export function analyze(load: LoadResult, provenance?: DatasetProvenance): EvaluatorResult {
  const segments = segmentSnapshots(load.eligibleRows);
  const split = temporalSplit(segments);
  const rules = deriveCandidateRules(split.development);
  const developmentRows = evaluateSegments(split.development, "DEVELOPMENT", rules);
  const holdoutRows = evaluateSegments(split.holdout, "HOLDOUT", rules);
  const evaluatedRows = [...developmentRows, ...holdoutRows];
  const metrics = [...stateMetrics(developmentRows, "DEVELOPMENT"), ...stateMetrics(holdoutRows, "HOLDOUT")];
  const transitions = [...transitionMetrics(developmentRows, "DEVELOPMENT"), ...transitionMetrics(holdoutRows, "HOLDOUT")];
  const sessions = [...sessionMetrics(developmentRows, "DEVELOPMENT"), ...sessionMetrics(holdoutRows, "HOLDOUT")];
  const { verdict, reasons } = determineVerdict(metrics);
  const reportProvenance = provenance ?? {
    sourceDataset: "UNSPECIFIED_LOGICAL_SOURCE",
    evaluatedSlice: defaultEvaluatedSlice(load)
  };

  return {
    schemaVersion: "liquidity-rotation-evaluator-v1",
    nonAuthoritative: true,
    productionApproved: false,
    total3State: "UNAVAILABLE",
    altBreadthState: "UNAVAILABLE",
    dataset: {
      sourceDataset: reportProvenance.sourceDataset,
      evaluatedSlice: reportProvenance.evaluatedSlice,
      rowsRead: load.rowsRead,
      parseableRows: load.parseableRows,
      eligibleBeforeDedup: load.eligibleBeforeDedup,
      eligibleRows: load.eligibleRows.length,
      duplicateTimestamps: load.duplicateTimestamps,
      exclusions: load.exclusions,
      segments: segments.map((segment) => ({ id: segment.id, start: segment.start, end: segment.end, rows: segment.rows.length })),
      continuityBreakMinutes: 30
    },
    split: {
      policy: split.policy,
      splitTimestamp: split.splitTimestamp,
      development: splitSummary(split.development),
      holdout: splitSummary(split.holdout),
      holdoutUsedForTuning: false
    },
    candidateRules: rules,
    candidateRuleSetCount: 1,
    candidateDefinitions: candidateDefinitions(rules),
    metrics,
    transitions,
    sessions,
    verdict,
    verdictReasons: reasons,
    limitations: [
      "Canonical TOTAL3 is unavailable; total3State remains UNAVAILABLE.",
      "Broad-alt universe, advances/declines, and canonical breadth are unavailable; altBreadthState remains UNAVAILABLE.",
      "The sample covers two short contiguous segments separated by a 600-minute gap.",
      "Candidate thresholds are descriptive development quantiles, not validated production thresholds.",
      "Forward outcomes are short-horizon snapshot returns and make no profitability claim.",
      "All states, metrics, and verdicts are research-only and non-authoritative."
    ],
    evaluatedRows
  };
}

export function renderSummary(result: EvaluatorResult): string {
  const metricLines = result.metrics.map((metric) =>
    `| ${metric.split} | ${metric.state} | ${metric.count} | ${format(metric.successRatePct)} | ${metric.falsePositives} | ${metric.rightCensored} | ${format(metric.averageForwardReturnPct)} | ${format(metric.averageMaePct)} | ${format(metric.averageMfePct)} |`);
  const sessionLines = result.sessions.map((session) =>
    `| ${session.split} | ${session.sessionWindow} | ${session.count} | ${session.candidateCount} | ${session.matureCandidateOutcomes} | ${format(session.candidateSuccessRatePct)} |`);
  return `# Liquidity Rotation State Machine V1 — Offline Evaluation

> **${result.verdict}**

Research-only and non-authoritative. Never approved for production.

## Dataset

- Source dataset: \`${result.dataset.sourceDataset}\`
- Evaluated slice: \`${result.dataset.evaluatedSlice}\`
- Rows: ${result.dataset.rowsRead} total; ${result.dataset.eligibleRows} eligible after ${result.dataset.duplicateTimestamps} duplicate timestamp(s)
- Exclusions: malformed ${result.dataset.exclusions.malformed}; legacy ${result.dataset.exclusions.legacy}; stale/broken ${result.dataset.exclusions.staleOrBroken}; missing required ${result.dataset.exclusions.missingRequired}
- Segments: ${result.dataset.segments.map((segment) => `${segment.rows} rows (${segment.start} to ${segment.end})`).join("; ")}
- Fixed continuity break: greater than ${result.dataset.continuityBreakMinutes} minutes

## Development and Holdout

- Policy: ${result.split.policy}
- Development: ${result.split.development.rows} rows, ${result.split.development.start} to ${result.split.development.end}
- Holdout: ${result.split.holdout.rows} rows, ${result.split.holdout.start} to ${result.split.holdout.end}
- Holdout used for tuning: **${result.split.holdoutUsedForTuning ? "yes" : "no"}**

## Provisional Candidate Rules

- One rule set, derived from development evidence only
- Score high / low: ${format(result.candidateRules.scoreHigh)} / ${format(result.candidateRules.scoreLow)}
- BTC breakout / cascade one-scan return: ${format(result.candidateRules.btcBreakoutReturnPct)}% / ${format(result.candidateRules.btcCascadeReturnPct)}%
- Alt margin: ${format(result.candidateRules.altMargin)}
- Alt persistence: ${result.candidateRules.altPersistenceScans} scans (${result.candidateRules.persistenceSource})

${result.candidateDefinitions.map((candidate) => `- ${candidate.state}: ${candidate.definition}`).join("\n")}

## State Metrics

| Split | State | Count | Success % | False Positives | Right-Censored | Forward % | MAE % | MFE % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${metricLines.join("\n")}

Forward return is measured four contiguous scans ahead. MAE and MFE are the minimum and maximum target-asset returns observed inside that same forward window. Rows without four future scans in the same segment are right-censored.

## Session-Conditioned Behavior

| Split | Session | Rows | Candidates | Mature Candidates | Success % |
| --- | --- | ---: | ---: | ---: | ---: |
${sessionLines.join("\n")}

## Verdict

${result.verdictReasons.map((reason) => `- ${reason}`).join("\n")}

## Missing Data and Limitations

${result.limitations.map((limitation) => `- ${limitation}`).join("\n")}
`;
}

export function renderCandidateMetricsCsv(result: EvaluatorResult): string {
  const header = [
    "split", "state", "count", "sharePct", "matureOutcomes", "successes", "successRatePct",
    "falsePositives", "rightCensored", "averageForwardReturnPct", "averageMaePct",
    "averageMfePct", "averageLeadTimeMinutes", "maximumPersistenceScans"
  ];
  const rows = result.metrics.map((metric) => header.map((key) => csv(metric[key as keyof StateMetric])).join(","));
  return `${header.join(",")}\n${rows.join("\n")}\n`;
}

export function renderTransitionsCsv(result: EvaluatorResult): string {
  const rows = result.transitions.map((transition) =>
    [transition.split, transition.from, transition.to, transition.count].map(csv).join(","));
  return `split,fromState,toState,count\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

export function writeReports(result: EvaluatorResult, cwd: string): string[] {
  const outputDirectory = resolve(cwd, REPORT_DIRECTORY);
  const reportsRoot = resolve(cwd, "reports");
  const relativeOutput = relative(reportsRoot, outputDirectory);
  if (relativeOutput.startsWith("..") || isAbsolute(relativeOutput)) throw new Error("Evaluator output escaped the reports directory");
  const paths = [
    resolve(outputDirectory, "summary.md"),
    resolve(outputDirectory, "candidate_metrics.csv"),
    resolve(outputDirectory, "transitions.csv"),
    resolve(outputDirectory, "evaluation.json")
  ];
  const values = [
    renderSummary(result),
    renderCandidateMetricsCsv(result),
    renderTransitionsCsv(result),
    `${JSON.stringify(result, null, 2)}\n`
  ];
  mkdirSync(outputDirectory, { recursive: true });
  paths.forEach((path, index) => atomicWrite(path, values[index]));
  return paths;
}

export function parseCliArgs(args: string[]): { input?: string; sourceDataset?: string; evaluatedSlice?: string } {
  let input: string | undefined;
  let sourceDataset: string | undefined;
  let evaluatedSlice: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error("Supported options require values: --input, --source-dataset, --evaluated-slice");
    }
    if (option === "--input") input = value;
    else if (option === "--source-dataset") sourceDataset = value;
    else if (option === "--evaluated-slice") evaluatedSlice = value;
    else throw new Error(`Unsupported option: ${option}`);
    index += 1;
  }
  return { input, sourceDataset, evaluatedSlice };
}

export function runEvaluator(cwd = process.cwd(), args = process.argv.slice(2)): EvaluatorResult {
  const { input, sourceDataset, evaluatedSlice } = parseCliArgs(args);
  const sourcePath = resolveInputPath(cwd, input);
  const load = loadSnapshots(sourcePath);
  const result = analyze(load, {
    sourceDataset: sourceDataset ?? "UNSPECIFIED_LOGICAL_SOURCE",
    evaluatedSlice: evaluatedSlice ?? defaultEvaluatedSlice(load)
  });
  const reports = writeReports(result, cwd);
  console.log(`Liquidity Rotation evaluator: ${result.verdict}`);
  console.log(`Source: ${relative(cwd, sourcePath) || basename(sourcePath)}`);
  console.log(`Rows: ${result.dataset.rowsRead} total, ${result.dataset.eligibleRows} eligible`);
  console.log(`Segments: ${result.dataset.segments.map((segment) => segment.rows).join(", ")}`);
  console.log(`Development / holdout: ${result.split.development.rows} / ${result.split.holdout.rows}`);
  console.log(`Reports: ${reports.map((path) => relative(cwd, path)).join(", ")}`);
  return result;
}

function defaultEvaluatedSlice(load: LoadResult): string {
  const through = load.eligibleRows.at(-1)?.timestamp ?? "UNAVAILABLE";
  return `rows 1-${load.rowsRead} through ${through}`;
}

function explicitFreshness(raw: Record<string, unknown>): "FRESH" | "LEGACY" | "BROKEN" {
  const fields = [raw.marketDataQuality, raw.marketDataFresh, raw.livePriceFresh, raw.historicalDataFresh];
  if (fields.some((field) => field === undefined || field === null)) return "LEGACY";
  return raw.marketDataQuality === "FRESH"
    && raw.marketDataFresh === true
    && raw.livePriceFresh === true
    && raw.historicalDataFresh === true
    ? "FRESH"
    : "BROKEN";
}

function normalizeSnapshot(raw: Record<string, unknown>): NormalizedSnapshot | null {
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";
  const timestampMs = Date.parse(timestamp);
  const score = finite(raw.score);
  const btcPrice = positive(raw.btcPrice);
  const ethPrice = positive(raw.ethPrice);
  const solPrice = positive(raw.solPrice);
  const laneScoreBtc = finite(raw.laneScoreBtc);
  const laneScoreEth = finite(raw.laneScoreEth);
  const laneScoreSol = finite(raw.laneScoreSol);
  if (!Number.isFinite(timestampMs) || score === null || btcPrice === null || ethPrice === null || solPrice === null
    || laneScoreBtc === null || laneScoreEth === null || laneScoreSol === null) return null;
  return {
    timestamp,
    timestampMs,
    score,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: positive(raw.ethBtcRatio) ?? ethPrice / btcPrice,
    solBtcRatio: positive(raw.solBtcRatio) ?? solPrice / btcPrice,
    solEthRatio: positive(raw.solEthRatio) ?? solPrice / ethPrice,
    btcDominancePct: finite((raw.global as Record<string, unknown> | undefined)?.btcDominancePct),
    laneScoreBtc,
    laneScoreEth,
    laneScoreSol,
    sessionWindow: typeof raw.sessionWindow === "string"
      ? raw.sessionWindow
      : classifyLiquidityRotationSession(timestamp).sessionWindow
  };
}

function toSegment(id: number, rows: NormalizedSnapshot[]): SnapshotSegment {
  return { id, start: rows[0].timestamp, end: rows.at(-1)!.timestamp, rows };
}

function deriveFeatures(rows: NormalizedSnapshot[]): FeatureSnapshot[] {
  return rows.map((row, index) => {
    const previous = index > 0 ? rows[index - 1] : null;
    const scores: Array<[Asset, number]> = [
      ["BTC", row.laneScoreBtc], ["ETH", row.laneScoreEth], ["SOL", row.laneScoreSol]
    ];
    scores.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const topAsset = scores[0][0];
    const topMargin = scores[0][1] - scores[1][1];
    const pairImproving = previous
      ? topAsset === "ETH"
        ? row.ethBtcRatio > previous.ethBtcRatio
        : topAsset === "SOL"
          ? row.solBtcRatio > previous.solBtcRatio && row.solEthRatio > previous.solEthRatio
          : false
      : false;
    return {
      ...row,
      oneScanBtcReturnPct: previous ? pct(row.btcPrice, previous.btcPrice) : null,
      topAsset,
      topMargin,
      altCondition: topAsset !== "BTC" && topMargin > 0 && pairImproving
    };
  });
}

function collectAltRunLengths(segments: SnapshotSegment[]): number[] {
  const lengths: number[] = [];
  for (const segment of segments) {
    let asset: Asset | null = null;
    let length = 0;
    for (const row of deriveFeatures(segment.rows)) {
      if (row.altCondition && row.topAsset === asset) {
        length += 1;
      } else {
        if (length) lengths.push(length);
        asset = row.altCondition ? row.topAsset : null;
        length = row.altCondition ? 1 : 0;
      }
    }
    if (length) lengths.push(length);
  }
  return lengths;
}

function evaluateSegments(segments: SnapshotSegment[], split: SplitName, rules: CandidateRules): EvaluatedSnapshot[] {
  const output: EvaluatedSnapshot[] = [];
  for (const segment of segments) {
    const features = deriveFeatures(segment.rows);
    let altAsset: Asset | null = null;
    let altRun = 0;
    let setupStartedMs: number | null = null;
    let previousState: RotationState | null = null;
    let statePersistence = 0;
    const segmentRows: EvaluatedSnapshot[] = [];

    features.forEach((row, index) => {
      if (row.altCondition && row.topMargin >= rules.altMargin) {
        if (altAsset === row.topAsset) altRun += 1;
        else {
          altAsset = row.topAsset;
          altRun = 1;
          setupStartedMs = row.timestampMs;
        }
      } else {
        altAsset = null;
        altRun = 0;
        setupStartedMs = null;
      }

      let state: RotationState = "NO_CLEAR_ROTATION";
      let candidateAsset: Asset | null = null;
      if (row.oneScanBtcReturnPct !== null && row.oneScanBtcReturnPct <= rules.btcCascadeReturnPct && row.score <= rules.scoreLow) {
        state = "CASCADE_RISK";
        candidateAsset = "BTC";
      } else if (row.oneScanBtcReturnPct !== null && row.oneScanBtcReturnPct >= rules.btcBreakoutReturnPct && row.score >= rules.scoreHigh) {
        state = "MAJOR_BREAKOUT";
        candidateAsset = "BTC";
      } else if (altRun >= rules.altPersistenceScans && altAsset) {
        state = "ALT_ROTATION_CONFIRMED";
        candidateAsset = altAsset;
      } else if (altRun > 0 && altAsset) {
        state = "ROTATION_SETUP";
        candidateAsset = altAsset;
      }

      statePersistence = state === previousState ? statePersistence + 1 : 1;
      previousState = state;
      const leadTimeMinutes = state === "ALT_ROTATION_CONFIRMED" && setupStartedMs !== null
        ? round((row.timestampMs - setupStartedMs) / 60000, 6)
        : null;
      const outcome = forwardOutcome(features, index, candidateAsset ?? "BTC", state);
      segmentRows.push({
        ...row,
        split,
        segmentId: segment.id,
        state,
        statePersistenceScans: statePersistence,
        candidateAsset,
        leadTimeMinutes,
        ...outcome
      });
    });
    output.push(...segmentRows);
  }
  return output;
}

function forwardOutcome(
  rows: FeatureSnapshot[],
  index: number,
  asset: Asset,
  state: RotationState
): Pick<EvaluatedSnapshot, "forwardReturnPct" | "maePct" | "mfePct" | "outcomeSuccess" | "rightCensored"> {
  const future = rows.slice(index + 1, index + FORWARD_HORIZON_SCANS + 1);
  if (future.length < FORWARD_HORIZON_SCANS) {
    return { forwardReturnPct: null, maePct: null, mfePct: null, outcomeSuccess: null, rightCensored: true };
  }
  const initial = assetPrice(rows[index], asset);
  const returns = future.map((row) => pct(assetPrice(row, asset), initial));
  const final = returns.at(-1)!;
  const success = state === "NO_CLEAR_ROTATION"
    ? null
    : state === "CASCADE_RISK"
      ? final < 0
      : final > 0;
  return {
    forwardReturnPct: round(final, 6),
    maePct: round(Math.min(...returns), 6),
    mfePct: round(Math.max(...returns), 6),
    outcomeSuccess: success,
    rightCensored: false
  };
}

function stateMetrics(rows: EvaluatedSnapshot[], split: SplitName): StateMetric[] {
  return ROTATION_STATES.map((state) => {
    const selected = rows.filter((row) => row.state === state);
    const mature = selected.filter((row) => !row.rightCensored);
    const scored = mature.filter((row) => row.outcomeSuccess !== null);
    const successes = scored.filter((row) => row.outcomeSuccess).length;
    const leads = selected.map((row) => row.leadTimeMinutes).filter(isNumber);
    return {
      split,
      state,
      count: selected.length,
      sharePct: round(selected.length / Math.max(1, rows.length) * 100, 4),
      matureOutcomes: mature.length,
      successes,
      successRatePct: scored.length ? round(successes / scored.length * 100, 4) : null,
      falsePositives: scored.length - successes,
      rightCensored: selected.filter((row) => row.rightCensored).length,
      averageForwardReturnPct: average(mature.map((row) => row.forwardReturnPct).filter(isNumber)),
      averageMaePct: average(mature.map((row) => row.maePct).filter(isNumber)),
      averageMfePct: average(mature.map((row) => row.mfePct).filter(isNumber)),
      averageLeadTimeMinutes: average(leads),
      maximumPersistenceScans: selected.length ? Math.max(...selected.map((row) => row.statePersistenceScans)) : 0
    };
  });
}

function transitionMetrics(rows: EvaluatedSnapshot[], split: SplitName): TransitionMetric[] {
  const counts = new Map<string, TransitionMetric>();
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    if (previous.segmentId !== current.segmentId || previous.state === current.state) continue;
    const key = `${previous.state}->${current.state}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { split, from: previous.state, to: current.state, count: 1 });
  }
  return [...counts.values()].sort((a, b) =>
    a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

function sessionMetrics(rows: EvaluatedSnapshot[], split: SplitName): SessionMetric[] {
  const sessions = [...new Set(rows.map((row) => row.sessionWindow))].sort();
  return sessions.map((sessionWindow) => {
    const selected = rows.filter((row) => row.sessionWindow === sessionWindow);
    const candidates = selected.filter((row) => row.state !== "NO_CLEAR_ROTATION");
    const mature = candidates.filter((row) => !row.rightCensored && row.outcomeSuccess !== null);
    const successes = mature.filter((row) => row.outcomeSuccess).length;
    return {
      split,
      sessionWindow,
      count: selected.length,
      candidateCount: candidates.length,
      matureCandidateOutcomes: mature.length,
      candidateSuccessRatePct: mature.length ? round(successes / mature.length * 100, 4) : null
    };
  });
}

function determineVerdict(metrics: StateMetric[]): { verdict: ResearchVerdict; reasons: string[] } {
  const development = metrics.filter((metric) => metric.split === "DEVELOPMENT" && metric.state !== "NO_CLEAR_ROTATION");
  const holdout = metrics.filter((metric) => metric.split === "HOLDOUT" && metric.state !== "NO_CLEAR_ROTATION");
  const devMature = development.reduce((sum, metric) => sum + metric.matureOutcomes, 0);
  const holdoutMature = holdout.reduce((sum, metric) => sum + metric.matureOutcomes, 0);
  const devSuccesses = development.reduce((sum, metric) => sum + metric.successes, 0);
  const holdoutSuccesses = holdout.reduce((sum, metric) => sum + metric.successes, 0);
  const holdoutConfirmed = holdout.find((metric) => metric.state === "ALT_ROTATION_CONFIRMED")?.count ?? 0;
  if (holdoutMature < 10 || holdoutConfirmed < 2) {
    return {
      verdict: "INSUFFICIENT_EVIDENCE",
      reasons: [
        `Untouched holdout has ${holdoutMature} mature candidate outcomes; at least 10 are required.`,
        `Untouched holdout has ${holdoutConfirmed} ALT_ROTATION_CONFIRMED observations; at least 2 are required.`
      ]
    };
  }
  const devRate = devMature ? devSuccesses / devMature : 0;
  const holdoutRate = holdoutSuccesses / holdoutMature;
  if (holdoutRate < 0.35 || Math.abs(devRate - holdoutRate) > 0.25) {
    return {
      verdict: "REJECT_UNSTABLE",
      reasons: [
        `Development candidate success rate is ${round(devRate * 100, 2)}%; untouched holdout is ${round(holdoutRate * 100, 2)}%.`,
        "Holdout behavior fails the provisional stability floor."
      ]
    };
  }
  return {
    verdict: "PROMISING_FOR_FORWARD_SHADOW",
    reasons: [
      `Untouched holdout contains ${holdoutMature} mature candidate outcomes.`,
      `Development and holdout candidate success rates are ${round(devRate * 100, 2)}% and ${round(holdoutRate * 100, 2)}%.`,
      "This verdict permits research-only forward shadow observation, never production activation."
    ]
  };
}

function candidateDefinitions(rules: CandidateRules): Array<{ state: RotationState; definition: string }> {
  return [
    {
      state: "MAJOR_BREAKOUT",
      definition: `BTC one-scan return is at least ${rules.btcBreakoutReturnPct}% and score is at least ${rules.scoreHigh}.`
    },
    {
      state: "ROTATION_SETUP",
      definition: `ETH or SOL leads, its required pair ratio improves, lane margin is at least ${rules.altMargin}, and persistence is below ${rules.altPersistenceScans} scans.`
    },
    {
      state: "ALT_ROTATION_CONFIRMED",
      definition: `The ROTATION_SETUP condition persists for at least ${rules.altPersistenceScans} contiguous scans.`
    },
    {
      state: "NO_CLEAR_ROTATION",
      definition: "No provisional breakout, alt-rotation, or cascade condition is present."
    },
    {
      state: "CASCADE_RISK",
      definition: `BTC one-scan return is at most ${rules.btcCascadeReturnPct}% and score is at most ${rules.scoreLow}.`
    }
  ];
}

function splitSummary(segments: SnapshotSegment[]): { start: string; end: string; rows: number; segmentIds: number[] } {
  return {
    start: segments[0].start,
    end: segments.at(-1)!.end,
    rows: segments.reduce((sum, segment) => sum + segment.rows.length, 0),
    segmentIds: segments.map((segment) => segment.id)
  };
}

function atomicWrite(path: string, contents: string): void {
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, contents, "utf8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

function assetPrice(row: NormalizedSnapshot, asset: Asset): number {
  return asset === "BTC" ? row.btcPrice : asset === "ETH" ? row.ethPrice : row.solPrice;
}

function quantile(values: number[], p: number): number {
  if (!values.length) throw new Error("Cannot calculate quantile of empty values");
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function pct(current: number, previous: number): number {
  return previous === 0 ? 0 : (current / previous - 1) * 100;
}

function average(values: number[]): number | null {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 6) : null;
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function isPositiveNumber(value: number | null): value is number {
  return isNumber(value) && value > 0;
}

function isNegativeNumber(value: number | null): value is number {
  return isNumber(value) && value < 0;
}

function round(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function format(value: number | null): string {
  if (value === null) return "n/a";
  if (value === Number.POSITIVE_INFINITY) return "unavailable";
  if (value === Number.NEGATIVE_INFINITY) return "unavailable";
  return String(value);
}

function csv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

if (require.main === module) {
  try {
    runEvaluator();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
