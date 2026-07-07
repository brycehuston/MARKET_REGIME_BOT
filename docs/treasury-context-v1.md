# Treasury FiscalData Context V1

Alpha Pulse Treasury FiscalData Context V1 is Priority 2 macro-liquidity telemetry. It enriches EventContext, snapshots, console context, and optional alert context text only. It does not alter score math, broad market regime math, lane scoring, Best Lane selection, If In / If Flat guidance, Market Move trigger thresholds, alert sending, or suppression behavior.

## Configuration

Treasury FiscalData support requires no API key and no secrets. Do not add Treasury credentials to `.env`.

## Data Source

The implementation uses the official Treasury FiscalData API:

- Base: `https://api.fiscaldata.treasury.gov/services/api/fiscal_service`
- Endpoint: `/v1/accounting/dts/operating_cash_balance`

Requests pull recent rows sorted by descending `record_date`, with selected fields:

- `record_date`
- `account_type`
- `close_today_bal`
- `open_today_bal`
- `table_nbr`
- `src_line_nbr`
- `table_nm`
- `sub_table_name`

The operating cash balance row is treated as Treasury General Account context. `close_today_bal` is parsed as USD millions. If parsing or unit confidence fails, Treasury values stay null/UNKNOWN and net liquidity is not calculated from unsafe units.

## Snapshot Fields

Treasury context is attached under `eventContext.macroLiquidityContext` and flattened into snapshot JSONL fields including:

- `treasuryEnabled`
- `treasurySourceTimestamp`
- `treasuryIngestTimestamp`
- `treasuryError`
- `treasuryBacktestDataStatus`
- `treasurySeriesDates`
- `tgaFiscalData`
- `tgaFiscalDataPrior`
- `tgaFiscalDataTrend`
- `tgaFiscalDataRecordDate`
- `tgaFiscalDataPriorRecordDate`
- `tgaPreferredSource`
- `netLiquidityProxy`
- `netLiquidityTrend`

## TGA Source Precedence

Alpha Pulse keeps both FRED and Treasury TGA telemetry:

- `tgaFred`: FRED `WTREGEN`
- `tgaFiscalData`: Treasury FiscalData Daily Treasury Statement operating cash balance

For display and net liquidity telemetry, Treasury FiscalData is preferred when finite and unit-compatible. FRED `WTREGEN` is the fallback. If neither is finite and unit-compatible, selected TGA is null and `netLiquidityProxy` is null.

`netLiquidityProxy = walcl - rrp - preferredTga` only when all components are finite and measured in USD millions. The proxy is telemetry only.

## Failure Behavior

Treasury FiscalData is fail-closed telemetry:

- No API key is required.
- API failures return unavailable telemetry with `treasuryError`.
- Partial or invalid data leaves affected fields null/UNKNOWN.
- Treasury failures do not crash the scan, block alerts, delay alerts, suppress alerts, or change Market Move behavior.

## Leakage And Backtest Caution

Treasury context is marked `REAL_TIME` at ingest and records source timestamps, ingest timestamps, and DTS record dates.

Historical analysis must use what was observed and stored at scan time. Do not backfill revised or later-published FiscalData values into older scans. Clean backtests should use stored live snapshot fields, especially `treasurySourceTimestamp`, `treasuryIngestTimestamp`, and `tgaFiscalDataRecordDate`.