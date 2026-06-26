import fs from "node:fs";
import {
  BotConfig,
  Candle,
  CandleBundle,
  DerivativesHeatAssetSnapshot,
  DerivativesHeatProvider,
  DerivativesHeatProviderInput,
  DerivativesHeatSnapshot,
  DerivativesHeatStatus,
  LeaderName,
  RegimeName
} from "./types";
import { average, pctChange, readJsonFile, round, writeJsonFile } from "./utils";

const CACHE_PATH = "data/derivatives_markets_cache.json";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EXCHANGE_PRIORITY = ["binance", "bybit", "okx"];

type AssetName = "BTC" | "ETH" | "SOL";

type HeatDirection = "longs" | "shorts" | "clean" | "mixed" | "unavailable";

interface MarketCache {
  generatedAt: string;
  mappings: Record<string, CachedMarket>;
}

interface CachedMarket {
  asset: string;
  symbol: string;
  exchange: string;
}

interface Point {
  timestamp: number;
  value: number;
}

interface LiquidationPoint {
  timestamp: number;
  longUsd: number;
  shortUsd: number;
}

interface AssetMetrics {
  direction: HeatDirection;
  score: number;
  bothSidedLiquidations: boolean;
}

export function unavailableDerivativesHeat(reason = "Derivatives heat unavailable."): DerivativesHeatSnapshot {
  return {
    timestamp: new Date().toISOString(),
    provider: "coinalyze",
    status: "Unavailable",
    publicLabel: "Unavailable \u26AA",
    summary: reason,
    assets: [],
    errors: [],
    warnings: [sanitizeLogText(reason)]
  };
}

export class CoinalyzeDerivativesHeatProvider implements DerivativesHeatProvider {
  private readonly enabled: boolean;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly assets: string[];
  private readonly interval: string;
  private readonly historyHours: number;

  constructor(private readonly config: BotConfig) {
    this.enabled = config.derivativesHeat.enabled;
    this.apiKey = config.derivativesHeat.coinalyzeApiKey.trim();
    this.baseUrl = config.derivativesHeat.coinalyzeBaseUrl.replace(/\/$/, "");
    this.timeoutMs = config.derivativesHeat.timeoutMs;
    this.assets = config.derivativesHeat.assets.map((asset) => asset.trim().toUpperCase()).filter(Boolean);
    this.interval = config.derivativesHeat.interval;
    this.historyHours = config.derivativesHeat.historyHours;
  }

  async getHeatSnapshot(input: DerivativesHeatProviderInput): Promise<DerivativesHeatSnapshot> {
    if (!this.enabled) return unavailableDerivativesHeat("Derivatives heat disabled by config.");
    if (!this.apiKey) return unavailableDerivativesHeat("Coinalyze API key missing; derivatives heat skipped.");

    try {
      return await this.fetchHeatSnapshot(input);
    } catch (error) {
      return unavailableDerivativesHeat(`Derivatives heat failed safely: ${sanitizeError(error)}`);
    }
  }

  private async fetchHeatSnapshot(input: DerivativesHeatProviderInput): Promise<DerivativesHeatSnapshot> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const markets = await this.resolveMarkets(warnings);
    const selected = this.assets.map((asset) => ({ asset, market: markets[asset] ?? null }));
    const symbols = selected.map((item) => item.market?.symbol).filter((value): value is string => Boolean(value));

    for (const item of selected) {
      if (!item.market) warnings.push(`No Coinalyze USDT perpetual market found for ${item.asset}.`);
    }

