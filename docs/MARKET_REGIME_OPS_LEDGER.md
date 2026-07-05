# Market Regime Bot Ops Ledger

## Mission

Give a fast, reliable market pulse: what the market regime is, what conditions matter right now, what risks/catalysts are active, what to watch for, and what actions or caution levels make sense.

## Current State

- Status: Active development; alert-only market regime bot with documented runtime boundaries.
- Current Branch: `fix/telegram-alert-format-v21-mobile-density`
- Last Known Good Commit: `ac2087f`
- Current Objective: Review Telegram Alert Format V2.1 Hybrid Mobile Density display-only formatter changes; keep EventContext relevance policy collecting live data before any suppression or scoring changes.
- Current Phase: Phase 3 - Macro/event/news context layer.
- Current Blocker: None. EventContext relevance policy is deployed and live verified on VPS.
- Next Best Action: Review and commit Telegram Alert Format V2.1 Hybrid Mobile Density formatter changes if accepted; otherwise let the bot collect more EventContext/relevance-policy snapshots, then review `logs/event_context_accuracy_report.md` before proposing behavioral changes.
- Last Validation: 2026-07-05 - Telegram Alert Format V2.1 Hybrid Mobile Density formatter validation passed locally; EventContext relevance policy remains deployed and live verified on VPS.
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

- 2026-07-05: Adopted `docs/MARKET_REGIME_OPS_LEDGER.md` as the fallback project reference for mission, state, progress, safety, validation, blockers, decisions, and next action.
- 2026-07-05: Set default safety mode to `LIVE_DISABLED` because the repo documents alert-only operation and explicitly excludes trading, wallets, swaps, transaction sending, private keys, and execution.
- 2026-07-05: Selected Phase 3 as the active phase because Phase 1 and Phase 2 have repository evidence, while macro/event context work is documented and appears to be the active branch focus.
- 2026-07-05: EventContext relevance policy is display-only. It observes/logs broad context but only displays currently relevant event context.
- 2026-07-05: BTC halving context is structural metadata only.
- 2026-07-05: Moon context is research-only metadata only.
- 2026-07-05: Suppression, scoring changes, lane changes, Market Move trigger changes, heartbeat changes, and execution behavior remain locked.

## Task History

- 2026-07-05: Implemented Telegram Alert Format V2.1 Hybrid Mobile Density display-only formatter changes on `fix/telegram-alert-format-v21-mobile-density`; changed `src/telegram.ts`, `src/telegram.test.ts`, and this ledger. Market Move alerts now use one MARKET MOVE header, heartbeat/status alerts use one ALPHA PULSE header, Plan/Context/Next Scan are compact for iPhone Telegram density, low-value macro/treasury telemetry availability text is suppressed from normal alert display, and EventContext remains display-gated and non-operational. Preserved score math, lane math, Best Lane / If Flat / If In logic, Market Move trigger logic, heartbeat cadence, EventContext relevance policy, suppression lock, and alert-only safety boundaries.
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

- 2026-07-05: Telegram Alert Format V2.1 Hybrid Mobile Density local validation passed:
  - `.\node_modules\.bin\tsx.cmd src\telegram.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContext.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\fred.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\treasury.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContextAccuracyReport.test.ts`
  - `npm.cmd run event-context:accuracy`
  - `npm.cmd run build` passed after sandbox EPERM required approved escalated rerun for writing `dist/*`.
  - Changed files confirmed by `git diff --stat` / `git status --short`; no files staged.
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

Review and commit Telegram Alert Format V2.1 Hybrid Mobile Density formatter changes if accepted. Then let `market-regime-bot` collect more live EventContext relevance-policy snapshots and re-run `npm run event-context:accuracy` after enough data accumulates. Do not add suppression, scoring changes, lane changes, Market Move trigger changes, heartbeat changes, or execution behavior until the report proves value.
