import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export const PRELIMINARY_PREFIX = "PRELIMINARY";
export const CANDIDATE_LABEL =
  "Candidate threshold — requires implementation and forward validation.";
export const DEFAULT_INPUTS = [
  "vps_logs/regime_snapshots_post_f75e087.jsonl",
  "logs/regime_snapshots.jsonl",
  "vps_logs/regime_snapshots_vps.jsonl",
] as const;
export const OUTPUT_DIRECTORY = "reports/lane_rotation_forensics";

export type AssetLane = "BTC" | "ETH" | "SOL";
export type Lane = AssetLane | "STABLES" | "NO_CLEAR_LANE";
export type ResearchState =
  | "NO_ROTATION"
  | "WATCH"
  | "TAKEOVER_FORMING"
  | "TAKEOVER_CONFIRMED"
  | "ROTATION_FAILED";
export type AttemptOutcome = "CONFIRMED" | "FAILED" | "UNMATURED";
export type DataReadiness = "COLLECTING" | "EXPLORATORY_READY" | "THRESHOLD_READY";

type NullableNumber = number | null;
type NullableString = string | null;
type JsonObject = Record<string, unknown>;
type LaneScores = Record<"BTC" | "ETH" | "SOL" | "STABLES", NullableNumber>;

export interface NormalizedSnapshot {
  sourceLine: number;
  timestamp: string;
  timestampMs: number;
  score: NullableNumber;
  regime: NullableString;
  leader: NullableString;
  bestLane: NullableString;
  bestLaneLabel: NullableString;
  laneConfidence: NullableString;
  laneScores: LaneScores;
  laneMargin: NullableNumber;
  timeframeRead: NullableString;
  chopState: NullableString;
  marketDataQuality: NullableString;
  marketDataFresh: boolean;
  livePriceFresh: boolean;
  historicalDataFresh: boolean;
  btcPrice: number;
  ethPrice: number;
  solPrice: number;
  ethBtcRatio: NullableNumber;
  solBtcRatio: NullableNumber;
  solEthRatio: NullableNumber;
  returns: Record<AssetLane, Record<"4h" | "12h" | "1d", NullableNumber>>;
  marketMove: {
    wanted: boolean | null;
    sent: boolean | null;
    reason: NullableString;
    previousScore: NullableNumber;
    currentScore: NullableNumber;
    previousMode: NullableString;
    currentMode: NullableString;
    previousConfidence: NullableString;
    currentConfidence: NullableString;
  };
  laneReason: NullableString;
  riskStyle: NullableString;
  ifInAction: NullableString;
  ifFlatAction: NullableString;
  invalidIf: NullableString;
  suppressionNote: NullableString;
  historicalInterval: NullableString;
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
  validRows: NormalizedSnapshot[];
  exclusions: ExclusionCounts;
  oldSchemaCompatibleRows: number;
}

export interface SpacingSummary {
  count: number;
  minMinutes: NullableNumber;
  medianMinutes: NullableNumber;
  p90Minutes: NullableNumber;
  maxMinutes: NullableNumber;
  buckets: Record<"<10" | "10-<20" | "20-<30" | "30-<60" | ">=60", number>;
}

export interface EnrichedScan extends NormalizedSnapshot {
  index: number;
  gapMinutes: NullableNumber;
  continuityBreak: boolean;
  currentLeader: Lane;
  priorLeader: Lane | null;
  challengerLane: Lane | null;
  topLaneScore: number;
  challengerLaneScore: NullableNumber;
  topRunnerUpMargin: NullableNumber;
  rotationMargin: NullableNumber;
  laneScoreDelta: LaneScores;
  challengerAcceleration: NullableNumber;
  leaderDeterioration: NullableNumber;
  leaderPersistenceScans: number;
  challengerPersistenceScans: number;
  scansSinceLeaderChange: number;
  minutesSinceLeaderChange: number;
  pairImprovement: boolean;
  multiWindowSupport: boolean | null;
}

export interface Scenario {
  id: string;
  persistenceScans: 2 | 3 | 4;
  marginLabel: string;
  marginThreshold: number;
}

export interface PreEventEvidence {
  scansBefore: number;
  timestamp: string;
  elapsedMinutes: number;
  futureLeader: Lane;
  challengerRank: number | null;
  challengerScoreDelta: NullableNumber;
  challengerAcceleration: NullableNumber;
  laneMarginVsLeader: NullableNumber;
  ethBtcChangePct: NullableNumber;
  solBtcChangePct: NullableNumber;
  solEthChangePct: NullableNumber;
  relativeReturnDifferences: Record<string, NullableNumber>;
  regime: NullableString;
  chopState: NullableString;
  marketDataQuality: NullableString;
  bestLane: NullableString;
  bestLaneLabel: NullableString;
  botHint: boolean;
  laneReason: NullableString;
}

export interface RotationAttempt {
  scenarioId: string;
  state: ResearchState;
  outcome: AttemptOutcome;
  timestamp: string;
  confirmationTimestamp: NullableString;
  priorLeader: Lane;
  challenger: Lane;
  transition: string;
  persistenceScans: number;
  requiredPersistenceScans: number;
  confirmationMargin: NullableNumber;
  medianRunMargin: NullableNumber;
  durationScans: number;
  durationMinutes: number;
  warningLeadMinutes: NullableNumber;
  regime: NullableString;
  chopState: NullableString;
  botHint: boolean;
  failureReason: NullableString;
  broaderWindowSupport: boolean | null;
  preEventEvidence: PreEventEvidence[];
}

export interface ScenarioResult {
  scenario: Scenario;
  confirmedRotationCount: number;
  failedOrFalsePositiveCount: number;
  averageWarningLeadMinutes: NullableNumber;
  medianWarningLeadMinutes: NullableNumber;
  missedDurableRotations: number;
  rightCensoredCount: number;
  sampleSize: number;
  attempts: RotationAttempt[];
}

interface Run {
  leader: Lane;
  start: number;
  end: number;
  priorLeader: Lane | null;
}

export interface ForensicsResult {
  generatedAt: string;
  preliminaryLabel: string;
  readiness: DataReadiness;
  rowsToThresholdReadiness: number;
  dataset: {
    sourcePath: string;
    rowsRead: number;
    parseableRows: number;
    validRows: number;
    exclusions: ExclusionCounts;
    excludedRows: number;
    oldSchemaCompatibleRows: number;
    dateRange: { start: NullableString; end: NullableString };
    spacing: SpacingSummary;
    continuityBreakMinutes: number;
    schemaCoverage: Record<string, number>;
  };
  leadership: {
    scanCounts: Record<Lane, number>;
    elapsedMinutes: Record<Lane, number>;
    percentages: Record<Lane, number>;
    leaderChangeCount: number;
    transitionCounts: Record<string, number>;
    transitionMatrix: Record<Lane, Record<Lane, number>>;
    oneScanSpikes: number;
    noisyReversals: number;
    scoreDistributions: Record<string, DistributionSummary>;
  };
  marginThresholds: Array<{ label: string; value: number }>;
  scenarios: ScenarioResult[];
  candidateSignals: Array<{ signal: string; observations: number; note: string }>;
  normalizedValidRows: EnrichedScan[];
}

interface DistributionSummary {
  count: number;
  min: NullableNumber;
  p25: NullableNumber;
  median: NullableNumber;
  p75: NullableNumber;
  max: NullableNumber;
}

const LANES: Lane[] = ["BTC", "ETH", "SOL", "STABLES", "NO_CLEAR_LANE"];
const SCORE_LANES: Array<Exclude<Lane, "NO_CLEAR_LANE">> = ["BTC", "ETH", "SOL", "STABLES"];
const ASSET_LANES: AssetLane[] = ["BTC", "ETH", "SOL"];
const EPSILON = 1e-9;

