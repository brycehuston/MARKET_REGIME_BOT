import {
  BacktestDataStatus,
  CalendarRiskState,
  ConfirmationRequirement,
  DisplayRelevantEvent,
  EventContext,
  EventConfluenceLevel,
  EventImpactClass,
  EventRiskLevel,
  EventType,
  ExpiryContext,
  LiquidityContext,
  MarketMoveEventMode,
  MoonPhaseContext
} from "./types";

export interface ScheduledEventContextInput {
  name: string;
  type: Exclude<EventType, "NONE" | "ANOMALY">;
  impactClass: Exclude<EventImpactClass, "NONE" | "RESEARCH_ONLY">;
  scheduledUtc: string;
  sourceLabel?: string;
  backtestDataStatus?: BacktestDataStatus;
}

export interface BtcHalvingContextInput {
  estimatedNextBtcHalvingTimeUtc?: string | null;
  blocksToNextBtcHalving?: number | null;
  daysToNextBtcHalving?: number | null;
}

export interface EventContextBuildOptions {
  scheduledEvents?: ScheduledEventContextInput[];
  macroContext?: EventContext["macroContext"];
  macroLiquidityContext?: EventContext["macroLiquidityContext"];
  fedContext?: EventContext["fedContext"];
  cryptoCatalystContext?: EventContext["cryptoCatalystContext"];
  newsRiskState?: EventContext["newsRiskState"];
  btcHalvingContext?: BtcHalvingContextInput;
}

interface ActiveEventWindow {
  event: ScheduledEventContextInput;
  minutesDelta: number;
  state: CalendarRiskState;
  riskLevel: EventRiskLevel;
  marketMoveEventMode: MarketMoveEventMode;
  confirmationRequirement: ConfirmationRequirement;
  reason: string;
}

interface ObservedDisplayCandidate {
  tag: string;
  type: DisplayRelevantEvent["type"];
  displayText: string | null;
  reason: string | null;
  relevant: boolean;
  researchOnly?: true;
  structuralOnly?: true;
}

const EVENT_CONTEXT_VERSION = "event-context-v1";
const DEFAULT_SCHEDULED_EVENTS: ScheduledEventContextInput[] = [];
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC_MS = Date.UTC(2000, 0, 6, 18, 14, 0, 0);
const BTC_HALVING_BLOCK_HEIGHT = 1050000 as const;
const BTC_HALVING_DISPLAY_DAYS = new Set([-1, 0, 1, 7, 30, 90, 180]);

