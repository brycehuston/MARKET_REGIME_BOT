import {
  BacktestDataStatus,
  CalendarRiskState,
  ConfirmationRequirement,
  EventContext,
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

export interface EventContextBuildOptions {
  scheduledEvents?: ScheduledEventContextInput[];
  macroContext?: EventContext["macroContext"];
  fedContext?: EventContext["fedContext"];
  cryptoCatalystContext?: EventContext["cryptoCatalystContext"];
  newsRiskState?: EventContext["newsRiskState"];
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

const EVENT_CONTEXT_VERSION = "event-context-v1";
const DEFAULT_SCHEDULED_EVENTS: ScheduledEventContextInput[] = [];
const SYNODIC_MONTH_DAYS = 29.530588853;
const KNOWN_NEW_MOON_UTC_MS = Date.UTC(2000, 0, 6, 18, 14, 0, 0);

export function buildEventContext(nowUtc: Date, options: EventContextBuildOptions = {}): EventContext {
  const nowMs = nowUtc.getTime();
  if (!Number.isFinite(nowMs)) {
    throw new Error("buildEventContext requires a valid UTC Date.");
  }

  const holidayContext = usHolidayLabels(nowUtc);
  const expiryContext = deriveExpiryContext(nowUtc);
  const liquidityContext = deriveLiquidityContext(nowUtc, holidayContext, expiryContext);
  const moonPhaseContext = deriveMoonPhaseContext(nowUtc);
  const scheduledEvents = options.scheduledEvents ?? DEFAULT_SCHEDULED_EVENTS;
  const activeWindows = scheduledEvents
    .map((event) => activeWindowForEvent(nowUtc, event))
    .filter((window): window is ActiveEventWindow => window !== null)
    .sort((left, right) => impactRank(right.event.impactClass) - impactRank(left.event.impactClass) || Math.abs(left.minutesDelta) - Math.abs(right.minutesDelta));
  const primary = activeWindows[0] ?? null;
  const nextHighImpact = nearestFutureHighImpact(nowUtc, scheduledEvents);

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
    macroContext: options.macroContext,
    fedContext: options.fedContext,
    cryptoCatalystContext: options.cryptoCatalystContext,
    moonPhaseContext
  };

  if (!primary && moonPhaseContext.phase) {
    context.eventType = "ANOMALY";
    context.eventImpactClass = "RESEARCH_ONLY";
  }

  return context;
}

export function formatEventContextSummary(eventContext: EventContext): string | null {
  const parts: string[] = [];

  if (eventContext.eventImpactClass !== "NONE" && eventContext.eventImpactClass !== "RESEARCH_ONLY") {
    const timing = eventContext.minutesToEvent !== null
      ? `in ${Math.round(eventContext.minutesToEvent)}m`
      : eventContext.minutesSinceEvent !== null
        ? `post-event ${Math.round(eventContext.minutesSinceEvent)}m`
        : eventContext.calendarRiskState.toLowerCase();
    parts.push(`Event: ${eventContext.nextHighImpactEvent ?? eventContext.eventType} ${timing} - context only`);
  }

  if (eventContext.liquidityContext !== "NORMAL") {
    parts.push(`Liquidity: ${formatEnumLabel(eventContext.liquidityContext)} - context only`);
  }

  if (eventContext.expiryContext !== "NONE") {
    parts.push(`Expiry: ${formatEnumLabel(eventContext.expiryContext)} - context only`);
  }

  if (eventContext.moonPhaseContext?.phase) {
    parts.push(`Anomaly: ${eventContext.moonPhaseContext.phase} - research-only tag`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
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
  const daysFromNewMoon = roundDays(Math.min(cyclePosition, SYNODIC_MONTH_DAYS - cyclePosition));
  const daysFromFullMoon = roundDays(Math.abs(cyclePosition - SYNODIC_MONTH_DAYS / 2));
  const phase = daysFromFullMoon <= 1 ? "Full moon" : daysFromNewMoon <= 1 ? "New moon" : null;

  return {
    phase,
    daysFromFullMoon,
    daysFromNewMoon,
    researchOnly: true
  };
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

function formatEnumLabel(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}