function finiteNumber(value: unknown): NullableNumber {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableString(value: unknown): NullableString {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function average(values: number[]): NullableNumber {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function percentile(values: number[], fraction: number): NullableNumber {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.round((sorted.length - 1) * fraction);
  return sorted[index] ?? null;
}

function distribution(values: Array<number | null>): DistributionSummary {
  const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    count: finite.length,
    min: finite.length ? Math.min(...finite) : null,
    p25: percentile(finite, 0.25),
    median: percentile(finite, 0.5),
    p75: percentile(finite, 0.75),
    max: finite.length ? Math.max(...finite) : null,
  };
}

function pctChange(current: NullableNumber, prior: NullableNumber): NullableNumber {
  if (current === null || prior === null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function rankForLane(scores: LaneScores, lane: Lane): number | null {
  if (lane === "NO_CLEAR_LANE" || scores[lane] === null) return null;
  const ranked = SCORE_LANES.filter((item) => scores[item] !== null).sort(
    (a, b) => (scores[b] as number) - (scores[a] as number),
  );
  return ranked.indexOf(lane) + 1;
}

function emptyLaneCount(): Record<Lane, number> {
  return { BTC: 0, ETH: 0, SOL: 0, STABLES: 0, NO_CLEAR_LANE: 0 };
}

function emptyTransitionMatrix(): Record<Lane, Record<Lane, number>> {
  return Object.fromEntries(LANES.map((from) => [from, emptyLaneCount()])) as Record<
    Lane,
    Record<Lane, number>
  >;
}

export function determineReadiness(validRows: number): DataReadiness {
  if (validRows < 40) return "COLLECTING";
  if (validRows < 100) return "EXPLORATORY_READY";
  return "THRESHOLD_READY";
}

export function preliminaryLabel(validRows: number): string {
  return validRows < 100
    ? `${PRELIMINARY_PREFIX} — ${validRows} valid fresh snapshots only.`
    : `${validRows} valid fresh snapshots; threshold comparison enabled.`;
}

export function resolveInputPath(
  cwd: string,
  explicitInput?: string,
  pathExists: (path: string) => boolean = existsSync,
): string {
  if (explicitInput) {
    const candidate = resolve(cwd, explicitInput);
    if (!pathExists(candidate)) throw new Error(`Input snapshot file does not exist: ${candidate}`);
    if (!candidate.toLowerCase().endsWith(".jsonl")) {
      throw new Error(`Input snapshot file must be JSONL: ${candidate}`);
    }
    return candidate;
  }
  for (const candidate of DEFAULT_INPUTS) {
    const absolute = resolve(cwd, candidate);
    if (pathExists(absolute)) return absolute;
  }
  throw new Error(`No snapshot source found. Checked: ${DEFAULT_INPUTS.join(", ")}`);
}

function normalizeSnapshot(raw: JsonObject, sourceLine: number): NormalizedSnapshot | null {
  const timestamp = nullableString(raw.timestamp);
  const timestampMs = timestamp ? Date.parse(timestamp) : Number.NaN;
  const btcPrice = finiteNumber(raw.btcPrice);
  const ethPrice = finiteNumber(raw.ethPrice);
  const solPrice = finiteNumber(raw.solPrice);
  const laneScoreBtc = finiteNumber(raw.laneScoreBtc);
  const laneScoreEth = finiteNumber(raw.laneScoreEth);
  const laneScoreSol = finiteNumber(raw.laneScoreSol);
  if (
    !timestamp ||
    !Number.isFinite(timestampMs) ||
    btcPrice === null ||
    ethPrice === null ||
    solPrice === null ||
    laneScoreBtc === null ||
    laneScoreEth === null ||
    laneScoreSol === null
  ) {
    return null;
  }
  return {
    sourceLine,
    timestamp,
    timestampMs,
    score: finiteNumber(raw.score),
    regime: nullableString(raw.regime),
    leader: nullableString(raw.leader),
    bestLane: nullableString(raw.bestLane),
    bestLaneLabel: nullableString(raw.bestLaneLabel),
    laneConfidence: nullableString(raw.laneConfidence),
    laneScores: {
      BTC: laneScoreBtc,
      ETH: laneScoreEth,
      SOL: laneScoreSol,
      STABLES: finiteNumber(raw.laneScoreStables),
    },
    laneMargin: finiteNumber(raw.laneMargin),
    timeframeRead: nullableString(raw.timeframeRead),
    chopState: nullableString(raw.chopState),
    marketDataQuality: nullableString(raw.marketDataQuality),
    marketDataFresh: raw.marketDataFresh === true,
    livePriceFresh: raw.livePriceFresh === true,
    historicalDataFresh: raw.historicalDataFresh === true,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: finiteNumber(raw.ethBtcRatio) ?? ethPrice / btcPrice,
    solBtcRatio: finiteNumber(raw.solBtcRatio) ?? solPrice / btcPrice,
    solEthRatio: finiteNumber(raw.solEthRatio) ?? solPrice / ethPrice,
    returns: {
      BTC: { "4h": finiteNumber(raw.retBtc4h), "12h": finiteNumber(raw.retBtc12h), "1d": finiteNumber(raw.retBtc1d) },
      ETH: { "4h": finiteNumber(raw.retEth4h), "12h": finiteNumber(raw.retEth12h), "1d": finiteNumber(raw.retEth1d) },
      SOL: { "4h": finiteNumber(raw.retSol4h), "12h": finiteNumber(raw.retSol12h), "1d": finiteNumber(raw.retSol1d) },
    },
    marketMove: {
      wanted: nullableBoolean(raw.marketMoveWanted),
      sent: nullableBoolean(raw.marketMoveSent),
      reason: nullableString(raw.marketMoveReason),
      previousScore: finiteNumber(raw.previousScore),
      currentScore: finiteNumber(raw.currentScore),
      previousMode: nullableString(raw.previousMode),
      currentMode: nullableString(raw.currentMode),
      previousConfidence: nullableString(raw.previousConfidence),
      currentConfidence: nullableString(raw.currentConfidence),
    },
    laneReason: nullableString(raw.laneReason),
    riskStyle: nullableString(raw.riskStyle),
    ifInAction: nullableString(raw.ifInAction),
    ifFlatAction: nullableString(raw.ifFlatAction),
    invalidIf: nullableString(raw.invalidIf),
    suppressionNote: nullableString(raw.suppressionNote),
    historicalInterval: nullableString(raw.historicalInterval),
  };
}

export function loadSnapshotLines(linesInput: string[], sourcePath = "memory.jsonl"): LoadResult {
  const lines = linesInput.filter((line) => line.trim() !== "");
  const exclusions: ExclusionCounts = { malformed: 0, legacy: 0, staleOrBroken: 0, missingRequired: 0 };
  const validRows: NormalizedSnapshot[] = [];
  let parseableRows = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let raw: JsonObject;
    try {
      const parsed: unknown = JSON.parse(lines[index]);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("not an object");
      raw = parsed as JsonObject;
      parseableRows += 1;
    } catch {
      exclusions.malformed += 1;
      continue;
    }
    const hasFreshSchema =
      typeof raw.marketDataQuality === "string" &&
      typeof raw.marketDataFresh === "boolean" &&
      typeof raw.livePriceFresh === "boolean" &&
      typeof raw.historicalDataFresh === "boolean";
    if (!hasFreshSchema) {
      exclusions.legacy += 1;
      continue;
    }
    const explicitlyFresh =
      raw.marketDataQuality === "FRESH" &&
      raw.marketDataFresh === true &&
      raw.livePriceFresh === true &&
      raw.historicalDataFresh === true;
    if (!explicitlyFresh) {
      exclusions.staleOrBroken += 1;
      continue;
    }
    const normalized = normalizeSnapshot(raw, index + 1);
    if (!normalized) {
      exclusions.missingRequired += 1;
      continue;
    }
    validRows.push(normalized);
  }
  validRows.sort((a, b) => a.timestampMs - b.timestampMs || a.sourceLine - b.sourceLine);
  return {
    sourcePath: resolve(sourcePath),
    rowsRead: lines.length,
    parseableRows,
    validRows,
    exclusions,
    oldSchemaCompatibleRows: exclusions.legacy,
  };
}

export function loadSnapshots(sourcePath: string): LoadResult {
  const contents = readFileSync(sourcePath, "utf8");
  return loadSnapshotLines(contents.split(/\r?\n/), sourcePath);
}

export function calculateSpacing(rows: NormalizedSnapshot[]): SpacingSummary {
  const gaps = rows.slice(1).map((row, index) => (row.timestampMs - rows[index].timestampMs) / 60_000);
  const buckets: SpacingSummary["buckets"] = { "<10": 0, "10-<20": 0, "20-<30": 0, "30-<60": 0, ">=60": 0 };
  for (const gap of gaps) {
    if (gap < 10) buckets["<10"] += 1;
    else if (gap < 20) buckets["10-<20"] += 1;
    else if (gap < 30) buckets["20-<30"] += 1;
    else if (gap < 60) buckets["30-<60"] += 1;
    else buckets[">=60"] += 1;
  }
  return {
    count: gaps.length,
    minMinutes: gaps.length ? Math.min(...gaps) : null,
    medianMinutes: percentile(gaps, 0.5),
    p90Minutes: percentile(gaps, 0.9),
    maxMinutes: gaps.length ? Math.max(...gaps) : null,
    buckets,
  };
}

export function deriveLeader(scores: LaneScores): { leader: Lane; topScore: number; runnerUpScore: number | null; margin: number | null } {
  const ranked = SCORE_LANES.filter((lane) => scores[lane] !== null).sort(
    (a, b) => (scores[b] as number) - (scores[a] as number),
  );
  if (ranked.length === 0) return { leader: "NO_CLEAR_LANE", topScore: Number.NaN, runnerUpScore: null, margin: null };
  const topScore = scores[ranked[0]] as number;
  const runnerUpScore = ranked.length > 1 ? (scores[ranked[1]] as number) : null;
  if (runnerUpScore !== null && Math.abs(topScore - runnerUpScore) <= EPSILON) {
    return { leader: "NO_CLEAR_LANE", topScore, runnerUpScore, margin: 0 };
  }
  return {
    leader: ranked[0],
    topScore,
    runnerUpScore,
    margin: runnerUpScore === null ? null : topScore - runnerUpScore,
  };
}

function strongestOther(scores: LaneScores, incumbent: Lane | null): Lane | null {
  const ranked = SCORE_LANES.filter((lane) => lane !== incumbent && scores[lane] !== null).sort(
    (a, b) => (scores[b] as number) - (scores[a] as number),
  );
  return ranked[0] ?? null;
}

function pairImproved(lane: Lane | null, current: NormalizedSnapshot, prior: NormalizedSnapshot | null): boolean {
  if (!prior || !lane || lane === "STABLES" || lane === "NO_CLEAR_LANE") return false;
  const ethBtc = pctChange(current.ethBtcRatio, prior.ethBtcRatio);
  const solBtc = pctChange(current.solBtcRatio, prior.solBtcRatio);
  const solEth = pctChange(current.solEthRatio, prior.solEthRatio);
  if (lane === "BTC") return ethBtc !== null && ethBtc < 0 && solBtc !== null && solBtc < 0;
  if (lane === "ETH") return ethBtc !== null && ethBtc > 0 && solEth !== null && solEth < 0;
  return solBtc !== null && solBtc > 0 && solEth !== null && solEth > 0;
}

function broaderWindowSupport(lane: Lane | null, row: NormalizedSnapshot): boolean | null {
  if (!lane || lane === "STABLES" || lane === "NO_CLEAR_LANE") return null;
  let available = 0;
  let supported = 0;
  for (const window of ["4h", "12h", "1d"] as const) {
    const challenger = row.returns[lane][window];
    const others = ASSET_LANES.filter((asset) => asset !== lane).map((asset) => row.returns[asset][window]);
    if (challenger === null || others.some((value) => value === null)) continue;
    available += 1;
    if (others.every((value) => challenger > (value as number))) supported += 1;
  }
  return available === 0 ? null : supported === available;
}

export function enrichSnapshots(rows: NormalizedSnapshot[]): { scans: EnrichedScan[]; spacing: SpacingSummary; breakMinutes: number } {
  const spacing = calculateSpacing(rows);
  const breakMinutes = Math.max(30, 2 * (spacing.medianMinutes ?? 15));
  const scans: EnrichedScan[] = [];
  let runStartMs = rows[0]?.timestampMs ?? 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = index > 0 ? rows[index - 1] : null;
    const previousScan = index > 0 ? scans[index - 1] : null;
    const gapMinutes = previous ? (row.timestampMs - previous.timestampMs) / 60_000 : null;
    const continuityBreak = gapMinutes !== null && gapMinutes > breakMinutes;
    const derived = deriveLeader(row.laneScores);
    const priorLeader = !previousScan || continuityBreak ? null : previousScan.currentLeader;
    const challengerLane = strongestOther(row.laneScores, priorLeader ?? derived.leader);
    const laneScoreDelta: LaneScores = { BTC: null, ETH: null, SOL: null, STABLES: null };
    for (const lane of SCORE_LANES) {
      const currentScore = row.laneScores[lane];
      const priorScore = previous?.laneScores[lane] ?? null;
      laneScoreDelta[lane] = currentScore === null || priorScore === null || continuityBreak ? null : currentScore - priorScore;
    }
    const previousDelta =
      previousScan && challengerLane && challengerLane !== "NO_CLEAR_LANE"
        ? previousScan.laneScoreDelta[challengerLane]
        : null;
    const currentDelta = challengerLane && challengerLane !== "NO_CLEAR_LANE" ? laneScoreDelta[challengerLane] : null;
    const challengerAcceleration =
      currentDelta === null || previousDelta === null || continuityBreak ? null : currentDelta - previousDelta;
    const incumbentCurrent = priorLeader && priorLeader !== "NO_CLEAR_LANE" ? row.laneScores[priorLeader] : null;
    const incumbentPrior = priorLeader && priorLeader !== "NO_CLEAR_LANE" && previous ? previous.laneScores[priorLeader] : null;
    const leaderDeterioration =
      incumbentCurrent === null || incumbentPrior === null ? null : Math.max(0, incumbentPrior - incumbentCurrent);
    const challengerScore = challengerLane && challengerLane !== "NO_CLEAR_LANE" ? row.laneScores[challengerLane] : null;
    const rotationMargin = challengerScore === null || incumbentCurrent === null ? null : challengerScore - incumbentCurrent;
    let leaderPersistenceScans = 1;
    if (previousScan && !continuityBreak && previousScan.currentLeader === derived.leader) {
      leaderPersistenceScans = previousScan.leaderPersistenceScans + 1;
    } else {
      runStartMs = row.timestampMs;
    }
    let challengerPersistenceScans = challengerLane ? 1 : 0;
    if (
      previousScan &&
      !continuityBreak &&
      challengerLane &&
      previousScan.challengerLane === challengerLane
    ) {
      challengerPersistenceScans = previousScan.challengerPersistenceScans + 1;
    }
    scans.push({
      ...row,
      index,
      gapMinutes,
      continuityBreak,
      currentLeader: derived.leader,
      priorLeader,
      challengerLane,
      topLaneScore: derived.topScore,
      challengerLaneScore: challengerScore,
      topRunnerUpMargin: derived.margin,
      rotationMargin,
      laneScoreDelta,
      challengerAcceleration,
      leaderDeterioration,
      leaderPersistenceScans,
      challengerPersistenceScans,
      scansSinceLeaderChange: leaderPersistenceScans - 1,
      minutesSinceLeaderChange: (row.timestampMs - runStartMs) / 60_000,
      pairImprovement: pairImproved(challengerLane, row, continuityBreak ? null : previous),
      multiWindowSupport: broaderWindowSupport(challengerLane, row),
    });
  }
  return { scans, spacing, breakMinutes };
}

function buildRuns(scans: EnrichedScan[]): Run[] {
  const runs: Run[] = [];
  for (let index = 0; index < scans.length; index += 1) {
    const scan = scans[index];
    const previousRun = runs[runs.length - 1];
    if (!previousRun || scan.continuityBreak || previousRun.leader !== scan.currentLeader) {
      runs.push({ leader: scan.currentLeader, start: index, end: index, priorLeader: scan.continuityBreak ? null : previousRun?.leader ?? null });
    } else {
      previousRun.end = index;
    }
  }
  return runs;
}

export function botHinted(row: NormalizedSnapshot, lane: Lane): boolean {
  if (lane === "NO_CLEAR_LANE" || lane === "STABLES") return row.bestLane?.toUpperCase() === lane;
  return row.bestLane?.toUpperCase() === lane || row.bestLaneLabel?.toUpperCase().startsWith(lane) === true;
}

function relativeReturnDifferences(row: NormalizedSnapshot, lane: Lane): Record<string, NullableNumber> {
  const output: Record<string, NullableNumber> = {};
  if (lane === "STABLES" || lane === "NO_CLEAR_LANE") return output;
  for (const window of ["4h", "12h", "1d"] as const) {
    for (const other of ASSET_LANES.filter((asset) => asset !== lane)) {
      const left = row.returns[lane][window];
      const right = row.returns[other][window];
      output[`${lane}-${other}-${window}`] = left === null || right === null ? null : left - right;
    }
  }
  return output;
}

export function collectPreEventEvidence(scans: EnrichedScan[], eventIndex: number, futureLeader: Lane): PreEventEvidence[] {
  const evidence: PreEventEvidence[] = [];
  for (let scansBefore = 1; scansBefore <= 4; scansBefore += 1) {
    const index = eventIndex - scansBefore;
    if (index < 0) break;
    const row = scans[index];
    if (scans.slice(index + 1, eventIndex + 1).some((scan) => scan.continuityBreak)) break;
    const previous = index > 0 && !row.continuityBreak ? scans[index - 1] : null;
    const futureScore = futureLeader === "NO_CLEAR_LANE" ? null : row.laneScores[futureLeader];
    const incumbentScore = row.currentLeader === "NO_CLEAR_LANE" ? null : row.laneScores[row.currentLeader];
    evidence.push({
      scansBefore,
      timestamp: row.timestamp,
      elapsedMinutes: (scans[eventIndex].timestampMs - row.timestampMs) / 60_000,
      futureLeader,
      challengerRank: rankForLane(row.laneScores, futureLeader),
      challengerScoreDelta: futureLeader === "NO_CLEAR_LANE" ? null : row.laneScoreDelta[futureLeader],
      challengerAcceleration:
        futureLeader !== "NO_CLEAR_LANE" && previous
          ? row.laneScoreDelta[futureLeader] === null || previous.laneScoreDelta[futureLeader] === null
            ? null
            : (row.laneScoreDelta[futureLeader] as number) - (previous.laneScoreDelta[futureLeader] as number)
          : null,
      laneMarginVsLeader:
        futureScore === null || incumbentScore === null ? null : futureScore - incumbentScore,
      ethBtcChangePct: pctChange(row.ethBtcRatio, previous?.ethBtcRatio ?? null),
      solBtcChangePct: pctChange(row.solBtcRatio, previous?.solBtcRatio ?? null),
      solEthChangePct: pctChange(row.solEthRatio, previous?.solEthRatio ?? null),
      relativeReturnDifferences: relativeReturnDifferences(row, futureLeader),
      regime: row.regime,
      chopState: row.chopState,
      marketDataQuality: row.marketDataQuality,
      bestLane: row.bestLane,
      bestLaneLabel: row.bestLaneLabel,
      botHint: botHinted(row, futureLeader),
      laneReason: row.laneReason,
    });
  }
  return evidence;
}

export function buildMarginThresholds(scans: EnrichedScan[]): Array<{ label: string; value: number }> {
  const margins = scans
    .map((scan) => scan.topRunnerUpMargin)
    .filter((value): value is number => value !== null && value > 0);
  const candidates: Array<{ label: string; value: number }> = [];
  for (const [label, fraction] of [["P25", 0.25], ["P50", 0.5], ["P75", 0.75]] as const) {
    const value = percentile(margins, fraction);
    if (value !== null) candidates.push({ label, value: round(value, 2) });
  }
  const seen = new Set<number>();
  return candidates.filter((item) => (seen.has(item.value) ? false : (seen.add(item.value), true)));
}

function medianRunMargin(scans: EnrichedScan[], start: number, end: number): NullableNumber {
  const values = scans.slice(start, end + 1).map((scan) => scan.topRunnerUpMargin).filter((value): value is number => value !== null);
  return percentile(values, 0.5);
}

function findWatchStart(scans: EnrichedScan[], runStart: number, challenger: Lane): number {
  let earliest = runStart;
  for (let index = runStart - 1; index >= Math.max(0, runStart - 4); index -= 1) {
    const row = scans[index];
    if (scans[index + 1]?.continuityBreak) break;
    const delta = challenger === "NO_CLEAR_LANE" ? null : row.laneScoreDelta[challenger];
    const priorLeader = row.currentLeader;
    const prior = index > 0 ? scans[index - 1] : null;
    const incumbentNow = priorLeader === "NO_CLEAR_LANE" ? null : row.laneScores[priorLeader];
    const incumbentBefore = prior && priorLeader !== "NO_CLEAR_LANE" ? prior.laneScores[priorLeader] : null;
    const deterioration = incumbentNow === null || incumbentBefore === null ? 0 : incumbentBefore - incumbentNow;
    if ((delta !== null && delta > 0) || deterioration > 0 || pairImproved(challenger, row, prior)) earliest = index;
    else break;
  }
  return earliest;
}

function isWatchEvidence(scan: EnrichedScan): boolean {
  if (!scan.challengerLane || scan.challengerLane === "NO_CLEAR_LANE") return false;
  const delta = scan.laneScoreDelta[scan.challengerLane];
  return (delta !== null && delta > 0) || (scan.leaderDeterioration ?? 0) > 0 || scan.pairImprovement;
}

function addNonTakeoverWatchAttempts(
  scans: EnrichedScan[],
  scenario: Scenario,
  attempts: RotationAttempt[],
): void {
  for (let index = 1; index < scans.length; index += 1) {
    const scan = scans[index];
    if (scan.continuityBreak || !isWatchEvidence(scan) || !scan.challengerLane || scan.challengerLane === "NO_CLEAR_LANE") continue;
    const previous = scans[index - 1];
    if (
      !previous.continuityBreak &&
      previous.currentLeader === scan.currentLeader &&
      previous.challengerLane === scan.challengerLane &&
      isWatchEvidence(previous)
    ) {
      continue;
    }
    const observationEnd = Math.min(scans.length - 1, index + 4);
    let uninterruptedEnd = observationEnd;
    for (let future = index + 1; future <= observationEnd; future += 1) {
      if (scans[future].continuityBreak) {
        uninterruptedEnd = future - 1;
        break;
      }
    }
    const takeover = scans
      .slice(index, uninterruptedEnd + 1)
      .some((future) => future.currentLeader === scan.challengerLane);
    if (takeover) continue;
    const hasFourFutureScans = uninterruptedEnd - index >= 4;
    const outcome: AttemptOutcome = hasFourFutureScans ? "FAILED" : "UNMATURED";
    const state: ResearchState = hasFourFutureScans ? "ROTATION_FAILED" : "WATCH";
    const context = scans.slice(index, uninterruptedEnd + 1);
    const repeatedChop = context.filter((row) => row.chopState?.toLowerCase().includes("chop") === true).length >= 2;
    const broaderAbsent = context.every((row) => row.multiWindowSupport === false);
    const failureReason =
      outcome === "UNMATURED"
        ? "End of dataset or continuity break before the WATCH could mature"
        : repeatedChop
          ? "Challenger improved but never cleared the margin during chop"
          : broaderAbsent
            ? "Challenger improved but never cleared the margin and broader timeframe support was absent"
            : "Challenger improved but never cleared a meaningful margin within four scans";
    attempts.push({
      scenarioId: scenario.id,
      state,
      outcome,
      timestamp: scan.timestamp,
      confirmationTimestamp: null,
      priorLeader: scan.currentLeader,
      challenger: scan.challengerLane,
      transition: `${scan.currentLeader}->${scan.challengerLane}`,
      persistenceScans: scan.challengerPersistenceScans,
      requiredPersistenceScans: scenario.persistenceScans,
      confirmationMargin: scan.rotationMargin,
      medianRunMargin: medianRunMargin(scans, index, uninterruptedEnd),
      durationScans: uninterruptedEnd - index + 1,
      durationMinutes: (scans[uninterruptedEnd].timestampMs - scan.timestampMs) / 60_000,
      warningLeadMinutes: null,
      regime: scan.regime,
      chopState: scan.chopState,
      botHint: botHinted(scan, scan.challengerLane),
      failureReason,
      broaderWindowSupport: scan.multiWindowSupport,
      preEventEvidence: collectPreEventEvidence(scans, index, scan.challengerLane),
    });
  }
}

function detectScenario(scans: EnrichedScan[], scenario: Scenario): ScenarioResult {
  const runs = buildRuns(scans);
  const attempts: RotationAttempt[] = [];
  for (let runIndex = 1; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex];
    if (!run.priorLeader || run.leader === run.priorLeader) continue;
    const runLength = run.end - run.start + 1;
    const confirmIndex = run.start + scenario.persistenceScans - 1;
    const hasPersistence = confirmIndex <= run.end;
    const confirmationMargin = hasPersistence ? scans[confirmIndex].topRunnerUpMargin : null;
    const firstWindowEnd = Math.min(run.end, confirmIndex);
    const runMedian = medianRunMargin(scans, run.start, firstWindowEnd);
    const meetsMargin =
      confirmationMargin !== null &&
      confirmationMargin >= scenario.marginThreshold &&
      runMedian !== null &&
      runMedian >= scenario.marginThreshold;
    const watchStart = findWatchStart(scans, run.start, run.leader);
    const reachesDatasetEnd = run.end === scans.length - 1;
    const maturedAfterConfirmation = hasPersistence && run.end - confirmIndex >= 4;
    const nextLeader = runs[runIndex + 1]?.leader ?? null;
    let state: ResearchState;
    let outcome: AttemptOutcome;
    let failureReason: string | null = null;
    if (hasPersistence && meetsMargin) {
      state = "TAKEOVER_CONFIRMED";
      if (reachesDatasetEnd && !maturedAfterConfirmation) outcome = "UNMATURED";
      else if (!maturedAfterConfirmation && nextLeader !== null) {
        outcome = "FAILED";
        failureReason = "Confirmed leader reversed within four contiguous scans";
      } else outcome = "CONFIRMED";
    } else if (reachesDatasetEnd) {
      state = hasPersistence || (scans[run.start].topRunnerUpMargin ?? 0) >= scenario.marginThreshold ? "TAKEOVER_FORMING" : "WATCH";
      outcome = "UNMATURED";
      failureReason = "End of dataset before the attempt could mature";
    } else {
      state = "ROTATION_FAILED";
      outcome = "FAILED";
      if (runLength === 1) failureReason = "Challenger held rank 1 for one scan only";
      else if (!hasPersistence) failureReason = `Challenger reversed before ${scenario.persistenceScans}-scan persistence`;
      else if (!meetsMargin) failureReason = "Challenger did not clear the scenario margin with persistent support";
      else if (scans.slice(run.start, run.end + 1).every((scan) => scan.multiWindowSupport === false)) {
        failureReason = "Broader timeframe support was absent";
      } else failureReason = "Leadership did not persist";
    }
    const eventIndex = hasPersistence && meetsMargin ? confirmIndex : run.start;
    const warningLeadMinutes = (scans[eventIndex].timestampMs - scans[watchStart].timestampMs) / 60_000;
    attempts.push({
      scenarioId: scenario.id,
      state,
      outcome,
      timestamp: scans[run.start].timestamp,
      confirmationTimestamp: hasPersistence && meetsMargin ? scans[confirmIndex].timestamp : null,
      priorLeader: run.priorLeader,
      challenger: run.leader,
      transition: `${run.priorLeader}->${run.leader}`,
      persistenceScans: runLength,
      requiredPersistenceScans: scenario.persistenceScans,
      confirmationMargin,
      medianRunMargin: runMedian,
      durationScans: runLength,
      durationMinutes: (scans[run.end].timestampMs - scans[run.start].timestampMs) / 60_000,
      warningLeadMinutes,
      regime: scans[eventIndex].regime,
      chopState: scans[eventIndex].chopState,
      botHint: botHinted(scans[watchStart], run.leader),
      failureReason,
      broaderWindowSupport: scans[eventIndex].multiWindowSupport,
      preEventEvidence: collectPreEventEvidence(scans, eventIndex, run.leader),
    });
  }
  addNonTakeoverWatchAttempts(scans, scenario, attempts);
  attempts.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.transition.localeCompare(b.transition));
  const confirmed = attempts.filter((attempt) => attempt.outcome === "CONFIRMED");
  const failed = attempts.filter((attempt) => attempt.outcome === "FAILED");
  const censored = attempts.filter((attempt) => attempt.outcome === "UNMATURED");
  const leads = confirmed.map((attempt) => attempt.warningLeadMinutes).filter((value): value is number => value !== null);
  const durableRuns = runs.filter((run) => run.priorLeader !== null && run.end - run.start + 1 >= 4).length;
  return {
    scenario,
    confirmedRotationCount: confirmed.length,
    failedOrFalsePositiveCount: failed.length,
    averageWarningLeadMinutes: average(leads),
    medianWarningLeadMinutes: percentile(leads, 0.5),
    missedDurableRotations: Math.max(0, durableRuns - confirmed.length),
    rightCensoredCount: censored.length,
    sampleSize: attempts.length,
    attempts,
  };
}

