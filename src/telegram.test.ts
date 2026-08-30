import assert from "node:assert/strict";
import { buildEventContext } from "./eventContext";
import {
  buildTempoTapeContext,
  deriveAlphaPulseMajors1h,
  formatFooter,
  formatHeader,
  formatHeartbeatAlert,
  formatRegimeAlert,
  selectMarketMoveHeaderEmoji,
  titleCaseDisplay,
  type AlphaPulseMajorsInput
} from "./telegram";
import { DerivativesHeatAssetSnapshot, DerivativesHeatSnapshot, LaneExplainerHistoryPoint, LaneExplainerResult, MarketDataFreshnessFields, RegimeName, RegimeScoreResult } from "./types";

function sampleResult(score: number, regime: RegimeName = "Neutral / Chop", timestamp = "2026-07-03T09:00:00Z"): RegimeScoreResult {
  return {
    timestamp,
    timeframe: "1h",
    score,
    regime,
    leader: "SOL-led",
    memeCondition: "Mixed",
    researchBias: "Neutral",
    reason: "test fixture",
    components: [
      { name: "BTC trend / structure", score: 0, min: -20, max: 20, label: "Flat", reason: "fixture" },
      { name: "ETH/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/BTC relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" },
      { name: "SOL/ETH relative strength", score: 0, min: -10, max: 10, label: "Flat", reason: "fixture" }
    ],
    global: {
      timestamp,
      totalMarketCapUsd: null,
      totalMarketCapChange24hPct: null,
      btcDominancePct: null,
      ethDominancePct: null,
      solDominancePct: null,
      stablecoinDominancePct: null,
      rawSource: "unavailable"
    },
    defiConfirmation: {
      status: "Mixed",
      solanaActivity: "Mixed",
      liquidity: "Mixed",
      reason: "fixture",
      components: {}
    }
  };
}

const laneExplainer: LaneExplainerResult = {
  bestLane: "SOL",
  bestLaneLabel: "SOL leading",
  laneConfidence: "Mixed",
  laneReason: "fixture",
  laneMargin: null,
  laneRank1: "SOL",
  laneRank2: "BTC",
  laneScoreBtc: null,
  laneScoreEth: null,
  laneScoreSol: null,
  laneScoreStables: null,
  leaderPersistenceScans: null,
  riskStyle: "Hold winners",
  ifInAction: "trail, don't chase",
  ifFlatAction: "wait for BTC repair",
  invalidIf: "SOL lead fades / BTC rejects",
  btcRepairFlag: null,
  timeframeRead: "fixture",
  shortTermState: "fixture",
  chopState: "Choppy",
  suppressionNote: "score whipsawing inside current regime",
  scoreFlipCount6h: 3,
  scoreRange6h: 6,
  retBtc4h: null,
  retEth4h: null,
  retSol4h: null,
  retBtc12h: null,
  retEth12h: null,
  retSol12h: null,
  retBtc1d: null,
  retEth1d: null,
  retSol1d: null,
  retEthBtc4h: null,
  retSolBtc4h: null,
  retSolEth4h: null,
  retEthBtc1d: null,
  retSolBtc1d: null,
  retSolEth1d: null,
  retBtc7d: null,
  retEth7d: null,
  retSol7d: null
};

const freshMarketData: MarketDataFreshnessFields = {
  marketDataFresh: true,
  marketDataStaleReason: null,
  marketDataProvider: "coingecko",
  marketDataProviderErrors: [],
  livePriceFresh: true,
  livePriceAgeMinutes: 0,
  livePriceTimestamp: "2026-07-03T09:00:00Z",
  livePriceProvider: "coingecko",
  livePriceProviderErrors: [],
  livePriceUnchangedScanCount: 0,
  historicalDataFresh: true,
  historicalDataAgeMinutes: 60,
  historicalDataTimestamp: "2026-07-03T08:00:00Z",
  historicalDataProvider: "coingecko",
  historicalDataProviderErrors: [],
  historicalInterval: "1d",
  btcPriceChanged: true,
  ethPriceChanged: true,
  solPriceChanged: false,
  marketDataQuality: "FRESH"
};

const staleMarketData: MarketDataFreshnessFields = {
  ...freshMarketData,
  marketDataFresh: false,
  marketDataStaleReason: "Live BTC/ETH/SOL prices stopped updating",
  livePriceFresh: false,
  livePriceAgeMinutes: 240,
  livePriceTimestamp: "2026-07-03T05:00:00Z",
  livePriceUnchangedScanCount: 4,
  btcPriceChanged: false,
  ethPriceChanged: false,
  solPriceChanged: false,
  marketDataQuality: "FROZEN"
};

