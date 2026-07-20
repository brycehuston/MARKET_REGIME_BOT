# Lane Rotation Forensics V1

> **PRELIMINARY — 46 valid fresh snapshots only.**

This is a read-only research report. It does not change production score math, lane math, triggers, providers, Telegram runtime formatting, or trading behavior.

## Dataset Summary

- Input path: `C:\Users\bryce\Documents\AlphaAlerts2.0\MARKET_REGIME_BOT\vps_logs\regime_snapshots_post_f75e087.jsonl`
- Rows read: 2302
- Parseable rows: 2302
- Valid explicit-fresh evidence rows: 46
- Excluded rows: 2256
  - Legacy schema: 2256
  - Stale, frozen, provider-error, or explicit freshness failure: 0
  - Missing timestamp, required prices, or BTC/ETH/SOL lane scores: 0
  - Malformed JSON: 0
- Older snapshots remained parse-compatible and were safely excluded: 2256
- Valid date range: 2026-07-19T21:11:04.808Z to 2026-07-20T08:15:01.250Z
- Readiness: **EXPLORATORY_READY**; 54 more valid fresh rows required for the 100-row comparison gate.
- Continuity break: gaps over 30 minutes.

### Scan Spacing

Min 3.95m, median 15m, P90 15.01m, max 15.08m.

| <10m | 10–<20m | 20–<30m | 30–<60m | ≥60m |
| --- | --- | --- | --- | --- |
| 1 | 44 | 0 | 0 | 0 |

### Fresh-Schema Coverage

| Field group | Rows present | Valid-row coverage |
| --- | --- | --- |
| score | 46 | 100% |
| bestLane | 46 | 100% |
| bestLaneLabel | 46 | 100% |
| laneConfidence | 46 | 100% |
| laneScoreStables | 46 | 100% |
| timeframeRead | 46 | 100% |
| chopState | 46 | 100% |
| ratios | 46 | 100% |
| returns4h | 46 | 100% |
| returns12h | 46 | 100% |
| returns1d | 46 | 100% |
| marketMove | 46 | 100% |
| laneReason | 46 | 100% |

## Leadership Summary

| Leader | Scans | Share | Elapsed minutes |
| --- | --- | --- | --- |
| BTC | 45 | 97.83% | 648.94 |
| ETH | 0 | 0% | 0 |
| SOL | 1 | 2.17% | 15.01 |
| STABLES | 0 | 0% | 0 |
| NO_CLEAR_LANE | 0 | 0% | 0 |

- Raw leader changes: 2
- One-scan rank-1 spikes: 1
- A→B→A noisy reversals within four scans: 1

### Transition Counts

| Transition | Count |
| --- | --- |
| BTC->SOL | 1 |
| SOL->BTC | 1 |

### Transition Matrix

| From \ To | BTC | ETH | SOL | STABLES | NO_CLEAR_LANE |
| --- | --- | --- | --- | --- | --- |
| BTC | 0 | 0 | 1 | 0 | 0 |
| ETH | 0 | 0 | 0 | 0 | 0 |
| SOL | 1 | 0 | 0 | 0 | 0 |
| STABLES | 0 | 0 | 0 | 0 | 0 |
| NO_CLEAR_LANE | 0 | 0 | 0 | 0 | 0 |

### Lane-Score Distributions

| Series | N | Min | P25 | Median | P75 | Max |
| --- | --- | --- | --- | --- | --- | --- |
| BTC | 46 | 29.96 | 65.23 | 66.29 | 66.45 | 67.6 |
| ETH | 46 | 22.33 | 22.33 | 44.52 | 45.26 | 49.54 |
| SOL | 46 | 21.7 | 26.69 | 28.35 | 42.29 | 66.3 |
| STABLES | 46 | 36 | 58 | 58 | 58 | 58 |
| topRunnerUpMargin | 46 | 7.23 | 7.23 | 8.29 | 8.45 | 16.76 |

## Successful Rotations

### SOL->BTC — 2026-07-20T00:30:01.201Z

- Prior leader: SOL; new leader: BTC
- Required persistence: 2 scans; observed run: 33 scans
- Confirmation margin: 8.45; median formation margin: 8.45
- Warning lead: 14.99 actual minutes

