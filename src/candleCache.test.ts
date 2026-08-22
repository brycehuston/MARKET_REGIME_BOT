import assert from "node:assert/strict";
import { MarketRegimeBot } from "./app";
import { CandleBundle, LiveSpotPriceSnapshot } from "./types";

async function testCandleCache() {
  const bot = new MarketRegimeBot();
  const originalFetchCoinGecko = (bot as any).fetchCoinGeckoCandleBundle;
  const originalFetchCoinbase = (bot as any).fetchCoinbaseCandleBundle;
  const originalFetchBybit = (bot as any).fetchBybitCandleBundle;
  const originalFetchBinance = (bot as any).fetchBinanceCandleBundle;
  const originalFetchSpotPrices = (bot as any).fetchSpotPricesFromProvider;

  let coingeckoCalled = 0;
  let coinbaseCalled = 0;
  let bybitCalled = 0;
  let binanceCalled = 0;
  let spotProviderCalls = 0;
  const spotProviderValues: string[] = [];

  const now = Date.now();
  const durationMs = 86400000;
  const openTime = Math.floor(now / durationMs) * durationMs - durationMs;
  
  const mockBundle = {
    btcUsdt: [{ openTime, closeTime: openTime + durationMs - 1, close: 100 } as any],
    ethUsdt: [{ openTime, closeTime: openTime + durationMs - 1, close: 100 } as any],
    solUsdt: [{ openTime, closeTime: openTime + durationMs - 1, close: 100 } as any],
    ethBtc: [], solBtc: [], solEth: []
  } as CandleBundle;

  (bot as any).fetchCoinGeckoCandleBundle = async () => {
    coingeckoCalled++;
    throw new Error("CoinGecko quota exceeded");
  };

  (bot as any).fetchCoinbaseCandleBundle = async () => {
    coinbaseCalled++;
    return mockBundle;
  };

  (bot as any).fetchBybitCandleBundle = async () => {
    bybitCalled++;
    return mockBundle;
  };

  (bot as any).fetchBinanceCandleBundle = async () => {
    binanceCalled++;
    return mockBundle;
  };

  (bot as any).fetchSpotPricesFromProvider = async (provider: string) => {
    spotProviderCalls++;
    spotProviderValues.push(provider);
    return {
      provider,
      timestamp: new Date().toISOString(),
      btcPrice: 50000,
      ethPrice: 3000,
      solPrice: 100
    } as LiveSpotPriceSnapshot;
  };

  try {
    // 1. PROVE ACTUAL HISTORICAL PROVIDER FAILOVER
    // Coingecko fails -> Coinbase succeeds -> bybit and binance not called.
    const result1 = await (bot as any).fetchCandleBundle("1d");
    
    assert.equal(coingeckoCalled, 1);
    assert.equal(coinbaseCalled, 1);
    assert.equal(bybitCalled, 0);
    assert.equal(binanceCalled, 0);
    assert.equal(result1.provider, "coinbase");
    assert.equal(result1.candles, mockBundle);

    // 2. PROVE LIVE PRICES NEVER COME FROM CANDLE CACHE
    // We have a populated candle cache now (from the successful fetch above).
    // Now call fetchLiveSpotPrices twice and verify the spot provider is hit twice.
    await (bot as any).fetchLiveSpotPrices("coinbase");
    await (bot as any).fetchLiveSpotPrices("coinbase");

    assert.equal(spotProviderCalls, 2, "Live spot prices should bypass historical cache entirely");
    assert.deepEqual(spotProviderValues, ["coinbase", "coinbase"]);
    
    // Check that cache reuse occurs before next closed candle
    const result2 = await (bot as any).fetchCandleBundle("1d");
    assert.equal(coingeckoCalled, 2); // Attempted again since it's primary and not cached
    assert.equal(coinbaseCalled, 1); // Not called again (cache hit)
    assert.equal(result2.provider, "coinbase");

    // Force cache expiry
    (bot as any).candleCache.expiresAtMs = Date.now() - 1000;
    
    // Failed refresh doesn't overwrite prior cache state
    (bot as any).fetchCoinbaseCandleBundle = async () => {
      coinbaseCalled++;
      throw new Error("Coinbase failed now");
    };
    (bot as any).fetchBybitCandleBundle = async () => {
      bybitCalled++;
      throw new Error("Bybit failed now");
    };
    (bot as any).fetchBinanceCandleBundle = async () => {
      binanceCalled++;
      throw new Error("Binance failed now");
    };
    
    await assert.rejects(
      (bot as any).fetchCandleBundle("1d"),
      /All market-data providers failed/
    );

    const cacheAfterFail = (bot as any).candleCache;
    assert.ok(cacheAfterFail);
    assert.equal(cacheAfterFail.bundle.btcUsdt[0].close, 100);

    // Expired cache -> later provider succeeds -> cache refreshes with NEW bundle
    const newMockBundle = {
      ...mockBundle,
      btcUsdt: [{ openTime, closeTime: openTime + durationMs - 1, close: 200 } as any]
    } as CandleBundle;

    (bot as any).fetchCoinbaseCandleBundle = async () => {
      coinbaseCalled++;
      return newMockBundle;
    };

    const recoveredResult = await (bot as any).fetchCandleBundle("1d");
    assert.equal(recoveredResult.provider, "coinbase");
    assert.equal(recoveredResult.candles.btcUsdt[0].close, 200);
    assert.equal((bot as any).candleCache.bundle.btcUsdt[0].close, 200);
    
    // Assert Bybit and Binance were not called after Coinbase succeeds!
    // binanceCalled and bybitCalled should be exactly 1 from the previous failed attempt!
    assert.equal(bybitCalled, 1);
    assert.equal(binanceCalled, 1);

    console.log("CandleCache and Failover tests passed.");
  } finally {
    (bot as any).fetchCoinGeckoCandleBundle = originalFetchCoinGecko;
    (bot as any).fetchCoinbaseCandleBundle = originalFetchCoinbase;
    (bot as any).fetchBybitCandleBundle = originalFetchBybit;
    (bot as any).fetchBinanceCandleBundle = originalFetchBinance;
    (bot as any).fetchSpotPricesFromProvider = originalFetchSpotPrices;
  }
}

testCandleCache().catch((error) => {
  console.error(error);
  process.exit(1);
});
