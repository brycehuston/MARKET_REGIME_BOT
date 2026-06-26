import fs from "node:fs";
import dotenv from "dotenv";
import { loadConfig } from "./config";
import { ensureDirForFile, pctChange, round, writeJsonFile } from "./utils";

dotenv.config();

type WindowLabel = "1D" | "3D" | "7D";
type AssetWinner = "STABLES" | "BTC" | "ETH" | "SOL";

interface WindowSpec {
  label: WindowLabel;
  hours: number;
  toleranceHours: number;
}

interface CoachSnapshot {
  timestamp: string;
  timestampMs: number;
  actionMode: string;
  normalizedActionMode: string;
  score: number | null;
  confidence: string;
  regime: string;
  leader: string;
  defiStatus: string;
  derivativesHeatStatus: string;
  derivativesHeatLabel: string;
  btcPrice: number;
  ethPrice: number;
  solPrice: number;
  ethBtcRatio: number;
  solBtcRatio: number;
  solEthRatio: number;
}

interface LoadSummary {
  snapshotsRead: number;
  validEnrichedSnapshots: number;
  malformedSkipped: number;
  missingRequiredFieldsSkipped: number;
  duplicateTimestampsSkipped: number;
  dateRange: {
    start: string | null;
    end: string | null;
  };
  unknownActionModes: Record<string, number>;
}

interface CoachEvaluation {
  sourceTimestamp: string;
  window: WindowLabel;
  actionMode: string;
  regime: string;
  leader: string;
  score: number | null;
  confidence: string;
  defiStatus: string;
  derivativesHeatStatus: string;
  sessionBucket: string;
  btcReturnPct: number;
  ethReturnPct: number;
  solReturnPct: number;
  avgReturnPct: number;
  ethVsBtcPct: number;
  solVsBtcPct: number;
  solVsEthPct: number;
  bestAsset: AssetWinner;
  worstAsset: AssetWinner;
  useful: boolean;
  usefulnessReason: string;
}

interface BreakdownRow {
  key: string;
  evaluatedCount: number;
  usefulPct: number;
  averageBtcReturn: number;
  averageEthReturn: number;
  averageSolReturn: number;
  mostCommonBestAsset: AssetWinner | "None";
  note?: string;
  insight?: string;
}

interface CoachReport {
  generatedAt: string;
  dataSummary: LoadSummary & {
    maturedEvaluations: Record<WindowLabel, number>;
  };
  overall: {
    totalEvaluated: number;
    usefulCallsPct: number;
    byWindow: Record<WindowLabel, { evaluatedCount: number; usefulPct: number }>;
    smallSampleWarning: string | null;
  };
  byActionMode: BreakdownRow[];
  byRegime: BreakdownRow[];
  byDefiStatus: BreakdownRow[];
  bySessionBucket: BreakdownRow[];
  assetWinners: Record<AssetWinner, number>;
  coachNotes: string[];
  suggestedNextExperiments: string[];
}

const WINDOWS: WindowSpec[] = [
  { label: "1D", hours: 24, toleranceHours: 6 },
  { label: "3D", hours: 72, toleranceHours: 12 },
  { label: "7D", hours: 168, toleranceHours: 24 }
];

const REPORT_JSON = "logs/accuracy_coach_report.json";
const EVALUATIONS_CSV = "logs/accuracy_coach_evaluations.csv";
const SMALL_SAMPLE_WARNING = "Small sample size. Treat this as directional only.";

function main(): void {
  const config = loadConfig();
  const { snapshots, summary } = loadSnapshots(config.paths.snapshotJsonl);
  const evaluations = evaluateSnapshots(snapshots, Date.now());
  const report = buildReport(summary, evaluations);

  writeEvaluationsCsv(EVALUATIONS_CSV, evaluations);
  writeJsonFile(REPORT_JSON, report);
  printReport(report);
}