function countNoisyReversals(runs: Run[]): number {
  let count = 0;
  for (let index = 2; index < runs.length; index += 1) {
    if (runs[index - 2].leader === runs[index].leader && runs[index - 1].end - runs[index - 1].start + 1 <= 4) count += 1;
  }
  return count;
}

function schemaCoverage(rows: NormalizedSnapshot[]): Record<string, number> {
  const fields: Record<string, (row: NormalizedSnapshot) => boolean> = {
    score: (row) => row.score !== null,
    bestLane: (row) => row.bestLane !== null,
    bestLaneLabel: (row) => row.bestLaneLabel !== null,
    laneConfidence: (row) => row.laneConfidence !== null,
    laneScoreStables: (row) => row.laneScores.STABLES !== null,
    timeframeRead: (row) => row.timeframeRead !== null,
    chopState: (row) => row.chopState !== null,
    ratios: (row) => row.ethBtcRatio !== null && row.solBtcRatio !== null && row.solEthRatio !== null,
    returns4h: (row) => ASSET_LANES.every((asset) => row.returns[asset]["4h"] !== null),
    returns12h: (row) => ASSET_LANES.every((asset) => row.returns[asset]["12h"] !== null),
    returns1d: (row) => ASSET_LANES.every((asset) => row.returns[asset]["1d"] !== null),
    marketMove: (row) => row.marketMove.wanted !== null,
    laneReason: (row) => row.laneReason !== null,
  };
  return Object.fromEntries(Object.entries(fields).map(([name, predicate]) => [name, rows.filter(predicate).length]));
}

