import assert from "node:assert/strict";
import { CoinbaseProvider } from "./providers";
import { Timeframe } from "./types";

async function testCoinbaseProvider() {
  const provider = new CoinbaseProvider();
  const originalFetch = global.fetch;

  // 1. Valid live ticker prices + timestamps succeed
  global.fetch = async (url: RequestInfo | URL) => {
    const urlStr = url.toString();
    if (urlStr.includes("BTC-USD")) return { ok: true, json: async () => ({ price: "77000.5", time: "2026-08-22T00:00:00Z" }) } as any;
    if (urlStr.includes("ETH-USD")) return { ok: true, json: async () => ({ price: "3000.1", time: "2026-08-22T00:00:01Z" }) } as any;
    if (urlStr.includes("SOL-USD")) return { ok: true, json: async () => ({ price: "150.2", time: "2026-08-22T00:00:02Z" }) } as any;
    return { ok: true, json: async () => ({}) } as any;
  };

  const prices = await provider.fetchSpotPrices({ btc: "BTC-USD", eth: "ETH-USD", sol: "SOL-USD" });
  assert.equal(prices.provider, "coinbase");
  assert.equal(prices.btcPrice, 77000.5);
  assert.equal(prices.ethPrice, 3000.1);
  assert.equal(prices.solPrice, 150.2);
  assert.equal(prices.timestamp, new Date("2026-08-22T00:00:00Z").toISOString());

  // 2. Any one missing/invalid ticker timestamp rejects
  global.fetch = async (url: RequestInfo | URL) => {
    const urlStr = url.toString();
    if (urlStr.includes("BTC-USD")) return { ok: true, json: async () => ({ price: "77000.5", time: "2026-08-22T00:00:00Z" }) } as any;
    if (urlStr.includes("ETH-USD")) return { ok: true, json: async () => ({ price: "3000.1", time: "invalid-date" }) } as any; // Invalid
    if (urlStr.includes("SOL-USD")) return { ok: true, json: async () => ({ price: "150.2", time: "2026-08-22T00:00:02Z" }) } as any;
    return { ok: true, json: async () => ({}) } as any;
  };
  await assert.rejects(
    provider.fetchSpotPrices({ btc: "BTC-USD", eth: "ETH-USD", sol: "SOL-USD" }),
    /Coinbase spot ticker timestamp missing or invalid/
  );

  // 3. Newest-first Coinbase candles become ascending chronological order
  // And forming daily candle is excluded
  const nowSecs = Math.floor(Date.now() / 1000);
  const todayMidnight = Math.floor(nowSecs / 86400) * 86400;

  global.fetch = async () => {
    return {
      ok: true,
      json: async () => [
        [todayMidnight, 77000, 78000, 77500, 77800, 1000], // Today (forming, closeTime > now)
        [todayMidnight - 86400, 76000, 77000, 76500, 76800, 900], // Yesterday
        [todayMidnight - 86400 * 2, 75000, 76000, 75500, 75800, 800] // 2 days ago
      ]
    } as any;
  };

  const candles = await provider.fetchSpotKlines("BTC-USD", "1d" as Timeframe, 2);
  assert.equal(candles.length, 2);
  // Asserts ascending order
  assert.equal(candles[0].openTime, (todayMidnight - 86400 * 2) * 1000);
  assert.equal(candles[1].openTime, (todayMidnight - 86400) * 1000);

  // 4. Malformed/non-finite candle values reject
  global.fetch = async () => {
    return {
      ok: true,
      json: async () => [
        [todayMidnight - 86400, 76000, 77000, -5, 76800, 900], // negative open price
      ]
    } as any;
  };
  await assert.rejects(
    provider.fetchSpotKlines("BTC-USD", "1d" as Timeframe, 1),
    /Invalid open price/
  );

  // 5. Coinbase 4h fails cleanly as unsupported
  await assert.rejects(
    provider.fetchSpotKlines("BTC-USD", "4h" as Timeframe, 1),
    /Coinbase does not natively support timeframe: 4h/
  );

  global.fetch = originalFetch;
  console.log("CoinbaseProvider tests passed.");
}

testCoinbaseProvider().catch((error) => {
  console.error(error);
  process.exit(1);
});
