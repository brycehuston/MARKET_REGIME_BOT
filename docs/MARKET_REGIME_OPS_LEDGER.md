# Market Regime Bot Ops Ledger

## Mission

Give a fast, reliable market pulse: what the market regime is, what conditions matter right now, what risks/catalysts are active, what to watch for, and what actions or caution levels make sense.

## Current State

- Status: Active development; alert-only market regime bot with documented runtime boundaries.
- Current Branch: `fix/market-data-freshness-guard-v1`
- Last Known Good Commit: `ac2087f`
- Current Objective: Corrected Market Data Freshness Guard V1 separates timestamped live spot quotes from structural closed candles; awaiting review before any commit or deploy.
- Current Phase: Phase 3 - Macro/event/news context layer.
- Current Blocker: None. EventContext relevance policy is deployed and live verified on VPS.
- Next Best Action: Review restored pre-V2 Telegram formatter state; then let the bot collect more EventContext/relevance-policy snapshots, then review `logs/event_context_accuracy_report.md` before proposing behavioral changes.
- Last Validation: 2026-07-19 18:45Z - Corrected live/historical freshness tests, Telegram tests, TypeScript build, timestamped CoinGecko one-shot proof, Accuracy, Accuracy Coach, and diff checks passed locally.
- Safety Mode: `LIVE_DISABLED` / alert-only. No live trading, wallets, swaps, transaction sending, private keys, or execution paths.

## Progress Board

- Overall Progress: `[###-------] 25%` based on 2 of 8 checked milestones.
- Current Phase: Phase 3 - Macro/event/news context layer.

Milestones:

- [x] Phase 1 - Base Telegram/market pulse bot running.
- [x] Phase 2 - Core market context signals added.
- [ ] Phase 3 - Macro/event/news context layer.
- [ ] Phase 4 - Risk-on/risk-off regime classification.
- [ ] Phase 5 - Actionable "what to do/watch out for" recommendations.
- [ ] Phase 6 - Historical validation against market moves.
- [ ] Phase 7 - AlphaTrend/Alpha-X integration signals.
- [ ] Phase 8 - Production-grade daily/real-time market pulse.

Progress Rules:

- Progress is based on checked milestones, not subjective guesses.
- New milestones may be added as the project learns more.
- Do not casually rewrite completed history.
- Completed milestones should have supporting validation or task-history evidence.
- If a milestone is partially implemented but lacks validation or task-history evidence, leave it unchecked and record the gap under blockers or validation status.

## Active Checklist

- [x] Create `docs/MARKET_REGIME_OPS_LEDGER.md`.
- [x] Create `AGENTS.md` with the ops-ledger workflow rule.
- [x] Record mission, current state, progress board, phase, milestone ladder, safety boundaries, project map, decision log, task history, blockers, validation status, and next exact action.
- [x] Resolve or separately commit pre-existing dirty `src/*` work.
- [x] Run full project validation after source work is clean enough to evaluate.
- [x] Deploy EventContext relevance policy to VPS.
- [x] Verify EventContext relevance-policy snapshot fields live.
- [ ] Let EventContext relevance policy collect enough live data for meaningful Accuracy Coach review.
- [ ] Re-run EventContext Accuracy Coach report after more live data accumulates.

## Permanent Safety Boundaries

- Do not modify runtime bot behavior from ledger-only tasks.
- Do not modify strategy logic from ledger-only tasks.
- Do not modify alert thresholds from ledger-only tasks.
- Do not mutate logs, archives, reports, source data, runtime state, or generated artifacts from ledger-only tasks.
- Do not touch env files, private keys, wallets, signer, swap, transaction, execution, or live-trading paths.
- Do not stage unrelated files.
- Never use broad `git add .`.
- Default safety mode is `LIVE_DISABLED` unless the repo clearly documents a safer or stricter mode.
- This project remains alert-only: no live trading, no wallet, no swaps, no transaction sending, and no execution.

## Project Map