    if (symbols.length === 0) {
      return {
        ...unavailableDerivativesHeat("No derivatives markets were available for requested assets."),
        warnings: warnings.map(sanitizeLogText)
      };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const fromSec = nowSec - this.historyHours * 60 * 60;
    const [openInterestNow, fundingNow, predictedFundingNow, oiHistory, fundingHistory, liquidationHistory, longShortHistory, ohlcvHistory] = await Promise.all([
      this.fetchEndpoint("/open-interest", { symbols: symbols.join(","), convert_to_usd: "true" }, errors),
      this.fetchEndpoint("/funding-rate", { symbols: symbols.join(",") }, errors),
      this.fetchEndpoint("/predicted-funding-rate", { symbols: symbols.join(",") }, errors),
      this.fetchEndpoint("/open-interest-history", { symbols: symbols.join(","), interval: this.interval, from: String(fromSec), to: String(nowSec), convert_to_usd: "true" }, errors),
      this.fetchEndpoint("/funding-rate-history", { symbols: symbols.join(","), interval: this.interval, from: String(fromSec), to: String(nowSec) }, errors),
      this.fetchEndpoint("/liquidation-history", { symbols: symbols.join(","), interval: this.interval, from: String(fromSec), to: String(nowSec), convert_to_usd: "true" }, errors),
      this.fetchEndpoint("/long-short-ratio-history", { symbols: symbols.join(","), interval: this.interval, from: String(fromSec), to: String(nowSec) }, errors),
      this.fetchEndpoint("/ohlcv-history", { symbols: symbols.join(","), interval: this.interval, from: String(fromSec), to: String(nowSec) }, errors)
    ]);

    const assets = selected.map(({ asset, market }) => {
      if (!market) return unavailableAsset(asset);
      return this.buildAssetSnapshot({
        asset,
        symbol: market.symbol,
        candles: input.candles,
        openInterestNow,
        fundingNow,
        predictedFundingNow,
        oiHistory,
        fundingHistory,
        liquidationHistory,
        longShortHistory,
        ohlcvHistory
      });
    });

    const classified = classifyOverall(assets, input.result.regime, input.result.leader, input.previousResult);

    return {
      timestamp: new Date().toISOString(),
      provider: "coinalyze",
      status: classified.status,
      publicLabel: publicLabelForStatus(classified.status),
      summary: classified.summary,
      assets,
      errors: errors.map(sanitizeLogText),
      warnings: warnings.map(sanitizeLogText)
    };
  }

  private async resolveMarkets(warnings: string[]): Promise<Record<string, CachedMarket>> {
    const cached = readMarketCache();
    const now = Date.now();
    const cachedTime = cached ? new Date(cached.generatedAt).getTime() : 0;
    const hasAllAssets = cached && this.assets.every((asset) => Boolean(cached.mappings[asset]));

    if (cached && hasAllAssets && Number.isFinite(cachedTime) && now - cachedTime < CACHE_TTL_MS) {
      return cached.mappings;
    }

    try {
      const markets = await this.fetchEndpoint("/future-markets", {}, warnings);
      const mappings = selectMarkets(markets, this.assets);
      writeJsonFile(CACHE_PATH, { generatedAt: new Date().toISOString(), mappings });
      return mappings;
    } catch (error) {
      warnings.push(`Coinalyze market discovery failed; using cache if available. ${sanitizeError(error)}`);
      return cached?.mappings ?? {};
    }
  }

