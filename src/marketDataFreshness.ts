import {
  LaneExplainerHistoryPoint,
  MarketDataFreshnessFields,
  MarketDataProviderName,
  MarketDataQuality,
  Timeframe
} from "./types";
import { round } from "./utils";

export interface MarketDataFreshnessInput {
  timestamp: string;
  historicalInterval: Timeframe;
  historicalProvider: MarketDataProviderName | null;
  historicalTimestamp: string | null;
  historicalProviderErrors?: string[];
  liveProvider: MarketDataProviderName | null;
  liveTimestamp: string | null;
  liveProviderErrors?: string[];
  btcPrice: number | null;
  ethPrice: number | null;
  solPrice: number | null;
  history: LaneExplainerHistoryPoint[];
}

export const LIVE_PRICE_MAX_AGE_MINUTES = 5;
const LIVE_FROZEN_SCAN_THRESHOLD = 3;
const HISTORICAL_CLOSE_GRACE_MINUTES = 15;

export function normalizeMarketDataQuality(value: unknown): MarketDataQuality {
  if (typeof value !== "string") return "UNKNOWN";
  const normalized = value.toUpperCase();
  return ["FRESH", "STALE", "FROZEN", "PROVIDER_ERROR", "UNKNOWN"].includes(normalized)
    ? normalized as MarketDataQuality
    : "UNKNOWN";
}

export function assessMarketDataFreshness(input: MarketDataFreshnessInput): MarketDataFreshnessFields {
  const livePriceAgeMinutes = ageMinutes(input.timestamp, input.liveTimestamp);
  const historicalDataAgeMinutes = ageMinutes(input.timestamp, input.historicalTimestamp);
  const previous = latestPriorPoint(input);
  const btcPriceChanged = priceChanged(input.btcPrice, previous?.btcPrice ?? null, Boolean(previous));
  const ethPriceChanged = priceChanged(input.ethPrice, previous?.ethPrice ?? null, Boolean(previous));
  const solPriceChanged = priceChanged(input.solPrice, previous?.solPrice ?? null, Boolean(previous));
  const livePriceUnchangedScanCount = unchangedLiveQuoteRun(input);
  const liveProviderErrors = input.liveProviderErrors ?? [];
  const historicalProviderErrors = input.historicalProviderErrors ?? [];
  const historicalMaxAgeMinutes = timeframeMinutes(input.historicalInterval) + HISTORICAL_CLOSE_GRACE_MINUTES;

  let livePriceFresh = true;
  let historicalDataFresh = true;
  let quality: MarketDataQuality = "FRESH";
  let reason: string | null = null;

  if (!hasPrice(input.btcPrice) || !hasPrice(input.ethPrice) || !hasPrice(input.solPrice) || !input.liveTimestamp) {
    livePriceFresh = false;
    quality = input.liveProvider === null && liveProviderErrors.length > 0 ? "PROVIDER_ERROR" : "STALE";
    reason = quality === "PROVIDER_ERROR" ? "Live spot-price providers failed" : "Live BTC/ETH/SOL quote or timestamp missing";
  } else if (livePriceAgeMinutes === null || livePriceAgeMinutes > LIVE_PRICE_MAX_AGE_MINUTES) {
    livePriceFresh = false;
    const quoteTimestampRepeated = repeatedLiveTimestamp(input);
    quality = livePriceUnchangedScanCount >= LIVE_FROZEN_SCAN_THRESHOLD && quoteTimestampRepeated ? "FROZEN" : "STALE";
    reason = quality === "FROZEN"
      ? "Live BTC/ETH/SOL prices and provider timestamp stopped updating"
      : `Live spot quote is ${livePriceAgeMinutes ?? "unknown"} minutes old (limit ${LIVE_PRICE_MAX_AGE_MINUTES})`;
  }

  if (!input.historicalTimestamp || historicalDataAgeMinutes === null || historicalDataAgeMinutes > historicalMaxAgeMinutes) {
    historicalDataFresh = false;
    if (quality === "FRESH") quality = input.historicalProvider === null && historicalProviderErrors.length > 0 ? "PROVIDER_ERROR" : "STALE";
    const historicalReason = !input.historicalTimestamp
      ? "Historical candle timestamp missing"
      : `Historical ${input.historicalInterval} candle is ${historicalDataAgeMinutes ?? "unknown"} minutes old (limit ${historicalMaxAgeMinutes})`;
    reason = reason ? `${reason}; ${historicalReason}` : historicalReason;
  }

  return {
    marketDataFresh: livePriceFresh && historicalDataFresh,
    marketDataStaleReason: reason,
    marketDataProvider: input.liveProvider,
    marketDataProviderErrors: [...liveProviderErrors, ...historicalProviderErrors],
    livePriceFresh,
    livePriceAgeMinutes,
    livePriceTimestamp: input.liveTimestamp,
    livePriceProvider: input.liveProvider,
    livePriceProviderErrors: liveProviderErrors,
    livePriceUnchangedScanCount,
    historicalDataFresh,
    historicalDataAgeMinutes,
    historicalDataTimestamp: input.historicalTimestamp,
    historicalDataProvider: input.historicalProvider,
    historicalDataProviderErrors: historicalProviderErrors,
    historicalInterval: input.historicalInterval,
    btcPriceChanged,
    ethPriceChanged,
    solPriceChanged,
    marketDataQuality: quality
  };
}