function loadSnapshots(filePath: string): { snapshots: CoachSnapshot[]; summary: LoadSummary } {
  const summary: LoadSummary = {
    snapshotsRead: 0,
    validEnrichedSnapshots: 0,
    malformedSkipped: 0,
    missingRequiredFieldsSkipped: 0,
    duplicateTimestampsSkipped: 0,
    dateRange: { start: null, end: null },
    unknownActionModes: {}
  };

  if (!fs.existsSync(filePath)) return { snapshots: [], summary };

  const byTimestamp = new Map<string, CoachSnapshot>();
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    summary.snapshotsRead += 1;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const snapshot = normalizeSnapshot(parsed);
      if (!snapshot) {
        summary.missingRequiredFieldsSkipped += 1;
        continue;
      }

      if (byTimestamp.has(snapshot.timestamp)) {
        summary.duplicateTimestampsSkipped += 1;
        continue;
      }

      byTimestamp.set(snapshot.timestamp, snapshot);
      if (snapshot.normalizedActionMode === "UNKNOWN") {
        summary.unknownActionModes[snapshot.actionMode] = (summary.unknownActionModes[snapshot.actionMode] ?? 0) + 1;
      }
    } catch {
      summary.malformedSkipped += 1;
    }
  }

  const snapshots = [...byTimestamp.values()].sort((a, b) => a.timestampMs - b.timestampMs);
  summary.validEnrichedSnapshots = snapshots.length;
  summary.dateRange = {
    start: snapshots[0]?.timestamp ?? null,
    end: snapshots[snapshots.length - 1]?.timestamp ?? null
  };

  return { snapshots, summary };
}

function normalizeSnapshot(raw: Record<string, unknown>): CoachSnapshot | null {
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return null;

  const actionMode = typeof raw.actionMode === "string" && raw.actionMode.trim() ? raw.actionMode.trim() : "";
  if (!actionMode) return null;

  const btcPrice = finiteNumber(raw.btcPrice);
  const ethPrice = finiteNumber(raw.ethPrice);
  const solPrice = finiteNumber(raw.solPrice);
  const ethBtcRatio = finiteNumber(raw.ethBtcRatio);
  const solBtcRatio = finiteNumber(raw.solBtcRatio);
  const solEthRatio = finiteNumber(raw.solEthRatio);

  if (
    btcPrice === null ||
    ethPrice === null ||
    solPrice === null ||
    ethBtcRatio === null ||
    solBtcRatio === null ||
    solEthRatio === null
  ) {
    return null;
  }

  return {
    timestamp,
    timestampMs,
    actionMode,
    normalizedActionMode: normalizeActionMode(actionMode),
    score: finiteNumber(raw.score),
    confidence: stringValue(raw.confidence, "Unknown"),
    regime: stringValue(raw.regime, "Unknown"),
    leader: stringValue(raw.leader, "Unknown"),
    defiStatus: normalizeDefiStatus(raw.defiStatus, raw.defiConfirmation),
    derivativesHeatStatus: stringValue(raw.derivativesHeatStatus, "Unavailable"),
    derivativesHeatLabel: stringValue(raw.derivativesHeatLabel, "Unavailable"),
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio,
    solBtcRatio,
    solEthRatio
  };
}

function evaluateSnapshots(snapshots: CoachSnapshot[], nowMs: number): CoachEvaluation[] {
  const evaluations: CoachEvaluation[] = [];

  for (const source of snapshots) {
    for (const window of WINDOWS) {
      const targetMs = source.timestampMs + window.hours * 60 * 60 * 1000;
      const toleranceMs = window.toleranceHours * 60 * 60 * 1000;
      if (targetMs > nowMs) continue;

      const future = nearestLaterSnapshot(snapshots, targetMs, toleranceMs);
      if (!future || future.timestampMs <= source.timestampMs) continue;

      const evaluation = buildEvaluation(source, future, window.label);
      if (evaluation) evaluations.push(evaluation);
    }
  }

  return evaluations;
}

function nearestLaterSnapshot(snapshots: CoachSnapshot[], targetMs: number, toleranceMs: number): CoachSnapshot | null {
  const latestAllowedMs = targetMs + toleranceMs;
  for (const snapshot of snapshots) {
    if (snapshot.timestampMs >= targetMs && snapshot.timestampMs <= latestAllowedMs) return snapshot;
  }
  return null;
}