  private async fetchEndpoint(endpoint: string, params: Record<string, string>, errors: string[]): Promise<unknown> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (key.toLowerCase() === "api_key") continue;
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { api_key: this.apiKey },
        signal: controller.signal
      });

      if (!response.ok) {
        errors.push(`${endpoint} returned HTTP ${response.status}.`);
        return null;
      }

      return await response.json();
    } catch (error) {
      errors.push(`${endpoint} failed: ${sanitizeError(error)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildAssetSnapshot(input: {
    asset: string;
    symbol: string;
    candles: CandleBundle;
    openInterestNow: unknown;
    fundingNow: unknown;
    predictedFundingNow: unknown;
    oiHistory: unknown;
    fundingHistory: unknown;
    liquidationHistory: unknown;
    longShortHistory: unknown;
    ohlcvHistory: unknown;
  }): DerivativesHeatAssetSnapshot {
    const oiPoints = pointsForSymbol(input.oiHistory, input.symbol);
    const fundingPoints = pointsForSymbol(input.fundingHistory, input.symbol);
    const liquidationPoints = liquidationPointsForSymbol(input.liquidationHistory, input.symbol);
    const longShortPoints = pointsForSymbol(input.longShortHistory, input.symbol);
    const ohlcvPoints = pointsForSymbol(input.ohlcvHistory, input.symbol);

    const openInterestCurrent = readCurrentMetric(input.openInterestNow, input.symbol) ?? latestValue(oiPoints);
    const fundingCurrent = readCurrentMetric(input.fundingNow, input.symbol) ?? latestValue(fundingPoints);
    const predictedFundingCurrent = readCurrentMetric(input.predictedFundingNow, input.symbol);
    const fundingZScore = zScore(fundingCurrent, fundingPoints.map((point) => point.value));
    const openInterestChange4hPct = pctChangeFromHours(oiPoints, 4);
    const openInterestChange24hPct = pctChangeFromHours(oiPoints, 24);
    const liquidationLongUsd1h = sumLiquidations(liquidationPoints, 1, "longUsd");
    const liquidationShortUsd1h = sumLiquidations(liquidationPoints, 1, "shortUsd");
    const liquidationLongUsd4h = sumLiquidations(liquidationPoints, 4, "longUsd");
    const liquidationShortUsd4h = sumLiquidations(liquidationPoints, 4, "shortUsd");
    const liquidationImbalance = liquidationImbalanceFrom(liquidationLongUsd4h, liquidationShortUsd4h);
    const longShortRatio = latestValue(longShortPoints);
    const price = latestSpotPrice(input.asset, input.candles) ?? latestValue(ohlcvPoints);
    const metrics = classifyAsset({
      fundingZScore,
      fundingCurrent,
      openInterestChange4hPct,
      openInterestChange24hPct,
      liquidationLongUsd4h,
      liquidationShortUsd4h,
      liquidationImbalance,
      longShortRatio
    });

    return {
      asset: input.asset,
      symbol: input.symbol,
      price: roundOptional(price),
      openInterestCurrent: roundOptional(openInterestCurrent),
      openInterestChange4hPct: roundOptional(openInterestChange4hPct),
      openInterestChange24hPct: roundOptional(openInterestChange24hPct),
      fundingCurrent: roundOptional(fundingCurrent, 6),
      fundingZScore: roundOptional(fundingZScore),
      predictedFundingCurrent: roundOptional(predictedFundingCurrent, 6),
      liquidationLongUsd1h: roundOptional(liquidationLongUsd1h),
      liquidationShortUsd1h: roundOptional(liquidationShortUsd1h),
      liquidationLongUsd4h: roundOptional(liquidationLongUsd4h),
      liquidationShortUsd4h: roundOptional(liquidationShortUsd4h),
      liquidationImbalance: roundOptional(liquidationImbalance),
      longShortRatio: roundOptional(longShortRatio),
      assetHeatLabel: labelForAsset(metrics.direction),
      assetHeatScore: metrics.score,
      assetSummary: summaryForAsset(input.asset, metrics, fundingZScore, openInterestChange24hPct)
    };
  }
}

function readMarketCache(): MarketCache | null {
  const cache = readJsonFile<MarketCache | null>(CACHE_PATH, null);
  if (!cache || !cache.mappings) return null;
  return cache;
}

function selectMarkets(marketsRaw: unknown, assets: string[]): Record<string, CachedMarket> {
  const rows = Array.isArray(marketsRaw) ? marketsRaw : [];
  const mappings: Record<string, CachedMarket> = {};

  for (const asset of assets) {
    const candidates = rows
      .filter((row): row is Record<string, unknown> => isRecord(row) && marketMatchesAsset(row, asset))
      .sort(compareMarkets);

    const selected = candidates[0];
    if (!selected) continue;

    const symbol = readString(selected.symbol) ?? readString(selected.code);
    if (!symbol) continue;

    mappings[asset] = {
      asset,
      symbol,
      exchange: readString(selected.exchange) ?? readString(selected.exchange_name) ?? "unknown"
    };
  }

  return mappings;
}

function marketMatchesAsset(row: Record<string, unknown>, asset: string): boolean {
  const symbol = `${readString(row.symbol) ?? readString(row.code) ?? ""}`.toUpperCase();
  const base = `${readString(row.base_asset) ?? readString(row.baseAsset) ?? readString(row.base) ?? ""}`.toUpperCase();
  const quote = `${readString(row.quote_asset) ?? readString(row.quoteAsset) ?? readString(row.quote) ?? ""}`.toUpperCase();
  const marketType = `${readString(row.market_type) ?? readString(row.type) ?? ""}`.toLowerCase();
  const isPerpetual = row.is_perpetual === true || row.isPerpetual === true || marketType.includes("perpetual") || symbol.includes("PERP");
  const isUsdt = quote === "USDT" || symbol.includes("USDT");
  const isBase = base === asset || symbol.startsWith(`${asset}`);
  return isBase && isUsdt && isPerpetual;
}

function compareMarkets(a: Record<string, unknown>, b: Record<string, unknown>): number {
  return exchangeRank(a) - exchangeRank(b);
}

function exchangeRank(row: Record<string, unknown>): number {
  const exchange = `${readString(row.exchange) ?? readString(row.exchange_name) ?? ""}`.toLowerCase();
  const index = EXCHANGE_PRIORITY.findIndex((name) => exchange.includes(name));
  return index === -1 ? 99 : index;
}

function readCurrentMetric(raw: unknown, symbol: string): number | null {
  const row = rowForSymbol(raw, symbol);
  if (!row) return null;
  return firstNumber(row, ["value", "open_interest", "oi", "c", "funding_rate", "rate", "predicted_funding_rate"]);
}

function rowForSymbol(raw: unknown, symbol: string): Record<string, unknown> | null {
  const rows = Array.isArray(raw) ? raw : [];
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const rowSymbol = readString(row.symbol) ?? readString(row.s);
    if (rowSymbol === symbol) return row;
  }
  return null;
}

function pointsForSymbol(raw: unknown, symbol: string): Point[] {
  const row = rowForSymbol(raw, symbol);
  const history = isRecord(row) && Array.isArray(row.history) ? row.history : Array.isArray(row?.data) ? row.data : [];
  return history
    .map((item): Point | null => {
      if (!isRecord(item)) return null;
      const timestamp = readTimestamp(item.t ?? item.timestamp ?? item.time);
      const value = firstNumber(item, ["c", "close", "value", "r", "ratio"]);
      return timestamp !== null && value !== null ? { timestamp, value } : null;
    })
    .filter((point): point is Point => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function liquidationPointsForSymbol(raw: unknown, symbol: string): LiquidationPoint[] {
  const row = rowForSymbol(raw, symbol);
  const history = isRecord(row) && Array.isArray(row.history) ? row.history : Array.isArray(row?.data) ? row.data : [];
  return history
    .map((item): LiquidationPoint | null => {
      if (!isRecord(item)) return null;
      const timestamp = readTimestamp(item.t ?? item.timestamp ?? item.time);
      const longUsd = firstNumber(item, ["l", "long", "long_liquidations", "longLiquidations"]);
      const shortUsd = firstNumber(item, ["s", "short", "short_liquidations", "shortLiquidations"]);
      return timestamp !== null ? { timestamp, longUsd: longUsd ?? 0, shortUsd: shortUsd ?? 0 } : null;
    })
    .filter((point): point is LiquidationPoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

function classifyAsset(input: {
  fundingZScore: number | null;
  fundingCurrent: number | null;
  openInterestChange4hPct: number | null;
  openInterestChange24hPct: number | null;
  liquidationLongUsd4h: number | null;
  liquidationShortUsd4h: number | null;
  liquidationImbalance: number | null;
  longShortRatio: number | null;
}): AssetMetrics {
  let score = 0;
  if ((input.fundingZScore ?? 0) >= 1.5 || (input.fundingCurrent ?? 0) > 0.0005) score += 2;
  if ((input.fundingZScore ?? 0) <= -1.5 || (input.fundingCurrent ?? 0) < -0.0005) score -= 2;
  if ((input.openInterestChange4hPct ?? 0) > 5) score += score >= 0 ? 1 : -1;
  if ((input.openInterestChange24hPct ?? 0) > 10) score += score >= 0 ? 1 : -1;
  if ((input.longShortRatio ?? 1) > 1.3) score += 1;
  if ((input.longShortRatio ?? 1) < 0.75) score -= 1;
  if ((input.liquidationImbalance ?? 0) < -0.35) score += 1;
  if ((input.liquidationImbalance ?? 0) > 0.35) score -= 1;

  const totalLiq4h = (input.liquidationLongUsd4h ?? 0) + (input.liquidationShortUsd4h ?? 0);
  const bothSidedLiquidations = totalLiq4h > 0 && Math.abs(input.liquidationImbalance ?? 0) < 0.2;

  if (score >= 3) return { direction: "longs", score, bothSidedLiquidations };
  if (score <= -3) return { direction: "shorts", score, bothSidedLiquidations };
  if (bothSidedLiquidations && Math.abs(score) <= 1) return { direction: "mixed", score, bothSidedLiquidations };
  return { direction: "clean", score, bothSidedLiquidations };
}

function classifyOverall(
  assets: DerivativesHeatAssetSnapshot[],
  regime: RegimeName,
  leader: LeaderName,
  previousResult: { score: number } | null
): { status: DerivativesHeatStatus; summary: string } {
  const usable = assets.filter((asset) => asset.assetHeatLabel !== "Unavailable");
  if (usable.length === 0) return { status: "Unavailable", summary: "No usable derivatives heat data." };

  const longCrowded = usable.filter((asset) => asset.assetHeatScore >= 3);
  const shortCrowded = usable.filter((asset) => asset.assetHeatScore <= -3);
  const mixed = usable.filter((asset) => asset.assetHeatLabel === "Leverage messy");
  const defensive = regime === "Risk-Off" || regime === "Defensive" || regime === "Neutral / Chop";
  const improving = regime === "Risk-On" || regime === "Strong Risk-On / Rotation" || leader === "BTC-led" || leader === "ETH-led" || leader === "SOL-led" || (previousResult !== null && usable.length > 0);

  if (longCrowded.length > 0 && defensive) return { status: "LongWipeoutRisk", summary: `${longCrowded.map((asset) => asset.asset).join("/")} leverage looks long-heavy into a cautious tape.` };
  if (shortCrowded.length > 0 && improving) return { status: "ShortSqueezeFuel", summary: `${shortCrowded.map((asset) => asset.asset).join("/")} shorts look crowded if trend keeps repairing.` };
  if (longCrowded.length > 0 && shortCrowded.length > 0) return { status: "Mixed", summary: "Leverage is split across assets; direction is not clean." };
  if (mixed.length > 0) return { status: "Mixed", summary: "Liquidations are active both ways; stay selective." };
  if (longCrowded.length > 0) return { status: "CrowdedLongs", summary: `${longCrowded.map((asset) => asset.asset).join("/")} longs look crowded.` };
  if (shortCrowded.length > 0) return { status: "CrowdedShorts", summary: `${shortCrowded.map((asset) => asset.asset).join("/")} shorts look crowded.` };
  return { status: "Clean", summary: "Funding, open interest, and liquidations look broadly neutral." };
}

function publicLabelForStatus(status: DerivativesHeatStatus): string {
  switch (status) {
    case "LongWipeoutRisk":
      return "Long wipeout risk below \u26A0\uFE0F";
    case "ShortSqueezeFuel":
      return "Short squeeze fuel above \u{1F525}";
    case "Mixed":
      return "Leverage messy / stay picky \u{1F32A}\uFE0F";
    case "Clean":
      return "Leverage clean / neutral \u2705";
    case "CrowdedLongs":
      return "Crowded longs \u26A0\uFE0F";
    case "CrowdedShorts":
      return "Crowded shorts \u{1F525}";
    case "Unavailable":
      return "Unavailable \u26AA";
  }
}

function labelForAsset(direction: HeatDirection): string {
  if (direction === "longs") return "Crowded longs";
  if (direction === "shorts") return "Crowded shorts";
  if (direction === "mixed") return "Leverage messy";
  if (direction === "unavailable") return "Unavailable";
  return "Clean";
}

function summaryForAsset(asset: string, metrics: AssetMetrics, fundingZScore: number | null, oiChange24hPct: number | null): string {
  if (metrics.direction === "longs") return `${asset} longs look crowded. Funding z ${formatNumber(fundingZScore)}, OI 24h ${formatPct(oiChange24hPct)}.`;
  if (metrics.direction === "shorts") return `${asset} shorts look crowded. Funding z ${formatNumber(fundingZScore)}, OI 24h ${formatPct(oiChange24hPct)}.`;
  if (metrics.direction === "mixed") return `${asset} liquidations are active both ways.`;
  return `${asset} leverage looks neutral.`;
}

function unavailableAsset(asset: string): DerivativesHeatAssetSnapshot {
  return {
    asset,
    symbol: null,
    price: null,
    openInterestCurrent: null,
    openInterestChange4hPct: null,
    openInterestChange24hPct: null,
    fundingCurrent: null,
    fundingZScore: null,
    predictedFundingCurrent: null,
    liquidationLongUsd1h: null,
    liquidationShortUsd1h: null,
    liquidationLongUsd4h: null,
    liquidationShortUsd4h: null,
    liquidationImbalance: null,
    longShortRatio: null,
    assetHeatLabel: "Unavailable",
    assetHeatScore: 0,
    assetSummary: `${asset} derivatives data unavailable.`
  };
}

function pctChangeFromHours(points: Point[], hours: number): number | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const target = latest.timestamp - hours * 60 * 60;
  const previous = [...points].reverse().find((point) => point.timestamp <= target) ?? points[0];
  return pctChange(latest.value, previous.value);
}

function sumLiquidations(points: LiquidationPoint[], hours: number, key: "longUsd" | "shortUsd"): number | null {
  if (points.length === 0) return null;
  const latest = points[points.length - 1].timestamp;
  const cutoff = latest - hours * 60 * 60;
  return points.filter((point) => point.timestamp >= cutoff).reduce((sum, point) => sum + point[key], 0);
}

function liquidationImbalanceFrom(longUsd: number | null, shortUsd: number | null): number | null {
  if (longUsd === null || shortUsd === null) return null;
  const total = longUsd + shortUsd;
  if (total === 0) return 0;
  return (shortUsd - longUsd) / total;
}

function zScore(current: number | null, history: number[]): number | null {
  if (current === null || history.length < 12) return null;
  const avg = average(history);
  if (avg === null) return null;
  const variance = average(history.map((value) => (value - avg) ** 2));
  if (variance === null || variance === 0) return null;
  return (current - avg) / Math.sqrt(variance);
}

function latestSpotPrice(asset: string, candles: CandleBundle): number | null {
  if (asset === "BTC") return latestClose(candles.btcUsdt);
  if (asset === "ETH") return latestClose(candles.ethUsdt);
  if (asset === "SOL") return latestClose(candles.solUsdt);
  return null;
}

function latestClose(candles: Candle[]): number | null {
  for (let i = candles.length - 1; i >= 0; i -= 1) {
    const close = candles[i]?.close;
    if (Number.isFinite(close)) return close;
  }
  return null;
}

function latestValue(points: Point[]): number | null {
  return points[points.length - 1]?.value ?? null;
}

function readTimestamp(value: unknown): number | null {
  const number = readNumber(value);
  if (number === null) return null;
  return number > 10_000_000_000 ? Math.floor(number / 1000) : number;
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = readNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function roundOptional(value: number | null, decimals = 2): number | null {
  return value === null || !Number.isFinite(value) ? null : round(value, decimals);
}

function formatNumber(value: number | null): string {
  return value === null ? "n/a" : String(round(value, 2));
}

function formatPct(value: number | null): string {
  if (value === null) return "n/a";
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${round(value, 2)}%`;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return sanitizeLogText(message);
}

function sanitizeLogText(value: string): string {
  return value
    .replace(/COINALYZE_API_KEY/gi, "[redacted_env]")
    .replace(/api_key=([^&\s]+)/gi, "api_key=[redacted]")
    .replace(/api_key:\s*[^,\s}]+/gi, "api_key:[redacted]")
    .slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