function leadershipSummary(scans: EnrichedScan[]) {
  const scanCounts = emptyLaneCount();
  const elapsedMinutes = Object.fromEntries(LANES.map((lane) => [lane, 0])) as Record<Lane, number>;
  const transitionCounts: Record<string, number> = {};
  const transitionMatrix = emptyTransitionMatrix();
  for (let index = 0; index < scans.length; index += 1) {
    const scan = scans[index];
    scanCounts[scan.currentLeader] += 1;
    if (index < scans.length - 1 && !scans[index + 1].continuityBreak) {
      elapsedMinutes[scan.currentLeader] += Math.max(0, (scans[index + 1].timestampMs - scan.timestampMs) / 60_000);
    }
    if (scan.priorLeader && scan.priorLeader !== scan.currentLeader) {
      const key = `${scan.priorLeader}->${scan.currentLeader}`;
      transitionCounts[key] = (transitionCounts[key] ?? 0) + 1;
      transitionMatrix[scan.priorLeader][scan.currentLeader] += 1;
    }
  }
  const runs = buildRuns(scans);
  const percentages = Object.fromEntries(
    LANES.map((lane) => [lane, scans.length === 0 ? 0 : round((scanCounts[lane] / scans.length) * 100, 2)]),
  ) as Record<Lane, number>;
  return {
    scanCounts,
    elapsedMinutes: Object.fromEntries(LANES.map((lane) => [lane, round(elapsedMinutes[lane], 2)])) as Record<Lane, number>,
    percentages,
    leaderChangeCount: Object.values(transitionCounts).reduce((sum, count) => sum + count, 0),
    transitionCounts,
    transitionMatrix,
    oneScanSpikes: runs.filter((run) => run.priorLeader !== null && run.end === run.start).length,
    noisyReversals: countNoisyReversals(runs),
    scoreDistributions: {
      BTC: distribution(scans.map((scan) => scan.laneScores.BTC)),
      ETH: distribution(scans.map((scan) => scan.laneScores.ETH)),
      SOL: distribution(scans.map((scan) => scan.laneScores.SOL)),
      STABLES: distribution(scans.map((scan) => scan.laneScores.STABLES)),
      topRunnerUpMargin: distribution(scans.map((scan) => scan.topRunnerUpMargin)),
    },
  };
}

