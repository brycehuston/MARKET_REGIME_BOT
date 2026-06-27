import fs from "node:fs";
import dotenv from "dotenv";
import { loadConfig } from "./config";
import { getActionGuidance } from "./telegram";
import { DefiConfirmationStatus, RegimeName, RegimeScoreResult } from "./types";
import { ensureDirForFile, pctChange, round } from "./utils";

dotenv.config();

type HorizonLabel = "1D" | "3D" | "7D";

interface Horizon {
  label: HorizonLabel;
  hours: number;
  toleranceHours: number;
}

interface AccuracySnapshot {
  timestamp: string;
  timestampMs: number;
  score: number | null;
  regime: string;
  leader: string;
  actionMode: string;
  confidence: string;
  regimeConfidence: string;
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

interface AccuracyResult {
  sourceTimestamp: string;
  horizon: HorizonLabel;
  futureTimestamp: string;
  actionMode: string;
  regime: string;
  leader: string;
  score: number | null;
  confidence: string;
  regimeConfidence: string;
  defiStatus: string;
  derivativesHeatStatus: string;
  derivativesHeatLabel: string;
  btcReturnPct: number;
  ethReturnPct: number;
  solReturnPct: number;
  ethVsBtcPct: number;
  solVsBtcPct: number;
  solVsEthPct: number;
  averageReturnPct: number;
  verdict: string;
  correct: boolean;
}

const HORIZONS: Horizon[] = [
  { label: "1D", hours: 24, toleranceHours: 6 },
  { label: "3D", hours: 72, toleranceHours: 12 },
  { label: "7D", hours: 168, toleranceHours: 24 }
];

const RESULT_CSV = "logs/accuracy_results.csv";

function main(): void {
  const config = loadConfig();
  const snapshots = loadSnapshots(config.paths.snapshotJsonl);
  const results = evaluateSnapshots(snapshots, Date.now());

  writeResultsCsv(RESULT_CSV, results);

  if (results.length === 0) {
    console.log("Not enough matured signals yet.");
    console.log("Keep collecting scans.");
    return;
  }

  printSummary(results);
}

function loadSnapshots(filePath: string): AccuracySnapshot[] {
  if (!fs.existsSync(filePath)) return [];

  const snapshots: AccuracySnapshot[] = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const snapshot = normalizeSnapshot(parsed);
      if (snapshot) snapshots.push(snapshot);
    } catch {
      continue;
    }
  }

  return snapshots.sort((a, b) => a.timestampMs - b.timestampMs);
}

function normalizeSnapshot(raw: Record<string, unknown>): AccuracySnapshot | null {
  const timestamp = typeof raw.timestamp === "string" ? raw.timestamp : "";
  const timestampMs = new Date(timestamp).getTime();
  if (!Number.isFinite(timestampMs)) return null;

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

  const score = finiteNumber(raw.score);
  const regime = typeof raw.regime === "string" ? raw.regime : "Unknown";
  const leader = typeof raw.leader === "string" ? raw.leader : "Unknown";
  const actionMode =
    typeof raw.actionMode === "string"
      ? raw.actionMode
      : inferActionMode(raw, score, regime, leader);

  return {
    timestamp,
    timestampMs,
    score,
    regime,
    leader,
    actionMode,
    confidence: typeof raw.confidence === "string" ? raw.confidence : "Unknown",
    regimeConfidence: typeof raw.regimeConfidence === "string" ? raw.regimeConfidence : "Unknown",
    defiStatus: normalizeDefiStatus(raw.defiStatus, raw.defiConfirmation),
    derivativesHeatStatus: typeof raw.derivativesHeatStatus === "string" ? raw.derivativesHeatStatus : "Unavailable",
    derivativesHeatLabel: typeof raw.derivativesHeatLabel === "string" ? raw.derivativesHeatLabel : "Unavailable ?",
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio,
    solBtcRatio,
    solEthRatio
  };
}

