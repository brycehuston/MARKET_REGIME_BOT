# Alpha Pulse Agent Instructions

## Mission

Alpha Pulse is a low-frequency, alert-only market-regime and guidance service. It ingests market data, scores conditions, persists snapshots, and may publish Market Move or heartbeat guidance to Telegram.

- It is not a transaction-execution engine.
- Never add wallets, private-key handling, signing, swaps, orders, or trade execution.

## Required Reading Order

Before editing:

1. Read this file.
2. Read `PLAN.md`.
3. Inspect Git branch and worktree status.
4. Inspect the relevant implementation.
5. Verify material claims before changing code or documentation.

## Source of Truth

Use this order when evidence conflicts:

1. Current repository code and configuration.
2. Current Git, command, test, and runtime evidence.
3. Direct instructions for the current task.
4. `AGENTS.md`.
5. `PLAN.md`.
6. Stable architecture documentation.
7. `README.md`.
8. Historical chats, summaries, and assumptions.

Correct written plans when verified evidence disagrees with them.

## Verified Boundaries

- Provider ingestion and provider-specific payloads stay separate from normalized scoring inputs.
- `scoreMarketRegime` stays separate from Telegram formatting and publishing.
- Provider failures and stale/frozen market data stay explicit; never fabricate data or treat missing data as valid scoring input.
- Snapshots retain timestamps, source/freshness fields, and persistence records.
- EventContext, FRED, Treasury, calendar, and related macro context remain advisory unless explicit authorization changes that behavior.
- Telegram presentation changes must not change score, lane, alert, or provider logic.
- Research logic must not silently enter production scoring.

## Current Functional Areas

- Market providers: CoinGecko, Bybit, and Binance fallback ingestion; DefiLlama and optional Coinalyze enrichment.
- Scoring: BTC trend / structure, total crypto market trend, BTC dominance behavior, stablecoin dominance, ETH/BTC, SOL/BTC, SOL/ETH, and volume confirmation.
- Guidance: regime confidence, Best Lane, Market Move, heartbeat, and Telegram formatting.
- Context: EventContext, FRED macro context, Treasury FiscalData/net-liquidity context, calendar, holiday, launch-window, and BTC-halving context.
- Persistence: current state, score/alert CSVs, JSONL snapshots, derivatives heat logs, and error logs.

## Development Rules

- Clear the highest-value blocker first and work only on the active `PLAN.md` item.
- `PLAN.md` must have exactly one `[~]` item and one Current Action.
- Use the shortest complete path; keep changes focused, independently testable, reversible, and behavior-preserving.
- Do not make unrelated refactors, speculative abstractions, placeholders, partial execution paths, duplicated scoring logic, or silent scope reductions.
- Stop when the definition of done is met. Report blockers explicitly.

## Runtime Safety

- Do not expose or modify secrets. Do not read or edit `.env` without explicit authorization.
- Do not restart PM2, services, or data collection unless explicitly requested.
- Verify runtime mode before deployment and preserve rollback capability.
- Do not claim deployment success without direct runtime evidence.
- Do not convert missing or stale provider data into valid scoring data.

## Git and Ledger Rules

- Read `docs/MARKET_REGIME_OPS_LEDGER.md` before meaningful changes and update it afterward.
- Preserve ledger history; append records rather than casually rewriting completed history, decisions, or validated milestones.
- Record branch, changed files, validation, blocker, next action, and safety mode in ledger updates.
- Inspect branch and status before editing. Use scoped branches for implementation work.
- Never use `git add .`; stage only intended files.
- Show validation, complete diff, and status before a commit.
- Do not commit, push, open a pull request, or rewrite shared history without authorization.

## FRUX NAV Task Continuity Protocol

FRUX NAV is the repository-local continuity anchor for resuming an approved task without relying on chat history.

- `PLAN.md` must identify the active Task ID, Checkpoint, State, Repository, Branch, Commit, and Resume token.
- The resume token format is `<TASK_ID>.<CHECKPOINT>@<SHORT_COMMIT>`.
- At task start or resume, read `AGENTS.md`, `PLAN.md`, and the ops ledger; then verify the repository, branch, commit, and worktree before changing files.
- Treat the recorded Task ID and Current Action as the authorized work scope. The continuity record does not authorize commits, pushes, deployments, service changes, or broader work.
- Keep exactly one active `[~]` plan item and exactly one Current Action. Task identity metadata does not create another active item.
- Advance a checkpoint or change its state only from direct repository evidence or explicit user direction. Never infer or invent checkpoint history.
- When checkpoint evidence conflicts with the working tree, stop and record the mismatch instead of silently rewriting the continuity record.
- At a durable handoff, update the active task identity and append concise ledger evidence while preserving completed history.

## Validation

Use only commands appropriate to the change. For documentation-only work:

```powershell
git diff --check
git diff -- AGENTS.md PLAN.md docs/ARCHITECTURE.md docs/MARKET_REGIME_OPS_LEDGER.md
git status --short
```

- `npm run build` is optional when dependencies are already installed and an existing build baseline is required.
- There is no dedicated source type-check script, lint script/configuration, CI configuration, deployment script, or tracked PM2 configuration.
- Do not run provider-contacting, Telegram-sending, state-writing, or report-generating commands for documentation-only work.

## Required Workflow

Before completion:

1. Run proportional validation.
2. Inspect the complete diff and Git status.
3. Update `PLAN.md` and the ops ledger.
4. Mark completed work `[x]`, set exactly one evidence-supported next `[~]` item and matching Current Action, and report blockers.