function candidateSignalSummary(scans: EnrichedScan[], scenarios: ScenarioResult[]) {
  const attempts = scenarios[0]?.attempts ?? [];
  const eventEvidence = attempts.flatMap((attempt) => attempt.preEventEvidence);
  return [
    { signal: "Challenger lane-score acceleration", observations: eventEvidence.filter((row) => (row.challengerAcceleration ?? 0) > 0).length, note: "Positive acceleration before a labeled attempt." },
    { signal: "Relative-pair improvement", observations: scans.filter((scan) => scan.pairImprovement).length, note: "Asset-specific pair direction improved using only data available at that scan." },
    { signal: "Multi-window support", observations: scans.filter((scan) => scan.multiWindowSupport === true).length, note: "Challenger beat both peers in at least one available return window." },
    { signal: "Leader deterioration", observations: scans.filter((scan) => (scan.leaderDeterioration ?? 0) > 0).length, note: "Incumbent lane score declined scan over scan." },
    { signal: "Production Best Lane hint", observations: attempts.filter((attempt) => attempt.botHint).length, note: "Existing Best Lane matched the eventual challenger at warning time." },
  ].sort((a, b) => b.observations - a.observations);
}

export function analyze(load: LoadResult, generatedAt = new Date().toISOString()): ForensicsResult {
  const { scans, spacing, breakMinutes } = enrichSnapshots(load.validRows);
  const marginThresholds = buildMarginThresholds(scans);
  const scenarios = ([2, 3, 4] as const).flatMap((persistenceScans) =>
    marginThresholds.map(({ label, value }) => ({
      id: `${persistenceScans}-scans-${label}`,
      persistenceScans,
      marginLabel: label,
      marginThreshold: value,
    })),
  );
  const scenarioResults = scenarios.map((scenario) => detectScenario(scans, scenario));
  const excludedRows = Object.values(load.exclusions).reduce((sum, count) => sum + count, 0);
  return {
    generatedAt,
    preliminaryLabel: preliminaryLabel(scans.length),
    readiness: determineReadiness(scans.length),
    rowsToThresholdReadiness: Math.max(0, 100 - scans.length),
    dataset: {
      sourcePath: load.sourcePath,
      rowsRead: load.rowsRead,
      parseableRows: load.parseableRows,
      validRows: scans.length,
      exclusions: load.exclusions,
      excludedRows,
      oldSchemaCompatibleRows: load.oldSchemaCompatibleRows,
      dateRange: { start: scans[0]?.timestamp ?? null, end: scans.at(-1)?.timestamp ?? null },
      spacing,
      continuityBreakMinutes: breakMinutes,
      schemaCoverage: schemaCoverage(load.validRows),
    },
    leadership: leadershipSummary(scans),
    marginThresholds,
    scenarios: scenarioResults,
    candidateSignals: candidateSignalSummary(scans, scenarioResults),
    normalizedValidRows: scans,
  };
}