function inferActionMode(raw: Record<string, unknown>, score: number | null, regime: string, leader: string): string {
  if (score === null) return "Unknown";
  try {
    return getActionGuidance({
      ...(raw as unknown as RegimeScoreResult),
      score,
      regime: regime as RegimeName,
      leader: leader as RegimeScoreResult["leader"],
      components: Array.isArray(raw.components) ? (raw.components as RegimeScoreResult["components"]) : [],
      defiConfirmation: raw.defiConfirmation as RegimeScoreResult["defiConfirmation"]
    }).action;
  } catch {
    return "Unknown";
  }
}

function normalizeDefiStatus(rawStatus: unknown, rawConfirmation: unknown): DefiConfirmationStatus | "Unknown" {
  if (isDefiStatus(rawStatus)) return rawStatus;
  if (rawConfirmation && typeof rawConfirmation === "object" && "status" in rawConfirmation) {
    const status = (rawConfirmation as { status?: unknown }).status;
    if (isDefiStatus(status)) return status;
  }
  return "Unknown";
}

function isDefiStatus(value: unknown): value is DefiConfirmationStatus {
  return value === "Strong" || value === "Mixed" || value === "Weak" || value === "Unavailable";
}

function evaluateSnapshots(snapshots: AccuracySnapshot[], nowMs: number): AccuracyResult[] {
  const results: AccuracyResult[] = [];

  for (const source of snapshots) {
    for (const horizon of HORIZONS) {
      const targetMs = source.timestampMs + horizon.hours * 60 * 60 * 1000;
      const toleranceMs = horizon.toleranceHours * 60 * 60 * 1000;
      if (targetMs > nowMs) continue;

      const future = nearestLaterSnapshot(snapshots, targetMs, toleranceMs);
      if (!future || future.timestampMs <= source.timestampMs) continue;

      const result = buildAccuracyResult(source, future, horizon.label);
      if (result) results.push(result);
    }
  }

  return results;
}

function nearestLaterSnapshot(snapshots: AccuracySnapshot[], targetMs: number, toleranceMs: number): AccuracySnapshot | null {
  const latestAllowedMs = targetMs + toleranceMs;

  for (const snapshot of snapshots) {
    if (snapshot.timestampMs >= targetMs && snapshot.timestampMs <= latestAllowedMs) {
      return snapshot;
    }
  }

  return null;
}

function buildAccuracyResult(source: AccuracySnapshot, future: AccuracySnapshot, horizon: HorizonLabel): AccuracyResult | null {
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

  const averageReturnPct = (btcReturnPct + ethReturnPct + solReturnPct) / 3;
  const verdict = verdictForAction(source.actionMode, {
    btcReturnPct,
    ethReturnPct,
    solReturnPct,
    ethVsBtcPct,
    solVsBtcPct,
    solVsEthPct,
    averageReturnPct,
    leader: source.leader
  });

  return {
    sourceTimestamp: source.timestamp,
    horizon,
    futureTimestamp: future.timestamp,
    actionMode: source.actionMode,
    regime: source.regime,
    leader: source.leader,
    score: source.score,
    confidence: source.confidence,
    regimeConfidence: source.regimeConfidence,
    defiStatus: source.defiStatus,
    derivativesHeatStatus: source.derivativesHeatStatus,
    derivativesHeatLabel: source.derivativesHeatLabel,
    btcReturnPct: round(btcReturnPct, 4),
    ethReturnPct: round(ethReturnPct, 4),
    solReturnPct: round(solReturnPct, 4),
    ethVsBtcPct: round(ethVsBtcPct, 4),
    solVsBtcPct: round(solVsBtcPct, 4),
    solVsEthPct: round(solVsEthPct, 4),
    averageReturnPct: round(averageReturnPct, 4),
    verdict: verdict.reason,
    correct: verdict.correct
  };
}

