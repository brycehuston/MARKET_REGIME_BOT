import { BotConfig, Candle, GlobalSnapshot, Timeframe } from "./types";
import { nowIso, safeFetchJson, round } from "./utils";

export class BinanceProvider {
  private readonly baseUrls: string[];

  constructor(baseUrls: string[]) {
    this.baseUrls = baseUrls.length > 0 ? baseUrls : ["https://api.binance.com"];
  }

  async fetchKlines(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    const params = new URLSearchParams({ symbol, interval, limit: String(limit) });
    const errors: string[] = [];

    for (const baseUrl of this.baseUrls) {
      const url = `${baseUrl.replace(/\/$/, "")}/api/v3/klines?${params.toString()}`;
      try {
        const rows = await safeFetchJson<unknown[]>(url);
        const now = Date.now();

        return rows
          .map((row) => this.parseKlineRow(symbol, interval, row))
          // Important: remove the currently forming candle so the bot only scores closed candles.
          .filter((candle) => candle.closeTime <= now);
      } catch (error) {
        errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`All Binance kline endpoints failed for ${symbol} ${interval}. ${errors.join(" | ")}`);
  }

  private parseKlineRow(symbol: string, interval: string, row: unknown): Candle {
    if (!Array.isArray(row) || row.length < 8) {
      throw new Error(`Invalid Binance kline row for ${symbol}.`);
    }

    return {
      symbol,
      interval,
      openTime: Number(row[0]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: Number(row[6]),
      quoteVolume: Number(row[7])
    };
  }
}

interface BybitKlineResponse {
  retCode?: number;
  retMsg?: string;
  result?: {
    category?: string;
    symbol?: string;
    list?: unknown[];
  };
}

export class BybitProvider {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = (baseUrl || "https://api.bybit.com").replace(/\/$/, "");
  }

  async fetchSpotKlines(symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const interval = toBybitInterval(timeframe);
    const params = new URLSearchParams({
      category: "spot",
      symbol,
      interval,
      limit: String(Math.min(Math.max(limit + 1, 1), 1000))
    });
    const url = `${this.baseUrl}/v5/market/kline?${params.toString()}`;
    const response = await safeFetchJson<BybitKlineResponse>(url);

    if (response.retCode !== 0) {
      throw new Error(`Bybit kline failed for ${symbol} ${timeframe}: ${response.retMsg ?? "unknown error"} (${response.retCode ?? "no code"}).`);
    }

    const rows = response.result?.list;
    if (!Array.isArray(rows)) {
      throw new Error(`Invalid Bybit kline response for ${symbol} ${timeframe}.`);
    }

    const now = Date.now();
    return rows
      .map((row) => this.parseKlineRow(symbol, timeframe, row))
      .filter((candle) => candle.closeTime <= now)
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-limit);
  }

  private parseKlineRow(symbol: string, timeframe: Timeframe, row: unknown): Candle {
    if (!Array.isArray(row) || row.length < 7) {
      throw new Error(`Invalid Bybit kline row for ${symbol}.`);
    }

    const openTime = Number(row[0]);
    const durationMs = timeframeToMs(timeframe);

    return {
      symbol,
      interval: timeframe,
      openTime,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      closeTime: openTime + durationMs - 1,
      quoteVolume: Number(row[6])
    };
  }
}

function toBybitInterval(timeframe: Timeframe): string {
  if (timeframe === "1h") return "60";
  if (timeframe === "4h") return "240";
  return "D";
}

interface CoinGeckoGlobalResponse {
  data?: {
    total_market_cap?: Record<string, number>;
    market_cap_percentage?: Record<string, number>;
    market_cap_change_percentage_24h_usd?: number;
    updated_at?: number;
  };
}

interface CoinGeckoMarketChartResponse {
  prices?: unknown[];
  market_caps?: unknown[];
  total_volumes?: unknown[];
}

interface ChartPoint {
  timestamp: number;
  value: number;
}

export class CoinGeckoProvider {
  private readonly baseUrl: string;
  private readonly demoApiKey: string | undefined;
  private readonly stablecoinSymbols: string[];

  constructor(config: BotConfig) {
    this.baseUrl = config.providers.coingeckoBaseUrl.replace(/\/$/, "");
    this.demoApiKey = process.env.COINGECKO_DEMO_API_KEY?.trim() || undefined;
    this.stablecoinSymbols = config.stablecoinDominanceSymbols.map((symbol) => symbol.toLowerCase());
  }

  async fetchMarketChartCandles(coinId: string, symbol: string, timeframe: Timeframe, limit: number): Promise<Candle[]> {
    const params = new URLSearchParams({
      vs_currency: "usd",
      days: String(marketChartDays(timeframe, limit)),
      interval: marketChartInterval(timeframe),
      precision: "full"
    });
    const headers = this.headers();
    const url = `${this.baseUrl}/coins/${encodeURIComponent(coinId)}/market_chart?${params.toString()}`;
    const response = await safeFetchJson<CoinGeckoMarketChartResponse>(url, headers, 20000);
    const prices = parseChartPoints(response.prices);
    const volumes = parseChartPoints(response.total_volumes);
    const candles = buildCandlesFromMarketChart(symbol, timeframe, prices, volumes);

    if (candles.length === 0) {
      throw new Error(`CoinGecko market_chart returned no closed candles for ${coinId} ${timeframe}.`);
    }

    return candles.slice(-limit);
  }

