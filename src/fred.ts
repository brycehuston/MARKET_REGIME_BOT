import {
  MacroContext,
  MacroLiquidityContext,
  MacroLiquidityTrend,
  MacroTrend,
  EquityRiskState,
  VolRegime
} from "./types";
import { round } from "./utils";

export interface FredContextSnapshot {
  macroContext: MacroContext;
  macroLiquidityContext: MacroLiquidityContext;
}

export interface FredContextProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  ingestTimestamp?: () => string;
}

export interface FredSeriesPoint {
  date: string;
  value: number;
}

interface FredSeriesPair {
  latest: FredSeriesPoint | null;
  prior: FredSeriesPoint | null;
  error: string | null;
}

interface FredObservationsResponse {
  observations?: unknown[];
}

const FRED_OBSERVATIONS_URL = "https://api.stlouisfed.org/fred/series/observations";
const FRED_TIMEOUT_MS = 10000;
const FRED_OBSERVATION_LIMIT = 30;
const TREND_EPSILON = 1e-9;

const SERIES = {
  tenYearYield: "DGS10",
  twoYearYield: "DGS2",
  tenYearRealYield: "DFII10",
  vix: "VIXCLS",
  highYieldSpread: "BAMLH0A0HYM2",
  dollarProxy: "DTWEXBGS",
  walcl: "WALCL",
  rrp: "RRPONTSYD",
  tga: "WTREGEN"
} as const;

type SeriesKey = keyof typeof SERIES;

