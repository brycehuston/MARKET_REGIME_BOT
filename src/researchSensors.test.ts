import assert from "node:assert";
import { ResearchSensorsCollector } from "./researchSensors";
import { BinanceProvider, BybitProvider, CoinGeckoProvider } from "./providers";
import { FredContextProvider } from "./fred";
import { DefiLlamaProvider } from "./defillama";
import { BotConfig } from "./types";
import { loadConfig } from "./config";

function runTests() {
  const mockConfig: BotConfig = {
    ...loadConfig(),
    defiLlama: { confirmationEnabled: true, baseUrl: "http://mock", timeoutMs: 1000 }
  };

  const binance = new BinanceProvider(["http://mock"]);
  const bybit = new BybitProvider("http://mock");
  const coingecko = new CoinGeckoProvider(mockConfig);
  const fred = new FredContextProvider();
  const defillama = new DefiLlamaProvider(mockConfig);

  const collector = new ResearchSensorsCollector(binance, bybit, coingecko, fred, defillama);

  // Mocking the providers to return deterministic data
  binance.fetchOrderBook = async (symbol: string) => {
    if (symbol === "BTCUSDT") return { bids: [[100000, 1]], asks: [[100010, 1]] };
    if (symbol === "ETHUSDT") return { bids: [[4000, 1]], asks: [[4002, 1]] };
    if (symbol === "SOLUSDT") return { bids: [[200, 1]], asks: [[200.5, 1]] };
    return { bids: [], asks: [] };
  };

  bybit.fetchOptions = async (asset: string) => {
    if (asset === "BTC") return [
      { symbol: "BTC-1", bidIv: 0.5, askIv: 0.6, delta: 0.8, iv: 0.6 },
      { symbol: "BTC-2", bidIv: 0.5, askIv: 0.6, delta: 0.52, iv: 0.55 },
      { symbol: "BTC-3", bidIv: 0.5, askIv: 0.6, delta: 0.45, iv: 0.53 }
    ];
    if (asset === "ETH") return [{ symbol: "ETH-1", bidIv: 0.5, askIv: 0.6, delta: 0.49, iv: 0.65 }];
    return [];
  };

  coingecko.fetchBreadth = async () => {
    return [
      { id: "bitcoin", symbol: "btc", currentPrice: 100000, priceChangePercentage24h: 5, marketCap: 2000000 },
      { id: "ethereum", symbol: "eth", currentPrice: 4000, priceChangePercentage24h: -2, marketCap: 500000 },
      { id: "solana", symbol: "sol", currentPrice: 200, priceChangePercentage24h: 10, marketCap: 100000 },
      { id: "tether", symbol: "usdt", currentPrice: 1, priceChangePercentage24h: 0.01, marketCap: 100000 }
    ];
  };

  defillama.fetchStablecoinSupplyMetrics = async () => {
    return { totalStablecoinSupply: 150000000000 };
  };

  coingecko.fetchStablecoinPrices = async () => {
    return { usdtPrice: 0.999, usdcPrice: 1.001 };
  };

  collector.collect().then(snapshot => {
    // Breadth assertions
    assert.strictEqual(snapshot.breadth.status, "OK");
    assert.strictEqual(snapshot.breadth.validAssetCount, 3); // 4 total - 1 tether
    assert.strictEqual(snapshot.breadth.advancingCount, 2); // btc, sol
    assert.strictEqual(snapshot.breadth.decliningCount, 1); // eth
    assert.strictEqual(snapshot.breadth.pctPositive24h, (2/3) * 100);
    assert.strictEqual(snapshot.breadth.medianReturn24h, 5); // returns are [-2, 5, 10]
    assert.strictEqual(snapshot.breadth.pctOutperformingBtc24h, (1/3) * 100); // Only SOL outperformed BTC

    // Liquidity assertions
    assert.strictEqual(snapshot.liquidity.status, "OK");
    assert.strictEqual(snapshot.liquidity.spreadBpsBtc, 1); // (100010 - 100000) / 100000 * 10000
    assert.strictEqual(snapshot.liquidity.depthUsdWithin10BpsBtc, 200010); // bid: 100000, ask: 100010

    // Options assertions
    assert.strictEqual(snapshot.options.status, "OK");
    assert.strictEqual(snapshot.options.btcAtmIv, 0.55); // delta 0.52 is closest to 0.5
    assert.strictEqual(snapshot.options.ethAtmIv, 0.65);
    assert.strictEqual(snapshot.options.termStructureSlopeBtc, null); // unavailable

    // Spot/Perp Flow
    assert.strictEqual(snapshot.spotPerpFlow.status, "Unavailable");

    // Macro/NDX
    assert.strictEqual(snapshot.macroNdx.status, "Unavailable");

    // Stablecoins assertions
    assert.strictEqual(snapshot.stablecoins.status, "OK");
    assert.strictEqual(snapshot.stablecoins.totalSupply, 150000000000);
    assert.strictEqual(snapshot.stablecoins.usdtPeg, 0.999);
    assert.strictEqual(snapshot.stablecoins.usdcPeg, 1.001);

    console.log("ResearchSensorsCollector tests passed.");
  }).catch(err => {
    console.error("ResearchSensorsCollector tests failed:", err);
    process.exit(1);
  });
}

runTests();
