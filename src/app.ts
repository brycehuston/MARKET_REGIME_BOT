import dotenv from "dotenv";
import { BinanceProvider, BybitProvider, CoinGeckoProvider } from "./providers";
import { DefiLlamaProvider } from "./defillama";
import { CoinalyzeDerivativesHeatProvider } from "./derivativesHeat";
import { buildRatioCandles } from "./indicators";
import { loadConfig } from "./config";
import { decideAlert, shouldSendTelegramHeartbeat } from "./alerts";
import { deriveLaneExplainer } from "./laneExplainer";
import { TelegramClient, buildTempoTapeContext, deriveRegimeConfidence, formatHeartbeatAlert, formatRegimeAlert, getActionGuidance } from "./telegram";
import { scoreMarketRegime } from "./scorer";
import {
  loadLaneExplainerHistory,
  loadState,
  logAlert,
  logDerivativesHeat,
  logError,
  logScore,
  logSnapshot,
  saveState,
  updateStateAfterRun
} from "./logger";
import {
  AccuracySnapshotFields,
  AlertDecision,
  Candle,
  CandleBundle,
  MarketMoveAuditFields,
  MarketDataProviderName,
  MarketDataSnapshot,
  RegimeConfidence,
  RegimeScoreResult,
  Timeframe
} from "./types";
import { sleep } from "./utils";

dotenv.config();

export class MarketRegimeBot {
  private readonly config = loadConfig();
  private readonly binance = new BinanceProvider(this.config.providers.binanceBaseUrls);
  private readonly bybit = new BybitProvider(this.config.providers.bybitBaseUrl);
  private readonly coingecko = new CoinGeckoProvider(this.config);
  private readonly defiLlama = new DefiLlamaProvider(this.config);
  private readonly derivativesHeat = new CoinalyzeDerivativesHeatProvider(this.config);
  private readonly telegram = new TelegramClient();

  async runOnce(): Promise<void> {
    const state = loadState(this.config);

    try {
      const snapshot = await this.fetchMarketData(this.config.primaryTimeframe);
      const result: RegimeScoreResult = {
        ...scoreMarketRegime({
          timeframe: this.config.primaryTimeframe,
          candles: snapshot.candles,
          global: snapshot.global,
          state,
          config: this.config
        }),
        defiConfirmation: snapshot.defiConfirmation
      };

      result.derivativesHeat = await this.derivativesHeat.getHeatSnapshot({
        result,
        candles: snapshot.candles,
        previousResult: state.currentResult
      });

      console.log(`DefiLlama confirmation: ${result.defiConfirmation?.status ?? "Unavailable"}`);
      console.log(`Derivatives heat: ${result.derivativesHeat.publicLabel}`);

      const guidance = getActionGuidance(result);
      const nextScanIso = this.nextScanIso(new Date());
      const previousConfidence = state.currentResult ? deriveRegimeConfidence(state.currentResult, null) : null;
      const currentConfidence = deriveRegimeConfidence(result, state.currentResult);
      const decision = decideAlert(this.config, state, result, currentConfidence, previousConfidence);
      const accuracyFields = this.buildAccuracySnapshotFields(snapshot.candles, result, guidance, state.currentResult, nextScanIso);
      const laneExplainer = deriveLaneExplainer({
        timestamp: result.timestamp,
        score: result.score,
        regime: result.regime,
        leader: result.leader,
        regimeConfidence: currentConfidence,
        defiStatus: accuracyFields.defiStatus,
        sessionPhase: accuracyFields.sessionPhase,
        activityState: accuracyFields.activityState,
        marketMoveReason: decision.reason,
        btcPrice: accuracyFields.btcPrice,
        ethPrice: accuracyFields.ethPrice,
        solPrice: accuracyFields.solPrice,
        ethBtcRatio: accuracyFields.ethBtcRatio,
        solBtcRatio: accuracyFields.solBtcRatio,
        solEthRatio: accuracyFields.solEthRatio,
        history: loadLaneExplainerHistory(this.config)
      });

      logScore(this.config, result);
      logDerivativesHeat(this.config, result.derivativesHeat);
      logAlert(this.config, result, decision);

      const telegramConfigured = this.telegram.isConfigured();
      let telegramSent = false;
      let heartbeatSent = false;
      let telegramSendError: string | null = null;
      const heartbeatWanted = shouldSendTelegramHeartbeat(this.config, state, telegramConfigured, decision.shouldSend);

      if (decision.shouldSend) {
        if (!telegramConfigured) {
          telegramSendError = "Telegram not configured.";
          console.log("Telegram alert wanted, but TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.");
        } else {
          try {
            await this.telegram.sendMessage(formatRegimeAlert(result, decision.reason, nextScanIso, state.currentResult, laneExplainer));
            telegramSent = true;
          } catch (error) {
            // Alert delivery should not stop the bot from saving state/logs.
            logError(this.config, error);
            const message = error instanceof Error ? error.message : String(error);
            telegramSendError = message;
            console.error(`Telegram send failed: ${message}`);
          }
        }
      } else if (heartbeatWanted) {
        try {
          await this.telegram.sendMessage(formatHeartbeatAlert(result, nextScanIso, state.currentResult, laneExplainer));
          heartbeatSent = true;
        } catch (error) {
          // Heartbeat delivery should not stop the bot from saving state/logs.
          logError(this.config, error);
          const message = error instanceof Error ? error.message : String(error);
          telegramSendError = message;
          console.error(`Telegram heartbeat send failed: ${message}`);
        }
      }

      const auditFields = this.buildMarketMoveAuditFields(
        state,
        result,
        decision,
        telegramConfigured,
        telegramSent,
        telegramSendError,
        heartbeatWanted,
        heartbeatSent,
        previousConfidence,
        currentConfidence
      );
      logSnapshot(this.config, result, accuracyFields, auditFields, laneExplainer);

      const nextState = updateStateAfterRun(state, result, decision, heartbeatSent);
      saveState(this.config, nextState);

      this.printHeartbeat(result, decision, telegramConfigured, telegramSent, heartbeatWanted, heartbeatSent, nextScanIso);
    } catch (error) {
      logError(this.config, error);
      throw error;
    }
  }

