import assert from "node:assert/strict";
import fs from "node:fs";
import {
  marketMatchesAsset,
  selectMarkets,
  buildExchangeMap,
  readMarketCache
} from "./derivativesHeat";

function testMarketMatchesAsset() {
  const ethwMarket = {
    symbol: "ETHWUSDT_PERP.A",
    base_asset: "ETHW",
    quote_asset: "USDT",
    is_perpetual: true
  };

  assert.equal(marketMatchesAsset(ethwMarket, "ETH"), false, "ETHWUSDT_PERP.A cannot satisfy requested ETH");

  const ethMarket = {
    symbol: "ETHUSDT_PERP.A",
    base_asset: "ETH",
    quote_asset: "USDT",
    is_perpetual: true
  };
  assert.equal(marketMatchesAsset(ethMarket, "ETH"), true, "ETHUSDT_PERP.A should satisfy requested ETH");
}

function testExchangeMappingAndPriority() {
  const exchangesRaw = [
    { code: "A", name: "Binance" },
    { code: "6", name: "Bybit" },
    { code: "3", name: "OKX" }
  ];

  const map = buildExchangeMap(exchangesRaw);
  assert.equal(map["A"], "binance");
  assert.equal(map["6"], "bybit");
  assert.equal(map["3"], "okx");

  const marketsRaw = [
    { symbol: "BTCUSDT.6", exchange: "6", base_asset: "BTC", quote_asset: "USDT", is_perpetual: true },
    { symbol: "BTCUSDT_PERP.3", exchange: "3", base_asset: "BTC", quote_asset: "USDT", is_perpetual: true },
    { symbol: "BTCUSDT_PERP.A", exchange: "A", base_asset: "BTC", quote_asset: "USDT", is_perpetual: true }
  ];

  const mappings = selectMarkets(marketsRaw, exchangesRaw, ["BTC"]);
  assert.equal(mappings["BTC"].symbol, "BTCUSDT_PERP.A", "BTC selects BTCUSDT_PERP.A (Binance priority)");

  const marketsRawEth = [
    { symbol: "ETHWUSDT_PERP.A", exchange: "A", base_asset: "ETHW", quote_asset: "USDT", is_perpetual: true },
    { symbol: "ETHUSDT_PERP.A", exchange: "A", base_asset: "ETH", quote_asset: "USDT", is_perpetual: true }
  ];
  const mappingsEth = selectMarkets(marketsRawEth, exchangesRaw, ["ETH"]);
  assert.equal(mappingsEth["ETH"].symbol, "ETHUSDT_PERP.A", "ETH selects ETHUSDT_PERP.A, never ETHWUSDT_PERP.A");

  const marketsRawSol = [
    { symbol: "SOLUSDT_PERP.A", exchange: "A", base_asset: "SOL", quote_asset: "USDT", is_perpetual: true }
  ];
  const mappingsSol = selectMarkets(marketsRawSol, exchangesRaw, ["SOL"]);
  assert.equal(mappingsSol["SOL"].symbol, "SOLUSDT_PERP.A", "SOL selects SOLUSDT_PERP.A");
}

function testCacheVersion() {
  const CACHE_PATH = "data/derivatives_markets_cache.json";
  // Backup existing
  let backup = null;
  if (fs.existsSync(CACHE_PATH)) {
    backup = fs.readFileSync(CACHE_PATH, "utf8");
  } else {
    fs.mkdirSync("data", { recursive: true });
  }

  try {
    // Write unversioned
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      generatedAt: new Date().toISOString(),
      mappings: { BTC: { asset: "BTC", symbol: "BTCUSDT", exchange: "binance" } }
    }));

    assert.equal(readMarketCache(), null, "Legacy/unversioned market cache is rejected rather than trusted.");

    // Write version 2
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      mappings: { BTC: { asset: "BTC", symbol: "BTCUSDT", exchange: "binance" } }
    }));

    assert.equal(readMarketCache(), null, "Version 2 market cache is rejected rather than trusted.");

    // Write version 3
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      version: 3,
      generatedAt: new Date().toISOString(),
      mappings: { BTC: { asset: "BTC", symbol: "BTCUSDT", exchange: "binance" } }
    }));

    const validCache = readMarketCache();
    assert.ok(validCache, "A current valid versioned cache remains reusable.");
    assert.equal(validCache.version, 3);

  } finally {
    if (backup !== null) {
      fs.writeFileSync(CACHE_PATH, backup);
    } else if (fs.existsSync(CACHE_PATH)) {
      fs.unlinkSync(CACHE_PATH);
    }
  }
}

function runTests() {
  testMarketMatchesAsset();
  testExchangeMappingAndPriority();
  testCacheVersion();
  console.log("Focused derivatives resolver tests passed.");
}

runTests();