- `README.md` - Project overview, boundaries, install/run commands, logs, and V1 notes.
- `package.json` - Node/TypeScript scripts for one-shot runs, loop mode, accuracy, event context accuracy, backtest, build, start, and Telegram testing.
- `src/` - Market data, regime scoring, event context, alerts, Telegram formatting, accuracy, and runtime application code.
- `docs/event-context-v1.md` - EventContext design and safety constraints.
- `docs/fred-context-v1.md` - FRED macro telemetry context and backtest leakage caveats.
- `docs/treasury-context-v1.md` - Treasury FiscalData macro-liquidity telemetry context and validation caveats.
- `logs/` - Runtime logs and generated outputs; do not mutate for ledger-only tasks.
- `data/` - Runtime state/current-state data; do not mutate for ledger-only tasks.
- `dist/` - Build output; generated artifact, avoid mutating for documentation-only tasks.
- `AGENTS.md` - Agent workflow and ops-ledger rule.
- `docs/MARKET_REGIME_OPS_LEDGER.md` - Fallback project state, progress, safety, validation, blocker, and next-action reference.

## Decision Log

- 2026-07-19: Superseded the unapproved equality-only frozen rule. Closed-candle equality never determines freshness. Live spot freshness now depends on provider timestamps and a five-minute cadence limit; `FROZEN` additionally requires three repeated live observations with the same old provider timestamp. Historical freshness is interval-aware (`1h`/`4h`/`1d` duration plus 15 minutes).
- 2026-07-19: Snapshot `btcPrice`/`ethPrice`/`solPrice` and current cross-ratios now come from timestamped live spot endpoints on the existing CoinGecko, Bybit, or Binance providers. Separate `historical*Price`/ratio fields retain closed-candle inputs for structural lane returns and scoring remains closed-candle-based.

- 2026-07-19: Market Data Freshness Guard V1 is alert/research/display-only. It preserves regime score math, lane score calculations, Market Move thresholds, provider order, Telegram send behavior, and all execution safety boundaries while degrading lane and alert wording when freshness fails.
- 2026-07-19: V1 marks BTC/ETH/SOL frozen when all three exact prices repeat for three scan observations or for at least 45 minutes. Provider candle age uses the oldest latest BTC/ETH/SOL close and a timeframe-plus-15-minute limit.

- 2026-07-05: Adopted `docs/MARKET_REGIME_OPS_LEDGER.md` as the fallback project reference for mission, state, progress, safety, validation, blockers, decisions, and next action.
- 2026-07-05: Set default safety mode to `LIVE_DISABLED` because the repo documents alert-only operation and explicitly excludes trading, wallets, swaps, transaction sending, private keys, and execution.
- 2026-07-05: Selected Phase 3 as the active phase because Phase 1 and Phase 2 have repository evidence, while macro/event context work is documented and appears to be the active branch focus.
- 2026-07-05: EventContext relevance policy is display-only. It observes/logs broad context but only displays currently relevant event context.
- 2026-07-05: BTC halving context is structural metadata only.
- 2026-07-05: Moon context is research-only metadata only.
- 2026-07-05: Suppression, scoring changes, lane changes, Market Move trigger changes, heartbeat changes, and execution behavior remain locked.

## Task History

- 2026-07-19: Corrected the unapproved first Market Data Freshness Guard implementation on `fix/market-data-freshness-guard-v1`. Added timestamped free live spot fetches for CoinGecko `/simple/price`, Bybit spot tickers, and Binance spot tickers plus server time; live fetch prefers the selected historical provider and falls back across the existing provider set when fetches fail or timestamps are old. Split live-price and historical-candle freshness metadata, switched snapshot prices/current ratios to live quotes, retained separate closed-candle prices/ratios for structural returns, removed equality-only candle freezing, kept stale Telegram/lane degradation, and expanded deterministic tests. Changed `src/providers.ts`, `src/app.ts`, `src/types.ts`, `src/marketDataFreshness.ts`, `src/marketDataFreshness.test.ts`, `src/logger.ts`, `src/laneExplainer.ts`, `src/telegram.ts`, `src/telegram.test.ts`, `src/accuracyCoach.ts`, and this ledger. No regime score formulas, lane score formulas, confidence formulas, Market Move thresholds, Telegram send behavior, paid APIs, dependencies, PM2/VPS files, environment secrets, trading, wallets, signers, swaps, or transactions changed. Safety mode: `LIVE_DISABLED` / alert-only. No commit or deploy.

