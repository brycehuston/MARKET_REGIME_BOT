import assert from "node:assert/strict";
import { FredContextProvider, classifyMacroTrend, parseFredObservations } from "./fred";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function observations(latest: number | string, prior: number | string, latestDate = "2026-07-02", priorDate = "2026-07-01"): unknown {
  return {
    observations: [
      { date: latestDate, value: String(latest) },
      { date: "2026-06-30", value: "." },
      { date: priorDate, value: String(prior) }
    ]
  };
}

async function testMissingApiKeyDisablesWithoutFetch(): Promise<void> {
  let fetchCalls = 0;
  const provider = new FredContextProvider({
    apiKey: "",
    ingestTimestamp: () => "2026-07-03T12:00:00.000Z",
    fetchImpl: (async () => {
      fetchCalls += 1;
      return jsonResponse({ observations: [] });
    }) as typeof fetch
  });

  const context = await provider.getContext();
  assert.equal(fetchCalls, 0);
  assert.equal(context.macroContext.fredEnabled, false);
  assert.equal(context.macroContext.tenYearYield, null);
  assert.equal(context.macroContext.dxyTrend, "UNKNOWN");
  assert.equal(context.macroContext.fredSourceTimestamp, null);
  assert.equal(context.macroContext.fredIngestTimestamp, "2026-07-03T12:00:00.000Z");
  assert.match(context.macroContext.fredError ?? "", /FRED_API_KEY missing/);
  assert.equal(context.macroLiquidityContext.netLiquidityProxy, null);
  assert.equal(context.macroLiquidityContext.netLiquidityTrend, "UNKNOWN");
}

function testParseObservations(): void {
  const parsed = parseFredObservations({
    observations: [
      { date: "2026-07-02", value: "4.12" },
      { date: "2026-07-01", value: "." },
      { date: "2026-06-30", value: "not-a-number" },
      { date: "2026-06-29", value: "4.01" }
    ]
  });

  assert.deepEqual(parsed, [
    { date: "2026-07-02", value: 4.12 },
    { date: "2026-06-29", value: 4.01 }
  ]);
}

function testTrendClassification(): void {
  assert.equal(classifyMacroTrend(2, 1), "UP");
  assert.equal(classifyMacroTrend(1, 2), "DOWN");
  assert.equal(classifyMacroTrend(1, 1), "FLAT");
  assert.equal(classifyMacroTrend(null, 1), "UNKNOWN");
  assert.equal(classifyMacroTrend(1, null), "UNKNOWN");
}

async function testMockFredContextParsesAndClassifies(): Promise<void> {
  const provider = new FredContextProvider({
    apiKey: "test-key",
    ingestTimestamp: () => "2026-07-03T12:00:00.000Z",
    fetchImpl: (async (input) => {
      const url = new URL(String(input));
      const series = url.searchParams.get("series_id");
      const bodies: Record<string, unknown> = {
        DGS10: observations(4.12, 4.0),
        DGS2: observations(3.9, 3.9),
        DFII10: observations(1.83, 1.9),
        VIXCLS: observations(24, 22),
        BAMLH0A0HYM2: observations(3.8, 3.7),
        DTWEXBGS: observations(125.2, 124.1),
        WALCL: observations(7000, 6900),
        RRPONTSYD: observations(500, 550),
        WTREGEN: observations(800, 750)
      };
      return jsonResponse(bodies[series ?? ""] ?? { observations: [] });
    }) as typeof fetch
  });

  const context = await provider.getContext();
  assert.equal(context.macroContext.fredEnabled, true);
  assert.equal(context.macroContext.tenYearYield, 4.12);
  assert.equal(context.macroContext.twoYearYield, 3.9);
  assert.equal(context.macroContext.tenYearRealYield, 1.83);
  assert.equal(context.macroContext.vix, 24);
  assert.equal(context.macroContext.highYieldSpread, 3.8);
  assert.equal(context.macroContext.dollarProxy, 125.2);
  assert.equal(context.macroContext.tenYearYieldTrend, "UP");
  assert.equal(context.macroContext.realYieldTrend, "DOWN");
  assert.equal(context.macroContext.dxyTrend, "UP");
  assert.equal(context.macroContext.volRegime, "ELEVATED");
  assert.equal(context.macroContext.equityRiskState, "NEUTRAL");
  assert.equal(context.macroContext.fredSourceTimestamp, "2026-07-02");
  assert.equal(context.macroContext.fredIngestTimestamp, "2026-07-03T12:00:00.000Z");
  assert.equal(context.macroContext.fredSeriesDates.DGS10, "2026-07-02");
  assert.equal(context.macroContext.backtestDataStatus, "REAL_TIME");
  assert.equal(context.macroLiquidityContext.walcl, 7000);
  assert.equal(context.macroLiquidityContext.rrp, 500);
  assert.equal(context.macroLiquidityContext.tga, 800);
  assert.equal(context.macroLiquidityContext.netLiquidityProxy, 5700);
  assert.equal(context.macroLiquidityContext.netLiquidityTrend, "EXPANDING");
  assert.equal(context.macroLiquidityContext.liquiditySourceTimestamp, "2026-07-02");
}

async function testPartialSeriesFailureDoesNotCrash(): Promise<void> {
  const provider = new FredContextProvider({
    apiKey: "test-key",
    ingestTimestamp: () => "2026-07-03T12:00:00.000Z",
    fetchImpl: (async (input) => {
      const url = new URL(String(input));
      const series = url.searchParams.get("series_id");
      if (series === "DFII10") return jsonResponse({ error: "failed" }, 500);
      return jsonResponse(observations(10, 9));
    }) as typeof fetch
  });

  const context = await provider.getContext();
  assert.equal(context.macroContext.fredEnabled, true);
  assert.equal(context.macroContext.tenYearRealYield, null);
  assert.equal(context.macroContext.realYieldTrend, "UNKNOWN");
  assert.match(context.macroContext.fredError ?? "", /DFII10: HTTP 500/);
  assert.equal(context.macroContext.tenYearYield, 10);
}

async function run(): Promise<void> {
  await testMissingApiKeyDisablesWithoutFetch();
  testParseObservations();
  testTrendClassification();
  await testMockFredContextParsesAndClassifies();
  await testPartialSeriesFailureDoesNotCrash();
  console.log("FRED context tests passed.");
}

void run();