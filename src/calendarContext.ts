import {
  CalendarContext,
  CalendarLiquidityContext,
  HolidayContext,
  HolidayItem,
  HolidayType,
  LaunchWindowContext
} from "./types";

const CALENDAR_CONTEXT_VERSION = "calendar-context-v1.1";
const MS_PER_DAY = 86400000;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

interface HolidayDefinition {
  name: string;
  countryCode: string;
  type: HolidayType;
  dateForYear: (year: number) => Date;
  observed?: true;
}

interface HolidayCandidate {
  name: string;
  countryCode: string;
  type: HolidayType;
  date: Date;
  observedDate: Date | null;
}

export function buildCalendarContext(scanTimeUtc: Date): CalendarContext {
  assertValidDate(scanTimeUtc);

  const holidayContext = buildHolidayContext(scanTimeUtc);
  const scanDateUtc = utcDateString(scanTimeUtc);
  const weekendFlag = isUtcWeekend(scanTimeUtc);
  const monthEndFlag = isUtcMonthEnd(scanTimeUtc);
  const quarterEndFlag = isUtcQuarterEnd(scanTimeUtc);
  const yearEndFlag = isUtcYearEnd(scanTimeUtc);
  const longWeekendFlag = isLongWeekend(scanTimeUtc);
  const liquidityContext = deriveCalendarLiquidityContext(scanTimeUtc, holidayContext, {
    weekendFlag,
    monthEndFlag,
    quarterEndFlag,
    yearEndFlag,
    longWeekendFlag
  });

  return {
    calendarContextVersion: CALENDAR_CONTEXT_VERSION,
    scanDateUtc,
    scanDayOfWeekUtc: DAY_NAMES[scanTimeUtc.getUTCDay()],
    weekendFlag,
    monthEndFlag,
    quarterEndFlag,
    yearEndFlag,
    longWeekendFlag,
    liquidityContext,
    calendarRiskState: liquidityContext === "NORMAL" ? "CLEAR" : "CALENDAR_CAUTION",
    backtestDataStatus: "KNOWN_AHEAD",
    calendarContextOperational: false
  };
}

export function buildHolidayContext(scanTimeUtc: Date): HolidayContext {
  assertValidDate(scanTimeUtc);

  const scanDate = utcDateOnly(scanTimeUtc);
  const candidates = holidayCandidatesAround(scanTimeUtc);
  const activeHolidays = candidates
    .map((candidate) => toHolidayItem(candidate, scanDate))
    .filter((item) => item.isToday || item.isObservedToday)
    .sort(sortHolidayItems);
  const upcomingHolidaysNext7d = candidates
    .map((candidate) => toHolidayItem(candidate, scanDate))
    .filter((item) => !item.isToday && !item.isObservedToday && item.daysUntil >= 0 && item.daysUntil <= 7)
    .sort(sortHolidayItems);
  const countryCodes = unique(activeHolidays.map((holiday) => holiday.countryCode));
  const names = activeHolidays.map((holiday) => holiday.name);

  return {
    activeHolidays,
    upcomingHolidaysNext7d,
    observedHolidayToday: activeHolidays.some((holiday) => holiday.isObservedToday),
    actualHolidayToday: activeHolidays.some((holiday) => holiday.isToday),
    countryCodes,
    holidayContextText: names.length > 0 ? names.join(", ") : null,
    source: "STATIC_CALENDAR_V1_1",
    backtestDataStatus: "KNOWN_AHEAD"
  };
}