export function buildEventContext(nowUtc: Date, options: EventContextBuildOptions = {}): EventContext {
  const nowMs = nowUtc.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("buildEventContext requires a valid UTC Date.");
  }

  const holidayContext = usHolidayLabels(nowUtc);
  const expiryContext = deriveExpiryContext(nowUtc);
  const liquidityContext = deriveLiquidityContext(nowUtc, holidayContext, expiryContext);
  const moonPhaseContext = deriveMoonPhaseContext(nowUtc);
  const btcHalvingContext = deriveBtcHalvingContext(nowUtc, options.btcHalvingContext);
  const scheduledEvents = options.scheduledEvents ?? DEFAULT_SCHEDULED_EVENTS;
  const activeWindows = scheduledEvents
    .map((event) => activeWindowForEvent(nowUtc, event))
    .filter((window): window is ActiveEventWindow => window !== null)
    .sort((left, right) => impactRank(right.event.impactClass) - impactRank(left.event.impactClass) || Math.abs(left.minutesDelta) - Math.abs(right.minutesDelta));
  const primary = activeWindows[0] ?? null;
  const nextHighImpact = nearestFutureHighImpact(nowUtc, scheduledEvents);
  const observedDisplayCandidates = buildObservedDisplayCandidates(nowUtc, scheduledEvents, liquidityContext, holidayContext, expiryContext, moonPhaseContext, btcHalvingContext);
  const displayRelevantEvents = observedDisplayCandidates
    .filter((candidate) => candidate.relevant && candidate.displayText && candidate.reason)
    .map((candidate): DisplayRelevantEvent => ({
      tag: candidate.tag,
      type: candidate.type,
      displayText: candidate.displayText ?? "",
      reason: candidate.reason ?? "",
      ...(candidate.researchOnly ? { researchOnly: true as const } : {}),
      ...(candidate.structuralOnly ? { structuralOnly: true as const } : {})
    }));
  const stackTags = unique(displayRelevantEvents.map((event) => event.tag));
  const eventStackCount = displayRelevantEvents.length;
  const eventConfluenceLevel = deriveEventConfluenceLevel(displayRelevantEvents);
  const eventDisplayReasons = buildEventDisplayReasons(displayRelevantEvents);
  const hiddenObservedEventsCount = observedDisplayCandidates.filter((candidate) => !candidate.relevant).length;

  const context: EventContext = {
    eventRiskLevel: primary?.riskLevel ?? "LOW",
    nextHighImpactEvent: primary?.event.name ?? nextHighImpact?.name ?? null,
    minutesToEvent: primary && primary.minutesDelta <= 0 ? Math.abs(primary.minutesDelta) : nextHighImpact?.minutesToEvent ?? null,
    minutesSinceEvent: primary && primary.minutesDelta > 0 ? primary.minutesDelta : null,
    eventType: primary?.event.type ?? "NONE",
    eventImpactClass: primary?.event.impactClass ?? "NONE",
    calendarRiskState: deriveCalendarRiskState(activeWindows, primary),
    liquidityContext,
    holidayContext,
    expiryContext,
    newsRiskState: options.newsRiskState ?? "NONE",
    eventSuppressionReason: primary?.reason ?? liquidityAdvisoryReason(liquidityContext, expiryContext),
    confirmationRequirement: primary?.confirmationRequirement ?? "NORMAL",
    marketMoveEventMode: primary?.marketMoveEventMode ?? "NORMAL",
    backtestDataStatus: primary?.event.backtestDataStatus ?? nextHighImpact?.backtestDataStatus ?? "KNOWN_AHEAD",
    eventContextVersion: EVENT_CONTEXT_VERSION,
    eventContextOperational: false,
    eventStackCount,
    eventStackTags: stackTags,
    eventConfluenceLevel,
    eventDisplayReasons,
    displayRelevantEvents,
    hiddenObservedEventsCount,
    macroContext: options.macroContext,
    macroLiquidityContext: options.macroLiquidityContext,
    fedContext: options.fedContext,
    cryptoCatalystContext: options.cryptoCatalystContext,
    moonPhaseContext,
    btcHalvingContext
  };

  return context;
}

