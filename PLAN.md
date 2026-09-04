# Objective

Preserve stable Alpha Pulse Generation 1 operation, complete legitimate loose ends, maintain reliable market snapshots and useful Telegram guidance, preserve validated scoring behavior, and prepare evidence-based future improvements.

Generation 2 or a Rust rewrite is not an active objective.

## Definition of Done

- Current architecture and operating boundaries are documented from repository evidence.
- Provider fallback behavior remains understood and explicit.
- Snapshot collection, Telegram behavior, and validated scoring behavior remain preserved.
- Known blockers and unverified runtime facts are recorded.
- Production state can be reproduced from direct evidence when access is available.
- No unresolved blocker prevents continued collection once the correct runtime host is verified.

## Current Verified State

- Last verified: 2026-07-23T00:38Z direct read-only VPS inspection.
- Branch: `main`.
- Commit: `94ebe1c`.
- Worktree: untracked `vps_logs/`; it is outside this work scope.
- Runtime language: TypeScript on Node.js (`>=20`).
- Runtime framework: direct Node/`tsx` process; `src/index.ts` starts `MarketRegimeBot`.
- Build: `npm run build` (`tsc -p tsconfig.json`); not run for this documentation-only update.
- Type-check: no dedicated source type-check script; build performs TypeScript compilation.
- Tests: no aggregate test script; not run because application behavior did not change.
- Lint: no lint script or configuration found.
- CI: no CI configuration found.
- Deployment method: PM2 on VPS; deployed path `/home/ubuntu/MARKET-REGIME-BOT`.
- PM2 process name: `market-regime-bot`.
- PM2 process status: `ONLINE`; PID `1093`, uptime 13h, restarts 0 at inspection.
- Runtime safety mode: `ALERT_ONLY_VERIFIED`.
- Production health: `HEALTHY`.
- Snapshot status: `ACTIVE`; `/home/ubuntu/MARKET-REGIME-BOT/logs/regime_snapshots.jsonl` had 2,520 rows, latest `2026-07-23T00:30:01.501Z`, and 20/20 recent rows parsed.
- Data collection status: `ACTIVE`; latest row and all 20 recent rows were `FRESH` with live and historical freshness true.
- Primary blocker: untouched holdout evidence has only seven mature candidate outcomes and zero `ALT_ROTATION_CONFIRMED` observations.

## Active Task Identity

- Task ID: `AP-V1-OUTLOOK-NOW-TELEMETRY`
- Checkpoint: `C01`
- State: `COMPLETED`
- Repository: `MARKET_REGIME_BOT`
- Branch: `feat/telemetry-snapshot-outlook-now-v1`
- Commit: `pending`
- Resume token: `AP-V1-OUTLOOK-NOW-TELEMETRY.C01@pending`

## Verified Architecture Boundaries

- Provider-specific payloads are normalized before scoring.
- Market-data provider fallback stays explicit and records failed attempts.
- Freshness classification remains separate from core score calculation.
- `scoreMarketRegime` remains separate from lane guidance and Telegram presentation.
- EventContext, FRED, Treasury, calendar, and research telemetry are advisory unless expressly approved otherwise.
- Telegram delivery failure must not prevent logging or state persistence.
- Snapshots preserve source, timestamp, freshness, score, lane, alert-audit, and context fields.
- Missing data must never be fabricated into valid scoring input.

## Verified Functional Areas

- Primary market data: CoinGecko, Bybit, and Binance fallback providers.
- Enrichment: DefiLlama confirmation and optional Coinalyze derivatives heat.
- Market scoring: trend, total market, dominance, relative-strength, and volume components.
- Guidance: regime confidence, Best Lane, Market Move, and heartbeat.
- Context: EventContext, FRED, Treasury FiscalData, net liquidity, calendar, holiday, launch-window, and BTC-halving telemetry.
- Persistence: current state, score/alert CSVs, JSONL snapshots, derivatives-heat logs, and error logs.

## Working Rules

- Read `AGENTS.md`, this plan, Git state, and relevant implementation before editing.
- Work only on the active item; exactly one item may be `[~]`.
- Clear the highest-value blocker with the shortest complete and reversible path.
- Do not add unrelated refactors, speculative abstractions, placeholders, or partial execution paths.
- Do not alter production behavior without explicit authorization.
- Do not expose or edit secrets, restart services, or stop collection unnecessarily.
- Do not commit, push, or open a pull request without authorization.

## Non-Negotiable Constraints

- Generation 1 remains intact; no Rust rewrite during closeout.
- No trade execution, private-key handling, wallets, swaps, orders, or transaction sending.
- Provider failures remain explicit; missing or stale data never becomes valid scoring input.
- EventContext remains advisory unless expressly approved.
- Telegram formatting stays unchanged unless specifically requested.
- Research does not enter production scoring without validation.
- Active data collection must not be stopped unnecessarily.

## Material Decisions

- Existing Generation 1 remains the operational baseline.
- Alpha Pulse is standardized before new feature work.
- TypeScript remains appropriate for this low-frequency, API-bound service; Python remains available for research and analysis.
- Rust is a future option only when it provides measurable benefit; a future Generation 2, if approved, is built beside Generation 1.
- `AGENTS.md` and `PLAN.md` are the repository-control standard.
- Current code and direct runtime evidence override stale plans, chats, and historical summaries.
- Planning, research, and testing must remain proportional to risk and value.

