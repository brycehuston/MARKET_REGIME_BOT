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
