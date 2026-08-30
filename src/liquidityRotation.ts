import {
  BestLane,
  GlobalSnapshot,
  LaneExplainerHistoryPoint,
  LiquidityRotationSessionWindow,
  LiquidityRotationTelemetry,
  LiquidityRotationTrend,
  MarketDataFreshnessFields
} from "./types";

const CONTINUITY_BREAK_MINUTES = 30;
const ROTATION_SCHEMA_VERSION = "liquidity-rotation-v1" as const;
const ROTATION_RULE_VERSION = "confirmed-takeover-shadow-v1" as const;

// Frozen development-split P25 margin threshold for the 2-scan confirmed-takeover shadow rule.
// Source: reports/lane_rotation_forensics/lane_rotation_forensics_summary.json
// frozenSplit.developmentMarginThresholds[0] => { "label": "P25", "value": 8.43 }
// Research result: 41 qualified confirmations, 34 durable successes, 7 reversals, 82.93% persistence success.
const CONFIRMED_TAKEOVER_MARGIN_THRESHOLD = 8.43;

// Eligible alt destinations. BTC-as-new-leader and STABLES-as-new-leader are excluded:
// they are not "alt" rotation targets and were not the basis for the forensic confirmation rule.
const ELIGIBLE_ALT_DESTINATIONS: readonly BestLane[] = ["ETH", "SOL"] as const;

export interface LiquidityRotationTelemetryInput {
  timestamp: string;
  global: GlobalSnapshot;
  freshness: MarketDataFreshnessFields;
  ethBtcRatio: number | null;
  solBtcRatio: number | null;
  solEthRatio: number | null;
  history: LaneExplainerHistoryPoint[];
  /** Current-scan laneMargin from deriveLaneExplainer. Must be derived before calling this function. */
  currentLaneMargin: number | null;
  /** Current-scan bestLane from deriveLaneExplainer. Must be derived before calling this function. */
  currentBestLane: BestLane | null;
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

  // Derive confirmed-takeover state using the exact frozen 2-scan / P25 rule.
  const takeover = deriveConfirmedTakeover(input, sourceFresh);

  const currentState = takeover.state;
  const currentRotationPersistenceScans = rotationPersistenceScans(input.history, input.timestamp, currentState, sourceFresh);

  return {
    majorExpansionState: deriveMajorExpansionState(input.global.totalMarketCapChange24hPct),
    majorCompressionState: "UNAVAILABLE",
    btcDominanceTrend: trend(input.global.btcDominancePct, previous?.btcDominancePct ?? null),
    total3Trend: "UNAVAILABLE",
    ethBtcTrend: trend(input.ethBtcRatio, previous?.ethBtcRatio ?? null),
    solBtcTrend: trend(input.solBtcRatio, previous?.solBtcRatio ?? null),
    solEthTrend: trend(input.solEthRatio, previous?.solEthRatio ?? null),
    altBreadthState: "UNAVAILABLE",
    rotationState: currentState,
    rotationConfidence: "INSUFFICIENT_DATA",
    cascadeRiskState: "UNAVAILABLE",
    sessionWindow: session.sessionWindow,
    sessionOverlap: session.sessionOverlap,
    rotationReasons,
    rotationInvalidation: [
      "Do not interpret a rotation state until canonical TOTAL3 and broad-alt breadth inputs are present.",
      "Do not interpret telemetry when live or historical market data is stale, frozen, missing, or provider-errored."
    ],
    rotationPersistenceScans: currentRotationPersistenceScans,
    rotationDataQuality,
    rotationSchemaVersion: ROTATION_SCHEMA_VERSION,
    rotationAuthoritative: false,
    rotationFromLane: takeover.fromLane,
    rotationToLane: takeover.toLane,
    rotationTriggerMargin: takeover.triggerMargin,
    rotationRuleVersion: ROTATION_RULE_VERSION
  };
}