function buildEvaluation(source: CoachSnapshot, future: CoachSnapshot, window: WindowLabel): CoachEvaluation | null {
  const btcReturnPct = pctChange(future.btcPrice, source.btcPrice);
  const ethReturnPct = pctChange(future.ethPrice, source.ethPrice);
  const solReturnPct = pctChange(future.solPrice, source.solPrice);
  const ethVsBtcPct = pctChange(future.ethBtcRatio, source.ethBtcRatio);
  const solVsBtcPct = pctChange(future.solBtcRatio, source.solBtcRatio);
  const solVsEthPct = pctChange(future.solEthRatio, source.solEthRatio);

  if (
    btcReturnPct === null ||
    ethReturnPct === null ||
    solReturnPct === null ||
    ethVsBtcPct === null ||
    solVsBtcPct === null ||
    solVsEthPct === null
  ) {
    return null;
  }

  const avgReturnPct = (btcReturnPct + ethReturnPct + solReturnPct) / 3;
  const bestAsset = bestAssetAfterSignal(btcReturnPct, ethReturnPct, solReturnPct);
  const worstAsset = worstAssetAfterSignal(btcReturnPct, ethReturnPct, solReturnPct);
  const usefulness = usefulnessForAction(source.normalizedActionMode, {
    btcReturnPct,
    ethReturnPct,
    solReturnPct,
    avgReturnPct,
    bestAsset
  });

  return {
    sourceTimestamp: source.timestamp,
    window,
    actionMode: source.actionMode,
    regime: source.regime,
    leader: source.leader,
    score: source.score,
    confidence: source.confidence,
    defiStatus: source.defiStatus,
    derivativesHeatStatus: source.derivativesHeatStatus,
    sessionBucket: sessionBucket(source.timestampMs),
    btcReturnPct: round(btcReturnPct, 4),
    ethReturnPct: round(ethReturnPct, 4),
    solReturnPct: round(solReturnPct, 4),
    avgReturnPct: round(avgReturnPct, 4),
    ethVsBtcPct: round(ethVsBtcPct, 4),
    solVsBtcPct: round(solVsBtcPct, 4),
    solVsEthPct: round(solVsEthPct, 4),
    bestAsset,
    worstAsset,
    useful: usefulness.useful,
    usefulnessReason: usefulness.reason
  };
}

function usefulnessForAction(
  normalizedActionMode: string,
  outcome: {
    btcReturnPct: number;
    ethReturnPct: number;
    solReturnPct: number;
    avgReturnPct: number;
    bestAsset: AssetWinner;
  }
): { useful: boolean; reason: string } {
  const returns = [outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct];
  const positiveCount = returns.filter((value) => value > 0).length;
  const negativeCount = returns.filter((value) => value < 0).length;
  const bestCryptoReturn = Math.max(...returns);
  const noClearOutperformer = Math.max(...returns) - Math.min(...returns) < 1.5;
  const weakOrMixed = Math.abs(outcome.avgReturnPct) < 1 || (positiveCount > 0 && negativeCount > 0);
  const riskProxyBad = Math.min(...returns) <= -5;

  if (normalizedActionMode === "STABLES") {
    const useful = outcome.avgReturnPct <= 0 || negativeCount >= 2 || riskProxyBad;
    return {
      useful,
      reason: useful ? "Stable/defensive posture matched weak or negative forward returns." : "Stable/defensive posture missed positive forward returns."
    };
  }

  if (normalizedActionMode === "WAIT") {
    const useful = weakOrMixed || noClearOutperformer || bestCryptoReturn <= 1.5;
    return {
      useful,
      reason: useful ? "Waiting was reasonable because returns were weak, mixed, or leaderless." : "Waiting was too cautious because a cleaner upside leader followed."
    };
  }

  if (normalizedActionMode === "BTC") {
    const useful = (outcome.btcReturnPct > outcome.ethReturnPct && outcome.btcReturnPct > outcome.solReturnPct) || (outcome.bestAsset === "BTC" && outcome.btcReturnPct > 0);
    return {
      useful,
      reason: useful ? "BTC posture worked because BTC led the forward window." : "BTC posture did not work because BTC failed to lead."
    };
  }

  if (normalizedActionMode === "ETH") {
    const useful = outcome.ethReturnPct > outcome.btcReturnPct && (outcome.ethReturnPct > 0 || outcome.ethReturnPct > outcome.avgReturnPct);
    return {
      useful,
      reason: useful ? "ETH posture worked because ETH beat BTC and held up versus the market." : "ETH posture did not work because ETH failed to confirm."
    };
  }

  if (normalizedActionMode === "SOL") {
    const useful = outcome.solReturnPct > outcome.btcReturnPct && outcome.solReturnPct > outcome.ethReturnPct && (outcome.solReturnPct > 0 || outcome.solReturnPct > outcome.avgReturnPct);
    return {
      useful,
      reason: useful ? "SOL posture worked because SOL led the forward window." : "SOL posture did not work because SOL failed to lead."
    };
  }

  if (normalizedActionMode === "RISK_ON") {
    const useful = outcome.avgReturnPct > 0 && positiveCount >= 2;
    return {
      useful,
      reason: useful ? "Risk-on posture matched broad positive forward returns." : "Risk-on posture was too aggressive for the forward window."
    };
  }

  return { useful: false, reason: "Unknown action mode; reported separately and not counted as useful." };
}