function verdictForAction(
  actionMode: string,
  outcome: {
    btcReturnPct: number;
    ethReturnPct: number;
    solReturnPct: number;
    ethVsBtcPct: number;
    solVsBtcPct: number;
    solVsEthPct: number;
    averageReturnPct: number;
    leader: string;
  }
): { correct: boolean; reason: string } {
  const weakOrMixed = isWeakOrMixed(outcome);
  const noClearLeader = Math.max(outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct) -
    Math.min(outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct) < 1.5;
  const marketCollapse = outcome.averageReturnPct <= -3;
  const riskPoor = outcome.averageReturnPct < 0 || Math.min(outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct) <= -5;
  const btcBest = outcome.btcReturnPct >= outcome.ethReturnPct && outcome.btcReturnPct >= outcome.solReturnPct;
  const ethBest = outcome.ethReturnPct >= outcome.btcReturnPct && outcome.ethReturnPct >= outcome.solReturnPct;
  const solBest = outcome.solReturnPct >= outcome.btcReturnPct && outcome.solReturnPct >= outcome.ethReturnPct;
  const leaderConfirmed =
    (outcome.leader === "BTC-led" && btcBest) ||
    (outcome.leader === "ETH-led" && ethBest && outcome.ethVsBtcPct > 0) ||
    (outcome.leader === "SOL-led" && solBest && outcome.solVsBtcPct > 0 && outcome.solVsEthPct > 0) ||
    (outcome.leader !== "BTC-led" && outcome.leader !== "ETH-led" && outcome.leader !== "SOL-led");

  if (actionMode === "STAY IN STABLES") {
    return { correct: riskPoor, reason: riskPoor ? "Correct: average return was negative or downside risk was poor." : "Incorrect: market returns were not defensive." };
  }

  if (actionMode === "WAIT / MOSTLY STABLES") {
    return { correct: weakOrMixed, reason: weakOrMixed ? "Correct: returns were weak, mixed, or leaderless." : "Incorrect: a cleaner upside leader followed." };
  }

  if (actionMode === "NO CLEAN EDGE") {
    return { correct: noClearLeader, reason: noClearLeader ? "Correct: no asset clearly outperformed." : "Incorrect: one asset clearly outperformed." };
  }

  if (actionMode === "BTC WATCH" || actionMode === "BTC FOCUS") {
    const correct = btcBest || (outcome.btcReturnPct > 0 && outcome.btcReturnPct >= outcome.averageReturnPct);
    return { correct, reason: correct ? "Correct: BTC outperformed or had the best risk-adjusted result." : "Incorrect: BTC was not the best lane." };
  }

  if (actionMode === "ETH WATCH" || actionMode === "ETH ROTATION") {
    const correct = outcome.ethVsBtcPct > 0 && !marketCollapse;
    return { correct, reason: correct ? "Correct: ETH outperformed BTC without a market collapse." : "Incorrect: ETH did not beat BTC or the market collapsed." };
  }

  if (actionMode === "SOL ROTATION") {
    const correct = outcome.solVsBtcPct > 0 && outcome.solVsEthPct > 0;
    return { correct, reason: correct ? "Correct: SOL outperformed BTC and ETH." : "Incorrect: SOL did not outperform both BTC and ETH." };
  }

  if (actionMode === "SELECTIVE RISK-ON") {
    const correct = outcome.averageReturnPct > 0 && leaderConfirmed;
    return { correct, reason: correct ? "Correct: average return was positive and leader confirmed." : "Incorrect: risk-on return or leader confirmation failed." };
  }

  return { correct: false, reason: "Unknown action mode; cannot score as correct." };
}

function isWeakOrMixed(outcome: { btcReturnPct: number; ethReturnPct: number; solReturnPct: number; averageReturnPct: number }): boolean {
  const positives = [outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct].filter((value) => value > 1).length;
  const negatives = [outcome.btcReturnPct, outcome.ethReturnPct, outcome.solReturnPct].filter((value) => value < -1).length;
  return Math.abs(outcome.averageReturnPct) < 1 || (positives > 0 && negatives > 0);
}