  async runLoop(): Promise<void> {
    console.log("MARKET REGIME BOT started. Alert-only. No execution.");
    console.log(`Scan interval: ${this.config.scanIntervalMinutes} minutes`);

    while (true) {
      const waitMs = this.msUntilNextScan(new Date());
      if (waitMs > 0) await sleep(waitMs);

      try {
        await this.runOnce();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Run failed: ${message}`);
      }
    }
  }

  private nextScanIso(from: Date): string {
    return new Date(from.getTime() + this.msUntilNextScan(from)).toISOString();
  }

  private msUntilNextScan(from: Date): number {
    const interval = this.config.scanIntervalMinutes;
    if (!Number.isFinite(interval) || interval <= 0) return 15 * 60 * 1000;

    if (!Number.isInteger(interval) || 60 % interval !== 0) {
      return interval * 60 * 1000;
    }

    const intervalMs = interval * 60 * 1000;
    const hourStartMs = Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      from.getUTCHours(),
      0,
      0,
      0
    );
    const elapsedInHourMs = from.getTime() - hourStartMs;
    const intervalsElapsed = Math.floor(elapsedInHourMs / intervalMs);
    const nextBoundaryMs = hourStartMs + (intervalsElapsed + 1) * intervalMs;
    return Math.max(1000, nextBoundaryMs - from.getTime());
  }
  async fetchMarketData(timeframe: Timeframe): Promise<MarketDataSnapshot> {
    const [candles, global, defiConfirmation] = await Promise.all([
      this.fetchCandleBundle(timeframe),
      this.coingecko.fetchGlobalSnapshot(),
      this.defiLlama.fetchConfirmation()
    ]);

    return {
      timestamp: new Date().toISOString(),
      timeframe,
      candles,
      global,
      defiConfirmation
    };
  }

  private async fetchCandleBundle(timeframe: Timeframe): Promise<CandleBundle> {
    const providers = this.marketDataProviderOrder();
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        return await this.fetchCandlesFromProvider(provider, timeframe);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${provider}: ${message}`);
        const nextProvider = providers[providers.indexOf(provider) + 1];
        if (nextProvider) console.warn(`${provider} market-data fetch failed; trying ${nextProvider}. ${message}`);
      }
    }

