import { BotConfig, DefiActivityStatus, DefiConfirmation, DefiLiquidityStatus } from "./types";
import { pctChange, round, safeFetchJson } from "./utils";

type MetricDirection = "improving" | "mixed" | "weakening";

interface Point {
  timestamp: number;
  value: number;
}

const ENDPOINTS = {
  solanaTvl: "/v2/historicalChainTvl/Solana",
  ethereumTvl: "/v2/historicalChainTvl/Ethereum",
  chains: "/v2/chains",
  stablecoinAll: "/stablecoincharts/all",
  stablecoinSolana: "/stablecoincharts/Solana",
  stablecoinChains: "/stablecoinchains",
  dexAll: "/overview/dexs",
  dexSolana: "/overview/dexs/Solana",
  dexEthereum: "/overview/dexs/Ethereum",
  feesAll: "/overview/fees",
  feesSolana: "/overview/fees/Solana",
  feesEthereum: "/overview/fees/Ethereum"
} as const;

type EndpointKey = keyof typeof ENDPOINTS;

type EndpointResults = Partial<Record<EndpointKey, unknown>>;

export function unavailableDefiConfirmation(reason = "DefiLlama confirmation unavailable."): DefiConfirmation {
  return {
    status: "Unavailable",
    solanaActivity: "Unavailable",
    liquidity: "Unavailable",
    reason,
    components: {}
  };
}

export class DefiLlamaProvider {
  private readonly enabled: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: BotConfig) {
    this.enabled = config.defiLlama.confirmationEnabled;
    this.baseUrl = config.defiLlama.baseUrl.replace(/\/$/, "");
    this.timeoutMs = config.defiLlama.timeoutMs;
  }

  async fetchConfirmation(): Promise<DefiConfirmation> {
    if (!this.enabled) {
      return unavailableDefiConfirmation("DefiLlama confirmation disabled by config.");
    }

    try {
      const results = await this.fetchAllEndpoints();

      const solanaTvl7dChangePct = parseHistoricalTvl7dChange(results.solanaTvl) ?? parseChainOverviewChange(results.chains, "Solana");
      const ethereumTvl7dChangePct = parseHistoricalTvl7dChange(results.ethereumTvl) ?? parseChainOverviewChange(results.chains, "Ethereum");
      const solanaDexVolume7dChangePct = parseOverview7dChange(results.dexSolana);
      const ethereumDexVolume7dChangePct = parseOverview7dChange(results.dexEthereum);
      const solanaFees7dChangePct = parseOverview7dChange(results.feesSolana);
      const stablecoinSupply7dChangePct = parseStablecoinSupply7dChange(results.stablecoinAll);

      const usableMetricCount = [
        solanaTvl7dChangePct,
        ethereumTvl7dChangePct,
        solanaDexVolume7dChangePct,
        ethereumDexVolume7dChangePct,
        solanaFees7dChangePct,
        stablecoinSupply7dChangePct
      ].filter(isFiniteNumber).length;

      if (usableMetricCount === 0) {
        return unavailableDefiConfirmation("DefiLlama data unavailable or schema unexpected.");
      }

      const solanaActivity = classifySolanaActivity([
        solanaTvl7dChangePct,
        solanaDexVolume7dChangePct,
        solanaFees7dChangePct
      ]);
      const liquidity = classifyLiquidity(stablecoinSupply7dChangePct);
      const status = classifyOverallConfirmation(solanaActivity, liquidity);

      return {
        status,
        solanaActivity,
        liquidity,
        reason: buildReason(status, solanaActivity, liquidity),
        components: {
          solanaTvl7dChangePct: roundOptional(solanaTvl7dChangePct),
          ethereumTvl7dChangePct: roundOptional(ethereumTvl7dChangePct),
          solanaDexVolumeTrend: formatTrend(solanaDexVolume7dChangePct),
          ethereumDexVolumeTrend: formatTrend(ethereumDexVolume7dChangePct),
          solanaFeesTrend: formatTrend(solanaFees7dChangePct),
          stablecoinSupplyTrend: formatTrend(stablecoinSupply7dChangePct)
        }
      };
    } catch {
      return unavailableDefiConfirmation("DefiLlama confirmation failed safely.");
    }
  }

  private async fetchAllEndpoints(): Promise<EndpointResults> {
    const entries = await Promise.all(
      (Object.entries(ENDPOINTS) as Array<[EndpointKey, string]>).map(async ([key, endpoint]) => {
        try {
          return [key, await safeFetchJson<unknown>(`${this.baseUrl}${endpoint}`, {}, this.timeoutMs)] as const;
        } catch {
          return [key, null] as const;
        }
      })
    );

    return Object.fromEntries(entries.filter(([, value]) => value !== null)) as EndpointResults;
  }
}

function parseHistoricalTvl7dChange(value: unknown): number | null {
  const points = parseObjectPoints(value, ["tvl"]);
  return pctChangeFromDailyPoints(points, 7);
}

function parseChainOverviewChange(value: unknown, chainName: string): number | null {
  if (!Array.isArray(value)) return null;

  const row = value.find((item) => {
    if (!isRecord(item)) return false;
    const name = typeof item.name === "string" ? item.name : typeof item.chain === "string" ? item.chain : "";
    return name.toLowerCase() === chainName.toLowerCase();
  });

  if (!isRecord(row)) return null;
  return readNumber(row.change_7d);
}

function parseOverview7dChange(value: unknown): number | null {
  if (!isRecord(value)) return null;

  const totalDataChart = value.totalDataChart;
  if (Array.isArray(totalDataChart)) {
    const points = parseTuplePoints(totalDataChart);
    return pctChangeFromWindowSums(points, 7);
  }

  return null;
}

