# Liquidity Rotation State Machine V1 — Offline Evaluation

> **INSUFFICIENT_EVIDENCE**

Research-only and non-authoritative. Never approved for production.

## Dataset

- Source dataset: `/home/ubuntu/MARKET-REGIME-BOT/logs/regime_snapshots.jsonl`
- Evaluated slice: `rows 1-2521 through 2026-07-23T00:45:01.298Z`
- Rows: 2521 total; 265 eligible after 0 duplicate timestamp(s)
- Exclusions: malformed 0; legacy 2256; stale/broken 0; missing required 0
- Segments: 211 rows (2026-07-19T21:11:04.808Z to 2026-07-22T01:30:01.481Z); 54 rows (2026-07-22T11:30:03.095Z to 2026-07-23T00:45:01.298Z)
- Fixed continuity break: greater than 30 minutes

## Development and Holdout

- Policy: All complete earlier contiguous segments are development; the final contiguous segment is untouched holdout.
- Development: 211 rows, 2026-07-19T21:11:04.808Z to 2026-07-22T01:30:01.481Z
- Holdout: 54 rows, 2026-07-22T11:30:03.095Z to 2026-07-23T00:45:01.298Z
- Holdout used for tuning: **no**

## Provisional Candidate Rules

- One rule set, derived from development evidence only
- Score high / low: 53 / 41
- BTC breakout / cascade one-scan return: 0.152103% / -0.162425%
- Alt margin: 13.77
- Alt persistence: 2 scans (DEVELOPMENT_RUNS)

- MAJOR_BREAKOUT: BTC one-scan return is at least 0.152103% and score is at least 53.
- ROTATION_SETUP: ETH or SOL leads, its required pair ratio improves, lane margin is at least 13.77, and persistence is below 2 scans.
- ALT_ROTATION_CONFIRMED: The ROTATION_SETUP condition persists for at least 2 contiguous scans.
- NO_CLEAR_ROTATION: No provisional breakout, alt-rotation, or cascade condition is present.
- CASCADE_RISK: BTC one-scan return is at most -0.162425% and score is at most 41.

## State Metrics

| Split | State | Count | Success % | False Positives | Right-Censored | Forward % | MAE % | MFE % |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| DEVELOPMENT | MAJOR_BREAKOUT | 11 | 63.6364 | 4 | 0 | 0.081853 | -0.020182 | 0.188382 |
| DEVELOPMENT | ROTATION_SETUP | 3 | 100 | 0 | 0 | 0.26232 | 0.023678 | 0.28482 |
| DEVELOPMENT | ALT_ROTATION_CONFIRMED | 1 | 100 | 0 | 0 | 0.219458 | -0.120139 | 0.219458 |
| DEVELOPMENT | NO_CLEAR_ROTATION | 185 | n/a | 0 | 4 | 0.056796 | -0.128601 | 0.190985 |
| DEVELOPMENT | CASCADE_RISK | 11 | 36.3636 | 7 | 0 | 0.066884 | -0.080795 | 0.21897 |
| HOLDOUT | MAJOR_BREAKOUT | 7 | 42.8571 | 4 | 0 | -0.142681 | -0.273346 | -0.007502 |
| HOLDOUT | ROTATION_SETUP | 1 | n/a | 0 | 1 | n/a | n/a | n/a |
| HOLDOUT | ALT_ROTATION_CONFIRMED | 0 | n/a | 0 | 0 | n/a | n/a | n/a |
| HOLDOUT | NO_CLEAR_ROTATION | 46 | n/a | 0 | 3 | 0.056764 | -0.112302 | 0.192378 |
| HOLDOUT | CASCADE_RISK | 0 | n/a | 0 | 0 | n/a | n/a | n/a |

Forward return is measured four contiguous scans ahead. MAE and MFE are the minimum and maximum target-asset returns observed inside that same forward window. Rows without four future scans in the same segment are right-censored.

## Session-Conditioned Behavior

| Split | Session | Rows | Candidates | Mature Candidates | Success % |
| --- | --- | ---: | ---: | ---: | ---: |
| DEVELOPMENT | ASIA | 75 | 17 | 17 | 58.8235 |
| DEVELOPMENT | LONDON | 40 | 4 | 4 | 75 |
| DEVELOPMENT | LONDON_NEW_YORK_OVERLAP | 24 | 3 | 3 | 66.6667 |
| DEVELOPMENT | NEW_YORK | 48 | 2 | 2 | 0 |
| DEVELOPMENT | OFF_HOURS | 24 | 0 | 0 | n/a |
| HOLDOUT | ASIA | 8 | 1 | 0 | n/a |
| HOLDOUT | LONDON | 2 | 0 | 0 | n/a |
| HOLDOUT | LONDON_NEW_YORK_OVERLAP | 12 | 0 | 0 | n/a |
| HOLDOUT | NEW_YORK | 24 | 6 | 6 | 50 |
| HOLDOUT | OFF_HOURS | 8 | 1 | 1 | 0 |

## Verdict

- Untouched holdout has 7 mature candidate outcomes; at least 10 are required.
- Untouched holdout has 0 ALT_ROTATION_CONFIRMED observations; at least 2 are required.

## Missing Data and Limitations

- Canonical TOTAL3 is unavailable; total3State remains UNAVAILABLE.
- Broad-alt universe, advances/declines, and canonical breadth are unavailable; altBreadthState remains UNAVAILABLE.
- The sample covers two short contiguous segments separated by a 600-minute gap.
- Candidate thresholds are descriptive development quantiles, not validated production thresholds.
- Forward outcomes are short-horizon snapshot returns and make no profitability claim.
- All states, metrics, and verdicts are research-only and non-authoritative.