function buildReport(summary: LoadSummary, evaluations: CoachEvaluation[]): CoachReport {
  const maturedEvaluations = countByWindow(evaluations);
  const byActionMode = breakdown(evaluations, (evaluation) => evaluation.actionMode);
  const byRegime = breakdown(evaluations, (evaluation) => evaluation.regime).map((row) => ({
    ...row,
    note: row.evaluatedCount < 5 ? "sample size is tiny" : undefined
  }));
  const byDefiStatus = breakdown(evaluations, (evaluation) => evaluation.defiStatus).map((row) => ({
    ...row,
    insight: defiInsight(row, evaluations.filter((evaluation) => evaluation.defiStatus === row.key))
  }));
  const bySessionBucket = breakdown(evaluations, (evaluation) => evaluation.sessionBucket);
  const assetWinners = assetWinnerCounts(evaluations);
  const smallSampleWarning = evaluations.length > 0 && evaluations.length < 20 ? SMALL_SAMPLE_WARNING : null;

  return {
    generatedAt: new Date().toISOString(),
    dataSummary: {
      ...summary,
      maturedEvaluations
    },
    overall: {
      totalEvaluated: evaluations.length,
      usefulCallsPct: usefulPct(evaluations),
      byWindow: {
        "1D": windowOverall(evaluations, "1D"),
        "3D": windowOverall(evaluations, "3D"),
        "7D": windowOverall(evaluations, "7D")
      },
      smallSampleWarning
    },
    byActionMode,
    byRegime,
    byDefiStatus,
    bySessionBucket,
    assetWinners,
    coachNotes: coachNotes(evaluations, byActionMode, byDefiStatus, assetWinners, smallSampleWarning),
    suggestedNextExperiments: suggestedNextExperiments(evaluations)
  };
}

function breakdown(evaluations: CoachEvaluation[], keyFn: (evaluation: CoachEvaluation) => string): BreakdownRow[] {
  return [...groupBy(evaluations, keyFn).entries()]
    .map(([key, group]) => ({
      key,
      evaluatedCount: group.length,
      usefulPct: usefulPct(group),
      averageBtcReturn: averageReturn(group, "btcReturnPct"),
      averageEthReturn: averageReturn(group, "ethReturnPct"),
      averageSolReturn: averageReturn(group, "solReturnPct"),
      mostCommonBestAsset: mostCommonAsset(group)
    }))
    .sort((a, b) => b.evaluatedCount - a.evaluatedCount || b.usefulPct - a.usefulPct || a.key.localeCompare(b.key));
}

function defiInsight(row: BreakdownRow, group: CoachEvaluation[]): string {
  if (row.evaluatedCount < 5) return "sample too small";
  const riskCalls = group.filter((evaluation) => ["BTC", "ETH", "SOL", "RISK_ON"].includes(normalizeActionMode(evaluation.actionMode)));
  const cautionCalls = group.filter((evaluation) => ["STABLES", "WAIT"].includes(normalizeActionMode(evaluation.actionMode)));

  if (row.key === "Strong") {
    if (riskCalls.length > 0 && usefulPct(riskCalls) >= 55) return "DeFi Strong helped risk calls";
    return "DeFi Strong did not confirm price";
  }

  if (row.key === "Weak" && cautionCalls.length > 0 && usefulPct(cautionCalls) >= 55) return "DeFi Weak aligned with caution";
  return "sample too small";
}

