# FRED Context V1

Alpha Pulse FRED Context V1 is Phase 2A snapshot-only macro telemetry. It enriches EventContext, snapshots, console context, and optional alert context text. It does not alter score math, broad market regime math, lane scoring, Best Lane selection, If In / If Flat guidance, Market Move trigger thresholds, alert sending, or suppression behavior.

## Configuration

FRED support is optional.

```env
FRED_API_KEY=
```

Leave `FRED_API_KEY` blank to disable FRED macro telemetry. When the key is missing, Alpha Pulse returns UNKNOWN/null macro context and continues the scan normally.

## Data Source

The implementation uses the official FRED series observations API:

- https://fred.stlouisfed.org/docs/api/fred/series_observations.html

Supported initial series:

- `DGS10`: 10-Year Treasury Constant Maturity Rate
- `DGS2`: 2-Year Treasury Constant Maturity Rate
- `DFII10`: 10-Year Treasury Inflation-Indexed Security, Constant Maturity
- `VIXCLS`: CBOE Volatility Index: VIX
- `BAMLH0A0HYM2`: ICE BofA US High Yield Index Option-Adjusted Spread
- `DTWEXBGS`: Nominal Broad U.S. Dollar Index
- `WALCL`: Assets: Total Assets: Total Assets (Less Eliminations from Consolidation): Wednesday Level
- `RRPONTSYD`: Overnight Reverse Repurchase Agreements: Treasury Securities Sold by the Federal Reserve in the Temporary Open Market Operations
- `WTREGEN`: U.S. Treasury General Account, Treasury General Account

Reference pages:

- https://fred.stlouisfed.org/series/DTWEXBGS
- https://fred.stlouisfed.org/series/WTREGEN
- https://fred.stlouisfed.org/series/D2WLTGAL may be considered as a future TGA fallback, but it is not used in Phase 2A.

## Snapshot Fields

FRED context is attached under:

- `eventContext.macroContext`
- `eventContext.macroLiquidityContext`
- flattened snapshot fields including `fredEnabled`, `fredSourceTimestamp`, `fredIngestTimestamp`, `fredError`, `fredBacktestDataStatus`, `fredSeriesDates`, `fredNetLiquidityProxy`, `fredNetLiquidityTrend`, `netLiquidityProxy`, and `netLiquidityTrend`

The macro context includes latest values, simple latest-vs-prior trends, FRED source dates, ingest timestamp, and error telemetry. The liquidity context includes `walcl`, `rrp`, `tgaFred`, `tga`, and net-liquidity telemetry. When Treasury FiscalData is unavailable, `tga` remains the FRED `WTREGEN` fallback and `netLiquidityProxy = walcl - rrp - tgaFred` only when all three values are available. When Treasury FiscalData is available and unit-compatible, Treasury is the preferred TGA source for display/proxy telemetry; FRED remains stored separately as `tgaFred`.

## Failure Behavior

FRED is fail-closed telemetry:

- Missing `FRED_API_KEY` disables FRED without throwing.
- A failed or unavailable series stays null/UNKNOWN.
- Per-series errors are captured in `fredError` only.
- FRED failures do not crash the scan, block alerts, delay alerts, or change Market Move behavior.

## Leakage And Backtest Caution

Phase 2A marks FRED context as `REAL_TIME` live telemetry and records `fredSourceTimestamp`, `fredIngestTimestamp`, and per-series `fredSeriesDates`.

FRED macro data can have publication lag and historical revisions. Historical backtests using revised FRED series can leak information that was not available at the scan timestamp. Leakage-safe historical testing of revised macro series requires ALFRED/vintage data or another point-in-time source. Phase 2A FRED context must remain telemetry-only until a separate leakage-aware validation phase is completed.