| Scans Before | Actual Lead Min | Timestamp | Rank | Score Δ | Acceleration | Margin Vs Leader | ETH/BTC % / SOL/BTC % / SOL/ETH % | Relative Returns | Regime | Chop | Freshness | Production Best Lane | Bot Hint | Lane Reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 14.99 | 2026-07-20T00:15:01.631Z | 1 | 36.49 | 72.82 | 0 | 0.45 / 0.03 / -0.42 | BTC-ETH-4h:0.28; BTC-SOL-4h:0.77; BTC-ETH-12h:0.28; BTC-SOL-12h:0.77; BTC-ETH-1d:0.28; BTC-SOL-1d:0.77 | Defensive | Choppy | FRESH | BTC / BTC only | yes | BTC is holding up best versus ETH/SOL; margin 8.45. |
| 2 | 30 | 2026-07-20T00:00:01.292Z | 4 | -36.33 | -36.33 | -36.34 | 0.02 / -0.06 / -0.08 | BTC-ETH-4h:-0.42; BTC-SOL-4h:-0.59; BTC-ETH-12h:-0.42; BTC-SOL-12h:-0.59; BTC-ETH-1d:0.98; BTC-SOL-1d:0 | Neutral / Chop | Mixed | FRESH | SOL / SOL leading | no | SOL/BTC and SOL/ETH improving; margin 16.76; persistence 0 |
| 3 | 44.99 | 2026-07-19T23:45:01.860Z | 1 | 0 | 0 | 0 | 0.06 / 0.13 / 0.07 | BTC-ETH-4h:0; BTC-SOL-4h:0; BTC-ETH-12h:0; BTC-SOL-12h:0; BTC-ETH-1d:1.38; BTC-SOL-1d:0.59 | Defensive | Choppy | FRESH | BTC / BTC only | yes | BTC is holding up best versus ETH/SOL; margin 8.29. |
| 4 | 60 | 2026-07-19T23:30:01.097Z | 1 | 0 | 0 | 0 | -0.03 / 0.23 / 0.26 | BTC-ETH-4h:0; BTC-SOL-4h:0; BTC-ETH-12h:0; BTC-SOL-12h:0; BTC-ETH-1d:1.38; BTC-SOL-1d:0.59 | Defensive | Choppy | FRESH | BTC / BTC only | yes | BTC is holding up best versus ETH/SOL; margin 8.29. |

For each confirmed event, the JSON report retains the preceding one through four valid scans with actual elapsed minutes, challenger rank/acceleration, lane margin, pair changes, relative returns, regime, chop, freshness, production Best Lane hint, and verbatim lane reason. No future field is used as an entry-time feature.

## Failed Rotations

- 2026-07-20T00:00:01.292Z — BTC->SOL; 1 scan(s), 0m; Challenger held rank 1 for one scan only; regime Neutral / Chop, chop Mixed.
- 2026-07-20T04:30:01.562Z — BTC->STABLES; 5 scan(s), 60m; Challenger improved but never cleared the margin during chop; regime Defensive, chop Choppy.

Failed labels include one-scan spikes, reversals within one to four contiguous scans, insufficient margin, repeated flips in chop, and absent available broader-window support. Attempts at the dataset boundary are UNMATURED rather than forced into success or failure.

## Candidate Early-Warning Signals

| Rank | Signal | Observed rows/events | Interpretation |
| --- | --- | --- | --- |
| 1 | Leader deterioration | 3 | Incumbent lane score declined scan over scan. |
| 2 | Challenger lane-score acceleration | 1 | Positive acceleration before a labeled attempt. |
| 3 | Multi-window support | 1 | Challenger beat both peers in at least one available return window. |
| 4 | Production Best Lane hint | 1 | Existing Best Lane matched the eventual challenger at warning time. |
| 5 | Relative-pair improvement | 0 | Asset-specific pair direction improved using only data available at that scan. |

These are descriptive counts, not evidence of profitability or a production-ready ordering.

## Threshold Comparison

Observed positive top-versus-runner-up margin candidates: P25=7.23, P50=8.29, P75=8.45.

| Scenario | Margin | Confirmed | Failed / false positive | Avg lead min | Median lead min | Missed durable | Right-censored | Sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2-scans-P25 | 7.23 | 1 | 2 | 14.99 | 14.99 | 0 | 0 | 3 |
| 2-scans-P50 | 8.29 | 1 | 2 | 14.99 | 14.99 | 0 | 0 | 3 |
| 2-scans-P75 | 8.45 | 1 | 2 | 14.99 | 14.99 | 0 | 0 | 3 |
| 3-scans-P25 | 7.23 | 1 | 2 | 30 | 30 | 0 | 0 | 3 |
| 3-scans-P50 | 8.29 | 1 | 2 | 30 | 30 | 0 | 0 | 3 |
| 3-scans-P75 | 8.45 | 1 | 2 | 30 | 30 | 0 | 0 | 3 |
| 4-scans-P25 | 7.23 | 1 | 2 | 45 | 45 | 0 | 0 | 3 |
| 4-scans-P50 | 8.29 | 1 | 2 | 45 | 45 | 0 | 0 | 3 |
| 4-scans-P75 | 8.45 | 1 | 2 | 45 | 45 | 0 | 0 | 3 |

Because fewer than 100 valid fresh rows are available, no scenario is selected or called production-ready. The comparison table activates automatically with additional data, but historical fit still requires forward validation.

## Recommended V1 Detector Design

