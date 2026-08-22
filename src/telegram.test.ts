import assert from "node:assert/strict";
import { buildEventContext } from "./eventContext";
import {
  deriveAlphaPulseMajors1h,
  formatFooter,
  formatHeader,
  formatHeartbeatAlert,
  formatRegimeAlert,
  selectMarketMoveHeaderEmoji,
  titleCaseDisplay,
  type AlphaPulseMajorsInput
} from "./telegram";
import { LaneExplainerHistoryPoint, LaneExplainerResult, MarketDataFreshnessFields, RegimeName, RegimeScoreResult } from "./types";

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
  retSolEth1d: null
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
  return {
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
  assert.equal(lines[0], "\u2501".repeat(22));
  assert.equal(lines[1], "<b>\u2764\uFE0F\u200D\u{1F525} \u1D00\u029F\u1D18\u029C\u1D00 | \u1D18\u1D1C\u029F\uA731\u1D07</b>");
  assert.equal(lines[2], "\u2501".repeat(22));
  assert.equal(lines.at(-2), "\u2501".repeat(22));
  assert.equal(lines.at(-1), "\u1D18\u1D1C\u029F\uA731\u1D07 \u00A9 \u1D00\u029F\u1D18\u029C\u1D00 \u1D00\u029F\u1D07\u0280\u1D1B\uA731 | v1.01");

  assert.match(alert, /🌡️ ᴍᴏᴅᴇ: ʀɪꜱᴋ-ᴏɴ/);
  assert.match(alert, /<b>├─ ꜱᴄᴏʀᴇ: 70\/100<\/b>/);
  assert.match(alert, /<b>└─ ᴄᴏɴꜰɪᴅᴇɴᴄᴇ: ɴᴏɪꜱʏ ⚠️<\/b>/);
  assert.match(alert, /🌊 ᴍᴀʀᴋᴇᴛ ꜱᴛᴀᴛᴇ: ᴄʜᴏᴘᴘʏ/);
  assert.match(alert, /<b>├─ ꜱᴇꜱꜱɪᴏɴ: ᴍɪᴅ ʟᴏɴᴅᴏɴ<\/b>/);
  assert.match(alert, /<b>└─ ᴘʀᴇꜱꜱᴜʀᴇ: ꜱᴏʟ ʀᴏᴛᴀᴛɪᴏɴ ᴀᴄᴛɪᴠᴇ<\/b>/);
  assert.match(alert, /🎯 ᴘʟᴀɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ/);
  assert.match(alert, /<b>├─ ʙᴇꜱᴛ ʟᴀɴᴇ: ꜱᴏʟ ʟᴇᴀᴅɪɴɢ<\/b>/);
  assert.match(alert, /<b>├─ ɪꜰ ɪɴ: ᴛʀᴀɪʟ • ᴅᴏɴ&#39;ᴛ ᴄʜᴀꜱᴇ<\/b>/);
  assert.match(alert, /<b>└─ ɪꜰ ꜰʟᴀᴛ: ᴡᴀɪᴛ ꜰᴏʀ ʙᴛᴄ ʀᴇᴘᴀɪʀ<\/b>/);
  assert.match(alert, /⏱️ ɴᴇxᴛ ꜱᴄᴀɴ: \d{2}:\d{2} ᴜᴛᴄ • ~15ᴍ/);

  const ordered = ["🌡️ ᴍᴏᴅᴇ", "📈 ᴍᴀᴊᴏʀꜱ • 1ʜ", "🌊 ᴍᴀʀᴋᴇᴛ ꜱᴛᴀᴛᴇ", "🎯 ᴘʟᴀɴ", "📎 ᴄᴏɴᴛᴇxᴛ", "⏱️ ɴᴇxᴛ ꜱᴄᴀɴ"];
  for (let index = 1; index < ordered.length; index += 1) assert.ok(alert.indexOf(ordered[index - 1]) < alert.indexOf(ordered[index]));
}

function testCausalMajorsAndFormatting(): void {
  const derived = deriveAlphaPulseMajors1h(majorsInput());
  assert.equal(derived.observedAt, "2026-07-03T08:00:00Z");
  assert.ok(Math.abs((derived.btcReturnPct ?? 0) - 1) < 1e-9);
  assert.ok(Math.abs((derived.ethReturnPct ?? 0) + 1) < 1e-9);
  assert.equal(derived.solReturnPct, 0);

  const alert = pulse();
  assert.match(alert, /<b>├─ ʙᴛᴄ: \+1\.0%<\/b>/);
  assert.match(alert, /<b>├─ ᴇᴛʜ: -1\.0%<\/b>/);
  assert.match(alert, /<b>└─ ꜱᴏʟ: 0\.0%<\/b>/);

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
  assert.equal((alert.match(/ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/g) ?? []).length, 4);
  assert.doesNotMatch(alert, /ʙᴛᴄ: [+-]?\d/);
  assert.match(alert, /🌡️ ᴍᴏᴅᴇ: ɴᴇᴜᴛʀᴀʟ \/ ᴄʜᴏᴘ/);
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
      historyPoint("2026-07-03T08:45:00Z", 60_420, 1_970, 98.9)
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

  assert.match(move, /<b>⚡ ʀᴇɢɪᴍᴇ ᴄʜᴀɴɢᴇ<\/b>/);
  assert.doesNotMatch(move, /Major Shift|ᴍᴀᴊᴏʀ ꜱʜɪꜰᴛ/);

  assert.match(move, /🎯 ꜱᴄᴏʀᴇ: 58 → 61/);
  assert.match(move, /└─ ꜱᴛᴀᴛᴜꜱ: 🟩 ɪᴍᴘʀᴏᴠɪɴɢ/);

  assert.match(
    move,
    /ᴍᴏᴅᴇ: ɴᴇᴜᴛʀᴀʟ \/ ᴄʜᴏᴘ → ʀɪꜱᴋ-ᴏɴ/
  );

  assert.doesNotMatch(move, /[├└]─ ʀɪꜱᴋ:/);

  assert.match(move, /🌐 ᴍᴀᴊᴏʀꜱ • ꜱɪɴᴄᴇ ʟᴀꜱᴛ ꜱᴄᴀɴ/);
  assert.match(move, /ʙᴛᴄ: \+0\.3%/);
  assert.match(move, /ᴇᴛʜ: \+0\.5%/);
  assert.match(move, /ꜱᴏʟ: \+1\.1%/);

  assert.match(move, /🎯 ᴀᴄᴛɪᴏɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ/);

  assert.match(move, /🌊 ᴄᴏɴᴛᴇxᴛ: ᴄʜᴏᴘᴘʏ • ᴍɪᴅ ʟᴏɴᴅᴏɴ/);
  assert.match(move, /⏱️ ɴᴇxᴛ ꜱᴄᴀɴ: \d{2}:\d{2} ᴜᴛᴄ • ~15ᴍ/);

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

  assert.match(move, /⚡ ꜱᴄᴏʀᴇ ꜱʟɪᴘ/);

  assert.match(move, /🎯 ꜱᴄᴏʀᴇ: 70 → 64/);
  assert.match(move, /└─ ꜱᴛᴀᴛᴜꜱ: 🟥 ᴅᴇᴛᴇʀɪᴏʀᴀᴛɪɴɢ/);
  assert.match(move, /ᴍᴏᴅᴇ: ɴᴏ ʀᴇɢɪᴍᴇ ᴄʜᴀɴɢᴇ/);

  assert.doesNotMatch(move, /[├└]─ ʀɪꜱᴋ:/);
  assert.doesNotMatch(move, /[├└]─ ʟᴇᴀᴅᴇʀ:/);

  assert.equal(
    (move.match(/ᴄᴏɴꜰɪᴅᴇɴᴄᴇ:/g) ?? []).length,
    1
  );

  assert.doesNotMatch(move, /🎯 ᴀᴄᴛɪᴏɴ:/);
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

  assert.match(move, /⚡ ʟᴇᴀᴅᴇʀꜱʜɪᴘ ᴄʜᴀɴɢᴇ/);
  assert.match(move, /🎯 ꜱᴄᴏʀᴇ: 64\/100/);
  assert.match(move, /└─ ꜱᴛᴀᴛᴜꜱ: 🟨 ɴᴏɪꜱʏ-ɴᴇᴜᴛʀᴀʟ/);
  assert.match(move, /ʟᴇᴀᴅᴇʀ: ʙᴛᴄ-ʟᴇᴅ → ꜱᴏʟ-ʟᴇᴅ/);
  assert.doesNotMatch(move, /[├└]─ ꜱᴄᴏʀᴇ:/);
  assert.match(move, /🎯 ᴀᴄᴛɪᴏɴ: ꜱᴏʟ ꜰᴀᴠᴏʀᴇᴅ/);
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

  assert.match(move, /⚡ ᴄᴏɴꜰɪᴅᴇɴᴄᴇ ᴄʜᴀɴɢᴇ/);
  assert.match(move, /🎯 ꜱᴄᴏʀᴇ: 58\/100/);
  assert.match(move, /└─ ꜱᴛᴀᴛᴜꜱ: 🟨 ɴᴏɪꜱʏ-ɴᴇᴜᴛʀᴀʟ/);
  assert.match(
    move,
    /ᴄᴏɴꜰɪᴅᴇɴᴄᴇ: ᴄᴏɴꜰɪʀᴍᴇᴅ ✅ → ɴᴏɪꜱʏ ⚠️/
  );

  assert.doesNotMatch(move, /[├└]─ ꜱᴄᴏʀᴇ:/);
  assert.doesNotMatch(move, /[├└]─ ᴍᴏᴅᴇ:/);
  assert.doesNotMatch(move, /[├└]─ ʟᴇᴀᴅᴇʀ:/);
  assert.doesNotMatch(move, /🎯 ᴀᴄᴛɪᴏɴ:/);
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
        historyPoint("2026-07-03T08:45:00Z", 60_420, 1_970, 98.9)
      ]
    })
  );

  assert.match(causal, /ʙᴛᴄ: \+0\.3%/);
  assert.match(causal, /ᴇᴛʜ: \+0\.5%/);
  assert.match(causal, /ꜱᴏʟ: \+1\.1%/);

  const unavailable = formatRegimeAlert(
    current,
    "Regime changed",
    new Date(Date.now() + 15 * 60_000).toISOString(),
    previous,
    laneExplainer,
    undefined,
    freshMarketData,
    marketMoveMajors({ history: [] })
  );

  assert.equal(
    (unavailable.match(/ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/g) ?? []).length,
    3
  );

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

  assert.equal(
    (tooOld.match(/ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/g) ?? []).length,
    3
  );
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

  assert.match(stale, /⚠️ ᴍᴏᴠᴇ ᴜɴᴠᴇʀɪꜰɪᴇᴅ/);
  assert.equal(
    (stale.match(/ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ/g) ?? []).length >= 3,
    true
  );

  assert.match(
    stale,
    /🎯 ᴀᴄᴛɪᴏɴ: ᴘʀᴏᴛᴇᴄᴛ \/ ᴠᴇʀɪꜰʏ ᴍᴀɴᴜᴀʟʟʏ/
  );

  assert.match(stale, /ᴇᴠᴇɴᴛ:/);
}
function testExistingGenericHeaderFooterAndCapitalizationRemainStable(): void {
  assert.equal(formatHeader("MARKET", selectMarketMoveHeaderEmoji(10), "MOVE")[1], "\u2022  <b>MARKET \u{1F6A8} MOVE</b>  \u2022");
  assert.deepEqual(formatFooter(), ["\u2501".repeat(22), "\u1D18\u1D1C\u029F\uA731\u1D07 \u00A9 \u1D00\u029F\u1D18\u029C\u1D00 \u1D00\u029F\u1D07\u0280\u1D1B\uA731 | v1.01"]);
  assert.equal(titleCaseDisplay("btc and sol repair by 09:15 utc during us holiday"), "BTC And SOL Repair By 09:15 UTC During US Holiday");
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

console.log("Telegram formatter tests passed.");
