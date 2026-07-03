# Event Context V1

Alpha Pulse Event Context V1 adds display/report/snapshot telemetry for external event conditions around each scan. It is not strategy logic and does not alter scoring, lane selection, Market Move triggers, alert delivery, or any trading behavior.

## Phase 1 Non-Operational Guarantee

- `eventContextOperational` is always `false`.
- EventContext is built after market scoring and is passed only to logging, snapshots, console output, and optional alert text rendering.
- Score math, broad regime math, lane scoring, Best Lane, If In / If Flat decisions, Market Move thresholds, and alert sending remain independent of EventContext.
- Advisory values such as `marketMoveEventMode`, `confirmationRequirement`, and `eventSuppressionReason` are context labels only. They do not suppress, delay, block, or reroute alerts in Phase 1.

## EventContext Fields

Top-level fields:

- `eventRiskLevel`: `LOW`, `MEDIUM`, `HIGH`, `EXTREME`
- `nextHighImpactEvent`: string or null
- `minutesToEvent`: number or null
- `minutesSinceEvent`: number or null
- `eventType`: `NONE`, `MACRO`, `FED`, `CENTRAL_BANK`, `EXPIRY`, `HOLIDAY`, `CRYPTO_SCHEDULED`, `CRYPTO_NEWS`, `OUTAGE`, `ANOMALY`
- `eventImpactClass`: `NONE`, `TIER_A`, `TIER_B`, `TIER_C`, `RESEARCH_ONLY`
- `calendarRiskState`: `CLEAR`, `PRE_EVENT`, `LIVE_EVENT`, `POST_EVENT`, `STACKED_EVENTS`
- `liquidityContext`: `NORMAL`, `THIN_WEEKEND`, `US_HOLIDAY`, `GLOBAL_HOLIDAY`, `MONTH_END`, `QUARTER_END`, `EXPIRY_DAY`, `OUTAGE_CONTAMINATED`
- `holidayContext`: string array
- `expiryContext`: `NONE`, `WEEKLY_OPTIONS`, `MONTHLY_OPTIONS`, `QUARTERLY_EXPIRY`, `CME_TRANSITION`
- `newsRiskState`: `NONE`, `LOW`, `ELEVATED`, `SEVERE`, `UNVERIFIED`
- `eventSuppressionReason`: string or null, advisory-only wording
- `confirmationRequirement`: `NORMAL`, `ONE_CLOSE`, `TWO_SCAN`, `POST_EVENT_WAIT`, `DISABLED_WEAK_ALERTS`
- `marketMoveEventMode`: `NORMAL`, `CAUTION`, `SUPPRESS_WEAK`, `DELAY`, `POST_EVENT_CONFIRM`, `DEFENSIVE_ONLY`
- `backtestDataStatus`: data timing class
- `eventContextVersion`: version string
- `eventContextOperational`: always `false` in V1

Optional nested fields are supported for macro, macro liquidity, Fed, crypto catalyst, and moon phase context. The default scheduled macro/Fed calendar is intentionally empty and must be populated later only from sources knowable at or before the scan timestamp.

FRED Context V1 is documented in `docs/fred-context-v1.md`. It is snapshot-only telemetry and must not affect score, lane, Market Move, alert, or suppression behavior.

## Data Timing Classes

- `KNOWN_AHEAD`: scheduled calendar data known before the scan timestamp.
- `REAL_TIME`: context observed in real time at scan time.
- `T_PLUS_1`: data available only after a delay, such as next-day flow data.
- `POST_EVENT_ONLY`: data not safely available until after the event.
- `UNSAFE_FOR_BACKTEST`: data that would create lookahead risk if used in backtests.

Leakage rule: Alpha Pulse may only use context that was knowable at or before the scan timestamp. Future Accuracy Coach analysis must group by timing class before drawing conclusions.

## Moon Policy

Moon/full-moon context is a research-only anomaly tag. `moonPhaseContext.researchOnly` is always `true`. It must never affect `eventRiskLevel`, `calendarRiskState`, `marketMoveEventMode`, `confirmationRequirement`, score, lane, Market Move triggers, alert sending, or guidance decisions.

## Future Accuracy Coach Plan

Phase 2 can evaluate whether logged event context improves analysis of:

- 4H, 12H, 1D, 3D, and 7D lane accuracy
- Market Move false positives and false negatives
- max adverse excursion and max favorable excursion
- hold-vs-flat usefulness
- later suppressed-but-should-have-fired analysis
- later fired-but-should-have-suppressed analysis

No score or suppression changes should be made from V1 telemetry until enough matured, leakage-safe samples exist.