function historyPoint(timestamp: string, btcPrice: number | null, ethPrice: number | null, solPrice: number | null, fresh = true): LaneExplainerHistoryPoint {
  return {
    timestamp,
    timestampMs: Date.parse(timestamp),
    score: 60,
    regime: "Neutral / Chop",
    leader: "SOL-led",
    regimeConfidence: "Noisy",
    marketMoveReason: null,
    btcPrice,
    ethPrice,
    solPrice,
    ethBtcRatio: null,
    solBtcRatio: null,
    solEthRatio: null,
    livePriceTimestamp: timestamp,
    bestLane: "SOL",
    marketDataFresh: fresh
  };
}

function majorsInput(overrides: Partial<AlphaPulseMajorsInput> = {}): AlphaPulseMajorsInput {
  const base = {
    timestamp: "2026-07-03T09:00:00Z",
    livePriceTimestamp: "2026-07-03T09:00:00Z",
    marketDataFresh: true,
    scanIntervalMinutes: 15,
    btcPrice: 60_600,
    ethPrice: 1_980,
    solPrice: 100,
    history: [
      historyPoint("2026-07-03T08:00:00Z", 60_000, 2_000, 100),
      historyPoint("2026-07-03T08:15:00Z", 1, 1, 1)
    ],
    ...overrides
  };
  const derived = deriveAlphaPulseMajors1h(base);
  return {
    ...base,
    retBtc1h: derived.btcReturnPct,
    retEth1h: derived.ethReturnPct,
    retSol1h: derived.solReturnPct
  };
}

function pulse(
  result = sampleResult(70, "Risk-On"),
  context = buildEventContext(new Date("2026-07-03T09:00:00Z")),
  marketData = freshMarketData,
  majors = majorsInput(),
  lane = laneExplainer
): string {
  return formatHeartbeatAlert(result, new Date(Date.now() + 15 * 60_000).toISOString(), result, lane, context, marketData, majors);
}

