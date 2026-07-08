# Calendar Launch Context V1

Calendar Launch Context V1 adds deterministic date, holiday, and launch-window telemetry to Alpha Pulse. It is context only. It does not change score math, lane selection, Best Lane, Market Move triggers, alert suppression, Telegram send conditions, or execution behavior.

## Purpose

The context marks known-ahead calendar conditions that can affect liquidity, narrative noise, and microcap/PVP risk. These fields are intended for EventContext, snapshots, logs, heartbeat text, and compact alert context text.

Canada Day and July 4th are included because national-holiday narratives and thin-liquidity periods can coincide with elevated meme-launch noise. They are not alpha signals, buy signals, sell signals, confirmation signals, or suppression signals.

## Fields

`CalendarContext`:

- `calendarContextVersion`
- `scanDateUtc`
- `scanDayOfWeekUtc`
- `weekendFlag`
- `monthEndFlag`
- `quarterEndFlag`
- `yearEndFlag`
- `longWeekendFlag`
- `liquidityContext`: `NORMAL`, `THIN_WEEKEND`, `US_HOLIDAY`, `CANADA_HOLIDAY`, `GLOBAL_HOLIDAY`, `LONG_WEEKEND`, `MONTH_END`, `QUARTER_END`, `YEAR_END`
- `calendarRiskState`: `CLEAR`, `CALENDAR_CAUTION`
- `backtestDataStatus: KNOWN_AHEAD`
- `calendarContextOperational: false`

`HolidayContext`:

- `activeHolidays`
- `upcomingHolidaysNext7d`
- `observedHolidayToday`
- `actualHolidayToday`
- `countryCodes`
- `holidayContextText`
- `source: STATIC_CALENDAR_V1`
- `backtestDataStatus: KNOWN_AHEAD`

Holiday items include `name`, `countryCode`, `date`, `observedDate`, `type`, `daysUntil`, `isToday`, and `isObservedToday`.

`LaunchWindowContext`:

- `launchWindowActive`
- `launchWindowType`
- `launchWindowName`
- `launchWindowRisk`
- `launchWindowReason`
- `affectedMarket`
- `backtestDataStatus: KNOWN_AHEAD`
- `telemetryOnly: true`

## Static Coverage

US holidays:

- New Year's Day
- Martin Luther King Jr. Day
- Presidents Day
- Memorial Day
- Independence Day
- Labor Day
- Thanksgiving
- Christmas

Canada holidays:

- New Year's Day
- Canada Day
- Labour Day
- Thanksgiving Canada
- Christmas

Lunar New Year and Golden Week are intentionally omitted in V1 because this task does not include explicit static date tables for tested years.

## Launch Windows

Static launch-window tags:

- Canada Day window: June 30 through July 2
- July 4th window: July 3 through July 5
- New Year window: Dec 31 through Jan 1
- Christmas / year-end thin liquidity window: Dec 24 through Jan 1

These windows mean narrative/meme launch activity may be elevated, liquidity may be thin, and microcap/PVP risk may be elevated. They do not imply that tokens pump, that SOL is confirmed, or that any trade should be opened or closed.

## Telemetry-Only Guarantee

Calendar Launch Context V1 is built after market scoring and is attached to EventContext for display and persistence. It must not be read by scorer, lane explainer, Best Lane logic, Market Move trigger logic, alert suppression logic, Telegram send-condition logic, or any trading/execution path.

Allowed uses:

- EventContext nested telemetry
- JSONL snapshot fields
- console heartbeat context text
- compact Telegram alert/heartbeat context rows

Forbidden uses:

- score changes
- lane scoring changes
- Best Lane changes
- Market Move trigger changes
- alert suppression changes
- Telegram send-condition changes
- execution, wallet, signer, swap, order, or provider changes

## Leakage Safety

The calendar, holiday, and launch-window fields are deterministic and knowable before the scan timestamp. Their timing class is `KNOWN_AHEAD`. Backtests may group by these fields without lookahead leakage, provided later real-time data is not backfilled into older scans.

## Future Work

Generic news, GDELT, status pages, DeFiLlama, token unlocks, and richer regional holiday tables are separate tasks. They should not be added to Calendar Launch Context V1.