export function formatEventContextSummary(eventContext: EventContext): string | null {
  const parts: string[] = [...eventContext.eventDisplayReasons];

  if (eventContext.macroContext) {
    if (eventContext.macroContext.fredEnabled) {
      parts.push("Macro: FRED context available - data context only; no score impact");
    } else {
      parts.push("Macro: FRED unavailable - context skipped");
    }
  }

  if (eventContext.macroLiquidityContext) {
    if (eventContext.macroLiquidityContext.treasuryEnabled) {
      parts.push("Liquidity: Treasury FiscalData available - TGA context only; no score impact");
    } else if (eventContext.macroLiquidityContext.treasuryError) {
      parts.push("Liquidity: Treasury FiscalData unavailable - context skipped");
    }

    if (eventContext.macroLiquidityContext.netLiquidityProxy !== null) {
      parts.push("Liquidity: Net liquidity proxy available - telemetry only");
    }
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function buildObservedDisplayCandidates(
  nowUtc: Date,
  scheduledEvents: ScheduledEventContextInput[],
  liquidityContext: LiquidityContext,
  holidayContext: string[],
  expiryContext: ExpiryContext,
  moonPhaseContext: MoonPhaseContext,
  btcHalvingContext: EventContext["btcHalvingContext"]
): ObservedDisplayCandidate[] {
  return [
    ...scheduledEvents.map((event) => scheduledEventDisplayCandidate(nowUtc, event)),
    ...calendarDisplayCandidates(nowUtc, liquidityContext, holidayContext, expiryContext),
    moonDisplayCandidate(moonPhaseContext),
    btcHalvingDisplayCandidate(btcHalvingContext)
  ];
}

function scheduledEventDisplayCandidate(nowUtc: Date, event: ScheduledEventContextInput): ObservedDisplayCandidate {
  const eventMs = new Date(event.scheduledUtc).getTime();
  if (!Number.isFinite(eventMs)) {
    return { tag: event.name.toUpperCase(), type: event.type, displayText: null, reason: null, relevant: false };
  }

  const minutesDelta = Math.round((nowUtc.getTime() - eventMs) / 60000);
  const eventName = event.name.toUpperCase();
  const window = scheduledDisplayWindow(eventName, event.type, event.impactClass, minutesDelta);
  const tag = scheduledDisplayTag(eventName, event.type);
  if (!window) return { tag, type: event.type, displayText: null, reason: null, relevant: false };

  const timing = formatEventTiming(minutesDelta);
  const risk = event.impactClass === "TIER_A" ? "HIGH" : event.impactClass === "TIER_B" ? "MEDIUM" : "LOW";
  const displayText = `Event: ${event.name} ${timing} - risk ${risk} - context only`;
  return { tag, type: event.type, displayText, reason: displayText, relevant: true };
}

function scheduledDisplayWindow(eventName: string, eventType: EventType, impactClass: EventImpactClass, minutesDelta: number): string | null {
  if (eventName.includes("PRESS") && eventName.includes("FOMC")) return minutesDelta >= -120 && minutesDelta <= 120 ? "FOMC_PRESS" : null;
  if (eventName.includes("FED MINUTES") || eventName.includes("FOMC MINUTES")) return minutesDelta >= -360 && minutesDelta <= 60 ? "FED_MINUTES" : null;
  if (eventName.includes("CPI") || eventName.includes("NFP") || eventName.includes("FOMC")) return minutesDelta >= -1440 && minutesDelta <= 60 ? "TIER_A_MAJOR" : null;
  if (impactClass === "TIER_A") return minutesDelta >= -120 && minutesDelta <= 60 ? "TIER_A" : null;
  if (impactClass === "TIER_B") return minutesDelta >= -180 && minutesDelta <= 120 ? "TIER_B" : null;
  if (impactClass === "TIER_C") return minutesDelta >= -60 && minutesDelta <= 30 ? "TIER_C" : null;
  if (eventType === "FED") return minutesDelta >= -120 && minutesDelta <= 120 ? "FED" : null;
  return null;
}

function scheduledDisplayTag(eventName: string, eventType: EventType): string {
  if (eventName.includes("CPI")) return "CPI";
  if (eventName.includes("NFP")) return "NFP";
  if (eventName.includes("FOMC")) return "FOMC";
  if (eventName.includes("FED")) return "FED";
  return eventType;
}

function calendarDisplayCandidates(nowUtc: Date, liquidityContext: LiquidityContext, holidayContext: string[], expiryContext: ExpiryContext): ObservedDisplayCandidate[] {
  const candidates: ObservedDisplayCandidate[] = [];

  const tomorrow = addUtcDays(nowUtc, 1);
  const tomorrowHoliday = usHolidayLabels(tomorrow);
  if (holidayContext.length > 0) {
    candidates.push(calendarCandidate("US_HOLIDAY", "HOLIDAY", `Liquidity: US Holiday today (${holidayContext.join(", ")}) - context only`, true));
  } else if (tomorrowHoliday.length > 0) {
    candidates.push(calendarCandidate("US_HOLIDAY", "HOLIDAY", `Liquidity: US Holiday tomorrow (${tomorrowHoliday.join(", ")}) - context only`, true));
  }

  if (liquidityContext === "THIN_WEEKEND") {
    candidates.push(calendarCandidate("THIN_WEEKEND", "LIQUIDITY", "Liquidity: thin weekend window - context only", true));
  }

  const monthEndHours = hoursUntilUtcMonthEnd(nowUtc);
  const isQuarterEndWindow = monthEndHours <= 48 && [2, 5, 8, 11].includes(nowUtc.getUTCMonth());
  if (liquidityContext === "QUARTER_END" || isQuarterEndWindow) {
    candidates.push(calendarCandidate("QUARTER_END", "LIQUIDITY", "Liquidity: quarter-end window - context only", monthEndHours <= 48));
  } else if (liquidityContext === "MONTH_END" || monthEndHours <= 48) {
    candidates.push(calendarCandidate("MONTH_END", "LIQUIDITY", "Liquidity: month-end window - context only", monthEndHours <= 48));
  }

  const nextExpiry = nextExpiryDisplay(nowUtc, expiryContext);
  if (nextExpiry) {
    candidates.push(calendarCandidate("EXPIRY", "EXPIRY", nextExpiry, true));
  }

  return candidates;
}

function calendarCandidate(tag: string, type: DisplayRelevantEvent["type"], displayText: string, relevant: boolean): ObservedDisplayCandidate {
  return { tag, type, displayText: relevant ? displayText : null, reason: relevant ? displayText : null, relevant };
}

function moonDisplayCandidate(moonPhaseContext: MoonPhaseContext): ObservedDisplayCandidate {
  const phase = moonPhaseContext.phase;
  const tag = phase === "FULL_MOON_WINDOW" ? "FULL_MOON_RESEARCH" : phase === "NEW_MOON_WINDOW" ? "NEW_MOON_RESEARCH" : "MOON_RESEARCH";
  if (phase !== "FULL_MOON_WINDOW" && phase !== "NEW_MOON_WINDOW") {
    return { tag, type: "ANOMALY", displayText: null, reason: null, relevant: false, researchOnly: true };
  }

  const label = phase === "FULL_MOON_WINDOW" ? "full moon" : "new moon";
  const dayLabel = phase === "FULL_MOON_WINDOW" ? formatMoonDayLabel(moonPhaseContext.daysFromFullMoon) : formatMoonDayLabel(moonPhaseContext.daysFromNewMoon);
  const displayText = `Anomaly: ${label} ${dayLabel} - research-only`;
  return { tag, type: "ANOMALY", displayText, reason: displayText, relevant: true, researchOnly: true };
}

function btcHalvingDisplayCandidate(btcHalvingContext: EventContext["btcHalvingContext"]): ObservedDisplayCandidate {
  const days = btcHalvingContext.daysToNextBtcHalving;
  if (days === null || !BTC_HALVING_DISPLAY_DAYS.has(Math.round(days))) {
    return { tag: "BTC_HALVING", type: "BTC_HALVING", displayText: null, reason: null, relevant: false, structuralOnly: true };
  }

  const roundedDays = Math.round(days);
  const label = roundedDays === 0 ? "day-of" : roundedDays === -1 ? "T+1d" : `${roundedDays}d estimate`;
  const displayText = `BTC halving window: ${label} - structural context only`;
  return { tag: "BTC_HALVING", type: "BTC_HALVING", displayText, reason: displayText, relevant: true, structuralOnly: true };
}

function buildEventDisplayReasons(displayRelevantEvents: DisplayRelevantEvent[]): string[] {
  if (displayRelevantEvents.length === 0) return [];
  if (displayRelevantEvents.length === 1) return [displayRelevantEvents[0].displayText];
  return [`Event Stack: ${displayRelevantEvents.map((event) => compactStackLabel(event)).join(" + ")}`];
}

function compactStackLabel(event: DisplayRelevantEvent): string {
  if (event.tag === "FULL_MOON_RESEARCH") return "full moon research tag";
  if (event.tag === "NEW_MOON_RESEARCH") return "new moon research tag";
  if (event.tag === "EXPIRY") return "expiry";
  if (event.tag === "US_HOLIDAY") return "US holiday";
  if (event.tag === "THIN_WEEKEND") return "weekend liquidity";
  if (event.tag === "MONTH_END") return "month-end";
  if (event.tag === "QUARTER_END") return "quarter-end";
  if (event.tag === "BTC_HALVING") return "BTC halving structural tag";
  return `${event.tag} today`;
}

function deriveEventConfluenceLevel(displayRelevantEvents: DisplayRelevantEvent[]): EventConfluenceLevel {
  const count = displayRelevantEvents.length;
  if (count === 0) return "NONE";
  if (count === 1) return "LOW";
  if (count === 2) return "MEDIUM";
  if (count === 3) return "HIGH";
  return "EXTREME";
}

function activeWindowForEvent(nowUtc: Date, event: ScheduledEventContextInput): ActiveEventWindow | null {
  const eventMs = new Date(event.scheduledUtc).getTime();
  if (!Number.isFinite(eventMs)) return null;

  const minutesDelta = Math.round((nowUtc.getTime() - eventMs) / 60000);
  const impact = event.impactClass;

  if (impact === "TIER_A") {
    if (minutesDelta >= -120 && minutesDelta < 0) {
      return buildWindow(event, minutesDelta, "PRE_EVENT", "HIGH", "SUPPRESS_WEAK", "TWO_SCAN", "Advisory only: Tier A event window");
    }
    if (minutesDelta === 0) {
      return buildWindow(event, minutesDelta, "LIVE_EVENT", "HIGH", "POST_EVENT_CONFIRM", "POST_EVENT_WAIT", "Advisory only: Tier A live event context");
    }
    if (minutesDelta > 0 && minutesDelta <= 60) {
      return buildWindow(event, minutesDelta, "POST_EVENT", "HIGH", "POST_EVENT_CONFIRM", "POST_EVENT_WAIT", "Advisory only: post-event confirmation context");
    }
  }

  if (impact === "TIER_B") {
    if (minutesDelta >= -180 && minutesDelta < 0) {
      return buildWindow(event, minutesDelta, "PRE_EVENT", "MEDIUM", "CAUTION", "ONE_CLOSE", "Advisory only: Tier B event window");
    }
    if (minutesDelta === 0) {
      return buildWindow(event, minutesDelta, "LIVE_EVENT", "MEDIUM", "CAUTION", "ONE_CLOSE", "Advisory only: Tier B live event context");
    }
    if (minutesDelta > 0 && minutesDelta <= 120) {
      return buildWindow(event, minutesDelta, "POST_EVENT", "MEDIUM", "CAUTION", "ONE_CLOSE", "Advisory only: Tier B post-event context");
    }
  }

  if (impact === "TIER_C" && minutesDelta >= -60 && minutesDelta <= 30) {
    const state = minutesDelta < 0 ? "PRE_EVENT" : minutesDelta === 0 ? "LIVE_EVENT" : "POST_EVENT";
    return buildWindow(event, minutesDelta, state, "LOW", "NORMAL", "NORMAL", "Advisory only: Tier C event context");
  }

  return null;
}

function buildWindow(
  event: ScheduledEventContextInput,
  minutesDelta: number,
  state: CalendarRiskState,
  riskLevel: EventRiskLevel,
  marketMoveEventMode: MarketMoveEventMode,
  confirmationRequirement: ConfirmationRequirement,
  reason: string
): ActiveEventWindow {
  return { event, minutesDelta, state, riskLevel, marketMoveEventMode, confirmationRequirement, reason };
}

function deriveCalendarRiskState(activeWindows: ActiveEventWindow[], primary: ActiveEventWindow | null): CalendarRiskState {
  const stackable = activeWindows.filter((window) => window.event.impactClass === "TIER_A" || window.event.impactClass === "TIER_B");
  if (stackable.length >= 2) return "STACKED_EVENTS";
  return primary?.state ?? "CLEAR";
}

function nearestFutureHighImpact(nowUtc: Date, events: ScheduledEventContextInput[]): (ScheduledEventContextInput & { minutesToEvent: number }) | null {
  const candidates = events
    .filter((event) => event.impactClass === "TIER_A" || event.impactClass === "TIER_B")
    .map((event) => ({ ...event, minutesToEvent: Math.round((new Date(event.scheduledUtc).getTime() - nowUtc.getTime()) / 60000) }))
    .filter((event) => Number.isFinite(event.minutesToEvent) && event.minutesToEvent >= 0)
    .sort((left, right) => left.minutesToEvent - right.minutesToEvent);
  return candidates[0] ?? null;
}

function deriveLiquidityContext(nowUtc: Date, holidayContext: string[], expiryContext: ExpiryContext): LiquidityContext {
  if (holidayContext.length > 0) return "US_HOLIDAY";
  if (expiryContext !== "NONE") return "EXPIRY_DAY";
  if (isQuarterEnd(nowUtc)) return "QUARTER_END";
  if (isMonthEnd(nowUtc)) return "MONTH_END";
  if (isWeekend(nowUtc)) return "THIN_WEEKEND";
  return "NORMAL";
}

function deriveExpiryContext(nowUtc: Date): ExpiryContext {
  if (nowUtc.getUTCDay() !== 5) return "NONE";
  if (isQuarterlyExpiryFriday(nowUtc)) return "QUARTERLY_EXPIRY";
  if (isThirdFriday(nowUtc)) return "MONTHLY_OPTIONS";
  return "WEEKLY_OPTIONS";
}

function nextExpiryDisplay(nowUtc: Date, expiryContext: ExpiryContext): string | null {
  if (expiryContext !== "NONE") return `Expiry: ${formatEnumLabel(expiryContext)} day-of - context only`;

  for (let daysAhead = 1; daysAhead <= 3; daysAhead += 1) {
    const date = addUtcDays(nowUtc, daysAhead);
    const context = deriveExpiryContext(date);
    if (context !== "NONE" && (daysAhead === 1 || daysAhead === 3)) {
      return `Expiry: ${formatEnumLabel(context)} T-${daysAhead}d - context only`;
    }
  }

  return null;
}

function liquidityAdvisoryReason(liquidityContext: LiquidityContext, expiryContext: ExpiryContext): string | null {
  if (liquidityContext === "NORMAL" && expiryContext === "NONE") return null;
  if (expiryContext !== "NONE") return "Advisory only: expiry context";
  return "Advisory only: thin-liquidity context";
}

function usHolidayLabels(nowUtc: Date): string[] {
  const year = nowUtc.getUTCFullYear();
  const month = nowUtc.getUTCMonth();
  const day = nowUtc.getUTCDate();
  const holidays: Array<[string, Date]> = [
    ["New Year's Day", observedFixedHoliday(year, 0, 1)],
    ["Martin Luther King Jr. Day", nthWeekdayOfMonth(year, 0, 1, 3)],
    ["Presidents' Day", nthWeekdayOfMonth(year, 1, 1, 3)],
    ["Memorial Day", lastWeekdayOfMonth(year, 4, 1)],
    ["Juneteenth", observedFixedHoliday(year, 5, 19)],
    ["Independence Day", observedFixedHoliday(year, 6, 4)],
    ["Labor Day", nthWeekdayOfMonth(year, 8, 1, 1)],
    ["Thanksgiving Day", nthWeekdayOfMonth(year, 10, 4, 4)],
    ["Christmas Day", observedFixedHoliday(year, 11, 25)]
  ];

  return holidays
    .filter(([, date]) => date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day)
    .map(([name]) => name);
}

function deriveMoonPhaseContext(nowUtc: Date): MoonPhaseContext {
  const elapsedDays = (nowUtc.getTime() - KNOWN_NEW_MOON_UTC_MS) / 86400000;
  const cyclePosition = positiveModulo(elapsedDays, SYNODIC_MONTH_DAYS);
  const signedDaysFromNewMoon = signedCycleDistance(cyclePosition, 0);
  const signedDaysFromFullMoon = signedCycleDistance(cyclePosition, SYNODIC_MONTH_DAYS / 2);
  const daysFromNewMoon = roundDays(Math.abs(signedDaysFromNewMoon));
  const daysFromFullMoon = roundDays(Math.abs(signedDaysFromFullMoon));
  const phase = signedDaysFromFullMoon >= -3 && signedDaysFromFullMoon <= 1
    ? "FULL_MOON_WINDOW"
    : signedDaysFromNewMoon >= -3 && signedDaysFromNewMoon <= 1
      ? "NEW_MOON_WINDOW"
      : "NONE";

  return {
    phase,
    daysFromFullMoon,
    daysFromNewMoon,
    researchOnly: true
  };
}

function deriveBtcHalvingContext(nowUtc: Date, input: BtcHalvingContextInput | undefined): EventContext["btcHalvingContext"] {
  const estimated = input?.estimatedNextBtcHalvingTimeUtc ?? null;
  const estimatedMs = estimated ? new Date(estimated).getTime() : NaN;
  const daysFromEstimate = Number.isFinite(estimatedMs) ? roundDays((estimatedMs - nowUtc.getTime()) / 86400000) : null;
  const daysToNextBtcHalving = input?.daysToNextBtcHalving ?? daysFromEstimate;
  const displayWindow = daysToNextBtcHalving !== null && BTC_HALVING_DISPLAY_DAYS.has(Math.round(daysToNextBtcHalving))
    ? btcHalvingWindowLabel(Math.round(daysToNextBtcHalving))
    : null;

  return {
    nextBtcHalvingBlockHeight: BTC_HALVING_BLOCK_HEIGHT,
    estimatedNextBtcHalvingTimeUtc: estimated,
    blocksToNextBtcHalving: input?.blocksToNextBtcHalving ?? null,
    daysToNextBtcHalving,
    btcHalvingDisplayWindow: displayWindow,
    structuralOnly: true
  };
}

function btcHalvingWindowLabel(days: number): string {
  if (days === -1) return "T+1d";
  if (days === 0) return "DAY_OF";
  return `T-${days}d`;
}

function formatEventTiming(minutesDelta: number): string {
  if (minutesDelta === 0) return "live";
  if (minutesDelta > 0) return `post-event ${minutesDelta}m`;
  const minutesToEvent = Math.abs(minutesDelta);
  if (minutesToEvent < 120) return `in ${minutesToEvent}m`;
  const hours = Math.round((minutesToEvent / 60) * 10) / 10;
  return `in ${hours}h`;
}

function formatMoonDayLabel(days: number | null): string {
  if (days === null) return "window";
  if (days <= 0.5) return "today";
  if (days <= 1.5) return "1d window";
  return `${Math.round(days)}d window`;
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function isMonthEnd(date: Date): boolean {
  return date.getUTCDate() === daysInUtcMonth(date.getUTCFullYear(), date.getUTCMonth());
}

function isQuarterEnd(date: Date): boolean {
  return isMonthEnd(date) && [2, 5, 8, 11].includes(date.getUTCMonth());
}

function isThirdFriday(date: Date): boolean {
  return date.getUTCDay() === 5 && date.getUTCDate() >= 15 && date.getUTCDate() <= 21;
}

function isQuarterlyExpiryFriday(date: Date): boolean {
  return isThirdFriday(date) && [2, 5, 8, 11].includes(date.getUTCMonth());
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function observedFixedHoliday(year: number, month: number, day: number): Date {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) return new Date(Date.UTC(year, month, day - 1));
  if (date.getUTCDay() === 0) return new Date(Date.UTC(year, month, day + 1));
  return date;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (nth - 1) * 7));
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

function impactRank(impactClass: EventImpactClass): number {
  if (impactClass === "TIER_A") return 3;
  if (impactClass === "TIER_B") return 2;
  if (impactClass === "TIER_C") return 1;
  return 0;
}

function roundDays(value: number): number {
  return Math.round(value * 10) / 10;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function signedCycleDistance(position: number, target: number): number {
  const raw = position - target;
  if (raw > SYNODIC_MONTH_DAYS / 2) return raw - SYNODIC_MONTH_DAYS;
  if (raw < -SYNODIC_MONTH_DAYS / 2) return raw + SYNODIC_MONTH_DAYS;
  return raw;
}

function formatEnumLabel(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

function hoursUntilUtcMonthEnd(date: Date): number {
  const end = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), daysInUtcMonth(date.getUTCFullYear(), date.getUTCMonth()), 23, 59, 59, 999);
  return Math.max(0, (end - date.getTime()) / 3600000);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
