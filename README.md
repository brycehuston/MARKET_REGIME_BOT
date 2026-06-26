# MARKET REGIME BOT

Alert-only crypto market regime classifier.

## Boundaries

- No live trading
- No wallet
- No private keys
- No swaps
- No transaction sending
- No execution
- Telegram alerts only
- CSV logs
- JSON current state

## Install

```bash
npm install
cp .env.example .env
```

Edit `.env` if you want Telegram alerts:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
SEND_STARTUP_ALERT=false
```

## Run once

```bash
npm run once
```

## Run continuously

```bash
npm run dev
```

## Test Telegram

```bash
npm run test:telegram
```

## Backtest starter

```bash
npm run backtest
```

## Build

```bash
npm run build
npm run start
```

## Logs

- `logs/regime_scores.csv`
- `logs/regime_alerts.csv`
- `logs/regime_snapshots.jsonl`
- `data/current_state.json`

## Notes

V1 uses daily candles as the core regime timeframe. It keeps BTC dominance and stablecoin dominance neutral until enough real non-duplicate global history exists locally. Cached duplicate CoinGecko timestamps are ignored so fake history does not distort dominance scoring.
