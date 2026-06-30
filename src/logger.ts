import { AccuracySnapshotFields, AlertDecision, BotConfig, DerivativesHeatAssetSnapshot, DerivativesHeatSnapshot, GlobalHistoryPoint, MarketMoveAuditFields, RegimeScoreResult, SavedState } from "./types";
import { appendCsvRow, appendLine, nowIso, readJsonFile, writeJsonFile } from "./utils";

export function createDefaultState(): SavedState {
  return {
    version: "1.0.0",
    lastRunAt: null,
    lastAlertAt: null,
    lastHeartbeatAt: null,
    lastAlertReason: null,
    lastScore: null,
    lastRegime: null,
    lastLeader: null,
    globalHistory: [],
    currentResult: null
  };
}

export function loadState(config: BotConfig): SavedState {
  const rawState = readJsonFile<Partial<SavedState>>(config.paths.stateFile, createDefaultState());
  return {
    ...createDefaultState(),
    ...rawState,
    lastHeartbeatAt: rawState.lastHeartbeatAt ?? null,
    globalHistory: rawState.globalHistory ?? [],
    currentResult: rawState.currentResult ?? null
  };
}

export function saveState(config: BotConfig, state: SavedState): void {
  writeJsonFile(config.paths.stateFile, state);
}

export function updateStateAfterRun(
  state: SavedState,
  result: RegimeScoreResult,
  alertDecision: AlertDecision,
  heartbeatSent: boolean
): SavedState {
  const cleanedHistory = dedupeAndSortGlobalHistory(state.globalHistory ?? []);
  const nextHistoryPoint: GlobalHistoryPoint = {
    timestamp: result.global.timestamp,
    totalMarketCapUsd: result.global.totalMarketCapUsd,
    btcDominancePct: result.global.btcDominancePct,
    stablecoinDominancePct: result.global.stablecoinDominancePct
  };

  // Important hardening fix:
  // CoinGecko global data can be cached and return the same timestamp across multiple scans.
  // Cached duplicate timestamps must NOT count as new dominance history.
  const updatedHistory = appendOnlyIfNewerGlobalHistory(cleanedHistory, nextHistoryPoint).slice(-500);

  return {
    ...state,
    lastRunAt: nowIso(),
    lastAlertAt: alertDecision.shouldSend ? nowIso() : state.lastAlertAt,
    lastHeartbeatAt: heartbeatSent ? nowIso() : state.lastHeartbeatAt,
    lastAlertReason: alertDecision.shouldSend ? alertDecision.reason : state.lastAlertReason,
    lastScore: result.score,
    lastRegime: result.regime,
    lastLeader: result.leader,
    globalHistory: updatedHistory,
    currentResult: result
  };
}

function appendOnlyIfNewerGlobalHistory(history: GlobalHistoryPoint[], incoming: GlobalHistoryPoint): GlobalHistoryPoint[] {
  const incomingMs = parseTimestampMs(incoming.timestamp);
  if (incomingMs === null) return history;

  const last = history[history.length - 1] ?? null;
  const lastMs = last ? parseTimestampMs(last.timestamp) : null;

  if (lastMs !== null && incomingMs <= lastMs) {
    return history;
  }

  return [...history, incoming];
}

function dedupeAndSortGlobalHistory(history: GlobalHistoryPoint[]): GlobalHistoryPoint[] {
  const byTimestamp = new Map<string, GlobalHistoryPoint>();

  for (const point of history) {
    if (parseTimestampMs(point.timestamp) === null) continue;
    byTimestamp.set(point.timestamp, point);
  }

  return [...byTimestamp.values()]
    .sort((a, b) => (parseTimestampMs(a.timestamp) ?? 0) - (parseTimestampMs(b.timestamp) ?? 0))
    .slice(-500);
}