function fmt(value: number | null, digits = 2): string {
  return value === null || !Number.isFinite(value) ? "n/a" : round(value, digits).toString();
}

function markdownTable(headers: string[], rows: string[][]): string {
  const sanitize = (value: string) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.map(sanitize).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(sanitize).join(" | ")} |`),
  ].join("\n");
}

function renderTelegramSection(): string {
  return `## Recommended Telegram Rotation Format

These premium, report-only format recommendations do not alter runtime Telegram code. Rotation is hidden when no meaningful challenger exists and never exposes raw lane scores or forensic terminology.

### A. No Meaningful Rotation

\`\`\`text
━━━━━━━━━━━━━━━━━━━━━━
•  ALPHA ❤️‍🔥 PULSE  •
━━━━━━━━━━━━━━━━━━━━━━

Mode: Defensive 🛡️
Confidence: Caution

🎯 Plan: Mostly Stables
├─ Best Lane: BTC
├─ If In: Trail, Don't Chase
└─ If Flat: Wait

🌊 Activity: Weak
├─ Session: Weekend Late • Liquidity Thinning
└─ Invalid If: BTC Loses Structure

📊 Score: 36/100
└─ Next Scan: 22:15 UTC (~15m)
\`\`\`

### B. Early Challenger

\`\`\`text
🎯 Plan: Mostly Stables
├─ Best Lane: BTC
├─ Rotation: ETH Gaining • Early
├─ If In: Trail, Don't Chase
└─ If Flat: Wait For Confirmation
\`\`\`

### C. Takeover Forming

\`\`\`text
🎯 Plan: ETH Takeover Forming
├─ Best Lane: ETH
├─ Rotation: Building • 2 Scans
├─ If In: Hold And Trail
└─ If Flat: Scout On Confirmation
\`\`\`

### D. Confirmed Takeover

\`\`\`text
🎯 Plan: ETH Leading
├─ Best Lane: ETH
├─ Rotation: Confirmed
├─ If In: Hold And Trail
└─ If Flat: Enter Only On Confirmation
\`\`\`

BTC, ETH, and SOL substitute generically in every asset position. Keep the centered Alpha Pulse header, current footer, required rows, and at most one extra visible row. Keep Context Only compact and hide it when empty.

### Plain-Language UX Review

${markdownTable(
  ["Avoid", "Prefer", "Reason"],
  [
    ["BTC Only", "BTC Leading", "Does not imply every other lane is invalid."],
    ["Wait For Cleaner Lane", "Wait", "Shorter and immediately actionable when no rotation exists."],
    ["Positive challenger acceleration", "ETH Gaining", "Moves diagnostic language into snapshots and reports."],
    ["Persistence threshold met", "Rotation: Confirmed", "States the conclusion without exposing scoring mechanics."],
    ["NO_CLEAR_LANE", "No Clean Lane", "Uses plain title-case language."],
  ],
)}

### Matching Market Move Layout

Market Move remains branch-free: one conclusion, one action set, and one invalidation.

\`\`\`text
━━━━━━━━━━━━━━━━━━━━━━━
• 🔎 MARKET MOVE 🔍 •
━━━━━━━━━━━━━━━━━━━━━━━

Alert: ETH Lane Takeover 🚨
Confidence: Confirmed

Plan: ETH Leading
Best Lane: ETH
Previous Leader: BTC
Rotation: Confirmed • 3 Scans

🧠 Read:
ETH Is Outperforming BTC And SOL.
Leadership Has Persisted Across Scans.

If In: Hold And Trail
If Flat: Enter Only On Confirmation
Invalid If: ETH/BTC Fades
\`\`\`

Use the same layout for BTC and SOL. Hide Rotation when state is NO_ROTATION and avoid repeating the same fact in Mode, Plan, Best Lane, and Read.`;
}