- 2026-07-19: On `fix/market-data-freshness-guard-v1`, added Market Data Freshness Guard V1 in `src/marketDataFreshness.ts`, wired provider/timestamp/fallback-error metadata through `src/app.ts` and `src/types.ts`, flattened freshness fields into snapshots, degraded stale lane and Telegram language in `src/laneExplainer.ts` and `src/telegram.ts`, added Accuracy Coach quality counts without outcome-score changes, and added deterministic freshness/formatter tests. Changed `src/marketDataFreshness.ts`, `src/marketDataFreshness.test.ts`, `src/types.ts`, `src/app.ts`, `src/laneExplainer.ts`, `src/telegram.ts`, `src/telegram.test.ts`, `src/accuracyCoach.ts`, and this ledger. No regime score math, lane score math, confidence math, Market Move thresholds, provider order, send behavior, dependencies, paid APIs, environment files, PM2/VPS files, trading, wallets, signers, swaps, or transactions changed. Safety mode: `LIVE_DISABLED` / alert-only.

- 2026-07-12: On `main`, completed a formatter-only Telegram context cleanup in `src/telegram.ts` and `src/telegram.test.ts`: suppressed generic FRED/TGA/net-liquidity availability rows, normalized moon-research casing, and retained compact directional macro/liquidity rows for future telemetry. No EventContext or CalendarContext generation, score, lane, Best Lane, trigger, suppression, send-condition, provider, runtime-flow, execution, environment, staging, or commit changes. Safety mode: `LIVE_DISABLED`.

- 2026-07-11: On `preview/alpha-pulse-format-examples`, expanded deterministic Calendar/Holiday/Launch Window telemetry to V1.1 and cleaned Alpha Pulse Telegram context-body formatting, including compact Event Stack mappings and runtime-relative preview Next Scan values; changed `src/calendarContext.ts`, `src/calendarContext.test.ts`, `src/types.ts`, `src/telegram.ts`, `src/telegram.test.ts`, `src/alphaPulseFormatPreview.ts`, `docs/calendar-launch-context-v1.md`, and this ledger. No score, lane, Best Lane, trigger, suppression, send-condition, provider, runtime-flow, execution, dependency, environment, staging, or commit changes. Safety mode: `LIVE_DISABLED`.

- 2026-07-05: Backed out Telegram Premium Compact V2 / V2.1 display formatting from `src/telegram.ts` and `src/telegram.test.ts`, restoring the pre-V2 Telegram formatter style from `83d329b`; updated this ledger. No score math, lane math, Best Lane / If Flat / If In logic, Market Move trigger logic, heartbeat cadence, EventContext relevance policy, suppression behavior, or execution behavior changed.
- 2026-07-05: Implemented Telegram Premium Compact V2 display-only formatter changes in working tree on `main`; changed `src/telegram.ts`, `src/telegram.test.ts`, and this ledger. Preserved score math, lane math, Market Move trigger logic, heartbeat cadence, EventContext relevance policy, suppression lock, and alert-only safety boundaries.
- 2026-07-05: Added EventContext safety tests in `37c65ce`.
- 2026-07-05: Flattened EventContext snapshot fields in `7639d30`.
- 2026-07-05: Added EventContext Accuracy Coach reporting in `81d0cd5`.
- 2026-07-05: Added EventContext relevance policy in `7cd8ff6`.
- 2026-07-05: Added Market Regime ops ledger in `aa723b8`.
- 2026-07-05: Updated ledger after EventContext relevance policy in `9f52763`.
- 2026-07-05: Corrected ledger merge readiness state in `3c27bf0`.
- 2026-07-05: Recorded EventContext relevance deploy verification in `ac2087f`.

## Deployment Verification

- 2026-07-05: Deployed `3c27bf0` to VPS and restarted `market-regime-bot` only.
- Live verification row: `2026-07-05T08:30:01.233Z`.
- Verified fields:
  - `eventContextOperational=false`
  - `eventStackCount=1`
  - `eventStackTags=["THIN_WEEKEND"]`
  - `eventConfluenceLevel=LOW`
  - `displayRelevantEvents` included only `THIN_WEEKEND`
  - `hiddenObservedEventsCount=2`
  - `btcHalvingContext.structuralOnly=true`
  - `moonResearchOnly=true`
  - `moonPhase=NONE`
- PM2 verified:
  - `market-regime-bot` online
  - `alpha-x-paper` stopped
- Safety result: no score math, lane math, Market Move trigger logic, suppression behavior, heartbeat cadence, or execution behavior changed.

## Blockers

- None.

## Validation Status