function latestPriorPoint(input: MarketDataFreshnessInput): LaneExplainerHistoryPoint | null {
  const currentMs = Date.parse(input.timestamp);
  if (!Number.isFinite(currentMs)) return input.history[input.history.length - 1] ?? null;
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    if (input.history[index].timestampMs < currentMs) return input.history[index];
  }
  return null;
}

function unchangedLiveQuoteRun(input: MarketDataFreshnessInput): number {
  const currentMs = Date.parse(input.timestamp);
  if (!Number.isFinite(currentMs) || !input.liveTimestamp) return 0;

  let matchingPriorCount = 0;
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const point = input.history[index];
    if (point.timestampMs >= currentMs) continue;
    if (!point.livePriceTimestamp) break;
    if (point.btcPrice !== input.btcPrice || point.ethPrice !== input.ethPrice || point.solPrice !== input.solPrice) break;
    matchingPriorCount += 1;
  }
  return matchingPriorCount === 0 ? 0 : matchingPriorCount + 1;
}

function repeatedLiveTimestamp(input: MarketDataFreshnessInput): boolean {
  if (!input.liveTimestamp) return false;
  const currentMs = Date.parse(input.timestamp);
  let matches = 1;
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const point = input.history[index];
    if (Number.isFinite(currentMs) && point.timestampMs >= currentMs) continue;
    if (point.livePriceTimestamp !== input.liveTimestamp) break;
    matches += 1;
    if (matches >= LIVE_FROZEN_SCAN_THRESHOLD) return true;
  }
  return false;
}

function priceChanged(current: number | null, previous: number | null, hasPrevious: boolean): boolean | null {
  if (!hasPrevious || !hasPrice(current) || !hasPrice(previous)) return null;
  return current !== previous;
}

function hasPrice(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function ageMinutes(timestamp: string, providerTimestamp: string | null): number | null {
  if (!providerTimestamp) return null;
  const currentMs = Date.parse(timestamp);
  const providerMs = Date.parse(providerTimestamp);
  if (!Number.isFinite(currentMs) || !Number.isFinite(providerMs)) return null;
  return round(Math.max(0, (currentMs - providerMs) / 60000), 2);
}

function timeframeMinutes(timeframe: Timeframe): number {
  if (timeframe === "1h") return 60;
  if (timeframe === "4h") return 240;
  return 1440;
}
