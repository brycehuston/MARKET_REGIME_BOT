import path from "node:path";
import { BotConfig, MarketDataProviderName } from "./types";
import { readJsonFile } from "./utils";

export function loadConfig(): BotConfig {
  const configPath = path.resolve(process.cwd(), "config", "bot.config.json");
  const config = readJsonFile<BotConfig>(configPath, null as unknown as BotConfig);

  if (!config) {
    throw new Error(`Missing config file at ${configPath}`);
  }

  config.providers.marketDataPrimary = normalizeMarketDataPrimary(config.providers.marketDataPrimary);
  config.providers.bybitBaseUrl = config.providers.bybitBaseUrl || "https://api.bybit.com";

  config.paths.derivativesHeatCsv = config.paths.derivativesHeatCsv || "logs/derivatives_heat.csv";
  config.paths.derivativesHeatJsonl = config.paths.derivativesHeatJsonl || "logs/derivatives_heat.jsonl";

  const existingDerivativesHeat = (config as Partial<BotConfig>).derivativesHeat;
  config.derivativesHeat = {
    enabled: existingDerivativesHeat?.enabled ?? false,
    provider: "coinalyze",
    coinalyzeApiKey: existingDerivativesHeat?.coinalyzeApiKey || "",
    coinalyzeBaseUrl: existingDerivativesHeat?.coinalyzeBaseUrl || "https://api.coinalyze.net/v1",
    timeoutMs: normalizePositiveNumber(existingDerivativesHeat?.timeoutMs, 10000),
    assets: normalizeAssetList(existingDerivativesHeat?.assets, ["BTC", "ETH", "SOL"]),
    interval: existingDerivativesHeat?.interval || "1hour",
    historyHours: normalizePositiveNumber(existingDerivativesHeat?.historyHours, 168)
  };

  const existingDefiLlama = (config as Partial<BotConfig>).defiLlama;
  config.defiLlama = {
    confirmationEnabled: existingDefiLlama?.confirmationEnabled ?? true,
    baseUrl: existingDefiLlama?.baseUrl || "https://api.llama.fi",
    timeoutMs: normalizePositiveNumber(existingDefiLlama?.timeoutMs, 10000)
  };

  config.alertRules.telegramHeartbeatEnabled = false;
  config.alertRules.telegramHeartbeatIntervalMinutes = 60;

  // Environment override so VPS changes do not require editing config JSON.
  if (process.env.MARKET_DATA_PRIMARY) {
    config.providers.marketDataPrimary = normalizeMarketDataPrimary(process.env.MARKET_DATA_PRIMARY);
  }

  if (process.env.BYBIT_BASE_URL) {
    config.providers.bybitBaseUrl = process.env.BYBIT_BASE_URL;
  }

  if (process.env.DEFILLAMA_CONFIRMATION_ENABLED) {
    config.defiLlama.confirmationEnabled = process.env.DEFILLAMA_CONFIRMATION_ENABLED.toLowerCase() === "true";
  }

  if (process.env.DEFILLAMA_BASE_URL) {
    config.defiLlama.baseUrl = process.env.DEFILLAMA_BASE_URL;
  }

  if (process.env.DEFILLAMA_TIMEOUT_MS) {
    config.defiLlama.timeoutMs = normalizePositiveNumber(Number(process.env.DEFILLAMA_TIMEOUT_MS), config.defiLlama.timeoutMs);
  }

  if (process.env.DERIVATIVES_HEAT_ENABLED) {
    config.derivativesHeat.enabled = process.env.DERIVATIVES_HEAT_ENABLED.toLowerCase() === "true";
  }

  if (process.env.DERIVATIVES_HEAT_PROVIDER) {
    config.derivativesHeat.provider = "coinalyze";
  }

  if (process.env.COINALYZE_API_KEY) {
    config.derivativesHeat.coinalyzeApiKey = process.env.COINALYZE_API_KEY;
  }

  if (process.env.COINALYZE_BASE_URL) {
    config.derivativesHeat.coinalyzeBaseUrl = process.env.COINALYZE_BASE_URL;
  }

  if (process.env.DERIVATIVES_HEAT_TIMEOUT_MS) {
    config.derivativesHeat.timeoutMs = normalizePositiveNumber(Number(process.env.DERIVATIVES_HEAT_TIMEOUT_MS), config.derivativesHeat.timeoutMs);
  }

  if (process.env.DERIVATIVES_HEAT_ASSETS) {
    config.derivativesHeat.assets = normalizeAssetList(process.env.DERIVATIVES_HEAT_ASSETS, config.derivativesHeat.assets);
  }

  if (process.env.DERIVATIVES_HEAT_INTERVAL) {
    config.derivativesHeat.interval = process.env.DERIVATIVES_HEAT_INTERVAL;
  }

  if (process.env.DERIVATIVES_HEAT_HISTORY_HOURS) {
    config.derivativesHeat.historyHours = normalizePositiveNumber(Number(process.env.DERIVATIVES_HEAT_HISTORY_HOURS), config.derivativesHeat.historyHours);
  }

  if (process.env.SEND_STARTUP_ALERT) {
    config.alertRules.sendStartupAlert = process.env.SEND_STARTUP_ALERT.toLowerCase() === "true";
  }

  if (process.env.TELEGRAM_HEARTBEAT_ENABLED) {
    config.alertRules.telegramHeartbeatEnabled = process.env.TELEGRAM_HEARTBEAT_ENABLED.toLowerCase() === "true";
  }

  if (process.env.TELEGRAM_HEARTBEAT_INTERVAL_MINUTES) {
    const interval = Number(process.env.TELEGRAM_HEARTBEAT_INTERVAL_MINUTES);
    if (Number.isFinite(interval) && interval > 0) {
      config.alertRules.telegramHeartbeatIntervalMinutes = interval;
    }
  }

  return config;
}

function normalizeMarketDataPrimary(value: unknown): MarketDataProviderName {
  if (value === "coingecko" || value === "bybit" || value === "binance") return value;
  return "binance";
}

function normalizeAssetList(value: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const assets = raw.map((item) => String(item).trim().toUpperCase()).filter(Boolean);
  return assets.length > 0 ? [...new Set(assets)] : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}