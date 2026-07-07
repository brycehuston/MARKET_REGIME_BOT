import { BacktestDataStatus, MacroLiquidityContext, MacroLiquidityTrend, TgaSource } from "./types";
import { round } from "./utils";

export interface TreasuryContextSnapshot {
  treasuryEnabled: boolean;
  treasurySourceTimestamp: string | null;
  treasuryIngestTimestamp: string | null;
  treasuryError: string | null;
  treasuryBacktestDataStatus: BacktestDataStatus;
  treasurySeriesDates: Record<string, string | null>;
  tgaFiscalData: number | null;
  tgaFiscalDataPrior: number | null;
  tgaFiscalDataTrend: MacroLiquidityTrend;
  tgaFiscalDataRecordDate: string | null;
  tgaFiscalDataPriorRecordDate: string | null;
  liquidityUnits: "USD_MILLIONS" | "UNKNOWN";
  netLiquidityUnitWarning: string | null;
}

export interface TreasuryFiscalDataProviderOptions {
  baseUrl?: string;
  timeoutMs?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  ingestTimestamp?: () => string;
}

export interface TreasuryOperatingCashBalancePoint {
  recordDate: string;
  value: number;
}

interface TreasuryFiscalDataResponse {
  data?: unknown[];
}

const TREASURY_BASE_URL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";
const OPERATING_CASH_BALANCE_PATH = "/v1/accounting/dts/operating_cash_balance";
const TREASURY_TIMEOUT_MS = 10000;
const TREASURY_PAGE_SIZE = 100;
const TREND_EPSILON = 1e-9;
const TREASURY_FIELDS = [
  "record_date",
  "account_type",
  "close_today_bal",
  "open_today_bal",
  "table_nbr",
  "src_line_nbr",
  "table_nm",
  "sub_table_name"
];

export class TreasuryFiscalDataProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly ingestTimestamp: () => string;

  constructor(options: TreasuryFiscalDataProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? TREASURY_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? TREASURY_TIMEOUT_MS;
    this.pageSize = options.pageSize ?? TREASURY_PAGE_SIZE;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.ingestTimestamp = options.ingestTimestamp ?? (() => new Date().toISOString());
  }

  async getContext(): Promise<TreasuryContextSnapshot> {
    const ingestTimestamp = this.ingestTimestamp();

    try {
      const response = await this.fetchRows();
      const points = extractOperatingCashBalancePoints(response);
      const latest = points[0] ?? null;
      const prior = points[1] ?? null;
      const error = points.length === 0 ? "Treasury FiscalData returned no valid operating cash balance rows." : null;

      return buildTreasurySnapshot({
        ingestTimestamp,
        latest,
        prior,
        error,
        unitWarning: null
      });
    } catch (error) {
      return buildTreasurySnapshot({
        ingestTimestamp,
        latest: null,
        prior: null,
        error: sanitizeTreasuryError(error),
        unitWarning: null
      });
    }
  }

  private async fetchRows(): Promise<TreasuryFiscalDataResponse> {
    const url = new URL(`${trimTrailingSlash(this.baseUrl)}${OPERATING_CASH_BALANCE_PATH}`);
    url.searchParams.set("sort", "-record_date");
    url.searchParams.set("page[size]", String(this.pageSize));
    url.searchParams.set("fields", TREASURY_FIELDS.join(","));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), { method: "GET", signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
      }
      return await response.json() as TreasuryFiscalDataResponse;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function fetchTreasuryContext(options: TreasuryFiscalDataProviderOptions = {}): Promise<TreasuryContextSnapshot> {
  return new TreasuryFiscalDataProvider(options).getContext();
}

export function parseTreasuryOperatingCashBalanceRows(raw: unknown): TreasuryOperatingCashBalancePoint[] {
  return extractOperatingCashBalancePoints(raw);
}

export function extractOperatingCashBalancePoints(raw: unknown): TreasuryOperatingCashBalancePoint[] {
  if (!isRecord(raw) || !Array.isArray(raw.data)) return [];

  return raw.data
    .map((row): TreasuryOperatingCashBalancePoint | null => {
      if (!isRecord(row) || !isOperatingCashBalanceRow(row)) return null;
      const recordDate = typeof row.record_date === "string" ? row.record_date : null;
      if (!recordDate || !isValidRecordDate(recordDate)) return null;
      const value = parseTreasuryNumber(row.close_today_bal);
      if (value === null) return null;
      return { recordDate, value };
    })
    .filter((point): point is TreasuryOperatingCashBalancePoint => point !== null)
    .sort((left, right) => right.recordDate.localeCompare(left.recordDate));
}

export function classifyTreasuryTrend(latest: number | null, prior: number | null, epsilon = TREND_EPSILON): MacroLiquidityTrend {
  if (!isFiniteNumber(latest) || !isFiniteNumber(prior)) return "UNKNOWN";
  if (latest > prior + epsilon) return "EXPANDING";
  if (latest < prior - epsilon) return "CONTRACTING";
  return "FLAT";
}

