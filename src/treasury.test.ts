import assert from "node:assert/strict";
import { decideAlert } from "./alerts";
import { buildEventContext } from "./eventContext";
import { deriveBestLane } from "./laneExplainer";
import { scoreMarketRegime } from "./scorer";
import {
  buildTreasurySnapshot,
  classifyTreasuryTrend,
  extractOperatingCashBalancePoints,
  mergeTreasuryLiquidityContext,
  TreasuryFiscalDataProvider
} from "./treasury";
import {
  BotConfig,
  Candle,
  CandleBundle,
  GlobalSnapshot,
  MacroLiquidityContext,
  RegimeScoreResult,
  SavedState
} from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function treasuryRows(): unknown {
  return {
    data: [
      { record_date: "2026-07-01", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "760000", table_nbr: "III", src_line_nbr: "4", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" },
      { record_date: "2026-07-03", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "776843", table_nbr: "III", src_line_nbr: "4", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" },
      { record_date: "2026-07-02", account_type: "Treasury General Account (TGA) Opening Balance", close_today_bal: "null", open_today_bal: "999999", table_nbr: "III", src_line_nbr: "3", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" },
      { record_date: "2026-07-02", account_type: "Total TGA Deposits", close_today_bal: "null", open_today_bal: "888888", table_nbr: "III", src_line_nbr: "5", table_nm: "Operating Cash Balance", sub_table_name: "Deposits" },
      { record_date: "2026-07-02", account_type: "Total TGA Withdrawals", close_today_bal: "null", open_today_bal: "777777", table_nbr: "III", src_line_nbr: "6", table_nm: "Operating Cash Balance", sub_table_name: "Withdrawals" },
      { record_date: "2026-07-02", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "790000", table_nbr: "III", src_line_nbr: "4", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" }
    ]
  };
}
function testParseOperatingCashBalanceRows(): void {
  const parsed = extractOperatingCashBalancePoints(treasuryRows());
  assert.deepEqual(parsed, [
    { recordDate: "2026-07-03", value: 776843 },
    { recordDate: "2026-07-02", value: 790000 },
    { recordDate: "2026-07-01", value: 760000 }
  ]);
}

function testInvalidNumericValueReturnsNoPointAndUnknownTrend(): void {
  const parsed = extractOperatingCashBalancePoints({
    data: [
      { record_date: "2026-07-03", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "not-a-number", src_line_nbr: "4", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" }
    ]
  });
  assert.deepEqual(parsed, []);
  assert.equal(classifyTreasuryTrend(null, 1), "UNKNOWN");
}


function testIgnoresNonClosingTgaRowsAndUsesOpenBalance(): void {
  const parsed = extractOperatingCashBalancePoints({
    data: [
      { record_date: "2026-07-04", account_type: "Treasury General Account (TGA) Opening Balance", close_today_bal: "999999", open_today_bal: "111111", src_line_nbr: "3", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" },
      { record_date: "2026-07-04", account_type: "Total TGA Deposits", close_today_bal: "999999", open_today_bal: "222222", src_line_nbr: "5", table_nm: "Operating Cash Balance", sub_table_name: "Deposits" },
      { record_date: "2026-07-04", account_type: "Total TGA Withdrawals", close_today_bal: "999999", open_today_bal: "333333", src_line_nbr: "6", table_nm: "Operating Cash Balance", sub_table_name: "Withdrawals" },
      { record_date: "2026-07-04", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "444444", src_line_nbr: "7", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" },
      { record_date: "2026-07-04", account_type: "Treasury General Account (TGA) Closing Balance", close_today_bal: "null", open_today_bal: "776843", src_line_nbr: "4", table_nm: "Operating Cash Balance", sub_table_name: "Cash Balance Details" }
    ]
  });

  assert.deepEqual(parsed, [{ recordDate: "2026-07-04", value: 776843 }]);
}

async function testProviderSuccessNoApiKeyRequired(): Promise<void> {
  let requestedUrl = "";
  const provider = new TreasuryFiscalDataProvider({
    ingestTimestamp: () => "2026-07-04T12:00:00.000Z",
    fetchImpl: (async (input) => {
      requestedUrl = String(input);
      return jsonResponse(treasuryRows());
    }) as typeof fetch
  });

  const context = await provider.getContext();
  assert.equal(context.treasuryEnabled, true);
  assert.equal(context.tgaFiscalData, 776843);
  assert.equal(context.tgaFiscalDataPrior, 790000);
  assert.equal(context.tgaFiscalDataTrend, "CONTRACTING");
  assert.equal(context.tgaFiscalDataRecordDate, "2026-07-03");
  assert.equal(context.treasurySourceTimestamp, "2026-07-03");
  assert.equal(context.treasuryIngestTimestamp, "2026-07-04T12:00:00.000Z");
  assert.equal(context.treasuryBacktestDataStatus, "REAL_TIME");
  const requestedSearchParams = new URL(requestedUrl).searchParams;
  const requestedFields = requestedSearchParams.get("fields")?.split(",") ?? [];
  assert.equal(requestedSearchParams.has("api_key"), false);
  assert.equal(requestedSearchParams.get("sort"), "-record_date");
  assert.equal(requestedFields.includes("line_code"), false);
  assert.equal(requestedFields.includes("line_item"), false);
  assert.ok(requestedFields.includes("open_today_bal"));
  assert.ok(requestedFields.includes("src_line_nbr"));
  assert.ok(requestedFields.includes("table_nm"));
  assert.ok(requestedFields.includes("sub_table_name"));
}

async function testProviderFailureDoesNotThrow(): Promise<void> {
  const provider = new TreasuryFiscalDataProvider({
    ingestTimestamp: () => "2026-07-04T12:00:00.000Z",
    fetchImpl: (async () => jsonResponse({ error: "failed" }, 503)) as typeof fetch
  });

  const context = await provider.getContext();
  assert.equal(context.treasuryEnabled, false);
  assert.equal(context.tgaFiscalData, null);
  assert.equal(context.tgaFiscalDataTrend, "UNKNOWN");
  assert.match(context.treasuryError ?? "", /HTTP 503/);
}

function testUnitGuardPreventsNetLiquidity(): void {
  const liquidity = fixtureLiquidity();
  const treasury = buildTreasurySnapshot({
    ingestTimestamp: "2026-07-04T12:00:00.000Z",
    latest: { recordDate: "2026-07-03", value: 810 },
    prior: { recordDate: "2026-07-02", value: 790 },
    error: null,
    unitWarning: "Treasury units could not be normalized safely."
  });

  const merged = mergeTreasuryLiquidityContext(liquidity, treasury);
  assert.equal(merged.netLiquidityProxy, null);
  assert.equal(merged.netLiquidityTrend, "UNKNOWN");
  assert.equal(merged.tgaPreferredSource, "FRED_WTREGEN");
  assert.equal(merged.netLiquidityUnitWarning, "Treasury units could not be normalized safely.");
}

function testNetLiquidityUsesTreasuryThenFredFallback(): void {
  const treasury = buildTreasurySnapshot({
    ingestTimestamp: "2026-07-04T12:00:00.000Z",
    latest: { recordDate: "2026-07-03", value: 810 },
    prior: { recordDate: "2026-07-02", value: 790 },
    error: null,
    unitWarning: null
  });
  const merged = mergeTreasuryLiquidityContext(fixtureLiquidity(), treasury);
  assert.equal(merged.tgaPreferredSource, "TREASURY_FISCALDATA");
  assert.equal(merged.tga, 810);
  assert.equal(merged.netLiquidityProxy, 5690);
  assert.equal(merged.netLiquidityTrend, "EXPANDING");

  const unavailableTreasury = buildTreasurySnapshot({
    ingestTimestamp: "2026-07-04T12:00:00.000Z",
    latest: null,
    prior: null,
    error: "unavailable",
    unitWarning: null
  });
  const fallback = mergeTreasuryLiquidityContext(fixtureLiquidity(), unavailableTreasury);
  assert.equal(fallback.tgaPreferredSource, "FRED_WTREGEN");
  assert.equal(fallback.tga, 800);
  assert.equal(fallback.netLiquidityProxy, 5700);
}

function testEventContextAndDecisionBehaviorUnchanged(): void {
  const config = fixtureConfig();
  const state = fixtureState();
  const candles = fixtureCandles();
  const global = fixtureGlobal();
  const scoredA = scoreMarketRegime({ timeframe: "1h", candles, global, state, config });
  const context = buildEventContext(new Date("2026-07-10T12:00:00Z"), { macroLiquidityContext: fixtureLiquidity() });
  const scoredB = scoreMarketRegime({ timeframe: "1h", candles, global, state, config });
  const { timestamp: timestampA, ...comparableA } = scoredA;
  const { timestamp: timestampB, ...comparableB } = scoredB;
  assert.ok(timestampA);
  assert.ok(timestampB);
  assert.equal(context.eventContextOperational, false);
  assert.deepEqual(comparableB, comparableA);

  const laneInput = {
    timestamp: "2026-07-10T12:00:00Z",
    score: scoredA.score,
    regime: scoredA.regime,
    leader: scoredA.leader,
    regimeConfidence: "Confirmed" as const,
    defiStatus: "Strong" as const,
    sessionPhase: "London/NY overlap",
    activityState: "steady activity",
    marketMoveReason: "No market move",
    btcPrice: 110,
    ethPrice: 120,
    solPrice: 135,
    ethBtcRatio: 1.09,
    solBtcRatio: 1.23,
    solEthRatio: 1.13,
    history: []
  };
  const laneA = deriveBestLane(laneInput);
  buildEventContext(new Date("2026-07-10T12:00:00Z"), { macroLiquidityContext: fixtureLiquidity() });
  const laneB = deriveBestLane(laneInput);
  assert.deepEqual(laneB, laneA);

  const previous = { ...scoredA, score: scoredA.score - 10, regime: scoredA.regime } as RegimeScoreResult;
  const alertState: SavedState = { ...state, lastScore: previous.score, lastRegime: previous.regime, currentResult: previous };
  const decisionA = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  buildEventContext(new Date("2026-07-10T12:00:00Z"), { macroLiquidityContext: fixtureLiquidity() });
  const decisionB = decideAlert(config, alertState, scoredA, "Confirmed", "Confirmed");
  assert.deepEqual(decisionB, decisionA);
}

function fixtureLiquidity(): MacroLiquidityContext {
  return {
    walcl: 7000,
    walclPrior: 6900,
    rrp: 500,
    rrpPrior: 550,
    tga: 800,
    tgaFred: 800,
    tgaFredPrior: 750,
    tgaFiscalData: null,
    tgaFiscalDataPrior: null,
    tgaFiscalDataTrend: "UNKNOWN",
    tgaFiscalDataRecordDate: null,
    tgaFiscalDataPriorRecordDate: null,
    netLiquidityProxy: 5700,
    netLiquidityTrend: "EXPANDING",
    liquiditySourceTimestamp: "2026-07-02",
    treasuryEnabled: false,
    treasurySourceTimestamp: null,
    treasuryIngestTimestamp: null,
    treasuryError: null,
    treasuryBacktestDataStatus: "REAL_TIME",
    treasurySeriesDates: {},
    tgaPreferredSource: "FRED_WTREGEN",
    liquidityUnits: "USD_MILLIONS",
    netLiquidityUnitWarning: null
  };
}

function fixtureConfig(): BotConfig {
  return {
    scanIntervalMinutes: 15,
    primaryTimeframe: "1h",
    confirmationTimeframe: "4h",
    timingTimeframe: "1h",
    candleLimit: 60,
    providers: { marketDataPrimary: "binance", binanceBaseUrls: [], bybitBaseUrl: "", coingeckoBaseUrl: "" },
    defiLlama: { confirmationEnabled: false, baseUrl: "", timeoutMs: 1000 },
    derivativesHeat: { enabled: false, provider: "coinalyze", coinalyzeApiKey: "", coinalyzeBaseUrl: "", timeoutMs: 1000, assets: ["BTC", "ETH", "SOL"], interval: "1hour", historyHours: 24 },
    assets: { btcUsdt: "BTCUSDT", ethUsdt: "ETHUSDT", solUsdt: "SOLUSDT", ethBtc: "ETHBTC", solBtc: "SOLBTC" },
    stablecoinDominanceSymbols: [],
    alertRules: { enabled: true, minScoreDelta: 3, cooldownMinutes: 0, criticalCooldownMinutes: 0, sendStartupAlert: false, telegramHeartbeatEnabled: false, telegramHeartbeatIntervalMinutes: 60 },
    paths: { stateFile: "", scoreCsv: "", alertCsv: "", snapshotJsonl: "", derivativesHeatCsv: "", derivativesHeatJsonl: "", errorLog: "" }
  };
}

function fixtureState(): SavedState {
  return {
    version: "1.0.0",
    lastRunAt: null,
    lastAlertAt: null,
    lastHeartbeatAt: null,
    lastAlertReason: null,
    lastScore: 50,
    lastRegime: "Neutral / Chop",
    lastLeader: "Mixed",
    globalHistory: [
      { timestamp: "2026-07-10T09:00:00Z", totalMarketCapUsd: 100, btcDominancePct: 50, stablecoinDominancePct: 8 },
      { timestamp: "2026-07-10T10:00:00Z", totalMarketCapUsd: 101, btcDominancePct: 49.8, stablecoinDominancePct: 7.9 },
      { timestamp: "2026-07-10T11:00:00Z", totalMarketCapUsd: 102, btcDominancePct: 49.6, stablecoinDominancePct: 7.8 }
    ],
    currentResult: null
  };
}

function fixtureGlobal(): GlobalSnapshot {
  return {
    timestamp: "2026-07-10T12:00:00Z",
    totalMarketCapUsd: 104,
    totalMarketCapChange24hPct: 1.2,
    btcDominancePct: 49.2,
    ethDominancePct: 18,
    solDominancePct: 3,
    stablecoinDominancePct: 7.4,
    rawSource: "coingecko"
  };
}

function fixtureCandles(): CandleBundle {
  const btc = makeCandles("BTCUSDT", 100, 1);
  const eth = makeCandles("ETHUSDT", 100, 1.2);
  const sol = makeCandles("SOLUSDT", 100, 1.4);
  return {
    btcUsdt: btc,
    ethUsdt: eth,
    solUsdt: sol,
    ethBtc: makeCandles("ETHBTC", 1, 0.01),
    solBtc: makeCandles("SOLBTC", 1, 0.015),
    solEth: makeCandles("SOLETH", 1, 0.012)
  };
}

function makeCandles(symbol: string, start: number, step: number): Candle[] {
  return Array.from({ length: 60 }, (_, index) => {
    const open = start + index * step;
    const close = open + step * 0.8;
    return {
      symbol,
      interval: "1h",
      openTime: Date.UTC(2026, 6, 8, index),
      closeTime: Date.UTC(2026, 6, 8, index, 59),
      open,
      high: close + 1,
      low: open - 1,
      close,
      volume: 1000 + index * 10,
      quoteVolume: 100000 + index * 100
    };
  });
}

async function run(): Promise<void> {
  testParseOperatingCashBalanceRows();
  testInvalidNumericValueReturnsNoPointAndUnknownTrend();
  testIgnoresNonClosingTgaRowsAndUsesOpenBalance();
  await testProviderSuccessNoApiKeyRequired();
  await testProviderFailureDoesNotThrow();
  testUnitGuardPreventsNetLiquidity();
  testNetLiquidityUsesTreasuryThenFredFallback();
  testEventContextAndDecisionBehaviorUnchanged();
  console.log("Treasury context tests passed.");
}

void run();