## Execution Plan

- [x] Repository standardization and verified-state capture.
- [x] Verify production runtime, PM2 status, and snapshot collection from the correct host without changing service behavior.
- [x] Assess current explicit-fresh snapshot sufficiency for Liquidity Rotation State Machine V1 research telemetry.
- [x] Implement research-only Liquidity Rotation State Machine V1 telemetry scaffolding.
- [x] Build the offline Liquidity Rotation research evaluator and measure provisional state behavior across development and holdout segments.
- [x] Add bounded 7D major-return snapshot telemetry (retBtc7d / retEth7d / retSol7d) on branch `feat/alpha-pulse-7d-major-returns`.
- [x] Turn the existing always-NO_CLEAR_ROTATION Liquidity Rotation telemetry into the validated confirmed-leadership-takeover shadow classifier.
- [x] Update Alpha Pulse Telegram presentation to the locked v1.02 layouts (Alpha Pulse / Heartbeat, Market Move, distinct context, NO_CLEAR_ROTATION wording fix).
- [x] Persist prospective Alpha Pulse OUTLOOK and NOW/posture decision telemetry into `regime_snapshots.jsonl`.
- [~] Record the evidence-based Generation 1 closeout decision.

## Current Action

Record the evidence-based Generation 1 closeout decision.

## Validation Evidence

- Documentation-only standardization changed only `AGENTS.md`, `PLAN.md`, `docs/ARCHITECTURE.md`, and `docs/MARKET_REGIME_OPS_LEDGER.md`.
- Required checks: `git diff --check`, scoped documentation diff, and `git status --short`.
- 2026-07-23 direct VPS evidence: `market-regime-bot` was online under PM2 with PID 1093, zero restarts, fresh 15-minute scans, and a current parseable JSONL snapshot stream. Historical PM2 error-log entries were last modified 2026-07-21; current scans were successful.
- 2026-07-23 dataset gate: 2,521 rows read; 265 valid explicit-fresh rows; zero malformed, stale/broken, or missing-required exclusions. The 100-row gate is `THRESHOLD_READY`. Fresh rows span `2026-07-19T21:11:04Z` through `2026-07-23T00:45:01Z`, with a 15-minute median interval, a 30-minute continuity threshold, two contiguous segments (211 and 54 rows), and a 600-minute inter-segment gap.
- Research-only telemetry validation passed after the fixed 30-minute continuity correction: `npx tsx src/liquidityRotation.test.ts` (35 assertions), `npx tsx src/marketDataFreshness.test.ts`, `npx tsx src/eventContext.test.ts`, `npm run test:lane-forensics` (127 assertions), and `npm run build`. The telemetry is snapshot-only and explicitly non-authoritative; it leaves score, lane, alert, Telegram, provider, and runtime paths unchanged.
- Offline evaluator validation passed at FRUX NAV checkpoint `C02`: 50 evaluator assertions plus tool type-check, existing deterministic tests, and production build. Development used the complete 211-row first segment; the untouched 54-row second segment was excluded from tuning. Development-derived rules produced 26 mature candidate outcomes (15 successes, 11 false positives); holdout produced seven mature candidate outcomes (three successes, four false positives), one right-censored setup, and zero `ALT_ROTATION_CONFIRMED` observations. Verdict: `INSUFFICIENT_EVIDENCE`.
- `npm run build` is optional only when dependencies are already installed and a build baseline is required.
- Do not run `npm run once`, `npm run dev`, `npm run start`, `npm run test:telegram`, `npm run lane:forensics`, or other provider-contacting, state-writing, Telegram-sending, or report-generating commands for this documentation-only work.

## Validation Commands

```powershell
git diff --check
npx tsx tools/liquidityRotationEvaluator.test.ts
npx tsx src/liquidityRotation.test.ts
npx tsx src/marketDataFreshness.test.ts
npx tsx src/eventContext.test.ts
npm run test:lane-forensics
npm run build
git diff --stat
git status --short
```

- Do not run `npm run once`, `npm run dev`, `npm run start`, `npm run test:telegram`, `npm run lane:forensics`, or provider-contacting, Telegram-sending, state-writing, or report-generating commands.
- Do not infer current production state from historical ledger entries.

## Blockers

- Untouched holdout evidence is below the evaluator gate: seven mature candidate outcomes versus 10 required, and zero `ALT_ROTATION_CONFIRMED` observations versus two required.
- Canonical TOTAL3, broad-alt universe, advances/declines, and a canonical breadth metric are unavailable; no threshold or production classification may be inferred.

## Handoff

- Keep Liquidity Rotation telemetry and evaluator output research-only and non-authoritative; `INSUFFICIENT_EVIDENCE` does not permit production activation.
- Do not alter score, lane, confidence, alert, Telegram, provider, schedule, or execution behavior while evaluating it.
- Keep `vps_logs/` outside the implementation scope unless explicitly authorized.
- Treat direct runtime evidence as authoritative over historical ledger records.