export function buildLaunchWindowContext(scanTimeUtc: Date, holidayContext: HolidayContext = buildHolidayContext(scanTimeUtc)): LaunchWindowContext {
  assertValidDate(scanTimeUtc);

  if (isNewYearWindow(scanTimeUtc)) {
    return activeLaunchWindow("New Year Window", "Calendar: New Year window - thin liquidity and narrative noise may be elevated.", "BROAD_CRYPTO", "ELEVATED_NOISE", "NATIONAL_HOLIDAY_THEME");
  }

  if (isChristmasYearEndWindow(scanTimeUtc)) {
    return activeLaunchWindow("Christmas / Year-End Window", "Calendar: Christmas / year-end window - thin liquidity and launch noise may be elevated.", "BROAD_CRYPTO", "ELEVATED_NOISE", "NATIONAL_HOLIDAY_THEME");
  }

  if (isBlackFridayCyberMondayWindow(scanTimeUtc)) return activeLaunchWindow("Black Friday / Cyber Monday", "Calendar: Black Friday / Cyber Monday - retail narrative activity may be elevated.", "BROAD_CRYPTO", "ELEVATED_NOISE", "MEME_DATE");
  if (isHalloweenWindow(scanTimeUtc)) return activeLaunchWindow("Halloween Window 🎃", "Calendar: Halloween window - narrative launch noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "MEME_DATE");
  if (isJulyFourthWindow(scanTimeUtc)) return activeLaunchWindow("July 4th Window", "Calendar: July 4th window - institutional volume may be thin; fakeout risk context only.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "NATIONAL_HOLIDAY_THEME");
  if (isCanadaDayWindow(scanTimeUtc)) return activeLaunchWindow("Canada Day Window", "Calendar: Canada Day window - thin liquidity and meme-launch noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "NATIONAL_HOLIDAY_THEME");
  if (isEasterWeekendWindow(scanTimeUtc)) return activeLaunchWindow("Easter Weekend 🐣", "Calendar: Easter weekend - holiday liquidity and narrative noise may be elevated.", "BROAD_CRYPTO", "ELEVATED_NOISE", "MEME_DATE");
  if (isStPatricksWindow(scanTimeUtc)) return activeLaunchWindow("St Patrick’s Window 🍀", "Calendar: St Patrick’s window - narrative launch noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "MEME_DATE");
  if (isValentinesWindow(scanTimeUtc)) return activeLaunchWindow("Valentine’s Window 💘", "Calendar: Valentine’s window - narrative launch noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "MEME_DATE");
  if (isAprilFoolsWindow(scanTimeUtc)) return activeLaunchWindow("April Fools Window 🃏", "Calendar: April Fools window - prank and narrative noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "MEME_DATE");
  if (isCincoDeMayoWindow(scanTimeUtc)) return activeLaunchWindow("Cinco de Mayo Window", "Calendar: Cinco de Mayo window - narrative launch noise may be elevated.", "SOL_MEME_MICROCAPS", "ELEVATED_NOISE", "MEME_DATE");

  const nationalHoliday = holidayContext.activeHolidays.find((holiday) => holiday.type === "NATIONAL");
  if (nationalHoliday) {
    return activeLaunchWindow(
      `${nationalHoliday.name} theme`,
      "Launch Window: National holiday theme - SOL meme/microcap noise may be elevated.",
      "SOL_MEME_MICROCAPS",
      "ELEVATED_NOISE",
      "NATIONAL_HOLIDAY_THEME"
    );
  }

  return {
    launchWindowActive: false,
    launchWindowType: "NONE",
    launchWindowName: null,
    launchWindowRisk: "NONE",
    launchWindowReason: null,
    affectedMarket: "NONE",
    backtestDataStatus: "KNOWN_AHEAD",
    telemetryOnly: true
  };
}

export function utcDateString(date: Date): string {
  assertValidDate(date);
  return date.toISOString().slice(0, 10);
}

export function isUtcWeekend(date: Date): boolean {
  assertValidDate(date);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isUtcMonthEnd(date: Date): boolean {
  assertValidDate(date);
  return date.getUTCDate() === daysInUtcMonth(date.getUTCFullYear(), date.getUTCMonth());
}

export function isUtcQuarterEnd(date: Date): boolean {
  return isUtcMonthEnd(date) && [2, 5, 8, 11].includes(date.getUTCMonth());
}

export function isUtcYearEnd(date: Date): boolean {
  assertValidDate(date);
  return date.getUTCMonth() === 11 && date.getUTCDate() === 31;
}

export function isLongWeekend(date: Date): boolean {
  assertValidDate(date);
  const scan = utcDateOnly(date);
  return holidayCandidatesAround(date).some((holiday) => {
    const anchor = holiday.observedDate ?? holiday.date;
    const weekday = anchor.getUTCDay();
    const delta = diffUtcDays(scan, anchor);

    if (weekday === 5) return delta >= 0 && delta <= 3;
    if (weekday === 1) return delta >= -2 && delta <= 0;
    return false;
  });
}

export function isCanadaDayWindow(date: Date): boolean {
  assertValidDate(date);
  return inMonthDayWindow(date, 5, 30, 6, 2);
}

export function isJulyFourthWindow(date: Date): boolean {
  assertValidDate(date);
  return inMonthDayWindow(date, 6, 3, 6, 5);
}

export function isNewYearWindow(date: Date): boolean {
  assertValidDate(date);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return (month === 11 && day === 31) || (month === 0 && day === 1);
}

export function isChristmasYearEndWindow(date: Date): boolean {
  assertValidDate(date);
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return (month === 11 && day >= 24) || (month === 0 && day === 1);
}

export function isValentinesWindow(date: Date): boolean { return inMonthDayWindow(date, 1, 13, 1, 15); }
export function isStPatricksWindow(date: Date): boolean { return inMonthDayWindow(date, 2, 16, 2, 18); }
export function isAprilFoolsWindow(date: Date): boolean { return inMonthDayWindow(date, 2, 31, 3, 1); }
export function isCincoDeMayoWindow(date: Date): boolean { return inMonthDayWindow(date, 4, 4, 4, 6); }
export function isHalloweenWindow(date: Date): boolean { return inMonthDayWindow(date, 9, 30, 10, 1); }

export function gregorianEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(year, month - 1, day);
}

export function isEasterWeekendWindow(date: Date): boolean {
  assertValidDate(date);
  const easter = gregorianEasterSunday(date.getUTCFullYear());
  const scan = utcDateOnly(date).getTime();
  return scan >= addUtcDays(easter, -2).getTime() && scan <= addUtcDays(easter, 1).getTime();
}

export function isBlackFridayCyberMondayWindow(date: Date): boolean {
  assertValidDate(date);
  const thanksgiving = nthWeekdayOfMonth(date.getUTCFullYear(), 10, 4, 4);
  const scan = utcDateOnly(date).getTime();
  return scan >= addUtcDays(thanksgiving, 1).getTime() && scan <= addUtcDays(thanksgiving, 4).getTime();
}

function deriveCalendarLiquidityContext(
  scanTimeUtc: Date,
  holidayContext: HolidayContext,
  flags: Pick<CalendarContext, "weekendFlag" | "monthEndFlag" | "quarterEndFlag" | "yearEndFlag" | "longWeekendFlag">
): CalendarLiquidityContext {
  const activeCountries = new Set(holidayContext.countryCodes);

  if (flags.yearEndFlag || isChristmasYearEndWindow(scanTimeUtc)) return "YEAR_END";
  if (flags.quarterEndFlag) return "QUARTER_END";
  if (flags.monthEndFlag) return "MONTH_END";
  if (activeCountries.has("US")) return "US_HOLIDAY";
  if (activeCountries.has("CA")) return "CANADA_HOLIDAY";
  if (activeCountries.size > 0) return "GLOBAL_HOLIDAY";
  if (flags.longWeekendFlag) return "LONG_WEEKEND";
  if (flags.weekendFlag) return "THIN_WEEKEND";
  return "NORMAL";
}

function activeLaunchWindow(
  name: string,
  reason: string,
  affectedMarket: LaunchWindowContext["affectedMarket"],
  risk: LaunchWindowContext["launchWindowRisk"],
  type: LaunchWindowContext["launchWindowType"]
): LaunchWindowContext {
  return {
    launchWindowActive: true,
    launchWindowType: type,
    launchWindowName: name,
    launchWindowRisk: risk,
    launchWindowReason: `${reason} Telemetry only; no score, lane, trigger, or suppression impact.`,
    affectedMarket,
    backtestDataStatus: "KNOWN_AHEAD",
    telemetryOnly: true
  };
}

function holidayCandidatesAround(date: Date): HolidayCandidate[] {
  const year = date.getUTCFullYear();
  const candidates = [year - 1, year, year + 1].flatMap((candidateYear) => holidayDefinitions().map((definition) => {
    const actualDate = utcDateOnly(definition.dateForYear(candidateYear));
    return {
      name: definition.name,
      countryCode: definition.countryCode,
      type: definition.type,
      date: actualDate,
      observedDate: definition.observed ? observedFixedHoliday(actualDate) : null
    };
  }));

  const byKey = new Map<string, HolidayCandidate>();
  for (const candidate of candidates) {
    byKey.set(`${candidate.countryCode}:${candidate.name}:${utcDateString(candidate.date)}`, candidate);
  }
  return [...byKey.values()];
}

function toHolidayItem(candidate: HolidayCandidate, scanDate: Date): HolidayItem {
  const actualDaysUntil = diffUtcDays(candidate.date, scanDate);
  const observedDaysUntil = candidate.observedDate ? diffUtcDays(candidate.observedDate, scanDate) : null;
  const nonNegativeDays = [actualDaysUntil, observedDaysUntil]
    .filter((value): value is number => value !== null && value >= 0)
    .sort((left, right) => left - right);

  return {
    name: candidate.name,
    countryCode: candidate.countryCode,
    date: utcDateString(candidate.date),
    observedDate: candidate.observedDate ? utcDateString(candidate.observedDate) : null,
    type: candidate.type,
    daysUntil: nonNegativeDays[0] ?? actualDaysUntil,
    isToday: actualDaysUntil === 0,
    isObservedToday: observedDaysUntil === 0
  };
}

function holidayDefinitions(): HolidayDefinition[] {
  return [
    { name: "Valentine’s Day", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => utcDate(year, 1, 14) },
    { name: "St Patrick’s Day", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => utcDate(year, 2, 17) },
    { name: "Good Friday", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => addUtcDays(gregorianEasterSunday(year), -2) },
    { name: "Easter Sunday", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: gregorianEasterSunday },
    { name: "Easter Monday", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => addUtcDays(gregorianEasterSunday(year), 1) },
    { name: "April Fools", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => utcDate(year, 3, 1) },
    { name: "Cinco de Mayo", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => utcDate(year, 4, 5) },
    { name: "Halloween", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => utcDate(year, 9, 31) },
    { name: "Black Friday", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => addUtcDays(nthWeekdayOfMonth(year, 10, 4, 4), 1) },
    { name: "Cyber Monday", countryCode: "GLOBAL", type: "CULTURAL", dateForYear: (year) => addUtcDays(nthWeekdayOfMonth(year, 10, 4, 4), 4) },
    { name: "New Year's Day", countryCode: "US", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 0, 1) },
    { name: "Martin Luther King Jr. Day", countryCode: "US", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 0, 1, 3) },
    { name: "Presidents Day", countryCode: "US", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 1, 1, 3) },
    { name: "Memorial Day", countryCode: "US", type: "NATIONAL", dateForYear: (year) => lastWeekdayOfMonth(year, 4, 1) },
    { name: "Independence Day", countryCode: "US", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 6, 4) },
    { name: "Labor Day", countryCode: "US", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 8, 1, 1) },
    { name: "Thanksgiving", countryCode: "US", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 10, 4, 4) },
    { name: "Christmas", countryCode: "US", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 11, 25) },
    { name: "New Year's Day", countryCode: "CA", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 0, 1) },
    { name: "Canada Day", countryCode: "CA", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 6, 1) },
    { name: "Labour Day", countryCode: "CA", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 8, 1, 1) },
    { name: "Thanksgiving Canada", countryCode: "CA", type: "NATIONAL", dateForYear: (year) => nthWeekdayOfMonth(year, 9, 1, 2) },
    { name: "Christmas", countryCode: "CA", type: "NATIONAL", observed: true, dateForYear: (year) => utcDate(year, 11, 25) }
  ];
}

