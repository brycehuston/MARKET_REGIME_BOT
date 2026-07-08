export type Timeframe = "1h" | "4h" | "1d";

export type RegimeName =
  | "Risk-Off"
  | "Defensive"
  | "Neutral / Chop"
  | "Risk-On"
  | "Strong Risk-On / Rotation";

export type LeaderName =
  | "BTC-led"
  | "ETH-led"
  | "SOL-led"
  | "Alt rotation"
  | "Mixed"
  | "Defensive";

export interface Candle {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export interface CandleBundle {
  btcUsdt: Candle[];
  ethUsdt: Candle[];
  solUsdt: Candle[];
  ethBtc: Candle[];
  solBtc: Candle[];
  solEth: Candle[];
}

export interface GlobalSnapshot {
  timestamp: string;
  totalMarketCapUsd: number | null;
  totalMarketCapChange24hPct: number | null;
  btcDominancePct: number | null;
  ethDominancePct: number | null;
  solDominancePct: number | null;
  stablecoinDominancePct: number | null;
  rawSource: "coingecko" | "unavailable";
}

export interface GlobalHistoryPoint {
  timestamp: string;
  totalMarketCapUsd: number | null;
  btcDominancePct: number | null;
  stablecoinDominancePct: number | null;
}

export interface ScoreComponent {
  name: string;
  score: number;
  min: number;
  max: number;
  label: string;
  reason: string;
}

export interface RegimeScoreResult {
  timestamp: string;
  timeframe: Timeframe;
  score: number;
  regime: RegimeName;
  leader: LeaderName;
  memeCondition: string;
  researchBias: string;
  components: ScoreComponent[];
  reason: string;
  global: GlobalSnapshot;
  defiConfirmation?: DefiConfirmation;
  derivativesHeat?: DerivativesHeatSnapshot;
}

export type RegimeConfidence = "Confirmed" | "Caution" | "Noisy";

export type EventRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type EventType =
  | "NONE"
  | "MACRO"
  | "FED"
  | "CENTRAL_BANK"
  | "EXPIRY"
  | "HOLIDAY"
  | "CRYPTO_SCHEDULED"
  | "CRYPTO_NEWS"
  | "OUTAGE"
  | "ANOMALY";
export type EventImpactClass = "NONE" | "TIER_A" | "TIER_B" | "TIER_C" | "RESEARCH_ONLY";
export type CalendarRiskState = "CLEAR" | "PRE_EVENT" | "LIVE_EVENT" | "POST_EVENT" | "STACKED_EVENTS";
export type LiquidityContext =
  | "NORMAL"
  | "THIN_WEEKEND"
  | "US_HOLIDAY"
  | "GLOBAL_HOLIDAY"
  | "MONTH_END"
  | "QUARTER_END"
  | "EXPIRY_DAY"
  | "OUTAGE_CONTAMINATED";
export type ExpiryContext = "NONE" | "WEEKLY_OPTIONS" | "MONTHLY_OPTIONS" | "QUARTERLY_EXPIRY" | "CME_TRANSITION";
export type NewsRiskState = "NONE" | "LOW" | "ELEVATED" | "SEVERE" | "UNVERIFIED";
export type ConfirmationRequirement = "NORMAL" | "ONE_CLOSE" | "TWO_SCAN" | "POST_EVENT_WAIT" | "DISABLED_WEAK_ALERTS";
export type MarketMoveEventMode = "NORMAL" | "CAUTION" | "SUPPRESS_WEAK" | "DELAY" | "POST_EVENT_CONFIRM" | "DEFENSIVE_ONLY";
export type BacktestDataStatus = "KNOWN_AHEAD" | "REAL_TIME" | "T_PLUS_1" | "POST_EVENT_ONLY" | "UNSAFE_FOR_BACKTEST";
export type EventConfluenceLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
export type MoonPhaseLabel = "FULL_MOON_WINDOW" | "NEW_MOON_WINDOW" | "NONE" | "UNKNOWN";
export type MacroTrend = "UNKNOWN" | "UP" | "DOWN" | "FLAT";
export type EquityRiskState = "UNKNOWN" | "RISK_ON" | "NEUTRAL" | "RISK_OFF";
export type VolRegime = "UNKNOWN" | "LOW" | "ELEVATED" | "STRESSED";
export type MacroLiquidityTrend = "UNKNOWN" | "EXPANDING" | "CONTRACTING" | "FLAT";
export type TgaSource = "TREASURY_FISCALDATA" | "FRED_WTREGEN" | "NONE";
export type LiquidityUnits = "USD_MILLIONS" | "UNKNOWN";
export type EtfFlowLagState = "UNKNOWN" | "T_PLUS_1_AVAILABLE" | "NOT_AVAILABLE";
export type TokenUnlockRisk = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type ChainStatusRisk = "NONE" | "DEGRADED" | "OUTAGE" | "UNKNOWN";
export type CalendarLiquidityContext =
  | "NORMAL"
  | "THIN_WEEKEND"
  | "US_HOLIDAY"
  | "CANADA_HOLIDAY"
  | "GLOBAL_HOLIDAY"
  | "LONG_WEEKEND"
  | "MONTH_END"
  | "QUARTER_END"
  | "YEAR_END";
export type CalendarContextRiskState = "CLEAR" | "CALENDAR_CAUTION";
export type HolidayType = "NATIONAL" | "BANK" | "CULTURAL" | "GLOBAL" | "CRYPTO_RELEVANT";
export type HolidayContextSource = "STATIC_CALENDAR_V1";
export type LaunchWindowType =
  | "NONE"
  | "NATIONAL_HOLIDAY_THEME"
  | "MEME_DATE"
  | "CONFERENCE_DATE"
  | "NEWS_CYCLE_THEME"
  | "SPORTS_FINAL_THEME"
  | "ELECTION_THEME"
  | "CELEBRITY_TREND_THEME"
  | "HIGH_RUG_RISK_THEME"
  | "UNKNOWN";
export type LaunchWindowRisk = "NONE" | "ELEVATED_NOISE" | "HIGH_PVP" | "UNKNOWN";
export type LaunchWindowMarket = "NONE" | "SOL_MEME_MICROCAPS" | "BROAD_CRYPTO" | "UNKNOWN";

export interface MacroContext {
  dxyTrend: MacroTrend;
  tenYearYieldTrend: MacroTrend;
  realYieldTrend: MacroTrend;
  equityRiskState: EquityRiskState;
  volRegime: VolRegime;
  tenYearYield: number | null;
  twoYearYield: number | null;
  tenYearRealYield: number | null;
  vix: number | null;
  highYieldSpread: number | null;
  dollarProxy: number | null;
  fredEnabled: boolean;
  fredSourceTimestamp: string | null;
  fredIngestTimestamp: string | null;
  fredSeriesDates: Record<string, string | null>;
  fredError: string | null;
  backtestDataStatus: BacktestDataStatus;
}

export interface MacroLiquidityContext {
  walcl: number | null;
  walclPrior: number | null;
  rrp: number | null;
  rrpPrior: number | null;
  tga: number | null;
  tgaFred: number | null;
  tgaFredPrior: number | null;
  tgaFiscalData: number | null;
  tgaFiscalDataPrior: number | null;
  tgaFiscalDataTrend: MacroLiquidityTrend;
  tgaFiscalDataRecordDate: string | null;
  tgaFiscalDataPriorRecordDate: string | null;
  netLiquidityProxy: number | null;
  netLiquidityTrend: MacroLiquidityTrend;
  liquiditySourceTimestamp: string | null;
  treasuryEnabled: boolean;
  treasurySourceTimestamp: string | null;
  treasuryIngestTimestamp: string | null;
  treasuryError: string | null;
  treasuryBacktestDataStatus: BacktestDataStatus;
  treasurySeriesDates: Record<string, string | null>;
  tgaPreferredSource: TgaSource;
  liquidityUnits: LiquidityUnits;
  netLiquidityUnitWarning: string | null;
}

export interface FedContext {
  blackoutWindow: boolean;
  nextFomcEvent: string | null;
  fedEventType: string | null;
}

export interface CryptoCatalystContext {
  etfFlowLagState: EtfFlowLagState;
  tokenUnlockRisk: TokenUnlockRisk;
  chainStatusRisk: ChainStatusRisk;
}

export interface MoonPhaseContext {
  phase: MoonPhaseLabel;
  daysFromFullMoon: number | null;
  daysFromNewMoon: number | null;
  researchOnly: true;
}

export interface BtcHalvingContext {
  nextBtcHalvingBlockHeight: 1050000;
  estimatedNextBtcHalvingTimeUtc: string | null;
  blocksToNextBtcHalving: number | null;
  daysToNextBtcHalving: number | null;
  btcHalvingDisplayWindow: string | null;
  structuralOnly: true;
}

export interface CalendarContext {
  calendarContextVersion: string;
  scanDateUtc: string;
  scanDayOfWeekUtc: string;
  weekendFlag: boolean;
  monthEndFlag: boolean;
  quarterEndFlag: boolean;
  yearEndFlag: boolean;
  longWeekendFlag: boolean;
  liquidityContext: CalendarLiquidityContext;
  calendarRiskState: CalendarContextRiskState;
  backtestDataStatus: "KNOWN_AHEAD";
  calendarContextOperational: false;
}

export interface HolidayItem {
  name: string;
  countryCode: string;
  date: string;
  observedDate: string | null;
  type: HolidayType;
  daysUntil: number;
  isToday: boolean;
  isObservedToday: boolean;
}

export interface HolidayContext {
  activeHolidays: HolidayItem[];
  upcomingHolidaysNext7d: HolidayItem[];
  observedHolidayToday: boolean;
  actualHolidayToday: boolean;
  countryCodes: string[];
  holidayContextText: string | null;
  source: HolidayContextSource;
  backtestDataStatus: "KNOWN_AHEAD";
}

export interface LaunchWindowContext {
  launchWindowActive: boolean;
  launchWindowType: LaunchWindowType;
  launchWindowName: string | null;
  launchWindowRisk: LaunchWindowRisk;
  launchWindowReason: string | null;
  affectedMarket: LaunchWindowMarket;
  backtestDataStatus: "KNOWN_AHEAD";
  telemetryOnly: true;
}

export interface DisplayRelevantEvent {
  tag: string;
  type: EventType | "LIQUIDITY" | "BTC_HALVING";
  displayText: string;
  reason: string;
  researchOnly?: true;
  structuralOnly?: true;
}

export interface EventContext {
  eventRiskLevel: EventRiskLevel;
  nextHighImpactEvent: string | null;
  minutesToEvent: number | null;
  minutesSinceEvent: number | null;
  eventType: EventType;
  eventImpactClass: EventImpactClass;
  calendarRiskState: CalendarRiskState;
  liquidityContext: LiquidityContext;
  holidayContext: string[];
  expiryContext: ExpiryContext;
  newsRiskState: NewsRiskState;
  eventSuppressionReason: string | null;
  confirmationRequirement: ConfirmationRequirement;
  marketMoveEventMode: MarketMoveEventMode;
  backtestDataStatus: BacktestDataStatus;
  eventContextVersion: string;
  eventContextOperational: false;
  eventStackCount: number;
  eventStackTags: string[];
  eventConfluenceLevel: EventConfluenceLevel;
  eventDisplayReasons: string[];
  displayRelevantEvents: DisplayRelevantEvent[];
  hiddenObservedEventsCount: number;
  macroContext?: MacroContext;
  macroLiquidityContext?: MacroLiquidityContext;
  fedContext?: FedContext;
  cryptoCatalystContext?: CryptoCatalystContext;
  moonPhaseContext?: MoonPhaseContext;
  btcHalvingContext: BtcHalvingContext;
  calendarContext: CalendarContext;
  holidayContextV1: HolidayContext;
  launchWindowContext: LaunchWindowContext;
}
export type ActionMode =
  | "STAY IN STABLES"
  | "WAIT / MOSTLY STABLES"
  | "BTC WATCH"
  | "ETH WATCH"
  | "BTC FOCUS"
  | "ETH ROTATION"
  | "SOL ROTATION"
  | "SELECTIVE RISK-ON"
  | "NO CLEAN EDGE";

export interface ActionGuidance {
  action: ActionMode;
  focus: string;
  avoid: string;
  risk: string;
  confidence: string;
  why: string[];
  watch: string[];
}

export interface AccuracySnapshotFields {
  actionMode: ActionMode;
  confidence: string;
  regimeConfidence: RegimeConfidence;
  defiStatus: DefiConfirmationStatus;
  derivativesHeatStatus: DerivativesHeatStatus;
  derivativesHeatLabel: string;
  derivativesHeatSummary: string;
  btcHeatLabel: string;
  ethHeatLabel: string;
  solHeatLabel: string;
  btcFundingZScore: number | null;
  ethFundingZScore: number | null;
  solFundingZScore: number | null;
  btcOiChange24hPct: number | null;
  ethOiChange24hPct: number | null;
  solOiChange24hPct: number | null;
  btcPrice: number | null;
  ethPrice: number | null;
  solPrice: number | null;
  ethBtcRatio: number | null;
  solBtcRatio: number | null;
  solEthRatio: number | null;
  sessionPhase: string;
  sessionElapsedMinutes: number | null;
  activityState: string;
  activityReason: string;
  tempo: string;
  tapeState: string;
  nextScanAt: string;
}


export type BestLane = "BTC" | "ETH" | "SOL" | "STABLES" | "NO_CLEAR_LANE";
export type LaneConfidence = "Clear" | "Mixed" | "Weak" | "Unavailable";
export type RiskStyle = "No trade" | "Scout only" | "Hold winners" | "Add only on confirmation" | "Risk-on allowed";
export type ChopState = "Clean" | "Mixed" | "Choppy" | "Unavailable";

export interface LaneExplainerHistoryPoint {
  timestamp: string;
  timestampMs: number;
  score: number | null;
  regime: string;
  leader: string;
  regimeConfidence: string;
  marketMoveReason: string | null;
  btcPrice: number | null;
  ethPrice: number | null;
  solPrice: number | null;
  ethBtcRatio: number | null;
  solBtcRatio: number | null;
  solEthRatio: number | null;
  bestLane?: BestLane | string | null;
}

export interface LaneExplainerSnapshotFields {
  bestLane: BestLane;
  bestLaneLabel: string;
  laneConfidence: LaneConfidence;
  laneReason: string;
  laneMargin: number | null;
  laneRank1: BestLane;
  laneRank2: BestLane;
  laneScoreBtc: number | null;
  laneScoreEth: number | null;
  laneScoreSol: number | null;
  laneScoreStables: number | null;
  leaderPersistenceScans: number | null;
  riskStyle: RiskStyle;
  ifInAction: string;
  ifFlatAction: string;
  invalidIf: string;
  btcRepairFlag: boolean | null;
  timeframeRead: string;
  shortTermState: string;
  chopState: ChopState;
  suppressionNote: string | null;
  scoreFlipCount6h: number | null;
  scoreRange6h: number | null;
  retBtc4h: number | null;
  retEth4h: number | null;
  retSol4h: number | null;
  retBtc12h: number | null;
  retEth12h: number | null;
  retSol12h: number | null;
  retBtc1d: number | null;
  retEth1d: number | null;
  retSol1d: number | null;
  retEthBtc4h: number | null;
  retSolBtc4h: number | null;
  retSolEth4h: number | null;
  retEthBtc1d: number | null;
  retSolBtc1d: number | null;
  retSolEth1d: number | null;
}

export interface LaneExplainerInput {
  timestamp: string;
  score: number;
  regime: RegimeName;
  leader: LeaderName;
  regimeConfidence: RegimeConfidence;
  defiStatus: DefiConfirmationStatus;
  sessionPhase: string;
  activityState: string;
  marketMoveReason: string | null;
  btcPrice: number | null;
  ethPrice: number | null;
  solPrice: number | null;
  ethBtcRatio: number | null;
  solBtcRatio: number | null;
  solEthRatio: number | null;
  history: LaneExplainerHistoryPoint[];
}

export type LaneExplainerResult = LaneExplainerSnapshotFields;
export interface MarketMoveAuditFields {
  marketMoveWanted: boolean;
  marketMoveSent: boolean;
  marketMoveReason: string;
  heartbeatWanted: boolean;
  heartbeatSent: boolean;
  telegramConfigured: boolean;
  telegramSendError: string | null;
  previousScore: number | null;
  currentScore: number;
  previousMode: RegimeName | null;
  currentMode: RegimeName;
  previousConfidence: RegimeConfidence | null;
  currentConfidence: RegimeConfidence;
  eventRiskLevel?: EventRiskLevel;
  eventCalendarRiskState?: CalendarRiskState;
  eventLiquidityContext?: LiquidityContext;
  eventExpiryContext?: ExpiryContext;
  eventMarketMoveMode?: MarketMoveEventMode;
  eventContextOperational?: false;
  fredEnabled?: boolean;
  fredSourceTimestamp?: string | null;
  fredIngestTimestamp?: string | null;
  fredError?: string | null;
  fredBacktestDataStatus?: BacktestDataStatus;
  treasuryEnabled?: boolean;
  treasurySourceTimestamp?: string | null;
  treasuryIngestTimestamp?: string | null;
  treasuryError?: string | null;
  treasuryBacktestDataStatus?: BacktestDataStatus;
}

export interface SavedState {

