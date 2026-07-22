# Alpha Pulse Architecture

## Purpose and Runtime

Alpha Pulse is an alert-only, low-frequency market-regime service. It is implemented in TypeScript for Node.js. `src/index.ts` constructs `MarketRegimeBot` from `src/app.ts`; `--once` runs one scan and `--loop` aligns repeated scans to the configured interval.

Runtime configuration is loaded from `config/bot.config.json` with supported environment overrides. The repository contains no tracked PM2, deployment, CI, or container configuration.

## Market Data and Scoring Flow

`MarketRegimeBot` obtains a candle bundle and timestamped live BTC/ETH/SOL prices through the configured provider order. CoinGecko, Bybit, and Binance are tried explicitly; failed providers are recorded and the next provider is attempted. The selected data is normalized into shared candle, live-price, and global-market types before scoring.

`assessMarketDataFreshness` evaluates live quote age, historical candle age, repeated timestamps, and provider errors. Freshness is retained as metadata; missing, stale, frozen, and provider-error data remain explicit rather than being fabricated into valid input.

`scoreMarketRegime` consumes normalized market data and persisted state. Its current components cover BTC trend / structure, total crypto market trend, BTC and stablecoin dominance behavior, ETH/BTC, SOL/BTC, SOL/ETH, and volume confirmation. `deriveLaneExplainer` separately derives Best Lane and guidance from the result and historical snapshots.

## Context and Alert Flow

After scoring, the runtime retrieves optional DeFi confirmation, derivatives heat, FRED macro context, and Treasury FiscalData context. It builds EventContext with calendar, holiday, launch-window, BTC-halving, and related display telemetry. These contexts are advisory: they are attached to snapshots and presentation rather than silently changing core scoring, lane selection, or provider behavior.

`decideAlert` determines Market Move alert intent and `shouldSendTelegramHeartbeat` determines optional heartbeat intent. `telegram.ts` formats the resulting guidance. Telegram failures are caught, logged, and do not prevent snapshot logging or state persistence.

## Persistence and Operational Boundaries

`logger.ts` persists current state in `data/current_state.json`, score and alert CSV files, JSONL snapshots, derivatives-heat logs, and errors. Snapshot records include result, freshness, lane, alert-audit, and EventContext fields.

The service has no transaction-execution, wallet, private-key, signer, swap, order, or live-trading path. Runtime mode, production health, and PM2 status cannot be established from this repository alone and require direct, non-secret evidence from the correct host.