export function renderMarkdown(result: ForensicsResult): string {
  const { dataset, leadership } = result;
  const transitionRows = Object.entries(leadership.transitionCounts);
  const successful = result.scenarios.flatMap((scenario) => scenario.attempts).filter((attempt) => attempt.outcome === "CONFIRMED");
  const failed = result.scenarios.flatMap((scenario) => scenario.attempts).filter((attempt) => attempt.outcome === "FAILED");
  const uniqueSuccessful = successful.filter((attempt, index, rows) => rows.findIndex((row) => row.timestamp === attempt.timestamp && row.transition === attempt.transition) === index);
  const uniqueFailed = failed.filter((attempt, index, rows) => rows.findIndex((row) => row.timestamp === attempt.timestamp && row.transition === attempt.transition) === index);
  const successfulDetails = uniqueSuccessful.map((event) => {
    const evidenceRows = event.preEventEvidence.map((row) => [
      String(row.scansBefore),
      fmt(row.elapsedMinutes),
      row.timestamp,
      row.challengerRank === null ? "n/a" : String(row.challengerRank),
      fmt(row.challengerScoreDelta),
      fmt(row.challengerAcceleration),
      fmt(row.laneMarginVsLeader),
      `${fmt(row.ethBtcChangePct)} / ${fmt(row.solBtcChangePct)} / ${fmt(row.solEthChangePct)}`,
      Object.entries(row.relativeReturnDifferences).map(([name, value]) => `${name}:${fmt(value)}`).join("; ") || "n/a",
      row.regime ?? "n/a",
      row.chopState ?? "n/a",
      row.marketDataQuality ?? "n/a",
      `${row.bestLane ?? "n/a"} / ${row.bestLaneLabel ?? "n/a"}`,
      row.botHint ? "yes" : "no",
      row.laneReason ?? "n/a",
    ]);
    return `### ${event.transition} — ${event.confirmationTimestamp ?? event.timestamp}

- Prior leader: ${event.priorLeader}; new leader: ${event.challenger}
- Required persistence: ${event.requiredPersistenceScans} scans; observed run: ${event.persistenceScans} scans
- Confirmation margin: ${fmt(event.confirmationMargin)}; median formation margin: ${fmt(event.medianRunMargin)}
- Warning lead: ${fmt(event.warningLeadMinutes)} actual minutes

${evidenceRows.length === 0 ? "No earlier contiguous valid scans were available." : markdownTable(
      ["Scans Before", "Actual Lead Min", "Timestamp", "Rank", "Score Δ", "Acceleration", "Margin Vs Leader", "ETH/BTC % / SOL/BTC % / SOL/ETH %", "Relative Returns", "Regime", "Chop", "Freshness", "Production Best Lane", "Bot Hint", "Lane Reason"],
      evidenceRows,
    )}`;
  }).join("\n\n");
  const rowsToReady = result.rowsToThresholdReadiness;
  const scenarioRows = result.scenarios.map((scenario) => [
    scenario.scenario.id,
    fmt(scenario.scenario.marginThreshold),
    String(scenario.confirmedRotationCount),
    String(scenario.failedOrFalsePositiveCount),
    fmt(scenario.averageWarningLeadMinutes),
    fmt(scenario.medianWarningLeadMinutes),
    String(scenario.missedDurableRotations),
    String(scenario.rightCensoredCount),
    String(scenario.sampleSize),
  ]);
  return `# Lane Rotation Forensics V1

> **${result.preliminaryLabel}**

This is a read-only research report. It does not change production score math, lane math, triggers, providers, Telegram runtime formatting, or trading behavior.

## Dataset Summary

- Input path: \`${dataset.sourcePath}\`
- Rows read: ${dataset.rowsRead}
- Parseable rows: ${dataset.parseableRows}
- Valid explicit-fresh evidence rows: ${dataset.validRows}
- Excluded rows: ${dataset.excludedRows}
  - Legacy schema: ${dataset.exclusions.legacy}
  - Stale, frozen, provider-error, or explicit freshness failure: ${dataset.exclusions.staleOrBroken}
  - Missing timestamp, required prices, or BTC/ETH/SOL lane scores: ${dataset.exclusions.missingRequired}
  - Malformed JSON: ${dataset.exclusions.malformed}
- Older snapshots remained parse-compatible and were safely excluded: ${dataset.oldSchemaCompatibleRows}
- Valid date range: ${dataset.dateRange.start ?? "n/a"} to ${dataset.dateRange.end ?? "n/a"}
- Readiness: **${result.readiness}**; ${rowsToReady} more valid fresh rows required for the 100-row comparison gate.
- Continuity break: gaps over ${fmt(dataset.continuityBreakMinutes)} minutes.

### Scan Spacing

Min ${fmt(dataset.spacing.minMinutes)}m, median ${fmt(dataset.spacing.medianMinutes)}m, P90 ${fmt(dataset.spacing.p90Minutes)}m, max ${fmt(dataset.spacing.maxMinutes)}m.

${markdownTable(["<10m", "10–<20m", "20–<30m", "30–<60m", "≥60m"], [[
    String(dataset.spacing.buckets["<10"]),
    String(dataset.spacing.buckets["10-<20"]),
    String(dataset.spacing.buckets["20-<30"]),
    String(dataset.spacing.buckets["30-<60"]),
    String(dataset.spacing.buckets[">=60"]),
  ]])}

### Fresh-Schema Coverage

${markdownTable(["Field group", "Rows present", "Valid-row coverage"], Object.entries(dataset.schemaCoverage).map(([field, count]) => [field, String(count), `${fmt((count / Math.max(1, dataset.validRows)) * 100)}%`]))}

## Leadership Summary

${markdownTable(["Leader", "Scans", "Share", "Elapsed minutes"], LANES.map((lane) => [lane, String(leadership.scanCounts[lane]), `${leadership.percentages[lane]}%`, fmt(leadership.elapsedMinutes[lane])]))}

- Raw leader changes: ${leadership.leaderChangeCount}
- One-scan rank-1 spikes: ${leadership.oneScanSpikes}
- A→B→A noisy reversals within four scans: ${leadership.noisyReversals}

### Transition Counts

${transitionRows.length ? markdownTable(["Transition", "Count"], transitionRows.map(([transition, count]) => [transition, String(count)])) : "No raw leader changes were observed."}

### Transition Matrix

${markdownTable(["From \\ To", ...LANES], LANES.map((from) => [from, ...LANES.map((to) => String(leadership.transitionMatrix[from][to]))]))}

### Lane-Score Distributions

${markdownTable(["Series", "N", "Min", "P25", "Median", "P75", "Max"], Object.entries(leadership.scoreDistributions).map(([name, stats]) => [name, String(stats.count), fmt(stats.min), fmt(stats.p25), fmt(stats.median), fmt(stats.p75), fmt(stats.max)]))}

## Successful Rotations

${uniqueSuccessful.length === 0 ? `No mature confirmed rotations were found. **${result.preliminaryLabel}**` : successfulDetails}

For each confirmed event, the JSON report retains the preceding one through four valid scans with actual elapsed minutes, challenger rank/acceleration, lane margin, pair changes, relative returns, regime, chop, freshness, production Best Lane hint, and verbatim lane reason. No future field is used as an entry-time feature.

## Failed Rotations

${uniqueFailed.length === 0 ? "No mature failed attempts were found." : uniqueFailed.map((event) => `- ${event.timestamp} — ${event.transition}; ${event.durationScans} scan(s), ${fmt(event.durationMinutes)}m; ${event.failureReason ?? "leadership did not persist"}; regime ${event.regime ?? "n/a"}, chop ${event.chopState ?? "n/a"}.`).join("\n")}

Failed labels include one-scan spikes, reversals within one to four contiguous scans, insufficient margin, repeated flips in chop, and absent available broader-window support. Attempts at the dataset boundary are UNMATURED rather than forced into success or failure.

## Candidate Early-Warning Signals

${markdownTable(["Rank", "Signal", "Observed rows/events", "Interpretation"], result.candidateSignals.map((signal, index) => [String(index + 1), signal.signal, String(signal.observations), signal.note]))}

These are descriptive counts, not evidence of profitability or a production-ready ordering.

## Threshold Comparison

Observed positive top-versus-runner-up margin candidates: ${result.marginThresholds.map((item) => `${item.label}=${item.value}`).join(", ")}.

${markdownTable(["Scenario", "Margin", "Confirmed", "Failed / false positive", "Avg lead min", "Median lead min", "Missed durable", "Right-censored", "Sample"], scenarioRows)}

Because fewer than 100 valid fresh rows are available, no scenario is selected or called production-ready. The comparison table activates automatically with additional data, but historical fit still requires forward validation.

## Recommended V1 Detector Design

- WATCH: a real non-incumbent challenger has positive lane-score delta, incumbent deterioration, or asset-specific pair improvement. **${CANDIDATE_LABEL}**
- TAKEOVER_FORMING: the challenger reaches rank 1 and clears an observed-distribution margin, but has not completed the required contiguous persistence. **${CANDIDATE_LABEL}**
- TAKEOVER_CONFIRMED: rank 1 persists for a tested 2-, 3-, or 4-scan window and both confirmation and median run margins clear the same candidate threshold. **${CANDIDATE_LABEL}**
- ROTATION_FAILED: a WATCH/forming/confirmed attempt reverses within one to four contiguous scans, spikes once, never clears margin, repeatedly flips in chop, or lacks available broader-window support. **${CANDIDATE_LABEL}**
- NO_ROTATION: no qualifying real challenger evidence exists. **${CANDIDATE_LABEL}**

No numeric scenario is recommended at ${dataset.validRows} valid rows. Re-run at 100+ rows and compare false positives, confirmed rotations, warning lead time, missed durable rotations, and right-censoring before choosing an implementation candidate.

## Limitations

- Only ${dataset.validRows} explicit-fresh snapshots are eligible; the historical legacy period is excluded from rotation thresholds.
- The valid period is short and may not cover diverse regimes or enough successful transfers.
- Schema changes reduce comparable sample history.
- The return windows are snapshot-proxy timeframes, not reconstructed exchange candles.
- Unavailable intrabar structure cannot be inferred.
- Future observations label historical outcomes only; they are not entry-time features.
- This report makes no profitability claim and does not validate an execution strategy.

${renderTelegramSection()}

## Phase 2

Implement Generic BTC/ETH/SOL Lane Rotation Detector V1.

- Add rotation state fields, snapshot logging, and console logging.
- Add Accuracy Coach report-only evaluation.
- Integrate compact Alpha Pulse and branch-free Market Move formatting.
- Make no core score-math change initially.
- Add no live-trading behavior.
- Defer production implementation until more data and forward validation are available.

Phase 2: **Implement Generic BTC/ETH/SOL Lane Rotation Detector V1**`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "number" ? String(round(value, 6)) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function renderCsv(result: ForensicsResult): string {
  const headers = [
    "scenarioId", "timestamp", "confirmationTimestamp", "transition", "priorLeader", "challenger", "state", "outcome",
    "persistenceScans", "requiredPersistenceScans", "confirmationMargin", "medianRunMargin", "durationScans", "durationMinutes",
    "warningLeadMinutes", "regime", "chopState", "botHint", "broaderWindowSupport", "failureReason",
  ];
  const attempts = result.scenarios.flatMap((scenario) => scenario.attempts);
  return [headers.join(","), ...attempts.map((attempt) => headers.map((header) => csvEscape(attempt[header as keyof RotationAttempt])).join(","))].join("\n") + "\n";
}

function serializableResult(result: ForensicsResult): Omit<ForensicsResult, "normalizedValidRows"> & { normalizedValidRows: EnrichedScan[] } {
  return result;
}

function ensureApprovedOutputDirectory(cwd: string): string {
  const approved = resolve(cwd, OUTPUT_DIRECTORY);
  const reportsRoot = resolve(cwd, "reports");
  const relativePath = relative(reportsRoot, approved);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) throw new Error("Forensic output escaped the approved reports directory");
  return approved;
}

