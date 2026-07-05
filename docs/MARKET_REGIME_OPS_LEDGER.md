# Market Regime Bot Ops Ledger

## Mission

Give a fast, reliable market pulse: what the market regime is, what conditions matter right now, what risks/catalysts are active, what to watch for, and what actions or caution levels make sense.

## Current State

- Status: Active development; alert-only market regime bot with documented runtime boundaries.
- Current Branch: `feat/event-context-relevance-policy-v1`
- Last Known Good Commit: `aa723b8`
- Current Objective: Establish this ops ledger as the fallback reference point for project state, progress, safety, validation, blockers, and next actions.
- Current Phase: Phase 3 - Macro/event/news context layer.
- Current Blocker: Worktree had unrelated dirty `src/*` files before this ledger setup; commit is skipped until that work is resolved or committed separately.
- Next Best Action: Merge `feat/event-context-relevance-policy-v1` into `main`, push `main`, deploy to VPS, restart `market-regime-bot` only, and verify relevance-policy snapshot fields.
- Last Validation: 2026-07-05 - `./node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit` passed.
- Safety Mode: `LIVE_DISABLED` / alert-only. No live trading, wallets, swaps, transaction sending, private keys, or execution paths.

## Progress Board

- Overall Progress: `[███░░░░░░░] 25%` based on 2 of 8 checked milestones.
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
- [ ] Update this ledger after the next meaningful project change.

## Permanent Safety Boundaries

- Do not modify runtime bot behavior from this ledger task.
- Do not modify strategy logic from this ledger task.
- Do not modify alert thresholds from this ledger task.
- Do not mutate logs, archives, reports, source data, runtime state, or generated artifacts.
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
- `logs/` - Runtime logs and generated outputs; do not mutate for ops-ledger tasks.
- `data/` - Runtime state/current-state data; do not mutate for ops-ledger tasks.
- `dist/` - Build output; generated artifact, avoid mutating for documentation-only tasks.
- `AGENTS.md` - Agent workflow and ops-ledger rule.
- `docs/MARKET_REGIME_OPS_LEDGER.md` - Fallback project state, progress, safety, validation, blocker, and next-action reference.

## Decision Log

- 2026-07-05: Adopted `docs/MARKET_REGIME_OPS_LEDGER.md` as the fallback project reference for mission, state, progress, safety, validation, blockers, decisions, and next action.
- 2026-07-05: Set default safety mode to `LIVE_DISABLED` because the repo documents alert-only operation and explicitly excludes trading, wallets, swaps, transaction sending, private keys, and execution.
- 2026-07-05: Selected Phase 3 as the active phase because Phase 1 and Phase 2 have repository evidence, while macro/event context work is documented and appears to be the active branch focus.
- 2026-07-05: Commit skipped for this task because unrelated dirty `src/*` files existed before the ledger setup.

## Task History

- 2026-07-05: Set up lightweight ops ledger/progress board standard. Created the ledger and `AGENTS.md`, recorded the active branch `feat/event-context-relevance-policy-v1`, last known commit `81d0cd5`, milestone ladder, safety boundaries, blockers, validation status, and next exact action. Validation passed with `./node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit`.

## Blockers

- Pre-existing unrelated dirty files before ledger setup:
  - `src/eventContext.test.ts`
  - `src/eventContext.ts`
  - `src/eventContextAccuracyReport.ts`
  - `src/logger.ts`
  - `src/telegram.test.ts`
  - `src/types.ts`
- Because the worktree was already dirty, this ledger task should not be committed until those changes are handled separately.

## Validation Status

- 2026-07-05: `./node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit` passed.
- Avoided validation commands that mutate generated artifacts, logs, reports, runtime state, source data, or env files.

## Next Exact Action

Merge `feat/event-context-relevance-policy-v1` into `main`, push `main`, deploy to VPS, restart `market-regime-bot` only, and verify `displayRelevantEvents`, `hiddenObservedEventsCount`, `eventStackCount`, `btcHalvingContext`, and moon research-only behavior in live snapshots.


## Task History Update

- 2026-07-05: EventContext relevance policy was committed as `7cd8ff6` and ops ledger was committed as `aa723b8` on `feat/event-context-relevance-policy-v1`. Feature branch is pushed and ready for fast-forward merge to `main`.

## Validation Update

- 2026-07-05: EventContext relevance policy validation passed before commit:
  - `.\node_modules\.bin\tsx.cmd src\eventContext.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\telegram.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\fred.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\treasury.test.ts`
  - `.\node_modules\.bin\tsx.cmd src\eventContextAccuracyReport.test.ts`
  - `npm.cmd run event-context:accuracy`
  - `npm.cmd run build`