    throw new Error(`All market-data providers failed. ${errors.join(" | ")}`);
  }

  private marketDataProviderOrder(): MarketDataProviderName[] {
    const primary = this.config.providers.marketDataPrimary;
    const priority: MarketDataProviderName[] = ["coingecko", "bybit", "binance"];
    return [primary, ...priority.filter((provider) => provider !== primary)];
  }

  private fetchCandlesFromProvider(provider: MarketDataProviderName, timeframe: Timeframe): Promise<CandleBundle> {
    if (provider === "coingecko") return this.fetchCoinGeckoCandleBundle(timeframe);
    if (provider === "bybit") return this.fetchBybitCandleBundle(timeframe);
    return this.fetchBinanceCandleBundle(timeframe);
  }

  private async fetchCoinGeckoCandleBundle(timeframe: Timeframe): Promise<CandleBundle> {
    const limit = this.config.candleLimit;

    const [btcUsdt, ethUsdt, solUsdt] = await Promise.all([
      this.coingecko.fetchMarketChartCandles("bitcoin", "BTCUSDT", timeframe, limit),
      this.coingecko.fetchMarketChartCandles("ethereum", "ETHUSDT", timeframe, limit),
      this.coingecko.fetchMarketChartCandles("solana", "SOLUSDT", timeframe, limit)
    ]);

    console.log("Market data provider: coingecko");
    return {
      btcUsdt,
      ethUsdt,
      solUsdt,
      ethBtc: buildRatioCandles("ETHBTC", ethUsdt, btcUsdt),
      solBtc: buildRatioCandles("SOLBTC", solUsdt, btcUsdt),
      solEth: buildRatioCandles("SOLETH", solUsdt, ethUsdt)
    };
  }
  private async fetchBinanceCandleBundle(timeframe: Timeframe): Promise<CandleBundle> {
    const limit = this.config.candleLimit;
    const assets = this.config.assets;

    const [btcUsdt, ethUsdt, solUsdt, ethBtc, solBtc] = await Promise.all([
      this.binance.fetchKlines(assets.btcUsdt, timeframe, limit),
      this.binance.fetchKlines(assets.ethUsdt, timeframe, limit),
      this.binance.fetchKlines(assets.solUsdt, timeframe, limit),
      this.binance.fetchKlines(assets.ethBtc, timeframe, limit),
      this.binance.fetchKlines(assets.solBtc, timeframe, limit)
    ]);

    console.log("Market data provider: binance");
    return {
      btcUsdt,
      ethUsdt,
      solUsdt,
      ethBtc,
      solBtc,
      solEth: buildRatioCandles("SOLETH", solUsdt, ethUsdt)
    };
  }

  private async fetchBybitCandleBundle(timeframe: Timeframe): Promise<CandleBundle> {
    const limit = this.config.candleLimit;
    const assets = this.config.assets;

    const [btcUsdt, ethUsdt, solUsdt] = await Promise.all([
      this.bybit.fetchSpotKlines(assets.btcUsdt, timeframe, limit),
      this.bybit.fetchSpotKlines(assets.ethUsdt, timeframe, limit),
      this.bybit.fetchSpotKlines(assets.solUsdt, timeframe, limit)
    ]);

    console.log("Market data provider: bybit");
    return {
      btcUsdt,
      ethUsdt,
      solUsdt,
      ethBtc: buildRatioCandles("ETHBTC", ethUsdt, btcUsdt),
      solBtc: buildRatioCandles("SOLBTC", solUsdt, btcUsdt),
      solEth: buildRatioCandles("SOLETH", solUsdt, ethUsdt)
    };
  }

  private buildMarketMoveAuditFields(
    state: ReturnType<typeof loadState>,
    result: RegimeScoreResult,
    decision: AlertDecision,
    telegramConfigured: boolean,
    marketMoveSent: boolean,
    telegramSendError: string | null,
    heartbeatWanted: boolean,
    heartbeatSent: boolean,
    previousConfidence: RegimeConfidence | null,
    currentConfidence: RegimeConfidence
  ): MarketMoveAuditFields {
    return {
      marketMoveWanted: decision.shouldSend,
      marketMoveSent,
      marketMoveReason: decision.reason,
      heartbeatWanted,
      heartbeatSent,
      telegramConfigured,
      telegramSendError,
      previousScore: state.lastScore,
      currentScore: result.score,
      previousMode: state.lastRegime,
      currentMode: result.regime,
      previousConfidence,
      currentConfidence
    };
  }
  private buildAccuracySnapshotFields(
    candles: CandleBundle,
    result: RegimeScoreResult,
    guidance: ReturnType<typeof getActionGuidance>,
    previousResult: RegimeScoreResult | null,
    nextScanIso: string
  ): AccuracySnapshotFields {
    const tempoContext = buildTempoTapeContext(result, previousResult);
    const regimeConfidence = deriveRegimeConfidence(result, previousResult, tempoContext);

    return {
      actionMode: guidance.action,
      confidence: guidance.confidence,
      regimeConfidence,
      defiStatus: result.defiConfirmation?.status ?? "Unavailable",
      derivativesHeatStatus: result.derivativesHeat?.status ?? "Unavailable",
      derivativesHeatLabel: result.derivativesHeat?.publicLabel ?? "Unavailable ?",
      derivativesHeatSummary: result.derivativesHeat?.summary ?? "Derivatives heat unavailable.",
      btcHeatLabel: this.heatAssetLabel(result, "BTC"),
      ethHeatLabel: this.heatAssetLabel(result, "ETH"),
      solHeatLabel: this.heatAssetLabel(result, "SOL"),
      btcFundingZScore: this.heatAssetNumber(result, "BTC", "fundingZScore"),
      ethFundingZScore: this.heatAssetNumber(result, "ETH", "fundingZScore"),
      solFundingZScore: this.heatAssetNumber(result, "SOL", "fundingZScore"),
      btcOiChange24hPct: this.heatAssetNumber(result, "BTC", "openInterestChange24hPct"),
      ethOiChange24hPct: this.heatAssetNumber(result, "ETH", "openInterestChange24hPct"),
      solOiChange24hPct: this.heatAssetNumber(result, "SOL", "openInterestChange24hPct"),
      btcPrice: this.latestFiniteClose(candles.btcUsdt),
      ethPrice: this.latestFiniteClose(candles.ethUsdt),
      solPrice: this.latestFiniteClose(candles.solUsdt),
      ethBtcRatio: this.latestFiniteClose(candles.ethBtc),
      solBtcRatio: this.latestFiniteClose(candles.solBtc),
      solEthRatio: this.latestFiniteClose(candles.solEth),
      sessionPhase: tempoContext.sessionPhase,
      sessionElapsedMinutes: tempoContext.sessionElapsedMinutes,
      activityState: tempoContext.activityState,
      activityReason: tempoContext.activityReason,
      tempo: tempoContext.tempo,
      tapeState: tempoContext.tapeState,
      nextScanAt: nextScanIso
    };
  }

  private heatAssetLabel(result: RegimeScoreResult, asset: string): string {
    return result.derivativesHeat?.assets.find((item) => item.asset.toUpperCase() === asset)?.assetHeatLabel ?? "Unavailable";
  }

  private heatAssetNumber(
    result: RegimeScoreResult,
    asset: string,
    field: "fundingZScore" | "openInterestChange24hPct"
  ): number | null {
    return result.derivativesHeat?.assets.find((item) => item.asset.toUpperCase() === asset)?.[field] ?? null;
  }

  private latestFiniteClose(candles: Candle[]): number | null {
    for (let i = candles.length - 1; i >= 0; i -= 1) {
      const close = candles[i]?.close;
      if (Number.isFinite(close)) return close;
    }
    return null;
  }

  private printHeartbeat(
    result: RegimeScoreResult,
    decision: AlertDecision,
    telegramConfigured: boolean,
    telegramSent: boolean,
    heartbeatWanted: boolean,
    heartbeatSent: boolean,
    nextScanIso: string
  ): void {

    console.log(
      [
        "",
        "================ MARKET REGIME SCAN ================",
        `Time: ${result.timestamp}`,
        `Score: ${result.score}/100 | Regime: ${result.regime} | Leader: ${result.leader}`,
        `Meme: ${result.memeCondition}`,
        `Bias: ${result.researchBias}`,
        `DeFi: ${result.defiConfirmation?.status ?? "Unavailable"}`,
        `Heat: ${result.derivativesHeat?.publicLabel ?? "Unavailable ?"}`,
        `Regime confidence: ${deriveRegimeConfidence(result, null)}`,
        "",
        "Components:",
        `BTC Trend: ${this.formatComponentScore(result, "BTC trend / structure")}`,
        `Total Market: ${this.formatComponentScore(result, "Total crypto market trend")}`,
        `BTC Dom: ${this.formatComponentScore(result, "BTC dominance behavior")}`,
        `Stable Dom: ${this.formatComponentScore(result, "Stablecoin dominance")}`,
        `ETH/BTC: ${this.formatComponentScore(result, "ETH/BTC relative strength")}`,
        `SOL/BTC: ${this.formatComponentScore(result, "SOL/BTC relative strength")}`,
        `SOL/ETH: ${this.formatComponentScore(result, "SOL/ETH relative strength")}`,
        `Volume: ${this.formatComponentScore(result, "Volume confirmation")}`,
        "",
        `Telegram configured: ${telegramConfigured ? "yes" : "no"}`,
        `Market Move wanted: ${decision.shouldSend ? "yes" : "no"}`,
        `Market Move sent: ${telegramSent ? "yes" : "no"}`,
        `Heartbeat enabled: ${this.config.alertRules.telegramHeartbeatEnabled ? "yes" : "no"}`,
        `Heartbeat wanted: ${heartbeatWanted ? "yes" : "no"}`,
        `Heartbeat sent: ${heartbeatSent ? "yes" : "no"}`,
        `Market Move reason: ${decision.reason}`,
        `Next scan: ${nextScanIso}`,
        "====================================================",
        ""
      ].join("\n")
    );
  }

  private formatComponentScore(result: RegimeScoreResult, name: string): string {
    const component = result.components.find((item) => item.name === name);
    if (!component) return "N/A";
    const prefix = component.score > 0 ? "+" : "";
    return `${component.label} (${prefix}${component.score})`;
  }
}