function sortHolidayItems(left: HolidayItem, right: HolidayItem): number {
  return left.daysUntil - right.daysUntil || left.countryCode.localeCompare(right.countryCode) || left.name.localeCompare(right.name);
}

function observedFixedHoliday(date: Date): Date {
  const day = date.getUTCDay();
  if (day === 6) return addUtcDays(date, -1);
  if (day === 0) return addUtcDays(date, 1);
  return date;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date {
  const first = utcDate(year, month, 1);
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return utcDate(year, month, 1 + offset + (nth - 1) * 7);
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
  const last = utcDate(year, month + 1, 0);
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return utcDate(year, month, last.getUTCDate() - offset);
}

function inMonthDayWindow(date: Date, startMonth: number, startDay: number, endMonth: number, endDay: number): boolean {
  const year = date.getUTCFullYear();
  const scan = Date.UTC(year, date.getUTCMonth(), date.getUTCDate());
  const start = Date.UTC(year, startMonth, startDay);
  const end = Date.UTC(year, endMonth, endDay);
  return scan >= start && scan <= end;
}

function utcDateOnly(date: Date): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function addUtcDays(date: Date, days: number): Date {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days);
}

function diffUtcDays(left: Date, right: Date): number {
  return Math.round((utcDateOnly(left).getTime() - utcDateOnly(right).getTime()) / MS_PER_DAY);
}

function daysInUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function assertValidDate(date: Date): void {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("Calendar context requires a valid UTC Date.");
  }
}
