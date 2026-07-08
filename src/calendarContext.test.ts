import assert from "node:assert/strict";
import {
  buildCalendarContext,
  buildHolidayContext,
  buildLaunchWindowContext,
  isUtcMonthEnd,
  isUtcQuarterEnd,
  isUtcWeekend,
  isUtcYearEnd
} from "./calendarContext";

function utc(value: string): Date {
  return new Date(value);
}

function testCanadaDay2026(): void {
  const holiday = buildHolidayContext(utc("2026-07-01T12:00:00Z"));
  assert.equal(holiday.source, "STATIC_CALENDAR_V1");
  assert.equal(holiday.backtestDataStatus, "KNOWN_AHEAD");
  assert.equal(holiday.actualHolidayToday, true);
  assert.equal(holiday.observedHolidayToday, true);
  assert.deepEqual(holiday.activeHolidays.map((item) => item.name), ["Canada Day"]);
  assert.deepEqual(holiday.countryCodes, ["CA"]);
  assert.equal(holiday.activeHolidays[0].countryCode, "CA");
  assert.equal(holiday.activeHolidays[0].date, "2026-07-01");
  assert.equal(holiday.activeHolidays[0].observedDate, "2026-07-01");
}

function testCanadaDayLaunchWindow(): void {
  for (const day of ["2026-06-30", "2026-07-01", "2026-07-02"]) {
    const launch = buildLaunchWindowContext(utc(`${day}T12:00:00Z`));
    assert.equal(launch.launchWindowActive, true);
    assert.equal(launch.launchWindowType, "NATIONAL_HOLIDAY_THEME");
    assert.equal(launch.launchWindowName, "Canada Day window");
    assert.equal(launch.launchWindowRisk, "ELEVATED_NOISE");
    assert.equal(launch.affectedMarket, "SOL_MEME_MICROCAPS");
    assert.equal(launch.telemetryOnly, true);
    assert.equal(launch.backtestDataStatus, "KNOWN_AHEAD");
    assert.match(launch.launchWindowReason ?? "", /no score, lane, trigger, or suppression impact/i);
  }
}

function testJulyFourth2026(): void {
  const actual = buildHolidayContext(utc("2026-07-04T12:00:00Z"));
  assert.equal(actual.actualHolidayToday, true);
  assert.equal(actual.observedHolidayToday, false);
  assert.deepEqual(actual.activeHolidays.map((item) => item.name), ["Independence Day"]);
  assert.deepEqual(actual.countryCodes, ["US"]);
  assert.equal(actual.activeHolidays[0].date, "2026-07-04");
  assert.equal(actual.activeHolidays[0].observedDate, "2026-07-03");

  const observed = buildHolidayContext(utc("2026-07-03T12:00:00Z"));
  assert.equal(observed.actualHolidayToday, false);
  assert.equal(observed.observedHolidayToday, true);
  assert.deepEqual(observed.activeHolidays.map((item) => item.name), ["Independence Day"]);
}

function testJulyFourthLaunchWindow(): void {
  for (const day of ["2026-07-03", "2026-07-04", "2026-07-05"]) {
    const launch = buildLaunchWindowContext(utc(`${day}T12:00:00Z`));
    assert.equal(launch.launchWindowActive, true);
    assert.equal(launch.launchWindowType, "NATIONAL_HOLIDAY_THEME");
    assert.equal(launch.launchWindowName, "July 4th window");
    assert.equal(launch.launchWindowRisk, "ELEVATED_NOISE");
    assert.equal(launch.telemetryOnly, true);
  }
}

function testCalendarFlags(): void {
  assert.equal(isUtcWeekend(utc("2026-07-11T12:00:00Z")), true);
  assert.equal(isUtcWeekend(utc("2026-07-12T12:00:00Z")), true);
  assert.equal(isUtcWeekend(utc("2026-07-13T12:00:00Z")), false);
  assert.equal(isUtcMonthEnd(utc("2026-08-31T12:00:00Z")), true);
  assert.equal(isUtcQuarterEnd(utc("2026-06-30T12:00:00Z")), true);
  assert.equal(isUtcYearEnd(utc("2026-12-31T12:00:00Z")), true);

  const weekend = buildCalendarContext(utc("2026-07-11T12:00:00Z"));
  assert.equal(weekend.weekendFlag, true);
  assert.equal(weekend.liquidityContext, "THIN_WEEKEND");
  assert.equal(weekend.calendarRiskState, "CALENDAR_CAUTION");
  assert.equal(weekend.backtestDataStatus, "KNOWN_AHEAD");
  assert.equal(weekend.calendarContextOperational, false);

  const monthEnd = buildCalendarContext(utc("2026-08-31T12:00:00Z"));
  assert.equal(monthEnd.monthEndFlag, true);
  assert.equal(monthEnd.liquidityContext, "MONTH_END");

  const quarterEnd = buildCalendarContext(utc("2026-06-30T12:00:00Z"));
  assert.equal(quarterEnd.quarterEndFlag, true);
  assert.equal(quarterEnd.liquidityContext, "QUARTER_END");
}

function testYearEndWindow(): void {
  const yearEnd = buildCalendarContext(utc("2026-12-31T12:00:00Z"));
  assert.equal(yearEnd.yearEndFlag, true);
  assert.equal(yearEnd.liquidityContext, "YEAR_END");

  const launch = buildLaunchWindowContext(utc("2026-12-31T12:00:00Z"));
  assert.equal(launch.launchWindowActive, true);
  assert.equal(launch.launchWindowName, "New Year window");
}

function testLongWeekend(): void {
  const fridayObserved = buildCalendarContext(utc("2026-07-03T12:00:00Z"));
  assert.equal(fridayObserved.longWeekendFlag, true);
  assert.equal(fridayObserved.liquidityContext, "US_HOLIDAY");

  const saturday = buildCalendarContext(utc("2026-07-04T12:00:00Z"));
  assert.equal(saturday.longWeekendFlag, true);
}

function testHolidayCompactFields(): void {
  const holiday = buildHolidayContext(utc("2026-01-01T12:00:00Z"));
  assert.deepEqual(holiday.activeHolidays.map((item) => item.name), ["New Year's Day", "New Year's Day"]);
  assert.deepEqual(holiday.countryCodes, ["CA", "US"]);
  assert.equal(holiday.holidayContextText, "New Year's Day, New Year's Day");
}

testCanadaDay2026();
testCanadaDayLaunchWindow();
testJulyFourth2026();
testJulyFourthLaunchWindow();
testCalendarFlags();
testYearEndWindow();
testLongWeekend();
testHolidayCompactFields();

console.log("CalendarContext tests passed.");