function coachNotes(
  evaluations: CoachEvaluation[],
  byActionMode: BreakdownRow[],
  byDefiStatus: BreakdownRow[],
  assetWinners: Record<AssetWinner, number>,
  smallSampleWarning: string | null
): string[] {
  const notes: string[] = [];
  if (evaluations.length === 0) return ["Too early to judge. Keep collecting data."];
  if (smallSampleWarning) notes.push("Sample size is small; do not change score math yet.");

  const riskOffRows = byActionMode.filter((row) => normalizeActionMode(row.key) === "STABLES" || normalizeActionMode(row.key) === "WAIT");
  const riskOnRows = byActionMode.filter((row) => ["BTC", "ETH", "SOL", "RISK_ON"].includes(normalizeActionMode(row.key)));
  if (rowCount(riskOffRows) > 0 && rowCount(riskOnRows) > 0 && weightedUsefulPct(riskOffRows) > weightedUsefulPct(riskOnRows)) notes.push("Risk-off calls are working better than risk-on calls.");

  const strongDefi = byDefiStatus.find((row) => row.key === "Strong");
  if (strongDefi && strongDefi.evaluatedCount >= 5 && strongDefi.usefulPct < 50) notes.push("Stable calls may be too cautious when DeFi is Strong.");

  const defensiveCalls = evaluations.filter((evaluation) => normalizeActionMode(evaluation.actionMode) === "STABLES" || evaluation.regime === "Defensive" || evaluation.regime === "Risk-Off");
  if (defensiveCalls.length > 0 && mostCommonAsset(defensiveCalls) === "SOL") notes.push("SOL has been the most common winner after defensive calls.");

  const btcRows = byActionMode.filter((row) => normalizeActionMode(row.key) === "BTC");
  if (weightedUsefulPct(btcRows) > 0 && weightedUsefulPct(btcRows) < 50) notes.push("BTC watch needs stricter confirmation.");

  const topAsset = Object.entries(assetWinners).sort((a, b) => b[1] - a[1])[0];
  if (topAsset && topAsset[1] > 0) notes.push(`${topAsset[0]} has been the most common best asset after evaluated signals.`);

  if (notes.length === 0) notes.push("Too early to judge. Keep collecting data.");
  return [...new Set(notes)].slice(0, 6);
}

function suggestedNextExperiments(evaluations: CoachEvaluation[]): string[] {
  if (evaluations.length === 0) {
    return ["Do not change production scoring yet.", "Keep collecting enriched snapshots."];
  }

  return [
    "Track whether Defensive + DeFi Strong often precedes recovery.",
    "Review BTC repair threshold.",
    "Track SOL strength during Risk-Off separately.",
    "Do not change production scoring yet."
  ];
}

function printReport(report: CoachReport): void {
  console.log("ALPHA PULSE ACCURACY COACH");
  console.log("");

  console.log("1. Data summary");
  console.log(`- snapshots read: ${report.dataSummary.snapshotsRead}`);
  console.log(`- valid enriched snapshots: ${report.dataSummary.validEnrichedSnapshots}`);
  console.log(`- malformed skipped: ${report.dataSummary.malformedSkipped}`);
  console.log(`- missing required fields skipped: ${report.dataSummary.missingRequiredFieldsSkipped}`);
  console.log(`- matured evaluations: 1D ${report.dataSummary.maturedEvaluations["1D"]} | 3D ${report.dataSummary.maturedEvaluations["3D"]} | 7D ${report.dataSummary.maturedEvaluations["7D"]}`);
  console.log(`- date range: ${report.dataSummary.dateRange.start ?? "n/a"} to ${report.dataSummary.dateRange.end ?? "n/a"}`);
  console.log("");

  if (report.overall.totalEvaluated === 0) {
    console.log("Not enough matured signals yet. Keep collecting scans.");
    console.log("");
    console.log(`Output files: ${REPORT_JSON}, ${EVALUATIONS_CSV}`);
    return;
  }

  if (report.overall.smallSampleWarning) console.log(report.overall.smallSampleWarning);
  console.log("2. Overall usefulness");
  console.log(`- useful calls: ${formatPct(report.overall.usefulCallsPct)}`);
  console.log(`- total evaluated: ${report.overall.totalEvaluated}`);
  for (const window of WINDOWS) {
    const row = report.overall.byWindow[window.label];
    console.log(`- ${window.label}: ${formatPct(row.usefulPct)} (${row.evaluatedCount})`);
  }
  console.log("");

  printBreakdown("3. Best/worst action modes", report.byActionMode);
  printBreakdown("4. Regime breakdown", report.byRegime);
  printBreakdown("5. DeFi breakdown", report.byDefiStatus, true);
  printBreakdown("6. Session/vibe breakdown", report.bySessionBucket);

  console.log("7. Asset winner table");
  for (const asset of ["STABLES", "BTC", "ETH", "SOL"] as AssetWinner[]) {
    console.log(`- ${asset}: ${report.assetWinners[asset]}`);
  }
  console.log("");

  const unknownEntries = Object.entries(report.dataSummary.unknownActionModes);
  if (unknownEntries.length > 0) {
    console.log("Unknown action modes");
    for (const [actionMode, count] of unknownEntries) console.log(`- ${actionMode}: ${count}`);
    console.log("");
  }

  console.log("8. Coach notes");
  for (const note of report.coachNotes) console.log(`- ${note}`);
  console.log("");

  console.log("9. Suggested next experiments");
  for (const experiment of report.suggestedNextExperiments) console.log(`- ${experiment}`);
  console.log("");

  console.log(`Output files: ${REPORT_JSON}, ${EVALUATIONS_CSV}`);
}