function writeResultsCsv(filePath: string, results: AccuracyResult[]): void {
  ensureDirForFile(filePath);
  const header = [
    "source_timestamp",
    "horizon",
    "future_timestamp",
    "action_mode",
    "regime",
    "leader",
    "score",
    "confidence",
    "regime_confidence",
    "defi_status",
    "derivatives_heat_status",
    "derivatives_heat_label",
    "btc_return_pct",
    "eth_return_pct",
    "sol_return_pct",
    "eth_vs_btc_pct",
    "sol_vs_btc_pct",
    "sol_vs_eth_pct",
    "average_return_pct",
    "correct",
    "verdict"
  ];
  const rows = results.map((result) => [
    result.sourceTimestamp,
    result.horizon,
    result.futureTimestamp,
    result.actionMode,
    result.regime,
    result.leader,
    result.score,
    result.confidence,
    result.regimeConfidence,
    result.defiStatus,
    result.derivativesHeatStatus,
    result.derivativesHeatLabel,
    result.btcReturnPct,
    result.ethReturnPct,
    result.solReturnPct,
    result.ethVsBtcPct,
    result.solVsBtcPct,
    result.solVsEthPct,
    result.averageReturnPct,
    result.correct ? "yes" : "no",
    result.verdict
  ]);

  fs.writeFileSync(filePath, [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n", "utf8");
}

function printSummary(results: AccuracyResult[]): void {
  console.log(`Total evaluated signals: ${results.length}`);
  console.log("");
  printAccuracyGroup("Accuracy by action mode", results, (result) => result.actionMode);
  printAccuracyGroup("Accuracy by regime", results, (result) => result.regime);
  printAccuracyGroup("Accuracy by regime confidence", results, (result) => result.regimeConfidence);
  printAccuracyGroup("Accuracy by DeFi confirmation status", results, (result) => result.defiStatus);
  printAverageReturns(results);
  printBestWorstActionMode(results);
}

function printAccuracyGroup(title: string, results: AccuracyResult[], keyFn: (result: AccuracyResult) => string): void {
  console.log(`${title}:`);
  const groups = groupBy(results, keyFn);
  for (const [key, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const correct = group.filter((result) => result.correct).length;
    console.log(`- ${key}: ${formatPct((correct / group.length) * 100)} (${correct}/${group.length})`);
  }
  console.log("");
}

function printAverageReturns(results: AccuracyResult[]): void {
  console.log("Average BTC/ETH/SOL return:");
  for (const horizon of HORIZONS) {
    const group = results.filter((result) => result.horizon === horizon.label);
    if (group.length === 0) {
      console.log(`- ${horizon.label}: no evaluated signals`);
      continue;
    }

    console.log(
      `- ${horizon.label}: BTC ${formatPct(average(group.map((result) => result.btcReturnPct)))} | ETH ${formatPct(
        average(group.map((result) => result.ethReturnPct))
      )} | SOL ${formatPct(average(group.map((result) => result.solReturnPct)))}`
    );
  }
  console.log("");
}

function printBestWorstActionMode(results: AccuracyResult[]): void {
  const groups = [...groupBy(results, (result) => result.actionMode).entries()].filter(([, group]) => group.length > 0);
  const ranked = groups
    .map(([actionMode, group]) => ({
      actionMode,
      accuracyPct: (group.filter((result) => result.correct).length / group.length) * 100,
      count: group.length
    }))
    .sort((a, b) => b.accuracyPct - a.accuracyPct || b.count - a.count || a.actionMode.localeCompare(b.actionMode));

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  console.log(`Best-performing action mode: ${best.actionMode} (${formatPct(best.accuracyPct)}, ${best.count} evaluated)`);
  console.log(`Worst-performing action mode: ${worst.actionMode} (${formatPct(worst.accuracyPct)}, ${worst.count} evaluated)`);
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function average(values: number[]): number {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function formatPct(value: number): string {
  return `${round(value, 2)}%`;
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

main();