function parseStablecoinSupply7dChange(value: unknown): number | null {
  const points = parseObjectPoints(value, [
    "totalCirculatingUSD.peggedUSD",
    "totalCirculating.peggedUSD",
    "total.peggedUSD",
    "totalCirculatingUSD",
    "totalCirculating"
  ]);
  return pctChangeFromDailyPoints(points, 7);
}

function classifySolanaActivity(metrics: Array<number | null>): DefiActivityStatus {
  const directions = metrics.map(classifyMetric).filter((value): value is MetricDirection => value !== null);
  if (directions.length === 0) return "Unavailable";

  const improving = directions.filter((value) => value === "improving").length;
  const weakening = directions.filter((value) => value === "weakening").length;

  if (improving >= 1) return "Improving";
  if (weakening >= Math.max(2, directions.length)) return "Weak";
  if (weakening >= 2) return "Weak";
  return "Mixed";
}

function classifyLiquidity(changePct: number | null): DefiLiquidityStatus {
  const direction = classifyMetric(changePct);
  if (direction === null) return "Unavailable";
  if (direction === "improving") return "Improving";
  if (direction === "weakening") return "Tightening";
  return "Mixed";
}

function classifyOverallConfirmation(solanaActivity: DefiActivityStatus, liquidity: DefiLiquidityStatus): DefiConfirmation["status"] {
  if (solanaActivity === "Unavailable" && liquidity === "Unavailable") return "Unavailable";
  if (solanaActivity === "Improving" && liquidity !== "Tightening") return "Strong";
  if (solanaActivity === "Weak" && liquidity !== "Improving") return "Weak";
  if (liquidity === "Tightening" && solanaActivity !== "Improving") return "Weak";
  return "Mixed";
}

function classifyMetric(changePct: number | null): MetricDirection | null {
  if (!isFiniteNumber(changePct)) return null;
  if (changePct > 3) return "improving";
  if (changePct < -3) return "weakening";
  return "mixed";
}

function buildReason(status: DefiConfirmation["status"], solanaActivity: DefiActivityStatus, liquidity: DefiLiquidityStatus): string {
  if (status === "Unavailable") return "DefiLlama confirmation unavailable.";
  if (status === "Strong") return "Solana activity is improving and liquidity is not tightening.";
  if (status === "Weak") return `DeFi activity/liquidity is not confirming risk. Solana activity: ${solanaActivity}. Liquidity: ${liquidity}.`;
  return `DeFi confirmation is mixed. Solana activity: ${solanaActivity}. Liquidity: ${liquidity}.`;
}

function parseObjectPoints(value: unknown, valuePaths: string[]): Point[] {
  if (!Array.isArray(value)) return [];

  const points: Point[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;

    const timestamp = readTimestamp(row.date ?? row.timestamp);
    const pointValue = firstFinite(valuePaths.map((path) => readNestedNumber(row, path)));
    if (timestamp === null || pointValue === null) continue;

    points.push({ timestamp, value: pointValue });
  }

  return sortPoints(points);
}

function parseTuplePoints(value: unknown[]): Point[] {
  const points: Point[] = [];

  for (const row of value) {
    if (!Array.isArray(row) || row.length < 2) continue;

    const timestamp = readTimestamp(row[0]);
    const pointValue = readNumber(row[1]);
    if (timestamp === null || pointValue === null) continue;

    points.push({ timestamp, value: pointValue });
  }

  return sortPoints(points);
}

function pctChangeFromDailyPoints(points: Point[], daysBack: number): number | null {
  if (points.length < 2) return null;

  const latest = points[points.length - 1];
  const targetTimestamp = latest.timestamp - daysBack * 24 * 60 * 60;
  const previous = [...points].reverse().find((point) => point.timestamp <= targetTimestamp) ?? points[0];

  return pctChange(latest.value, previous.value);
}

function pctChangeFromWindowSums(points: Point[], windowDays: number): number | null {
  if (points.length >= windowDays * 2) {
    const latestWindow = points.slice(-windowDays);
    const previousWindow = points.slice(-windowDays * 2, -windowDays);
    const latestSum = sum(latestWindow.map((point) => point.value));
    const previousSum = sum(previousWindow.map((point) => point.value));
    return pctChange(latestSum, previousSum);
  }

  return pctChangeFromDailyPoints(points, windowDays);
}

function formatTrend(changePct: number | null): string | undefined {
  if (!isFiniteNumber(changePct)) return undefined;
  const direction = classifyMetric(changePct);
  const label = direction === "improving" ? "Improving" : direction === "weakening" ? "Weakening" : "Mixed";
  const prefix = changePct > 0 ? "+" : "";
  return `${label} (${prefix}${round(changePct, 2)}%)`;
}

function roundOptional(value: number | null): number | undefined {
  return isFiniteNumber(value) ? round(value, 2) : undefined;
}

function readNestedNumber(row: Record<string, unknown>, path: string): number | null {
  const parts = path.split(".");
  let current: unknown = row;

  for (const part of parts) {
    if (!isRecord(current)) return null;
    current = current[part];
  }

  return readNumber(current);
}

function readTimestamp(value: unknown): number | null {
  const parsed = readNumber(value);
  if (parsed === null) return null;
  return parsed > 10_000_000_000 ? Math.floor(parsed / 1000) : parsed;
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstFinite(values: Array<number | null>): number | null {
  return values.find(isFiniteNumber) ?? null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function sortPoints(points: Point[]): Point[] {
  return points.sort((a, b) => a.timestamp - b.timestamp);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}