function printBreakdown(title: string, rows: BreakdownRow[], includeInsight = false): void {
  console.log(title);
  if (rows.length === 0) {
    console.log("- no evaluated signals");
    console.log("");
    return;
  }

  for (const row of rows) {
    const suffix = row.note ? ` | ${row.note}` : "";
    console.log(
      `- ${row.key}: ${row.evaluatedCount} eval | useful ${formatPct(row.usefulPct)} | BTC ${formatPct(row.averageBtcReturn)} | ETH ${formatPct(row.averageEthReturn)} | SOL ${formatPct(row.averageSolReturn)} | best ${row.mostCommonBestAsset}${suffix}`
    );
    if (includeInsight && row.insight) console.log(`  ${row.insight}`);
  }
  console.log("");
}

function normalizeActionMode(actionMode: string): string {
  const normalized = actionMode.trim().toUpperCase().replace(/\s+/g, " ");
  if (normalized.includes("STABLE") || normalized.includes("RISK-OFF") || normalized.includes("DEFENSIVE")) {
    if (normalized.includes("WAIT") || normalized.includes("MOSTLY") || normalized.includes("NO CLEAN EDGE")) return "WAIT";
    return "STABLES";
  }
  if (normalized.includes("WAIT") || normalized.includes("NO CLEAN EDGE")) return "WAIT";
  if (normalized.includes("BTC")) return "BTC";
  if (normalized.includes("ETH")) return "ETH";
  if (normalized.includes("SOL")) return "SOL";
  if (normalized.includes("RISK-ON") || normalized.includes("RISK ON")) return "RISK_ON";
  return "UNKNOWN";
}

function normalizeDefiStatus(rawStatus: unknown, rawConfirmation: unknown): string {
  if (typeof rawStatus === "string" && rawStatus.trim()) return rawStatus.trim();
  if (rawConfirmation && typeof rawConfirmation === "object" && "status" in rawConfirmation) {
    const status = (rawConfirmation as { status?: unknown }).status;
    if (typeof status === "string" && status.trim()) return status.trim();
  }
  return "Unknown";
}

function bestAssetAfterSignal(btcReturnPct: number, ethReturnPct: number, solReturnPct: number): AssetWinner {
  if (btcReturnPct < 0 && ethReturnPct < 0 && solReturnPct < 0) return "STABLES";
  return highestAsset([
    ["BTC", btcReturnPct],
    ["ETH", ethReturnPct],
    ["SOL", solReturnPct]
  ]);
}

function worstAssetAfterSignal(btcReturnPct: number, ethReturnPct: number, solReturnPct: number): AssetWinner {
  return lowestAsset([
    ["STABLES", 0],
    ["BTC", btcReturnPct],
    ["ETH", ethReturnPct],
    ["SOL", solReturnPct]
  ]);
}

function highestAsset(values: Array<[AssetWinner, number]>): AssetWinner {
  return values.sort((a, b) => b[1] - a[1])[0][0];
}

