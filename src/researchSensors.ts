import { BinanceProvider, BybitProvider, CoinGeckoProvider } from "./providers";
import { FredContextProvider } from "./fred";
import { DefiLlamaProvider } from "./defillama";
import { nowIso } from "./utils";

export interface ResearchBreadth {
  status: "OK" | "Unavailable";
  universeSize: number | null;
  validAssetCount: number | null;
  pctPositive1h: number | null;
  pctPositive4h: number | null;
  pctPositive24h: number | null;
  medianReturn1h: number | null;
  medianReturn4h: number | null;
  medianReturn24h: number | null;
  advancingCount: number | null;
  decliningCount: number | null;
  pctOutperformingBtc1h: number | null;
  pctOutperformingBtc4h: number | null;
  pctOutperformingBtc24h: number | null;
  breadthState: string | null;
  breadthImpulse: string | null;
  unavailabilityReason: string | null;
}

export interface ResearchLiquidity {
  status: "OK" | "Unavailable";
  bestBidBtc: number | null;
  bestAskBtc: number | null;
  spreadBpsBtc: number | null;
  depthUsdWithin10BpsBtc: number | null;
  depthUsdWithin25BpsBtc: number | null;
  depthUsdWithin50BpsBtc: number | null;
  buyImpactBpsFor10kUsdBtc: number | null;
  sellImpactBpsFor10kUsdBtc: number | null;
  buyImpactBpsFor50kUsdBtc: number | null;
  sellImpactBpsFor50kUsdBtc: number | null;
  orderBookImbalanceBtc: number | null;
  ofiBtc: number | null;
  unavailabilityReason: string | null;
}

export interface ResearchSpotPerpFlow {
  status: "OK" | "Unavailable";
  spotReturn1h: number | null;
  perpReturn1h: number | null;
  spotVolume1h: number | null;
  perpVolume1h: number | null;
  spotVolumeChange: number | null;
  perpVolumeChange: number | null;
  oiChange: number | null;
  funding: number | null;
  spotPerpParticipationState: "SPOT_LED" | "PERP_LED" | "CONFIRMED" | "DIVERGENT" | "UNAVAILABLE" | null;
  unavailabilityReason: string | null;
}

export interface ResearchOptions {
  status: "OK" | "Unavailable";
  btcAtmIv: number | null;
  ethAtmIv: number | null;
  shortTermIvBtc: number | null;
  mediumTermIvBtc: number | null;
  termStructureSlopeBtc: number | null;
  putCallSkewBtc: number | null;
  unavailabilityReason: string | null;
}

export interface ResearchMacroNdx {
  status: "OK" | "Unavailable";
  ndxValue: number | null;
  unavailabilityReason: string | null;
}

export interface ResearchStablecoins {
  status: "OK" | "Unavailable";
  totalSupply: number | null;
  usdtPeg: number | null;
  usdcPeg: number | null;
  unavailabilityReason: string | null;
}

export interface ResearchSensorsSnapshot {
  timestamp: string;
  breadth: ResearchBreadth;
  liquidity: ResearchLiquidity;
  spotPerpFlow: ResearchSpotPerpFlow;
  options: ResearchOptions;
  macroNdx: ResearchMacroNdx;
  stablecoins: ResearchStablecoins;
  errors: string[];
}

export class ResearchSensorsCollector {
  constructor(
    private readonly binance: BinanceProvider,
    private readonly bybit: BybitProvider,
    private readonly coingecko: CoinGeckoProvider,
    private readonly fred: FredContextProvider,
    private readonly defillama: DefiLlamaProvider
  ) {}