  async fetchGlobalSnapshot(): Promise<GlobalSnapshot> {
    try {
      const response = await safeFetchJson<CoinGeckoGlobalResponse>(`${this.baseUrl}/global`, this.headers(), 15000);
      const data = response.data;
      if (!data) throw new Error("CoinGecko global response was missing data.");

      const totalMarketCapUsd = numberOrNull(data.total_market_cap?.usd);
      const percentages = data.market_cap_percentage ?? {};
      const stablecoinDominancePct = this.stablecoinSymbols.reduce((sum, symbol) => {
        const value = numberOrNull(percentages[symbol]);
        return value === null ? sum : sum + value;
      }, 0);

      return {
        timestamp: data.updated_at ? new Date(data.updated_at * 1000).toISOString() : nowIso(),
        totalMarketCapUsd,
        totalMarketCapChange24hPct: numberOrNull(data.market_cap_change_percentage_24h_usd),
        btcDominancePct: numberOrNull(percentages.btc),
        ethDominancePct: numberOrNull(percentages.eth),
        solDominancePct: numberOrNull(percentages.sol),
        stablecoinDominancePct: stablecoinDominancePct > 0 ? round(stablecoinDominancePct, 4) : null,
        rawSource: "coingecko"
      };
    } catch {
      return {
        timestamp: nowIso(),
        totalMarketCapUsd: null,
        totalMarketCapChange24hPct: null,
        btcDominancePct: null,
        ethDominancePct: null,
        solDominancePct: null,
        stablecoinDominancePct: null,
        rawSource: "unavailable"
      };
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.demoApiKey) headers["x-cg-demo-api-key"] = this.demoApiKey;
    return headers;
  }
}

function marketChartDays(timeframe: Timeframe, limit: number): number {
  if (timeframe === "1h") return Math.min(Math.max(Math.ceil(limit / 24) + 2, 1), 100);
  if (timeframe === "4h") return Math.min(Math.max(Math.ceil((limit * 4) / 24) + 2, 1), 100);
  return Math.max(limit + 5, 1);
}

function marketChartInterval(timeframe: Timeframe): "hourly" | "daily" {
  return timeframe === "1d" ? "daily" : "hourly";
}

function buildCandlesFromMarketChart(symbol: string, timeframe: Timeframe, prices: ChartPoint[], volumes: ChartPoint[]): Candle[] {
  const durationMs = timeframeToMs(timeframe);
  const now = Date.now();
  const priceBuckets = new Map<number, ChartPoint[]>();
  const volumeBuckets = new Map<number, ChartPoint[]>();

  for (const point of prices) {
    const bucketStart = bucketStartMs(point.timestamp, durationMs);
    const bucket = priceBuckets.get(bucketStart) ?? [];
    bucket.push(point);
    priceBuckets.set(bucketStart, bucket);
  }

  for (const point of volumes) {
    const bucketStart = bucketStartMs(point.timestamp, durationMs);
    const bucket = volumeBuckets.get(bucketStart) ?? [];
    bucket.push(point);
    volumeBuckets.set(bucketStart, bucket);
  }

  const candles: Candle[] = [];
  for (const [openTime, bucket] of priceBuckets.entries()) {
    const closeTime = openTime + durationMs - 1;
    if (closeTime > now) continue;

    const sortedPrices = bucket.sort((a, b) => a.timestamp - b.timestamp);
    const priceValues = sortedPrices.map((point) => point.value).filter((value) => Number.isFinite(value));
    if (priceValues.length === 0) continue;

    const sortedVolumes = (volumeBuckets.get(openTime) ?? []).sort((a, b) => a.timestamp - b.timestamp);
    const volume = sortedVolumes.length > 0 ? sortedVolumes[sortedVolumes.length - 1].value : 0;

    candles.push({
      symbol,
      interval: timeframe,
      openTime,
      closeTime,
      open: priceValues[0],
      high: Math.max(...priceValues),
      low: Math.min(...priceValues),
      close: priceValues[priceValues.length - 1],
      volume: Number.isFinite(volume) ? volume : 0,
      quoteVolume: Number.isFinite(volume) ? volume : 0
    });
  }

  return candles.sort((a, b) => a.openTime - b.openTime);
}

function parseChartPoints(rows: unknown): ChartPoint[] {
  if (!Array.isArray(rows)) return [];

  const points: ChartPoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const timestamp = Number(row[0]);
    const value = Number(row[1]);
    if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
    points.push({ timestamp, value });
  }

  return points.sort((a, b) => a.timestamp - b.timestamp);
}

function bucketStartMs(timestamp: number, durationMs: number): number {
  return Math.floor(timestamp / durationMs) * durationMs;
}

function timeframeToMs(timeframe: Timeframe): number {
  if (timeframe === "1h") return 60 * 60 * 1000;
  if (timeframe === "4h") return 4 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}