function lowestAsset(values: Array<[AssetWinner, number]>): AssetWinner {
  return values.sort((a, b) => a[1] - b[1])[0][0];
}

function sessionBucket(timestampMs: number): string {
  const date = new Date(timestampMs);
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return "Weekend";

  const hour = date.getUTCHours();
  if (hour < 7) return "Asia";
  if (hour < 13) return "London";
  if (hour < 16) return "London/NY overlap";
  if (hour < 21) return "New York";
  return "Late/Rollover";
}

function countByWindow(evaluations: CoachEvaluation[]): Record<WindowLabel, number> {
  return {
    "1D": evaluations.filter((evaluation) => evaluation.window === "1D").length,
    "3D": evaluations.filter((evaluation) => evaluation.window === "3D").length,
    "7D": evaluations.filter((evaluation) => evaluation.window === "7D").length
  };
}

function windowOverall(evaluations: CoachEvaluation[], window: WindowLabel): { evaluatedCount: number; usefulPct: number } {
  const group = evaluations.filter((evaluation) => evaluation.window === window);
  return { evaluatedCount: group.length, usefulPct: usefulPct(group) };
}

function assetWinnerCounts(evaluations: CoachEvaluation[]): Record<AssetWinner, number> {
  return {
    STABLES: evaluations.filter((evaluation) => evaluation.bestAsset === "STABLES").length,
    BTC: evaluations.filter((evaluation) => evaluation.bestAsset === "BTC").length,
    ETH: evaluations.filter((evaluation) => evaluation.bestAsset === "ETH").length,
    SOL: evaluations.filter((evaluation) => evaluation.bestAsset === "SOL").length
  };
}

function mostCommonAsset(evaluations: CoachEvaluation[]): AssetWinner | "None" {
  if (evaluations.length === 0) return "None";
  const counts = assetWinnerCounts(evaluations);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as AssetWinner;
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

function usefulPct(evaluations: CoachEvaluation[]): number {
  if (evaluations.length === 0) return 0;
  return round((evaluations.filter((evaluation) => evaluation.useful).length / evaluations.length) * 100, 2);
}

function rowCount(rows: BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + row.evaluatedCount, 0);
}

function weightedUsefulPct(rows: BreakdownRow[]): number {
  const total = rows.reduce((sum, row) => sum + row.evaluatedCount, 0);
  if (total === 0) return 0;
  return rows.reduce((sum, row) => sum + row.usefulPct * row.evaluatedCount, 0) / total;
}

function averageReturn(evaluations: CoachEvaluation[], key: "btcReturnPct" | "ethReturnPct" | "solReturnPct"): number {
  if (evaluations.length === 0) return 0;
  return round(evaluations.reduce((sum, evaluation) => sum + evaluation[key], 0) / evaluations.length, 4);
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function writeEvaluationsCsv(filePath: string, evaluations: CoachEvaluation[]): void {
  ensureDirForFile(filePath);
  const header = [
    "sourceTimestamp",
    "window",
    "actionMode",
    "regime",
    "leader",
    "score",
    "confidence",
    "defiStatus",
    "derivativesHeatStatus",
    "sessionBucket",
    "btcReturnPct",
    "ethReturnPct",
    "solReturnPct",
    "avgReturnPct",
    "ethVsBtcPct",
    "solVsBtcPct",
    "solVsEthPct",
    "bestAsset",
    "worstAsset",
    "useful",
    "usefulnessReason"
  ];

  const rows = evaluations.map((evaluation) => [
    evaluation.sourceTimestamp,
    evaluation.window,
    evaluation.actionMode,
    evaluation.regime,
    evaluation.leader,
    evaluation.score,
    evaluation.confidence,
    evaluation.defiStatus,
    evaluation.derivativesHeatStatus,
    evaluation.sessionBucket,
    evaluation.btcReturnPct,
    evaluation.ethReturnPct,
    evaluation.solReturnPct,
    evaluation.avgReturnPct,
    evaluation.ethVsBtcPct,
    evaluation.solVsBtcPct,
    evaluation.solVsEthPct,
    evaluation.bestAsset,
    evaluation.worstAsset,
    evaluation.useful ? "yes" : "no",
    evaluation.usefulnessReason
  ]);

  fs.writeFileSync(filePath, [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function formatPct(value: number): string {
  return `${round(value, 2)}%`;
}

main();
