import dotenv from "dotenv";
import { BinanceProvider, CoinGeckoProvider } from "./providers";
import { loadConfig } from "./config";
import { buildRatioCandles } from "./indicators";
import { scoreMarketRegime } from "./scorer";
import { createDefaultState } from "./logger";
import { appendCsvRow, pctChange, round } from "./utils";
import { CandleBundle, GlobalSnapshot } from "./types";

dotenv.config();

async function main(): Promise<void> {
  const config = loadConfig();
  const binance = new BinanceProvider(config.providers.binanceBaseUrls);
  const coingecko = new CoinGeckoProvider(config);
  const timeframe = config.primaryTimeframe;
  const limit = Math.min(config.candleLimit, 1000);

  console.log(`Running simple V1 backtest on ${timeframe} candles. Dominance history is neutral in this first backtest version.`);

  const [btcUsdt, ethUsdt, solUsdt, ethBtc, solBtc, global] = await Promise.all([
    binance.fetchKlines(config.assets.btcUsdt, timeframe, limit),
    binance.fetchKlines(config.assets.ethUsdt, timeframe, limit),
    binance.fetchKlines(config.assets.solUsdt, timeframe, limit),
    binance.fetchKlines(config.assets.ethBtc, timeframe, limit),
    binance.fetchKlines(config.assets.solBtc, timeframe, limit),
    coingecko.fetchGlobalSnapshot()
  ]);

  const minLength = Math.min(btcUsdt.length, ethUsdt.length, solUsdt.length, ethBtc.length, solBtc.length);
  const startIndex = 220;
  const outputPath = "logs/backtest_results.csv";

  for (let i = startIndex; i < minLength - 3; i += 1) {
    const candles: CandleBundle = {
      btcUsdt: btcUsdt.slice(0, i + 1),
      ethUsdt: ethUsdt.slice(0, i + 1),
      solUsdt: solUsdt.slice(0, i + 1),
      ethBtc: ethBtc.slice(0, i + 1),
      solBtc: solBtc.slice(0, i + 1),
      solEth: buildRatioCandles("SOLETH", solUsdt.slice(0, i + 1), ethUsdt.slice(0, i + 1))
    };

    const historicalGlobal: GlobalSnapshot = {
      ...global,
      timestamp: new Date(btcUsdt[i].closeTime).toISOString(),
      // We do not fake historical dominance in V1. This keeps the backtest honest.
      totalMarketCapChange24hPct: null,
      btcDominancePct: null,
      stablecoinDominancePct: null,
      rawSource: "unavailable"
    };

    const result = scoreMarketRegime({
      timeframe,
      candles,
      global: historicalGlobal,
      state: createDefaultState(),
      config
    });

    const next1Btc = pctChange(btcUsdt[i + 1].close, btcUsdt[i].close);
    const next3Btc = pctChange(btcUsdt[i + 3].close, btcUsdt[i].close);
    const next1Eth = pctChange(ethUsdt[i + 1].close, ethUsdt[i].close);
    const next3Eth = pctChange(ethUsdt[i + 3].close, ethUsdt[i].close);
    const next1Sol = pctChange(solUsdt[i + 1].close, solUsdt[i].close);
    const next3Sol = pctChange(solUsdt[i + 3].close, solUsdt[i].close);

    appendCsvRow(
      outputPath,
      [
        "timestamp",
        "score",
        "regime",
        "leader",
        "meme_condition",
        "next_1_btc_pct",
        "next_3_btc_pct",
        "next_1_eth_pct",
        "next_3_eth_pct",
        "next_1_sol_pct",
        "next_3_sol_pct"
      ],
      [
        result.timestamp,
        result.score,
        result.regime,
        result.leader,
        result.memeCondition,
        round(next1Btc ?? 0, 3),
        round(next3Btc ?? 0, 3),
        round(next1Eth ?? 0, 3),
        round(next3Eth ?? 0, 3),
        round(next1Sol ?? 0, 3),
        round(next3Sol ?? 0, 3)
      ]
    );
  }

  console.log(`Backtest written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