function parseTimestampMs(timestamp: string | null | undefined): number | null {
  if (!timestamp) return null;
  const ms = new Date(timestamp).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function logScore(config: BotConfig, result: RegimeScoreResult): void {
  const getScore = (name: string): number => result.components.find((component) => component.name === name)?.score ?? 0;

  appendCsvRow(
    config.paths.scoreCsv,
    [
      "timestamp",
      "timeframe",
      "score",
      "regime",
      "leader",
      "meme_condition",
      "research_bias",
      "btc_trend_score",
      "total_market_score",
      "btc_dominance_score",
      "stablecoin_dominance_score",
      "eth_btc_score",
      "sol_btc_score",
      "sol_eth_score",
      "volume_score",
      "btc_dominance_pct",
      "stablecoin_dominance_pct",
      "total_market_cap_usd",
      "global_source"
    ],
    [
      result.timestamp,
      result.timeframe,
      result.score,
      result.regime,
      result.leader,
      result.memeCondition,
      result.researchBias,
      getScore("BTC trend / structure"),
      getScore("Total crypto market trend"),
      getScore("BTC dominance behavior"),
      getScore("Stablecoin dominance"),
      getScore("ETH/BTC relative strength"),
      getScore("SOL/BTC relative strength"),
      getScore("SOL/ETH relative strength"),
      getScore("Volume confirmation"),
      result.global.btcDominancePct,
      result.global.stablecoinDominancePct,
      result.global.totalMarketCapUsd,
      result.global.rawSource
    ]
  );
}


export function logDerivativesHeat(config: BotConfig, snapshot: DerivativesHeatSnapshot): void {
  appendLine(config.paths.derivativesHeatJsonl, JSON.stringify(snapshot));

  const btc = heatAsset(snapshot, "BTC");
  const eth = heatAsset(snapshot, "ETH");
  const sol = heatAsset(snapshot, "SOL");

  appendCsvRow(
    config.paths.derivativesHeatCsv,
    [
      "timestamp",
      "provider",
      "status",
      "publicLabel",
      "summary",
      ...heatCsvHeader("btc"),
      ...heatCsvHeader("eth"),
      ...heatCsvHeader("sol"),
      "errorCount",
      "warningCount"
    ],
    [
      snapshot.timestamp,
      snapshot.provider,
      snapshot.status,
      snapshot.publicLabel,
      snapshot.summary,
      ...heatCsvRow(btc),
      ...heatCsvRow(eth),
      ...heatCsvRow(sol),
      snapshot.errors.length,
      snapshot.warnings.length
    ]
  );
}

function heatAsset(snapshot: DerivativesHeatSnapshot, asset: string): DerivativesHeatAssetSnapshot | null {
  return snapshot.assets.find((item) => item.asset.toUpperCase() === asset) ?? null;
}

function heatCsvHeader(prefix: string): string[] {
  return [
    prefix + "HeatLabel",
    prefix + "OpenInterestCurrent",
    prefix + "OpenInterestChange4hPct",
    prefix + "OpenInterestChange24hPct",
    prefix + "FundingCurrent",
    prefix + "FundingZScore",
    prefix + "LiquidationLongUsd1h",
    prefix + "LiquidationShortUsd1h",
    prefix + "LiquidationLongUsd4h",
    prefix + "LiquidationShortUsd4h"
  ];
}

function heatCsvRow(asset: DerivativesHeatAssetSnapshot | null): Array<string | number | null | undefined> {
  return [
    asset?.assetHeatLabel,
    asset?.openInterestCurrent,
    asset?.openInterestChange4hPct,
    asset?.openInterestChange24hPct,
    asset?.fundingCurrent,
    asset?.fundingZScore,
    asset?.liquidationLongUsd1h,
    asset?.liquidationShortUsd1h,
    asset?.liquidationLongUsd4h,
    asset?.liquidationShortUsd4h
  ];
}

export function logAlert(config: BotConfig, result: RegimeScoreResult, decision: AlertDecision): void {
  appendCsvRow(
    config.paths.alertCsv,
    ["timestamp", "sent", "reason", "critical", "score", "regime", "leader"],
    [result.timestamp, decision.shouldSend ? "yes" : "no", decision.reason, decision.isCritical ? "yes" : "no", result.score, result.regime, result.leader]
  );
}

export function logSnapshot(
  config: BotConfig,
  result: RegimeScoreResult,
  accuracyFields?: AccuracySnapshotFields,
  auditFields?: MarketMoveAuditFields
): void {
  appendLine(config.paths.snapshotJsonl, JSON.stringify({ ...result, ...accuracyFields, ...auditFields }));
}

export function logError(config: BotConfig, error: unknown): void {
  const message = error instanceof Error ? `${error.stack ?? error.message}` : String(error);
  appendLine(config.paths.errorLog, `[${nowIso()}] ${message}`);
}

