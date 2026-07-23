import {
  GlobalSnapshot,
  LaneExplainerHistoryPoint,
  LiquidityRotationSessionWindow,
  LiquidityRotationTelemetry,
  LiquidityRotationTrend,
  MarketDataFreshnessFields
} from "./types";

const CONTINUITY_BREAK_MINUTES = 30;
const ROTATION_SCHEMA_VERSION = "liquidity-rotation-v1" as const;

export interface LiquidityRotationTelemetryInput {
  timestamp: string;
  global: GlobalSnapshot;
  freshness: MarketDataFreshnessFields;
  ethBtcRatio: number | null;
  solBtcRatio: number | null;
  solEthRatio: number | null;
  history: LaneExplainerHistoryPoint[];
}

interface LocalTime {
  hour: number;
  minute: number;
}

/**
 * Classifies research context with IANA zones so London and New York follow
 * their respective DST calendars. It deliberately has no production effect.
 */
export function classifyLiquidityRotationSession(timestamp: string): {
  sessionWindow: LiquidityRotationSessionWindow;
  sessionOverlap: boolean;
} {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return { sessionWindow: "OFF_HOURS", sessionOverlap: false };

  const londonOpen = inLocalWindow(date, "Europe/London", 8, 16);
  const newYorkOpen = inLocalWindow(date, "America/New_York", 8, 17);
  const asiaOpen = inLocalWindow(date, "Asia/Tokyo", 8, 16);

  if (londonOpen && newYorkOpen) return { sessionWindow: "LONDON_NEW_YORK_OVERLAP", sessionOverlap: true };
  if (londonOpen) return { sessionWindow: "LONDON", sessionOverlap: false };
  if (newYorkOpen) return { sessionWindow: "NEW_YORK", sessionOverlap: false };
  if (asiaOpen) return { sessionWindow: "ASIA", sessionOverlap: false };
  return { sessionWindow: "OFF_HOURS", sessionOverlap: false };
}

export function deriveLiquidityRotationTelemetry(input: LiquidityRotationTelemetryInput): LiquidityRotationTelemetry {
  const session = classifyLiquidityRotationSession(input.timestamp);
  const previous = latestFreshHistoryPoint(input.history, input.timestamp);
  const sourceFresh = input.freshness.marketDataFresh
    && input.freshness.livePriceFresh
    && input.freshness.historicalDataFresh
    && input.freshness.marketDataQuality === "FRESH";
  const rotationDataQuality = sourceFresh ? "FRESH_BUT_INSUFFICIENT" : "STALE_SOURCE";
  const rotationReasons = [
    "Research-only, non-authoritative telemetry; no production rotation threshold is encoded.",
    "Canonical TOTAL3 series is unavailable.",
    "Broad-alt breadth, advances/declines, and a canonical breadth metric are unavailable."
  ];
  if (!sourceFresh) rotationReasons.push("Current source freshness is insufficient for research feature interpretation.");

  return {
    majorExpansionState: deriveMajorExpansionState(input.global.totalMarketCapChange24hPct),
    majorCompressionState: "UNAVAILABLE",
    btcDominanceTrend: trend(input.global.btcDominancePct, previous?.btcDominancePct ?? null),
    total3Trend: "UNAVAILABLE",
    ethBtcTrend: trend(input.ethBtcRatio, previous?.ethBtcRatio ?? null),
    solBtcTrend: trend(input.solBtcRatio, previous?.solBtcRatio ?? null),
    solEthTrend: trend(input.solEthRatio, previous?.solEthRatio ?? null),
    altBreadthState: "UNAVAILABLE",
    rotationState: "NO_CLEAR_ROTATION",
    rotationConfidence: "INSUFFICIENT_DATA",
    cascadeRiskState: "UNAVAILABLE",
    sessionWindow: session.sessionWindow,
    sessionOverlap: session.sessionOverlap,
    rotationReasons,
    rotationInvalidation: [
      "Do not interpret a rotation state until canonical TOTAL3 and broad-alt breadth inputs are present.",
      "Do not interpret telemetry when live or historical market data is stale, frozen, missing, or provider-errored."
    ],
    rotationPersistenceScans: rotationPersistenceScans(input.history, input.timestamp, "NO_CLEAR_ROTATION", sourceFresh),
    rotationDataQuality,
    rotationSchemaVersion: ROTATION_SCHEMA_VERSION,
    rotationAuthoritative: false
  };
}

function deriveMajorExpansionState(change24h: number | null): LiquidityRotationTelemetry["majorExpansionState"] {
  if (!isFiniteNumber(change24h)) return "UNAVAILABLE";
  if (change24h > 0) return "EXPANDING";
  if (change24h < 0) return "CONTRACTING";
  return "NEUTRAL";
}

function latestFreshHistoryPoint(history: LaneExplainerHistoryPoint[], currentTimestamp: string): LaneExplainerHistoryPoint | null {
  const currentMs = Date.parse(currentTimestamp);
  if (!Number.isFinite(currentMs)) return null;
  const valid = history
    .filter((point) => point.marketDataFresh === true
      && point.timestampMs < currentMs
      && (currentMs - point.timestampMs) / 60000 <= CONTINUITY_BREAK_MINUTES)
    .sort((a, b) => b.timestampMs - a.timestampMs);
  return valid[0] ?? null;
}

function trend(current: number | null, previous: number | null): LiquidityRotationTrend {
  if (!isFiniteNumber(current) || !isFiniteNumber(previous)) return "UNAVAILABLE";
  if (current > previous) return "UP";
  if (current < previous) return "DOWN";
  return "FLAT";
}

function rotationPersistenceScans(
  history: LaneExplainerHistoryPoint[],
  timestamp: string,
  currentState: LiquidityRotationTelemetry["rotationState"],
  currentSourceFresh: boolean
): number {
  if (!currentSourceFresh) return 0;
  const currentMs = Date.parse(timestamp);
  if (!Number.isFinite(currentMs)) return 1;
  const points = history
    .filter((point) => point.marketDataFresh === true && point.rotationState && point.timestampMs < currentMs)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  let persistence = 1;
  let nextMs = currentMs;
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    if (point.rotationState !== currentState) break;
    if ((nextMs - point.timestampMs) / 60000 > CONTINUITY_BREAK_MINUTES) break;
    persistence += 1;
    nextMs = point.timestampMs;
  }
  return persistence;
}

function inLocalWindow(date: Date, timeZone: string, startHour: number, endHour: number): boolean {
  const local = localTime(date, timeZone);
  const minutes = local.hour * 60 + local.minute;
  return minutes >= startHour * 60 && minutes < endHour * 60;
}

function localTime(date: Date, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { hour: value("hour"), minute: value("minute") };
}

function isFiniteNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