  async collect(): Promise<ResearchSensorsSnapshot> {
    const errors: string[] = [];
    const timestamp = nowIso();

    // 1. Breadth
    let breadth: ResearchBreadth = {
      status: "Unavailable", universeSize: null, validAssetCount: null,
      pctPositive1h: null, pctPositive4h: null, pctPositive24h: null,
      medianReturn1h: null, medianReturn4h: null, medianReturn24h: null,
      advancingCount: null, decliningCount: null,
      pctOutperformingBtc1h: null, pctOutperformingBtc4h: null, pctOutperformingBtc24h: null,
      breadthState: null, breadthImpulse: null,
      unavailabilityReason: null
    };
    try {
      const data = await this.coingecko.fetchBreadth();
      if (data && data.length > 0) {
        const nonStables = data.filter(d => d.id !== 'tether' && d.id !== 'usd-coin' && d.id !== 'dai' && d.id !== 'first-digital-usd');
        const advancing = nonStables.filter(d => d.priceChangePercentage24h > 0).length;
        const declining = nonStables.filter(d => d.priceChangePercentage24h < 0).length;

        const btcData = data.find(d => d.id === 'bitcoin');
        const btcReturn24h = btcData ? btcData.priceChangePercentage24h : null;
        const outperformingBtc24h = btcReturn24h !== null ? nonStables.filter(d => d.priceChangePercentage24h > btcReturn24h).length : null;

        const returns24h = nonStables.map(d => d.priceChangePercentage24h).sort((a, b) => a - b);
        const median24h = returns24h.length > 0 ? returns24h[Math.floor(returns24h.length / 2)] : null;

        breadth = {
          status: "OK",
          universeSize: 250, // Top 250 requested
          validAssetCount: nonStables.length,
          pctPositive1h: null, // 1h not provided by current endpoint
          pctPositive4h: null, // 4h not provided by CoinGecko API standard fields
          pctPositive24h: nonStables.length > 0 ? (advancing / nonStables.length) * 100 : null,
          medianReturn1h: null,
          medianReturn4h: null,
          medianReturn24h: median24h,
          advancingCount: advancing,
          decliningCount: declining,
          pctOutperformingBtc1h: null,
          pctOutperformingBtc4h: null,
          pctOutperformingBtc24h: (outperformingBtc24h !== null && nonStables.length > 0) ? (outperformingBtc24h / nonStables.length) * 100 : null,
          breadthState: "Neutral", // Placeholder state logic
          breadthImpulse: "None",
          unavailabilityReason: "1h/4h returns require separate historic endpoints per coin on CoinGecko. Limited by API quota."
        };
      } else {
        breadth.unavailabilityReason = "Empty breadth data from provider";
      }
    } catch (err) {
      breadth.unavailabilityReason = `Breadth error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(breadth.unavailabilityReason);
    }

    // 2. Liquidity (Order Books)
    let liquidity: ResearchLiquidity = {
      status: "Unavailable", bestBidBtc: null, bestAskBtc: null, spreadBpsBtc: null,
      depthUsdWithin10BpsBtc: null, depthUsdWithin25BpsBtc: null, depthUsdWithin50BpsBtc: null,
      buyImpactBpsFor10kUsdBtc: null, sellImpactBpsFor10kUsdBtc: null,
      buyImpactBpsFor50kUsdBtc: null, sellImpactBpsFor50kUsdBtc: null,
      orderBookImbalanceBtc: null, ofiBtc: null, unavailabilityReason: null
    };
    try {
      const btcOb = await this.binance.fetchOrderBook("BTCUSDT").catch(() => null);
      if (btcOb && btcOb.bids.length > 0 && btcOb.asks.length > 0) {
        const bestBid = btcOb.bids[0][0];
        const bestAsk = btcOb.asks[0][0];
        const spreadBps = ((bestAsk - bestBid) / bestBid) * 10000;

        const calcDepth = (ob: number[][], maxBps: number, isAsk: boolean, bestP: number) => {
          let depth = 0;
          for (const [p, q] of ob) {
            const bps = Math.abs(p - bestP) / bestP * 10000;
            if (bps <= maxBps) depth += (p * q);
            else break;
          }
          return depth;
        };

        const calcImpact = (ob: number[][], targetUsd: number, bestP: number) => {
          let remaining = targetUsd;
          let executedValue = 0;
          let executedBase = 0;
          for (const [p, q] of ob) {
            const availableUsd = p * q;
            if (remaining <= availableUsd) {
              executedValue += remaining;
              executedBase += (remaining / p);
              remaining = 0;
              break;
            } else {
              executedValue += availableUsd;
              executedBase += q;
              remaining -= availableUsd;
            }
          }
          if (remaining > 0) return null; // Not enough depth
          const avgPrice = executedValue / executedBase;
          return (Math.abs(avgPrice - bestP) / bestP) * 10000;
        };

        const depth10Bid = calcDepth(btcOb.bids, 10, false, bestBid);
        const depth10Ask = calcDepth(btcOb.asks, 10, true, bestAsk);
        const depth25Bid = calcDepth(btcOb.bids, 25, false, bestBid);
        const depth25Ask = calcDepth(btcOb.asks, 25, true, bestAsk);
        const depth50Bid = calcDepth(btcOb.bids, 50, false, bestBid);
        const depth50Ask = calcDepth(btcOb.asks, 50, true, bestAsk);

        const imbalance = (depth50Bid && depth50Ask) ? (depth50Bid - depth50Ask) / (depth50Bid + depth50Ask) : null;

        liquidity = {
          status: "OK",
          bestBidBtc: bestBid,
          bestAskBtc: bestAsk,
          spreadBpsBtc: spreadBps,
          depthUsdWithin10BpsBtc: depth10Bid + depth10Ask,
          depthUsdWithin25BpsBtc: depth25Bid + depth25Ask,
          depthUsdWithin50BpsBtc: depth50Bid + depth50Ask,
          buyImpactBpsFor10kUsdBtc: calcImpact(btcOb.asks, 10000, bestAsk),
          sellImpactBpsFor10kUsdBtc: calcImpact(btcOb.bids, 10000, bestBid),
          buyImpactBpsFor50kUsdBtc: calcImpact(btcOb.asks, 50000, bestAsk),
          sellImpactBpsFor50kUsdBtc: calcImpact(btcOb.bids, 50000, bestBid),
          orderBookImbalanceBtc: imbalance,
          ofiBtc: null,
          unavailabilityReason: "OFI requires consecutive snapshots; currently implemented as point-in-time"
        };
      } else {
        liquidity.unavailabilityReason = "BTC Order book empty or failed to fetch";
      }
    } catch (err) {
      liquidity.unavailabilityReason = `Liquidity error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(liquidity.unavailabilityReason);
    }

    // 3. Spot/Perp Flow
    let spotPerpFlow: ResearchSpotPerpFlow = {
      status: "Unavailable", spotReturn1h: null, perpReturn1h: null, spotVolume1h: null,
      perpVolume1h: null, spotVolumeChange: null, perpVolumeChange: null, oiChange: null,
      funding: null, spotPerpParticipationState: "UNAVAILABLE",
      unavailabilityReason: "Spot/Perp comparison requires derivatives kline integration which is not currently wired in this collector."
    };

    // 4. Options
    let options: ResearchOptions = {
      status: "Unavailable", btcAtmIv: null, ethAtmIv: null,
      shortTermIvBtc: null, mediumTermIvBtc: null, termStructureSlopeBtc: null, putCallSkewBtc: null,
      unavailabilityReason: null
    };
    try {
      const [btcOpt, ethOpt] = await Promise.all([
        this.bybit.fetchOptions("BTC").catch(() => []),
        this.bybit.fetchOptions("ETH").catch(() => [])
      ]);

      const getAtmIv = (opts: any[]) => {
        if (!opts || opts.length === 0) return null;
        const atm = opts.reduce((prev, curr) => Math.abs(curr.delta - 0.5) < Math.abs(prev.delta - 0.5) ? curr : prev);
        return atm.iv;
      };

      // We don't have expiration dates in the simplified provider payload,
      // so we can't reliably calculate short/medium term or term structure.
      options = {
        status: btcOpt.length > 0 && ethOpt.length > 0 ? "OK" : "Unavailable",
        btcAtmIv: getAtmIv(btcOpt),
        ethAtmIv: getAtmIv(ethOpt),
        shortTermIvBtc: null,
        mediumTermIvBtc: null,
        termStructureSlopeBtc: null,
        putCallSkewBtc: null, // No put/call flag in current provider ticker
        unavailabilityReason: "Term structure and skew require parsing expiration and option types which aren't in the current simplified ticker."
      };
    } catch (err) {
      options.unavailabilityReason = `Options error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(options.unavailabilityReason);
    }

    // 5. Macro / NDX
    let macroNdx: ResearchMacroNdx = {
      status: "Unavailable",
      ndxValue: null,
      unavailabilityReason: "NDX (Nasdaq-100) not available. Existing providers (FRED/CoinGecko/Binance/Bybit/DefiLlama) do not support reliable live equity indices."
    };

    // 6. Stablecoins
    let stablecoins: ResearchStablecoins = { status: "Unavailable", totalSupply: null, usdtPeg: null, usdcPeg: null, unavailabilityReason: null };
    try {
      const [supplyData, pegData] = await Promise.all([
        this.defillama.fetchStablecoinSupplyMetrics().catch(() => ({ totalStablecoinSupply: null })),
        this.coingecko.fetchStablecoinPrices().catch(() => ({ usdtPrice: null, usdcPrice: null }))
      ]);

      stablecoins = {
        status: supplyData.totalStablecoinSupply !== null || pegData.usdtPrice !== null ? "OK" : "Unavailable",
        totalSupply: supplyData.totalStablecoinSupply,
        usdtPeg: pegData.usdtPrice,
        usdcPeg: pegData.usdcPrice,
        unavailabilityReason: (supplyData.totalStablecoinSupply === null || pegData.usdtPrice === null) ? "Partial data missing" : null
      };
    } catch (err) {
      stablecoins.unavailabilityReason = `Stablecoins error: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(stablecoins.unavailabilityReason);
    }

    const snapshot: ResearchSensorsSnapshot = {
      timestamp,
      breadth,
      liquidity,
      spotPerpFlow,
      options,
      macroNdx,
      stablecoins,
      errors
    };

    return snapshot;
  }
}