export class FredContextProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly ingestTimestamp: () => string;

  constructor(options: FredContextProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.FRED_API_KEY?.trim() ?? "";
    this.baseUrl = options.baseUrl ?? FRED_OBSERVATIONS_URL;
    this.timeoutMs = options.timeoutMs ?? FRED_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ingestTimestamp = options.ingestTimestamp ?? (() => new Date().toISOString());
  }

  async getContext(): Promise<FredContextSnapshot> {
    const ingestTimestamp = this.ingestTimestamp();

    if (!this.apiKey) {
      return buildSnapshot({
        enabled: false,
        ingestTimestamp,
        results: emptyResults(),
        errors: ["FRED_API_KEY missing; macro context disabled."]
      });
    }

    const entries = await Promise.all(
      (Object.entries(SERIES) as Array<[SeriesKey, string]>).map(async ([key, seriesId]) => {
        const result = await this.fetchSeriesPair(seriesId);
        return [key, result] as const;
      })
    );

    const results = Object.fromEntries(entries) as Record<SeriesKey, FredSeriesPair>;
    const errors = entries
      .map(([key, result]) => result.error ? `${SERIES[key]}: ${result.error}` : null)
      .filter((value): value is string => value !== null);
    const hasUsableValue = entries.some(([, result]) => result.latest !== null);

    return buildSnapshot({
      enabled: hasUsableValue,
      ingestTimestamp,
      results,
      errors
    });
  }

  private async fetchSeriesPair(seriesId: string): Promise<FredSeriesPair> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", String(FRED_OBSERVATION_LIMIT));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), { method: "GET", signal: controller.signal });
      if (!response.ok) {
        return { latest: null, prior: null, error: `HTTP ${response.status} ${response.statusText}`.trim() };
      }

      const raw = await response.json() as FredObservationsResponse;
      const points = parseFredObservations(raw);
      if (points.length === 0) return { latest: null, prior: null, error: "no valid observations" };
      return { latest: points[0] ?? null, prior: points[1] ?? null, error: null };
    } catch (error) {
      return { latest: null, prior: null, error: sanitizeFredError(error) };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function parseFredObservations(raw: unknown): FredSeriesPoint[] {
  if (!isRecord(raw) || !Array.isArray(raw.observations)) return [];

  return raw.observations
    .map((row): FredSeriesPoint | null => {
      if (!isRecord(row) || typeof row.date !== "string") return null;
      const value = readFredNumber(row.value);
      return value === null ? null : { date: row.date, value };
    })
    .filter((point): point is FredSeriesPoint => point !== null);
}

export function classifyMacroTrend(latest: number | null, prior: number | null, epsilon = TREND_EPSILON): MacroTrend {
  if (!isFiniteNumber(latest) || !isFiniteNumber(prior)) return "UNKNOWN";
  if (latest > prior + epsilon) return "UP";
  if (latest < prior - epsilon) return "DOWN";
  return "FLAT";
}

function buildSnapshot(input: {
  enabled: boolean;
  ingestTimestamp: string;
  results: Record<SeriesKey, FredSeriesPair>;
  errors: string[];
}): FredContextSnapshot {
  const sourceTimestamp = latestSourceDate(input.results);
  const fredError = input.errors.length > 0 ? input.errors.join(" | ").slice(0, 500) : null;
  const netLiquidity = calculateNetLiquidity(input.results.walcl.latest, input.results.rrp.latest, input.results.tga.latest);
  const priorNetLiquidity = calculateNetLiquidity(input.results.walcl.prior, input.results.rrp.prior, input.results.tga.prior);

  return {
    macroContext: {
      dxyTrend: pairTrend(input.results.dollarProxy),
      tenYearYieldTrend: pairTrend(input.results.tenYearYield),
      realYieldTrend: pairTrend(input.results.tenYearRealYield),
      equityRiskState: classifyEquityRiskState(valueOf(input.results.vix.latest), valueOf(input.results.highYieldSpread.latest)),
      volRegime: classifyVolRegime(valueOf(input.results.vix.latest)),
      tenYearYield: roundedValue(input.results.tenYearYield.latest),
      twoYearYield: roundedValue(input.results.twoYearYield.latest),
      tenYearRealYield: roundedValue(input.results.tenYearRealYield.latest),
      vix: roundedValue(input.results.vix.latest),
      highYieldSpread: roundedValue(input.results.highYieldSpread.latest),
      dollarProxy: roundedValue(input.results.dollarProxy.latest),
      fredEnabled: input.enabled,
      fredSourceTimestamp: sourceTimestamp,
      fredIngestTimestamp: input.ingestTimestamp,
      fredSeriesDates: seriesDates(input.results),
      fredError,
      backtestDataStatus: "REAL_TIME"
    },
    macroLiquidityContext: {
      walcl: roundedValue(input.results.walcl.latest),
      walclPrior: roundedValue(input.results.walcl.prior),
      rrp: roundedValue(input.results.rrp.latest),
      rrpPrior: roundedValue(input.results.rrp.prior),
      tga: roundedValue(input.results.tga.latest),
      tgaFred: roundedValue(input.results.tga.latest),
      tgaFredPrior: roundedValue(input.results.tga.prior),
      tgaFiscalData: null,
      tgaFiscalDataPrior: null,
      tgaFiscalDataTrend: "UNKNOWN",
      tgaFiscalDataRecordDate: null,
      tgaFiscalDataPriorRecordDate: null,
      netLiquidityProxy: netLiquidity === null ? null : round(netLiquidity, 2),
      netLiquidityTrend: classifyNetLiquidityTrend(netLiquidity, priorNetLiquidity),
      liquiditySourceTimestamp: latestSourceDate({ walcl: input.results.walcl, rrp: input.results.rrp, tga: input.results.tga }),
      treasuryEnabled: false,
      treasurySourceTimestamp: null,
      treasuryIngestTimestamp: null,
      treasuryError: null,
      treasuryBacktestDataStatus: "REAL_TIME",
      treasurySeriesDates: {},
      tgaPreferredSource: roundedValue(input.results.tga.latest) === null ? "NONE" : "FRED_WTREGEN",
      liquidityUnits: "USD_MILLIONS",
      netLiquidityUnitWarning: null
    }
  };
}

function emptyResults(): Record<SeriesKey, FredSeriesPair> {
  return Object.fromEntries(
    Object.keys(SERIES).map((key) => [key, { latest: null, prior: null, error: null }])
  ) as Record<SeriesKey, FredSeriesPair>;
}

function pairTrend(pair: FredSeriesPair): MacroTrend {
  return classifyMacroTrend(valueOf(pair.latest), valueOf(pair.prior));
}

function classifyVolRegime(vix: number | null): VolRegime {
  if (!isFiniteNumber(vix)) return "UNKNOWN";
  if (vix >= 30) return "STRESSED";
  if (vix < 15) return "LOW";
  return "ELEVATED";
}

function classifyEquityRiskState(vix: number | null, highYieldSpread: number | null): EquityRiskState {
  if (!isFiniteNumber(vix) && !isFiniteNumber(highYieldSpread)) return "UNKNOWN";
  if ((vix ?? 0) >= 30 || (highYieldSpread ?? 0) >= 5) return "RISK_OFF";
  if ((vix === null || vix <= 20) && (highYieldSpread === null || highYieldSpread <= 4)) return "RISK_ON";
  return "NEUTRAL";
}

function classifyNetLiquidityTrend(latest: number | null, prior: number | null): MacroLiquidityTrend {
  const trend = classifyMacroTrend(latest, prior);
  if (trend === "UP") return "EXPANDING";
  if (trend === "DOWN") return "CONTRACTING";
  if (trend === "FLAT") return "FLAT";
  return "UNKNOWN";
}

function calculateNetLiquidity(walcl: FredSeriesPoint | null, rrp: FredSeriesPoint | null, tga: FredSeriesPoint | null): number | null {
  const walclValue = valueOf(walcl);
  const rrpValue = valueOf(rrp);
  const tgaValue = valueOf(tga);
  if (!isFiniteNumber(walclValue) || !isFiniteNumber(rrpValue) || !isFiniteNumber(tgaValue)) return null;
  return walclValue - rrpValue - tgaValue;
}

function seriesDates(results: Record<SeriesKey, FredSeriesPair>): Record<string, string | null> {
  return Object.fromEntries(
    (Object.entries(SERIES) as Array<[SeriesKey, string]>).map(([key, seriesId]) => [seriesId, results[key].latest?.date ?? null])
  );
}

function latestSourceDate(results: Partial<Record<SeriesKey, FredSeriesPair>>): string | null {
  const dates = Object.values(results)
    .map((result) => result?.latest?.date ?? null)
    .filter((date): date is string => Boolean(date))
    .sort();
  return dates[dates.length - 1] ?? null;
}

function roundedValue(point: FredSeriesPoint | null): number | null {
  const value = valueOf(point);
  return value === null ? null : round(value, 4);
}

function valueOf(point: FredSeriesPoint | null): number | null {
  return point?.value ?? null;
}

function readFredNumber(value: unknown): number | null {
  if (value === "." || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeFredError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/api_key=([^&\s]+)/gi, "api_key=[redacted]")
    .replace(/FRED_API_KEY/gi, "[redacted_env]")
    .slice(0, 250);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}