function atomicWrite(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, contents, "utf8");
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) rmSync(temporary);
  }
}

export function writeReports(result: ForensicsResult, cwd: string): string[] {
  const outputDirectory = ensureApprovedOutputDirectory(cwd);
  const paths = [
    resolve(outputDirectory, "lane_rotation_forensics_report.md"),
    resolve(outputDirectory, "lane_rotation_forensics_summary.json"),
    resolve(outputDirectory, "lane_rotation_events.csv"),
  ];
  for (const path of paths) {
    if (dirname(path) !== outputDirectory) throw new Error(`Refusing unapproved output path: ${path}`);
  }
  atomicWrite(paths[0], `${renderMarkdown(result)}\n`);
  atomicWrite(paths[1], `${JSON.stringify(serializableResult(result), null, 2)}\n`);
  atomicWrite(paths[2], renderCsv(result));
  return paths;
}

export function parseCliArgs(args: string[]): { input?: string } {
  let input: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--input") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--input requires a JSONL path");
      input = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}. Only --input <jsonl> is supported; output is fixed.`);
    }
  }
  return { input };
}

export function runLaneRotationForensics(cwd = process.cwd(), args = process.argv.slice(2)): ForensicsResult {
  const { input } = parseCliArgs(args);
  const sourcePath = resolveInputPath(cwd, input);
  const load = loadSnapshots(sourcePath);
  const result = analyze(load);
  const paths = writeReports(result, cwd);
  console.log(`Lane rotation forensics: ${result.preliminaryLabel}`);
  console.log(`Source: ${relative(cwd, sourcePath) || basename(sourcePath)}`);
  console.log(`Rows: ${result.dataset.rowsRead} read, ${result.dataset.validRows} valid, ${result.dataset.excludedRows} excluded`);
  console.log(`Exclusions: ${JSON.stringify(result.dataset.exclusions)}`);
  console.log(`Readiness: ${result.readiness} (${result.rowsToThresholdReadiness} rows to 100)`);
  console.log(`Transitions: ${JSON.stringify(result.leadership.transitionCounts)}`);
  console.log(`Reports: ${paths.map((path) => relative(cwd, path)).join(", ")}`);
  return result;
}

if (require.main === module) {
  try {
    runLaneRotationForensics();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