- 2026-07-19 18:45Z: Corrected Market Data Freshness Guard validation passed: `npm run build`; freshness tests proving valid unchanged `1d` and `4h` candles do not freeze, old live timestamps go stale, repeated fresh-timestamp live values remain fresh, repeated old/non-advancing live timestamps freeze, live snapshot prices differ independently from historical closes, closed fields feed structural lane returns, fallback errors do not poison a current final dataset, old quality fields normalize safely, and stale live prices degrade lanes; Telegram stale tests passed. Real `npm run once` selected CoinGecko and logged live BTC `64384.17536067605`, ETH `1858.649085271666`, SOL `75.6626028704276`, live timestamp `2026-07-19T18:45:07.000Z`, live freshness `FRESH` at `0.24m`, historical `1d` candle timestamp `2026-07-18T23:59:59.999Z`, historical freshness `FRESH` at `1125.36m`, and CoinGecko as both live and historical provider. `npm run accuracy` and `npm run accuracy:coach` passed with three valid rows and zero stale/frozen/provider-error rows. `git diff --check` passed; only intended source/docs plus pre-existing untracked `vps_logs/` remain. Blocker: none technical; user review is required before commit/deploy. Safety mode remained `LIVE_DISABLED` / alert-only.

- 2026-07-19: Market Data Freshness Guard V1 validation passed: `npm run build`; `tsx src/marketDataFreshness.test.ts`; `tsx src/telegram.test.ts`; escalated `npm run once` public-network validation selected CoinGecko and logged `Market data freshness: FRESH`, `Market data stale reason: none`, and `Price stale scans: 0`; `npm run accuracy` completed with insufficient matured signals; `npm run accuracy:coach` completed with one valid fresh snapshot, `marketDataQuality: FRESH 1`, and zero stale/frozen/provider-error snapshots; `git diff --check` passed. Initial sandboxed `npm run once` could not reach public providers and the approved public-network rerun passed. Blocker: none. Limitations: a total provider outage still follows the existing fail-fast/error-log path and cannot emit a scored snapshot or Telegram alert; closed-candle feeds can conservatively enter degraded mode after the explicit three-scan/45-minute unchanged rule. Next action: review the diff and VPS-deploy the alert-only guard; do not add ETH Takeover logic until live freshness fields and stale wording are verified. Safety mode remained `LIVE_DISABLED` / alert-only.

- 2026-07-12: Final Telegram provider-context filtering passed TypeScript no-emit compile, 13-scenario formatter preview, Telegram, EventContext, and CalendarContext tests, plus diff checks. Blocker: none. Next action: review the unstaged formatter diff; do not stage or commit without explicit approval. Safety mode remained `LIVE_DISABLED`.

- 2026-07-11: Calendar V1.1 / final Telegram body cleanup validation passed: TypeScript no-emit compile, 13-scenario production formatter preview with no raw Event Stack rows, Telegram, EventContext, and CalendarContext tests, plus diff checks. Blocker: none. Next action: review the uncommitted preview output and diff; do not stage or commit without explicit approval. Safety mode remained `LIVE_DISABLED`.

- 2026-07-05: Telegram formatter pre-V2 restore validation passed:
  - Telegram formatter test passed (`src/telegram.test.ts` via tsx).
  - `git diff --stat`
  - `git status --short`
- 2026-07-05: Telegram Premium Compact V2 local validation passed:
  - `.\node_modules\.bin\tsx.cmd src\telegram.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContext.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\fred.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\treasury.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContextAccuracyReport.test.ts`
  - `npm.cmd run event-context:accuracy`
  - `npm.cmd run build` passed after sandbox EPERM required approved escalated rerun for writing `dist/*`.
  - Changed files confirmed by `git diff --stat` / `git status --short`; no files staged.
- 2026-07-05: EventContext relevance policy validation passed before commit:
  - `.\node_modules\.bin\tsx.cmd src\eventContext.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\telegram.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\fred.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\treasury.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContextAccuracyReport.test.ts`
  - `npm.cmd run event-context:accuracy`
  - `npm.cmd run build`
- 2026-07-05: VPS deployment validation passed:
  - VPS pulled `main` to `3c27bf0`
  - tests passed
  - `npm run event-context:accuracy` passed
  - `npm run build` passed
  - `market-regime-bot` restarted and online
  - `alpha-x-paper` remained stopped
- 2026-07-05: Live relevance-policy snapshot verification passed on row `2026-07-05T08:30:01.233Z`.

## Next Exact Action

Review the corrected live-quote/historical-candle freshness diff. Do not commit or deploy without explicit approval. After approval, verify live and historical timestamps/ages, provider fallback metadata, independent spot-vs-close prices, and degraded Telegram wording on the VPS before adding ETH Takeover logic.