export function mergeTreasuryLiquidityContext(
  liquidity: MacroLiquidityContext,
  treasury: TreasuryContextSnapshot
): MacroLiquidityContext {
  const treasuryUsable = isFiniteNumber(treasury.tgaFiscalData) && treasury.liquidityUnits === "USD_MILLIONS";
  const fredUsable = isFiniteNumber(liquidity.tgaFred) && liquidity.liquidityUnits === "USD_MILLIONS";
  const selectedSource: TgaSource = treasuryUsable ? "TREASURY_FISCALDATA" : fredUsable ? "FRED_WTREGEN" : "NONE";
  const selectedTga = selectedSource === "TREASURY_FISCALDATA" ? treasury.tgaFiscalData : selectedSource === "FRED_WTREGEN" ? liquidity.tgaFred : null;
  const selectedPriorTga = selectedSource === "TREASURY_FISCALDATA" ? treasury.tgaFiscalDataPrior : selectedSource === "FRED_WTREGEN" ? liquidity.tgaFredPrior : null;
  const unitWarning = treasury.netLiquidityUnitWarning ?? liquidity.netLiquidityUnitWarning;
  const latestNetLiquidity = calculateNetLiquidity(liquidity.walcl, liquidity.rrp, selectedTga, unitWarning);
  const priorNetLiquidity = calculateNetLiquidity(liquidity.walclPrior, liquidity.rrpPrior, selectedPriorTga, unitWarning);
  const liquiditySourceTimestamp = latestDate([
    liquidity.liquiditySourceTimestamp,
    selectedSource === "TREASURY_FISCALDATA" ? treasury.tgaFiscalDataRecordDate : null
  ]);

  return {
    ...liquidity,
    tga: selectedTga === null ? null : round(selectedTga, 4),
    tgaFiscalData: treasury.tgaFiscalData,
    tgaFiscalDataPrior: treasury.tgaFiscalDataPrior,
    tgaFiscalDataTrend: treasury.tgaFiscalDataTrend,
    tgaFiscalDataRecordDate: treasury.tgaFiscalDataRecordDate,
    tgaFiscalDataPriorRecordDate: treasury.tgaFiscalDataPriorRecordDate,
    netLiquidityProxy: latestNetLiquidity === null ? null : round(latestNetLiquidity, 2),
    netLiquidityTrend: classifyTreasuryTrend(latestNetLiquidity, priorNetLiquidity),
    liquiditySourceTimestamp,
    treasuryEnabled: treasury.treasuryEnabled,
    treasurySourceTimestamp: treasury.treasurySourceTimestamp,
    treasuryIngestTimestamp: treasury.treasuryIngestTimestamp,
    treasuryError: treasury.treasuryError,
    treasuryBacktestDataStatus: treasury.treasuryBacktestDataStatus,
    treasurySeriesDates: treasury.treasurySeriesDates,
    tgaPreferredSource: selectedSource,
    liquidityUnits: unitWarning ? "UNKNOWN" : "USD_MILLIONS",
    netLiquidityUnitWarning: unitWarning
  };
}

export function buildTreasurySnapshot(input: {
  ingestTimestamp: string;
  latest: TreasuryOperatingCashBalancePoint | null;
  prior: TreasuryOperatingCashBalancePoint | null;
  error: string | null;
  unitWarning: string | null;
}): TreasuryContextSnapshot {
  const latestValue = roundedValue(input.latest?.value ?? null);
  const priorValue = roundedValue(input.prior?.value ?? null);
  const sourceTimestamp = input.latest?.recordDate ?? null;
  const unitWarning = input.unitWarning;

  return {
    treasuryEnabled: latestValue !== null && unitWarning === null,
    treasurySourceTimestamp: sourceTimestamp,
    treasuryIngestTimestamp: input.ingestTimestamp,
    treasuryError: input.error,
    treasuryBacktestDataStatus: "REAL_TIME",
    treasurySeriesDates: { operating_cash_balance: sourceTimestamp },
    tgaFiscalData: latestValue,
    tgaFiscalDataPrior: priorValue,
    tgaFiscalDataTrend: classifyTreasuryTrend(latestValue, priorValue),
    tgaFiscalDataRecordDate: sourceTimestamp,
    tgaFiscalDataPriorRecordDate: input.prior?.recordDate ?? null,
    liquidityUnits: unitWarning === null ? "USD_MILLIONS" : "UNKNOWN",
    netLiquidityUnitWarning: unitWarning
  };
}

function calculateNetLiquidity(
  walcl: number | null,
  rrp: number | null,
  tga: number | null,
  unitWarning: string | null
): number | null {
  if (unitWarning) return null;
  if (!isFiniteNumber(walcl) || !isFiniteNumber(rrp) || !isFiniteNumber(tga)) return null;
  return walcl - rrp - tga;
}

function isOperatingCashBalanceRow(row: Record<string, unknown>): boolean {
  const joined = [row.account_type, row.table_nbr, row.src_line_nbr, row.table_nm, row.sub_table_name]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  if (joined.includes("treasury general account")) return true;
  if (joined.includes("operating cash balance")) return true;
  if (joined.includes("federal reserve account") && joined.includes("account")) return true;
  return false;
}

function parseTreasuryNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/,/g, "");
  if (!text || text === "N/A") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeTreasuryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/api_key=([^&\s]+)/gi, "api_key=[redacted]").slice(0, 250);
}

function roundedValue(value: number | null): number | null {
  return value === null ? null : round(value, 4);
}

function latestDate(values: Array<string | null | undefined>): string | null {
  const dates = values.filter((value): value is string => Boolean(value)).sort();
  return dates[dates.length - 1] ?? null;
}

function trimTrailingSlash(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function isValidRecordDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}