interface TakeoverResult {
  state: LiquidityRotationTelemetry["rotationState"];
  fromLane: BestLane | null;
  toLane: BestLane | null;
  triggerMargin: number | null;
}

/**
 * Applies the exact frozen 2-scan / P25 confirmed-takeover rule.
 *
 * RULE (from confirmed forensic scenario "2-scans-P25"):
 *   - The current scan and the immediately preceding fresh contiguous scan must
 *     have the same best lane (new leader).
 *   - That best lane must be an eligible alt destination (ETH or SOL).
 *   - Both scans must have laneMargin >= 8.43 (P25 development threshold).
 *   - The gap between the preceding scan and the current scan must be
 *     <= 30 minutes (CONTINUITY_BREAK_MINUTES) — no future data may be used.
 *
 * rotationAuthoritative remains false. This never affects scoring, lane,
 * alert, Telegram send conditions, thresholds, or execution behavior.
 */
function deriveConfirmedTakeover(input: LiquidityRotationTelemetryInput, sourceFresh: boolean): TakeoverResult {
  const noConfirmation: TakeoverResult = { state: "NO_CLEAR_ROTATION", fromLane: null, toLane: null, triggerMargin: null };

  // Source must be fresh, current scan must have a valid eligible alt leader and sufficient margin.
  if (!sourceFresh) return noConfirmation;

  const currentLane = input.currentBestLane;
  const currentMargin = input.currentLaneMargin;

  if (!currentLane || !isEligibleAltDestination(currentLane)) return noConfirmation;
  if (!isFiniteNumber(currentMargin) || currentMargin < CONFIRMED_TAKEOVER_MARGIN_THRESHOLD) return noConfirmation;

  // Find the immediately preceding fresh contiguous history point.
  const currentMs = Date.parse(input.timestamp);
  if (!Number.isFinite(currentMs)) return noConfirmation;

  const precedingPoint = latestFreshHistoryPoint(input.history, input.timestamp);
  if (!precedingPoint) return noConfirmation;

  // Preceding point must have the same best lane and sufficient margin.
  const precedingLane = precedingPoint.bestLane;
  const precedingMargin = precedingPoint.laneMargin;
  if (precedingLane !== currentLane) return noConfirmation;
  if (!isFiniteNumber(precedingMargin) || precedingMargin < CONFIRMED_TAKEOVER_MARGIN_THRESHOLD) return noConfirmation;

  // Identify the prior leader (the lane that was displaced).
  // Look for the most recent fresh history point that had a DIFFERENT best lane.
  const priorLeaderPoint = findPriorLeaderPoint(input.history, precedingPoint.timestampMs, precedingLane as BestLane);
  const fromLane: BestLane = priorLeaderPoint?.bestLane
    ? (priorLeaderPoint.bestLane as BestLane)
    : "NO_CLEAR_LANE" as BestLane;

  // Confirmed: emit ALT_ROTATION_CONFIRMED
  return {
    state: "ALT_ROTATION_CONFIRMED",
    fromLane,
    toLane: currentLane as BestLane,
    triggerMargin: currentMargin
  };
}

function isEligibleAltDestination(lane: string): boolean {
  return (ELIGIBLE_ALT_DESTINATIONS as readonly string[]).includes(lane);
}

/**
 * Finds the most recent fresh history point strictly before the given timestampMs
 * that has a DIFFERENT best lane (to identify the displaced leader).
 * Respects the 30-minute continuity constraint from the confirmed point backwards.
 */
function findPriorLeaderPoint(
  history: LaneExplainerHistoryPoint[],
  confirmedTimestampMs: number,
  confirmedLane: BestLane
): LaneExplainerHistoryPoint | null {
  const sorted = history
    .filter((p) => p.marketDataFresh === true && p.timestampMs < confirmedTimestampMs && typeof p.bestLane === "string" && p.bestLane !== confirmedLane)
    .sort((a, b) => b.timestampMs - a.timestampMs);
  return sorted[0] ?? null;
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

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}