- WATCH: a real non-incumbent challenger has positive lane-score delta, incumbent deterioration, or asset-specific pair improvement. **Candidate threshold — requires implementation and forward validation.**
- TAKEOVER_FORMING: the challenger reaches rank 1 and clears an observed-distribution margin, but has not completed the required contiguous persistence. **Candidate threshold — requires implementation and forward validation.**
- TAKEOVER_CONFIRMED: rank 1 persists for a tested 2-, 3-, or 4-scan window and both confirmation and median run margins clear the same candidate threshold. **Candidate threshold — requires implementation and forward validation.**
- ROTATION_FAILED: a WATCH/forming/confirmed attempt reverses within one to four contiguous scans, spikes once, never clears margin, repeatedly flips in chop, or lacks available broader-window support. **Candidate threshold — requires implementation and forward validation.**
- NO_ROTATION: no qualifying real challenger evidence exists. **Candidate threshold — requires implementation and forward validation.**

No numeric scenario is recommended at 46 valid rows. Re-run at 100+ rows and compare false positives, confirmed rotations, warning lead time, missed durable rotations, and right-censoring before choosing an implementation candidate.

## Limitations

- Only 46 explicit-fresh snapshots are eligible; the historical legacy period is excluded from rotation thresholds.
- The valid period is short and may not cover diverse regimes or enough successful transfers.
- Schema changes reduce comparable sample history.
- The return windows are snapshot-proxy timeframes, not reconstructed exchange candles.
- Unavailable intrabar structure cannot be inferred.
- Future observations label historical outcomes only; they are not entry-time features.
- This report makes no profitability claim and does not validate an execution strategy.

## Recommended Telegram Rotation Format

These premium, report-only format recommendations do not alter runtime Telegram code. Rotation is hidden when no meaningful challenger exists and never exposes raw lane scores or forensic terminology.

### A. No Meaningful Rotation

```text
━━━━━━━━━━━━━━━━━━━━━━
•  ALPHA ❤️‍🔥 PULSE  •
━━━━━━━━━━━━━━━━━━━━━━

Mode: Defensive 🛡️
Confidence: Caution

🎯 Plan: Mostly Stables
├─ Best Lane: BTC
├─ If In: Trail, Don't Chase
└─ If Flat: Wait

🌊 Activity: Weak
├─ Session: Weekend Late • Liquidity Thinning
└─ Invalid If: BTC Loses Structure

📊 Score: 36/100
└─ Next Scan: 22:15 UTC (~15m)
```

### B. Early Challenger

```text
🎯 Plan: Mostly Stables
├─ Best Lane: BTC
├─ Rotation: ETH Gaining • Early
├─ If In: Trail, Don't Chase
└─ If Flat: Wait For Confirmation
```

### C. Takeover Forming

```text
🎯 Plan: ETH Takeover Forming
├─ Best Lane: ETH
├─ Rotation: Building • 2 Scans
├─ If In: Hold And Trail
└─ If Flat: Scout On Confirmation
```

### D. Confirmed Takeover

```text
🎯 Plan: ETH Leading
├─ Best Lane: ETH
├─ Rotation: Confirmed
├─ If In: Hold And Trail
└─ If Flat: Enter Only On Confirmation
```

BTC, ETH, and SOL substitute generically in every asset position. Keep the centered Alpha Pulse header, current footer, required rows, and at most one extra visible row. Keep Context Only compact and hide it when empty.

### Plain-Language UX Review

| Avoid | Prefer | Reason |
| --- | --- | --- |
| BTC Only | BTC Leading | Does not imply every other lane is invalid. |
| Wait For Cleaner Lane | Wait | Shorter and immediately actionable when no rotation exists. |
| Positive challenger acceleration | ETH Gaining | Moves diagnostic language into snapshots and reports. |
| Persistence threshold met | Rotation: Confirmed | States the conclusion without exposing scoring mechanics. |
| NO_CLEAR_LANE | No Clean Lane | Uses plain title-case language. |

### Matching Market Move Layout

Market Move remains branch-free: one conclusion, one action set, and one invalidation.

```text
━━━━━━━━━━━━━━━━━━━━━━━
• 🔎 MARKET MOVE 🔍 •
━━━━━━━━━━━━━━━━━━━━━━━

Alert: ETH Lane Takeover 🚨
Confidence: Confirmed

Plan: ETH Leading
Best Lane: ETH
Previous Leader: BTC
Rotation: Confirmed • 3 Scans

🧠 Read:
ETH Is Outperforming BTC And SOL.
Leadership Has Persisted Across Scans.

If In: Hold And Trail
If Flat: Enter Only On Confirmation
Invalid If: ETH/BTC Fades
```

Use the same layout for BTC and SOL. Hide Rotation when state is NO_ROTATION and avoid repeating the same fact in Mode, Plan, Best Lane, and Read.

## Phase 2

Implement Generic BTC/ETH/SOL Lane Rotation Detector V1.

- Add rotation state fields, snapshot logging, and console logging.
- Add Accuracy Coach report-only evaluation.
- Integrate compact Alpha Pulse and branch-free Market Move formatting.
- Make no core score-math change initially.
- Add no live-trading behavior.
- Defer production implementation until more data and forward validation are available.

Phase 2: **Implement Generic BTC/ETH/SOL Lane Rotation Detector V1**
