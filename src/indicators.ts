import { Candle } from "./types";
import { average, round } from "./utils";

export interface StructureResult {
  label: "Bullish" | "Bearish" | "Mixed" | "Unknown";
  event: "Bullish BOS" | "Bearish BOS" | "Bullish CHoCH" | "Bearish CHoCH" | "None";
  latestSwingHigh: number | null;
  latestSwingLow: number | null;
  reason: string;
}

interface PivotPoint {
  index: number;
  value: number;
}

export function closes(candles: Candle[]): number[] {
  return candles.map((candle) => candle.close);
}

export function volumes(candles: Candle[]): number[] {
  return candles.map((candle) => candle.volume);
}

export function ema(values: number[], period: number): Array<number | null> {
  if (period <= 0) throw new Error("EMA period must be greater than zero.");
  const result: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return result;

  const firstAverage = average(values.slice(0, period));
  if (firstAverage === null) return result;

  const multiplier = 2 / (period + 1);
  result[period - 1] = firstAverage;

  for (let i = period; i < values.length; i += 1) {
    const previous = result[i - 1];
    if (previous === null) continue;
    result[i] = (values[i] - previous) * multiplier + previous;
  }

  return result;
}

export function sma(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;

  for (let i = period - 1; i < values.length; i += 1) {
    result[i] = average(values.slice(i - period + 1, i + 1));
  }

  return result;
}

export function latest<T>(values: Array<T | null>): T | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (values[i] !== null && values[i] !== undefined) return values[i] as T;
  }
  return null;
}

export function valueAgo<T>(values: Array<T | null>, barsAgo: number): T | null {
  const index = values.length - 1 - barsAgo;
  if (index < 0) return null;
  const value = values[index];
  return value === undefined ? null : value;
}

export function rateOfChange(values: number[], bars: number): number | null {
  if (values.length <= bars) return null;
  const current = values[values.length - 1];
  const previous = values[values.length - 1 - bars];
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function emaSlope(values: number[], period: number, barsAgo: number): number | null {
  const emaValues = ema(values, period);
  const current = latest(emaValues);
  const previous = valueAgo(emaValues, barsAgo);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function averageVolumeRatio(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  const volumeValues = volumes(candles);
  const currentVolume = volumeValues[volumeValues.length - 1];
  const averageVolume = average(volumeValues.slice(-period - 1, -1));
  if (averageVolume === null || averageVolume === 0) return null;
  return currentVolume / averageVolume;
}

export function buildRatioCandles(symbol: string, numerator: Candle[], denominator: Candle[]): Candle[] {
  const count = Math.min(numerator.length, denominator.length);
  const left = numerator.slice(numerator.length - count);
  const right = denominator.slice(denominator.length - count);

  const ratioCandles: Candle[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b || b.close === 0 || b.open === 0 || b.high === 0 || b.low === 0) continue;

    ratioCandles.push({
      symbol,
      interval: a.interval,
      openTime: Math.max(a.openTime, b.openTime),
      closeTime: Math.min(a.closeTime, b.closeTime),
      open: a.open / b.open,
      high: a.high / b.high,
      low: a.low / b.low,
      close: a.close / b.close,
      volume: a.volume,
      quoteVolume: a.quoteVolume
    });
  }

  return ratioCandles;
}

export function getStructure(candles: Candle[], pivotLength = 3): StructureResult {
  if (candles.length < pivotLength * 2 + 10) {
    return {
      label: "Unknown",
      event: "None",
      latestSwingHigh: null,
      latestSwingLow: null,
      reason: "Not enough candles to confirm swing structure."
    };
  }

  const swingHighs: PivotPoint[] = [];
  const swingLows: PivotPoint[] = [];

  // Confirmed pivots only. We intentionally ignore the newest few candles because pivots need future candles to confirm.
  for (let i = pivotLength; i < candles.length - pivotLength; i += 1) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= pivotLength; offset += 1) {
      if (current.high <= candles[i - offset].high || current.high <= candles[i + offset].high) isHigh = false;
      if (current.low >= candles[i - offset].low || current.low >= candles[i + offset].low) isLow = false;
    }

    if (isHigh) swingHighs.push({ index: i, value: current.high });
    if (isLow) swingLows.push({ index: i, value: current.low });
  }

  const lastClose = candles[candles.length - 1].close;
  const lastHigh = swingHighs[swingHighs.length - 1] ?? null;
  const previousHigh = swingHighs[swingHighs.length - 2] ?? null;
  const lastLow = swingLows[swingLows.length - 1] ?? null;
  const previousLow = swingLows[swingLows.length - 2] ?? null;

  if (!lastHigh || !previousHigh || !lastLow || !previousLow) {
    return {
      label: "Unknown",
      event: "None",
      latestSwingHigh: lastHigh?.value ?? null,
      latestSwingLow: lastLow?.value ?? null,
      reason: "Not enough confirmed swing highs/lows."
    };
  }

  const higherHigh = lastHigh.value > previousHigh.value;
  const higherLow = lastLow.value > previousLow.value;
  const lowerHigh = lastHigh.value < previousHigh.value;
  const lowerLow = lastLow.value < previousLow.value;

  let label: StructureResult["label"] = "Mixed";
  if (higherHigh && higherLow) label = "Bullish";
  if (lowerHigh && lowerLow) label = "Bearish";

  let event: StructureResult["event"] = "None";
  if (lastClose > lastHigh.value) event = label === "Bearish" ? "Bullish CHoCH" : "Bullish BOS";
  if (lastClose < lastLow.value) event = label === "Bullish" ? "Bearish CHoCH" : "Bearish BOS";

  return {
    label,
    event,
    latestSwingHigh: round(lastHigh.value, 8),
    latestSwingLow: round(lastLow.value, 8),
    reason: `${label} structure. Latest close ${round(lastClose, 8)}, swing high ${round(lastHigh.value, 8)}, swing low ${round(lastLow.value, 8)}.`
  };
}