  version: string;
  lastRunAt: string | null;
  lastAlertAt: string | null;
  lastHeartbeatAt: string | null;
  lastAlertReason: string | null;
  lastScore: number | null;
  lastRegime: RegimeName | null;
  lastLeader: LeaderName | null;
  globalHistory: GlobalHistoryPoint[];
  currentResult: RegimeScoreResult | null;
}

export interface AlertDecision {
  shouldSend: boolean;
  reason: string;
  isCritical: boolean;
}

export type MarketDataProviderName = "coingecko" | "bybit" | "binance";

export type DerivativesHeatStatus =
  | "Mixed"
  | "Clean"
  | "CrowdedLongs"
  | "CrowdedShorts"
  | "LongWipeoutRisk"
  | "ShortSqueezeFuel"
  | "Unavailable";

export interface DerivativesHeatAssetSnapshot {
  asset: "BTC" | "ETH" | "SOL" | string;
  symbol: string | null;
  price: number | null;
  openInterestCurrent: number | null;
  openInterestChange4hPct: number | null;
  openInterestChange24hPct: number | null;
  fundingCurrent: number | null;
  fundingZScore: number | null;
  predictedFundingCurrent: number | null;
  liquidationLongUsd1h: number | null;
  liquidationShortUsd1h: number | null;
  liquidationLongUsd4h: number | null;
  liquidationShortUsd4h: number | null;
  liquidationImbalance: number | null;
  longShortRatio: number | null;
  assetHeatLabel: string;
  assetHeatScore: number;
  assetSummary: string;
}

export interface DerivativesHeatSnapshot {
  timestamp: string;
  provider: string;
  status: DerivativesHeatStatus;
  publicLabel: string;
  summary: string;
  assets: DerivativesHeatAssetSnapshot[];
  errors: string[];
  warnings: string[];
}

export interface DerivativesHeatProviderInput {
  result: RegimeScoreResult;
  candles: CandleBundle;
  previousResult: RegimeScoreResult | null;
}

export interface DerivativesHeatProvider {
  getHeatSnapshot(input: DerivativesHeatProviderInput): Promise<DerivativesHeatSnapshot>;
}

export type DefiConfirmationStatus = "Strong" | "Mixed" | "Weak" | "Unavailable";
export type DefiActivityStatus = "Improving" | "Mixed" | "Weak" | "Unavailable";
export type DefiLiquidityStatus = "Improving" | "Mixed" | "Tightening" | "Unavailable";

export interface DefiConfirmation {
  status: DefiConfirmationStatus;
  solanaActivity: DefiActivityStatus;
  liquidity: DefiLiquidityStatus;
  reason: string;
  components: {
    solanaTvl7dChangePct?: number;
    ethereumTvl7dChangePct?: number;
    solanaDexVolumeTrend?: string;
    ethereumDexVolumeTrend?: string;
    solanaFeesTrend?: string;
    stablecoinSupplyTrend?: string;
  };
}

export interface BotConfig {
  scanIntervalMinutes: number;
  primaryTimeframe: Timeframe;
  confirmationTimeframe: Timeframe;
  timingTimeframe: Timeframe;
  candleLimit: number;
  providers: {
    marketDataPrimary: MarketDataProviderName;
    binanceBaseUrls: string[];
    bybitBaseUrl: string;
    coingeckoBaseUrl: string;
  };
  defiLlama: {
    confirmationEnabled: boolean;
    baseUrl: string;
    timeoutMs: number;
  };
  derivativesHeat: {
    enabled: boolean;
    provider: "coinalyze";
    coinalyzeApiKey: string;
    coinalyzeBaseUrl: string;
    timeoutMs: number;
    assets: string[];
    interval: string;
    historyHours: number;
  };
  assets: {
    btcUsdt: string;
    ethUsdt: string;
    solUsdt: string;
    ethBtc: string;
    solBtc: string;
  };
  stablecoinDominanceSymbols: string[];
  alertRules: {
    enabled: boolean;
    minScoreDelta: number;
    cooldownMinutes: number;
    criticalCooldownMinutes: number;
    sendStartupAlert: boolean;
    telegramHeartbeatEnabled: boolean;
    telegramHeartbeatIntervalMinutes: number;
  };
  paths: {
    stateFile: string;
    scoreCsv: string;
    alertCsv: string;
    snapshotJsonl: string;
    derivativesHeatCsv: string;
    derivativesHeatJsonl: string;
    errorLog: string;
  };
}

export interface MarketDataSnapshot {
  timestamp: string;
  timeframe: Timeframe;
  candles: CandleBundle;
  global: GlobalSnapshot;
  defiConfirmation: DefiConfirmation;
}