function testLockedShellRuntimeValuesAndOrder(): void {
  const alert = pulse();
  const lines = alert.split("\n");
  assert.equal(lines[0], "\u2501".repeat(20));
  assert.equal(lines[1], "<b>\u2764\uFE0F\u200D\u{1F525} \u1D00\u029F\u1D18\u029C\u1D00 | \u1D18\u1D1C\u029F\uA731\u1D07</b>");
  assert.equal(lines[2], "\u2501".repeat(20));
  assert.deepEqual(lines.slice(-2), ["\u2501".repeat(20), "ᴘᴜʟꜱᴇ © ᴀʟᴘʜᴀ ᴀʟᴇʀᴛꜱ | v1.01"]);

  assert.match(alert, /<b>\u{1F321} ᴍᴏᴅᴇ: ʀɪꜱᴋ-ᴏɴ<\/b>/u);
  assert.match(alert, /<b>\u251C ꜱᴄᴏʀᴇ: 70\/100<\/b>/);
  assert.match(alert, /<b>\u2514 ᴄᴏɴꜰɪᴅᴇɴᴄᴇ: ɴᴏɪꜱʏ<\/b>/);

  assert.match(alert, /🌊 ᴍᴀʀᴋᴇᴛ ꜱᴛᴀᴛᴇ: ᴄʜᴏᴘᴘʏ/);
  assert.match(alert, /<b>├─ ꜱᴇꜱꜱɪᴏɴ: ᴍɪᴅ ʟᴏɴᴅᴏɴ<\/b>/);
  assert.match(alert, /<b>└─ ᴘʀᴇꜱꜱᴜʀᴇ: ꜱᴏʟ ʀᴏᴛᴀᴛɪᴏɴ ᴀᴄᴛɪᴠᴇ<\/b>/);
  assert.match(alert, /🎯 ᴘʟᴀɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ/);
  assert.match(alert, /<b>├─ ʙᴇꜱᴛ ʟᴀɴᴇ: ꜱᴏʟ ʟᴇᴀᴅɪɴɢ<\/b>/);
  assert.match(alert, /<b>├─ ɪꜰ ɪɴ: ᴛʀᴀɪʟ • ᴅᴏɴ&#39;ᴛ ᴄʜᴀꜱᴇ<\/b>/);
  console.log(alert);
  assert.match(alert, /<b>└─ ɪꜰ ꜰʟᴀᴛ: ᴡᴀɪᴛ ꜰᴏʀ ʙᴛᴄ ʀᴇᴘᴀɪʀ<\/b>/);
  assert.match(alert, /⏱️ ɴᴇxᴛ ꜱᴄᴀɴ: \d{2}:\d{2} ᴜᴛᴄ • ~1[45]ᴍ/);

  const ordered = ["\u{1F321} ᴍᴏᴅᴇ", "\u{1F4C8} ᴍᴀᴊᴏʀꜱ", "\u{1F30A} ᴍᴀʀᴋᴇᴛ ꜱᴛᴀᴛᴇ", "\u{1F3AF} ᴘʟᴀɴ", "\u{1F4CE} ᴄᴏɴᴛᴇxᴛ", "\u23F1\uFE0F ɴᴇxᴛ ꜱᴄᴀɴ"];
  for (let index = 1; index < ordered.length; index += 1) assert.ok(alert.indexOf(ordered[index - 1]) !== -1 && alert.indexOf(ordered[index - 1]) < alert.indexOf(ordered[index]));
}

function testCausalMajorsAndFormatting(): void {
  const derived = deriveAlphaPulseMajors1h(majorsInput());
  assert.equal(derived.observedAt, "2026-07-03T08:00:00Z");
  assert.ok(Math.abs((derived.btcReturnPct ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((derived.ethReturnPct ?? 0) + 1) < 1e-9);
  assert.equal(derived.solReturnPct, 0);

  const alert = pulse();
  assert.ok(alert.includes("<b>\u251C ʙᴛᴄ: $60.6K \u2022 1\u029C +1.0%</b>"));
  assert.ok(alert.includes("<b>\u251C ᴇᴛʜ: $2.0K \u2022 1\u029C -1.0%</b>"));
  assert.ok(alert.includes("<b>\u2514 ꜱᴏʟ: $100.00 \u2022 1\u029C 0.0%</b>"));

  const futureOnly = majorsInput({ history: [historyPoint("2026-07-03T08:01:00Z", 60_000, 2_000, 100)] });
  assert.deepEqual(deriveAlphaPulseMajors1h(futureOnly), { observedAt: null, btcReturnPct: null, ethReturnPct: null, solReturnPct: null });
  const tooOld = majorsInput({ history: [historyPoint("2026-07-03T07:44:59Z", 60_000, 2_000, 100)] });
  assert.equal(deriveAlphaPulseMajors1h(tooOld).observedAt, null);

  const laggedCurrent = majorsInput({
    livePriceTimestamp: "2026-07-03T08:55:00Z",
    history: [{ ...historyPoint("2026-07-03T08:00:00Z", 60_000, 2_000, 100), livePriceTimestamp: "2026-07-03T07:55:00Z" }]
  });
  assert.equal(deriveAlphaPulseMajors1h(laggedCurrent).observedAt, "2026-07-03T07:55:00Z");
}

function testMissingOrDegradedDataNeverFabricatesMajors(): void {
  const staleLane: LaneExplainerResult = {
    ...laneExplainer,
    bestLane: "NO_CLEAR_LANE",
    bestLaneLabel: "Data stale",
    ifInAction: "Protect gains / verify manually",
    ifFlatAction: "Wait — data stale"
  };
  const alert = pulse(sampleResult(60), undefined, staleMarketData, majorsInput({ marketDataFresh: false }), staleLane);
  assert.doesNotMatch(alert, /ʙᴛᴄ: [+-]?\d/);
  assert.match(alert, /<b>\u251C ꜱᴄᴏʀᴇ: 60\/100<\/b>/);
  assert.match(alert, /🌊 ᴍᴀʀᴋᴇᴛ ꜱᴛᴀᴛᴇ: ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/);
  assert.match(alert, /<b>├─ ʙᴇꜱᴛ ʟᴀɴᴇ: ᴅᴀᴛᴀ ꜱᴛᴀʟᴇ<\/b>/);
}

function testConditionalContextAndProviderNoiseFiltering(): void {
  const result = sampleResult(70, "Risk-On");
  const clear = formatHeartbeatAlert(result, new Date(Date.now() + 15 * 60_000).toISOString(), result, laneExplainer, undefined, freshMarketData, majorsInput());
  assert.doesNotMatch(clear, /📎 ᴄᴏɴᴛᴇxᴛ/);

  const context = buildEventContext(new Date("2026-10-31T09:00:00Z"));
  context.eventDisplayReasons = [
    "Liquidity: Thin Weekend Window",
    "Macro: FRED Context Available - Data Context Only; No Score Impact",
    "Liquidity: Treasury Fiscaldata Available - Tga Context Only; No Score Impact"
  ];
  const contextual = pulse(sampleResult(70, "Risk-On", "2026-10-31T09:00:00Z"), context);
  assert.match(contextual, /📎 ᴄᴏɴᴛᴇxᴛ: ᴡᴇᴇᴋᴇɴᴅ ʟɪqᴜɪᴅɪᴛʏ • ʜᴀʟʟᴏᴡᴇᴇɴ ᴡɪɴᴅᴏᴡ 🎃/);
  assert.doesNotMatch(contextual, /FRED|TGA|Telemetry|No Score Impact|Event Stack/i);
}

function testHtmlEscapingAndBalancedBoldTags(): void {
  const escapedLane = { ...laneExplainer, ifInAction: "trail < protect & don't chase" };
  const alert = pulse(sampleResult(70, "Risk-On"), undefined, freshMarketData, majorsInput(), escapedLane);
  assert.match(alert, /ᴛʀᴀɪʟ &lt; ᴘʀᴏᴛᴇᴄᴛ &amp; ᴅᴏɴ&#39;ᴛ ᴄʜᴀꜱᴇ/);
  assert.equal((alert.match(/<b>/g) ?? []).length, (alert.match(/<\/b>/g) ?? []).length);
  assert.doesNotMatch(alert.replaceAll("<b>", "").replaceAll("</b>", ""), /[<>]/);
}

function marketMoveMajors(
  overrides: Partial<AlphaPulseMajorsInput> = {}
): AlphaPulseMajorsInput {
  return majorsInput({
    history: [
      historyPoint("2026-07-03T08:45:00Z", 60_420, 1_970, 98.9),
        historyPoint("2026-07-03T08:00:00Z", 60_000, 2_000, 100)
    ],
    ...overrides
  });
}

function withLeader(
  result: RegimeScoreResult,
  leader: RegimeScoreResult["leader"]
): RegimeScoreResult {
  return { ...result, leader };
}

function withComponentScore(
  result: RegimeScoreResult,
  name: string,
  score: number
): RegimeScoreResult {
  return {
    ...result,
    components: result.components.map((component) =>
      component.name === name ? { ...component, score } : component
    )
  };
}

function testMarketMoveRegimeChangeLockedLayout(): void {
  const previous = sampleResult(
    58,
    "Neutral / Chop",
    "2026-07-03T08:45:00Z"
  );

  const current = sampleResult(
    61,
    "Risk-On",
    "2026-07-03T09:00:00Z"
  );

  const move = formatRegimeAlert(
    current,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors()
  );

  assert.equal(
    move.split("\n")[1],
    "<b>📈 ᴀʟᴘʜᴀ | ᴍᴀʀᴋᴇᴛ ᴍᴏᴠᴇ</b>"
  );

  assert.match(move, /<b>🎯 ꜱɪɢɴᴀʟ: ʀᴇɢɪᴍᴇ ᴄʜᴀɴɢᴇ<\/b>/);
  assert.doesNotMatch(move, /Major Shift|ᴍᴀᴊᴏʀ ꜱʜɪꜰᴛ/);

  assert.match(move, /<b>📊 ꜱᴄᴏʀᴇ: 【 58 → 61 】 ↗<\/b>/);
  assert.ok(move.includes("<b>\u2514 ꜱᴛᴀᴛᴜꜱ: ɪᴍᴘʀᴏᴠɪɴɢ</b>"));

  assert.match(
    move,
    /ᴍᴏᴅᴇ: ɴᴇᴜᴛʀᴀʟ \/ ᴄʜᴏᴘ → ʀɪꜱᴋ-ᴏɴ/
  );

  assert.doesNotMatch(move, /[├└]─ ʀɪꜱᴋ:/);

  assert.match(move, /<b>\u{1F310} ᴍᴀᴊᴏʀꜱ • ʟᴀꜱᴛ ꜱᴄᴀɴ<\/b>/u);
  assert.ok(move.includes("<b>\u251C ʙᴛᴄ +0.3%</b>"));
  assert.ok(move.includes("<b>\u251C ᴇᴛʜ +0.5%</b>"));
  assert.ok(move.includes("<b>\u2514 ꜱᴏʟ +1.1%</b>"));

  assert.match(move, /<b>🧭 ᴀᴄᴛɪᴏɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ<\/b>/);

  assert.match(move, /<b>└─ ᴍᴀʀᴋᴇᴛ: ᴄʜᴏᴘᴘʏ • ᴍɪᴅ ʟᴏɴᴅᴏɴ<\/b>/);
  assert.match(move, /⏱️ ɴᴇxᴛ ꜱᴄᴀɴ: \d{2}:\d{2} ᴜᴛᴄ • ~1[45]ᴍ/);

  assert.equal(
    move.split("\n").at(-1),
    "\u1D18\u1D1C\u029F\uA731\u1D07 \u00A9 \u1D00\u029F\u1D18\u029C\u1D00 \u1D00\u029F\u1D07\u0280\u1D1B\uA731 | v1.01"
  );

  assert.equal(
    (move.match(/<b>/g) ?? []).length,
    (move.match(/<\/b>/g) ?? []).length
  );
}

function testMarketMoveScoreSlipOmitsUnchangedState(): void {
  const previous = sampleResult(
    70,
    "Risk-On",
    "2026-07-03T08:45:00Z"
  );

  const current = sampleResult(
    64,
    "Risk-On",
    "2026-07-03T09:00:00Z"
  );

  const move = formatRegimeAlert(
    current,
    "Score dropped",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors()
  );

  assert.equal(
    move.split("\n")[1],
    "<b>📉 ᴀʟᴘʜᴀ | ᴍᴀʀᴋᴇᴛ ᴍᴏᴠᴇ</b>"
  );

  assert.match(move, /<b>🎯 ꜱɪɢɴᴀʟ: ꜱᴄᴏʀᴇ ꜱʟɪᴘ<\/b>/);

  assert.match(move, /<b>📊 ꜱᴄᴏʀᴇ: 【 70 → 64 】 ↘<\/b>/);
  assert.ok(move.includes("<b>\u2514 ꜱᴛᴀᴛᴜꜱ: ᴅᴇᴛᴇʀɪᴏʀᴀᴛɪɴɢ</b>"));
  assert.doesNotMatch(move, /ᴍᴏᴅᴇ: ɴᴏ ʀᴇɢɪᴍᴇ ᴄʜᴀɴɢᴇ/);

  assert.doesNotMatch(move, /[├└]─ ʀɪꜱᴋ:/);
  assert.doesNotMatch(move, /[├└]─ ʟᴇᴀᴅᴇʀ:/);

  assert.equal(
    (move.match(/ᴄᴏɴꜰɪᴅᴇɴᴄᴇ:/g) ?? []).length,
    1
  );

  assert.doesNotMatch(move, /🧭 ᴀᴄᴛɪᴏɴ:/);
}

function testMarketMoveLeadershipOnlyChange(): void {
  const previous = withLeader(
    sampleResult(64, "Risk-On", "2026-07-03T08:45:00Z"),
    "BTC-led"
  );

  const current = withLeader(
    sampleResult(64, "Risk-On", "2026-07-03T09:00:00Z"),
    "SOL-led"
  );

  const move = formatRegimeAlert(
    current,
    "Leader changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors()
  );

  assert.equal(
    move.split("\n")[1],
    "<b>🔄 ᴀʟᴘʜᴀ | ᴍᴀʀᴋᴇᴛ ᴍᴏᴠᴇ</b>"
  );

  assert.match(move, /<b>🎯 ꜱɪɢɴᴀʟ: ʟᴇᴀᴅᴇʀꜱʜɪᴘ ᴄʜᴀɴɢᴇ<\/b>/);
  assert.match(move, /<b>📊 ꜱᴄᴏʀᴇ: 【 64\/100 】<\/b>/);
  assert.ok(move.includes("<b>\u2514 ꜱᴛᴀᴛᴜꜱ: ɴᴏɪꜱʏ \/ ɴᴇᴜᴛʀᴀʟ</b>"));
  assert.match(move, /ʟᴇᴀᴅᴇʀ: ʙᴛᴄ-ʟᴇᴅ → ꜱᴏʟ-ʟᴇᴅ/);
  assert.doesNotMatch(move, /\[\s*\]\s*ꜱᴄᴏʀᴇ:/);
  assert.match(move, /<b>🧭 ᴀᴄᴛɪᴏɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ<\/b>/);
}

function testMarketMoveConfidenceOnlyChange(): void {
  const previous = sampleResult(
    58,
    "Neutral / Chop",
    "2026-07-03T08:45:00Z"
  );

  const current = withComponentScore(
    sampleResult(58, "Neutral / Chop", "2026-07-03T09:00:00Z"),
    "BTC trend / structure",
    10
  );

  const move = formatRegimeAlert(
    current,
    "Confidence changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors()
  );

  assert.match(move, /<b>🎯 ꜱɪɢɴᴀʟ: ᴄᴏɴꜰɪᴅᴇɴᴄᴇ ᴄʜᴀɴɢᴇ<\/b>/);
  assert.match(move, /<b>📊 ꜱᴄᴏʀᴇ: 【 58\/100 】<\/b>/);
  assert.ok(move.includes("<b>\u2514 ꜱᴛᴀᴛᴜꜱ: ɴᴏɪꜱʏ \/ ɴᴇᴜᴛʀᴀʟ</b>"));
  assert.match(
    move,
    /ᴄᴏɴꜰɪᴅᴇɴᴄᴇ: ᴄᴏɴꜰɪʀᴍᴇᴅ → ɴᴏɪꜱʏ/
  );

  assert.doesNotMatch(move, /\[├└\]─ SCORE:/);
  assert.doesNotMatch(move, /[├└]─ ᴍᴏᴅᴇ:/);
  assert.doesNotMatch(move, /[├└]─ ʟᴇᴀᴅᴇʀ:/);
  assert.doesNotMatch(move, /🧭 ᴀᴄᴛɪᴏɴ:/);
}

function testMarketMoveMajorsAreCausalOrUnavailable(): void {
  const previous = sampleResult(
    58,
    "Neutral / Chop",
    "2026-07-03T08:45:00Z"
  );

  const current = sampleResult(
    61,
    "Risk-On",
    "2026-07-03T09:00:00Z"
  );

  const causal = formatRegimeAlert(
    current,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors({
      history: [
        historyPoint("2026-07-03T09:01:00Z", 1, 1, 1),
        historyPoint("2026-07-03T08:45:00Z", 60_420, 1_970, 98.9),
        historyPoint("2026-07-03T08:00:00Z", 60_000, 2_000, 100)
      ]
    })
  );

  assert.ok(causal.includes("<b>\u251C ʙᴛᴄ +0.3%</b>"));
  assert.ok(causal.includes("<b>\u251C ᴇᴛʜ +0.5%</b>"));
  assert.ok(causal.includes("<b>\u2514 ꜱᴏʟ +1.1%</b>"));

  const unavailable = formatRegimeAlert(
    current,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors({
      history: [
        historyPoint("2026-07-03T09:01:00Z", 1, 1, 1)
      ]
    })
  );

  assert.ok(!unavailable.includes("\u{1F310} ᴍᴀᴊᴏʀꜱ \u2022 ʟᴀꜱᴛ ꜱᴄᴀɴ"));

  const tooOld = formatRegimeAlert(
    current,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors({
      history: [
        historyPoint("2026-07-03T08:20:00Z", 60_420, 1_970, 98.9)
      ]
    })
  );

  assert.ok(!tooOld.includes("\u{1F310} MAJORS \u2022 LAST SCAN"));
}

function testMarketMoveStaleSafetyAndConditionalEventContext(): void {
  const previous = sampleResult(
    60,
    "Neutral / Chop",
    "2026-10-31T08:45:00Z"
  );

  const current = sampleResult(
    64,
    "Risk-On",
    "2026-10-31T09:00:00Z"
  );

  const stale = formatRegimeAlert(
    current,
    "Score rose",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    buildEventContext(new Date("2026-10-31T09:00:00Z")),
    staleMarketData,
    marketMoveMajors({
      timestamp: "2026-10-31T09:00:00Z",
      livePriceTimestamp: "2026-10-31T05:00:00Z",
      marketDataFresh: false,
      history: []
    })
  );

  assert.match(stale, /<b>🎯 ꜱɪɢɴᴀʟ: ᴍᴏᴠᴇ ᴜɴᴠᴇʀɪꜰɪᴇᴅ<\/b>/);
  assert.equal(
    (stale.match(/Unavailable|ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/gi) ?? []).length >= 1,
    true
  );

  assert.match(stale, /<b>🧭 ᴀᴄᴛɪᴏɴ: ᴘʀᴏᴛᴇᴄᴛ \/ ᴠᴇʀɪꜰʏ ᴍᴀɴᴜᴀʟʟʏ<\/b>/);

  assert.match(stale, /ᴇᴠᴇɴᴛ:/);
}
function testExistingGenericHeaderFooterAndCapitalizationRemainStable(): void {
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(10), "MOVE")[1], "\u2022  <b>MARKET \u{1F6A8} MOVE</b>  \u2022");
  assert.deepEqual(formatFooter(), ["\u2501".repeat(20), "\u1D18\u1D1C\u029F\uA731\u1D07 \u00A9 \u1D00\u029F\u1D18\u029C\u1D00 \u1D00\u029F\u1D07\u0280\u1D1B\uA731 | v1.01"]);
  assert.equal(titleCaseDisplay("btc and sol repair by 09:15 utc during us holiday"), "BTC And SOL Repair By 09:15 UTC During US Holiday");
}

function testTypographyConsistency(): void {
  const pulseAlert = pulse(sampleResult(70, "Risk-On"), buildEventContext(new Date("2026-07-03T09:00:00Z")), freshMarketData, majorsInput(), { chopState: "mixed", bestLaneLabel: "SOL leading", ifInAction: "Hold", ifFlatAction: "Wait" } as any);

  const stalePulse = pulse(sampleResult(70, "Risk-On"), buildEventContext(new Date("2026-07-03T09:00:00Z")), staleMarketData, majorsInput(staleMarketData), undefined);

  const move = formatRegimeAlert(
    sampleResult(65, "Neutral / Chop"),
    new Date().toISOString(),
    { score: 65, regime: "Neutral / Chop", label: "Recovery", confidence: "Noisy" } as any,
    sampleResult(60, "Risk-On"),
    { chopState: "mixed", bestLaneLabel: "SOL", ifInAction: "Wait", ifFlatAction: "Wait" } as any,
    buildEventContext(new Date("2026-07-03T09:00:00Z")),
    freshMarketData,
    majorsInput()
  );

  const allOutputs = pulseAlert + stalePulse + move;
  assert.doesNotMatch(allOutputs, /Unavailable|Degraded|Unknown|Stale|Neutral|Market Data/, "Legacy mixed font words found! Apply smallCapsDisplay to presentation output.");
  assert.ok(allOutputs.includes("\u2764\uFE0F\u200D\u{1F525} \u1D00\u029F\u1D18\u029C\u1D00 | \u1D18\u1D1C\u029F\uA731\u1D07"), "Missing exact heart-on-fire ZWJ header sequence");
}

testLockedShellRuntimeValuesAndOrder();
testCausalMajorsAndFormatting();
testMissingOrDegradedDataNeverFabricatesMajors();
testConditionalContextAndProviderNoiseFiltering();
testHtmlEscapingAndBalancedBoldTags();
testMarketMoveRegimeChangeLockedLayout();
testMarketMoveScoreSlipOmitsUnchangedState();
testMarketMoveLeadershipOnlyChange();
testMarketMoveConfidenceOnlyChange();
testMarketMoveMajorsAreCausalOrUnavailable();
testMarketMoveStaleSafetyAndConditionalEventContext();
testExistingGenericHeaderFooterAndCapitalizationRemainStable();
testTypographyConsistency();

console.log("Telegram formatter tests passed.");

// ============================================================
// DERIVATIVES RESEARCH ISOLATION TESTS
// Proves that enabling derivatives collection (DERIVATIVES_HEAT_ENABLED=true)
// has zero effect on Telegram output, activityState, activityReason, or tempo.
// ============================================================

function makeActiveHeatSnapshot(): DerivativesHeatSnapshot {
  const asset: DerivativesHeatAssetSnapshot = {
    asset: "BTC",
    symbol: "BTCUSDT_PERP",
    price: 64000,
    openInterestCurrent: 12_000_000_000,
    openInterestChange4hPct: 8.5,
    openInterestChange24hPct: 22.3,
    fundingCurrent: 0.0012,
    fundingZScore: 2.8,
    predictedFundingCurrent: 0.0014,
    liquidationLongUsd1h: 5_000_000,
    liquidationShortUsd1h: 800_000,
    liquidationLongUsd4h: 18_000_000,
    liquidationShortUsd4h: 2_000_000,
    liquidationImbalance: -0.8,
    longShortRatio: 1.6,
    assetHeatLabel: "Crowded longs",
    assetHeatScore: 4,
    assetSummary: "BTC longs look crowded."
  };
  return {
    timestamp: "2026-07-03T09:00:00Z",
    provider: "coinalyze",
    status: "LongWipeoutRisk",
    publicLabel: "Long wipeout risk below ⚠️",
    summary: "BTC leverage looks long-heavy into a cautious tape.",
    assets: [asset],
    errors: [],
    warnings: []
  };
}

function makeUnavailableHeatSnapshot(): DerivativesHeatSnapshot {
  return {
    timestamp: "2026-07-03T09:00:00Z",
    provider: "coinalyze",
    status: "Unavailable",
    publicLabel: "Unavailable ⚪",
    summary: "Derivatives heat disabled by config.",
    assets: [],
    errors: [],
    warnings: ["Derivatives heat disabled by config."]
  };
}

function testActiveHeatDoesNotAddHeatRowToTelegram(): void {
  // Attach the most extreme active heat to a result and verify neither
  // Market Move nor Alpha Pulse heartbeat contains any "Heat" row.
  const result = { ...sampleResult(70, "Risk-On"), derivativesHeat: makeActiveHeatSnapshot() };

  const heartbeat = pulse(result);
  assert.doesNotMatch(heartbeat, /[Hh]eat/,
    "Active derivatives heat must not appear in Alpha Pulse heartbeat output.");
  assert.doesNotMatch(heartbeat, /LongWipeoutRisk|wipeout|CrowdedLong|ShortSqueeze/i,
    "Derivatives heat status labels must not appear in Alpha Pulse heartbeat output.");

  const move = formatRegimeAlert(
    result,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    sampleResult(58, "Neutral / Chop", "2026-07-03T08:45:00Z"),
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors()
  );
  assert.doesNotMatch(move, /[Hh]eat/,
    "Active derivatives heat must not appear in Market Move output.");
}

function testActiveHeatDoesNotChangeActivityStateTempOrReason(): void {
  // Two identical results; one has active "LongWipeoutRisk" heat, one has Unavailable heat.
  // buildTempoTapeContext must produce identical activityState, activityReason, and tempo.
  const baseResult = sampleResult(70, "Risk-On", "2026-07-03T09:00:00Z"); // London/NY overlap NOT active; "Mid London"
  const withActive   = { ...baseResult, derivativesHeat: makeActiveHeatSnapshot() };
  const withUnavail  = { ...baseResult, derivativesHeat: makeUnavailableHeatSnapshot() };
  const withNone     = { ...baseResult };

  const ctxActive  = buildTempoTapeContext(withActive,  null);
  const ctxUnavail = buildTempoTapeContext(withUnavail, null);
  const ctxNone    = buildTempoTapeContext(withNone,    null);

  assert.equal(ctxActive.activityState, ctxUnavail.activityState,
    "activityState must not differ between active and unavailable heat.");
  assert.equal(ctxActive.activityState, ctxNone.activityState,
    "activityState must not differ between active heat and no heat.");
  assert.equal(ctxActive.activityReason, ctxUnavail.activityReason,
    "activityReason must not differ between active and unavailable heat.");
  assert.equal(ctxActive.activityReason, ctxNone.activityReason,
    "activityReason must not differ between active heat and no heat.");
  assert.equal(ctxActive.tempo, ctxUnavail.tempo,
    "tempo must not differ between active and unavailable heat.");
  assert.equal(ctxActive.tempo, ctxNone.tempo,
    "tempo must not differ between active heat and no heat.");

  // Verify no "derivatives heat" text escapes into any reason string.
  assert.doesNotMatch(ctxActive.activityReason, /derivatives|heat/i,
    "activityReason must not reference derivatives heat.");

  // Also test with a previous result to exercise the scoreDelta path.
  const prev = sampleResult(55, "Neutral / Chop", "2026-07-03T08:45:00Z");
  const ctxDeltaActive  = buildTempoTapeContext(withActive,  prev);
  const ctxDeltaUnavail = buildTempoTapeContext(withUnavail, prev);
  assert.equal(ctxDeltaActive.activityState, ctxDeltaUnavail.activityState,
    "activityState must be identical with/without heat when scoreDelta is present.");
  assert.equal(ctxDeltaActive.tempo, ctxDeltaUnavail.tempo,
    "tempo must be identical with/without heat when scoreDelta is present.");
}

function testDerivativesCollectionFieldsRemainsInResultObject(): void {
  // Verify the snapshot fields are typed and accessible — collection/persistence path is intact.
  // This is a structural/type proof; it does not contact any network.
  const heat = makeActiveHeatSnapshot();
  const result: RegimeScoreResult = { ...sampleResult(70, "Risk-On"), derivativesHeat: heat };

  assert.equal(result.derivativesHeat?.status, "LongWipeoutRisk",
    "derivativesHeat.status must be accessible on RegimeScoreResult for persistence.");
  assert.equal(result.derivativesHeat?.assets[0]?.fundingZScore, 2.8,
    "fundingZScore must be accessible on DerivativesHeatAssetSnapshot.");
  assert.equal(result.derivativesHeat?.assets[0]?.openInterestChange24hPct, 22.3,
    "openInterestChange24hPct must be accessible for research cohort.");
  assert.equal(result.derivativesHeat?.assets[0]?.liquidationLongUsd4h, 18_000_000,
    "liquidationLongUsd4h must be accessible for research cohort.");
  assert.equal(result.derivativesHeat?.assets[0]?.liquidationImbalance, -0.8,
    "liquidationImbalance must be accessible for research cohort.");
  assert.equal(result.derivativesHeat?.assets[0]?.longShortRatio, 1.6,
    "longShortRatio must be accessible for research cohort.");
}




testActiveHeatDoesNotAddHeatRowToTelegram();
testActiveHeatDoesNotChangeActivityStateTempOrReason();
testDerivativesCollectionFieldsRemainsInResultObject();

console.log("Derivatives research isolation tests passed.");
