import { formatEventContextSummary } from "./eventContext";
import { ActionGuidance, EventContext, LaneExplainerResult, LeaderName, RegimeConfidence, RegimeScoreResult } from "./types";

const ALERT_SEPARATOR = "\u2501".repeat(22);
const MARKET_MOVE_BIG_DELTA_DISPLAY_THRESHOLD = 10;
const FOOTER = "\u1D18\u1D1C\u029F\uA731\u1D07 \u00A9 \u1D00\u029F\u1D18\u029C\u1D00 \u1D00\u029F\u1D07\u0280\u1D1B\uA731 | v1.01";
const DISPLAY_ACRONYMS = new Set(["BTC", "ETH", "SOL", "US", "USD", "UTC", "ETF", "FOMC", "CPI", "PPI", "ATH", "ATL", "RSI", "MACD"]);
export interface TempoTapeContext {
  sessionPhase: string;
  sessionElapsedMinutes: number | null;
  activityState: string;
  activityReason: string;
  tempo: string;
  tapeState: string;
}

export class TelegramClient {
  private readonly botToken: string | undefined;
  private readonly chatId: string | undefined;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
    this.chatId = process.env.TELEGRAM_CHAT_ID?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  async sendMessage(text: string): Promise<void> {
    if (!this.botToken || !this.chatId) {
      throw new Error("Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.");
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Telegram sendMessage failed: HTTP ${response.status} ${response.statusText}. ${body.slice(0, 250)}`);
    }
  }
}

export function formatRegimeAlert(
  result: RegimeScoreResult,
  alertReason: string,
  nextScanIso?: string,
  previousResult?: RegimeScoreResult | null,
  laneExplainer?: LaneExplainerResult,
  eventContext?: EventContext
): string {
  const guidance = getActionGuidance(result);
  const tempoContext = buildTempoTapeContext(result, previousResult);
  const regimeConfidence = deriveRegimeConfidence(result, previousResult, tempoContext);
  const nextScan = formatRelativeNextScan(nextScanIso);
  const useExplainer = shouldUseLaneExplainer(laneExplainer);
  const eventContextSummary = eventContext ? formatEventContextSummary(eventContext) : null;
  const contextLines = compactContextLines(eventContextSummary);
  const scoreDelta = previousResult ? result.score - previousResult.score : null;
  const marketMoveEmoji = selectMarketMoveHeaderEmoji(scoreDelta, isCriticalMarketMove(result, previousResult));
  const actionLines = compactActionLines(result, guidance, useExplainer ? laneExplainer : undefined, true);
  const lines = [
    ...formatHeader("MARKET", marketMoveEmoji, "MOVE"),
    "",
    rawLabelLine("Mode", compactModeLeaderLine(result)),
    rawLabelLine("Score", `${result.score}/100 \u00B7 ${regimeConfidenceLabel(regimeConfidence)}`),
    rawLabelLine("Trigger", alertReason),
    "",
    ...formatPlanSection(buildMoveActionLabel(result, guidance), actionLines, useExplainer ? laneExplainer : undefined, result, guidance),
    ...formatContextSection(contextLines),
    ...formatNextScanSection(nextScan, contextLines.length > 0),
    ...formatFooter()
  ];

  return lines.join("\n");
}
export function formatHeartbeatAlert(
  result: RegimeScoreResult,
  nextScanIso: string,
  previousResult?: RegimeScoreResult | null,
  laneExplainer?: LaneExplainerResult,
  eventContext?: EventContext
): string {
  const guidance = getActionGuidance(result);
  const nextScan = formatRelativeNextScan(nextScanIso);
  const useExplainer = shouldUseLaneExplainer(laneExplainer);
  const eventContextSummary = eventContext ? formatEventContextSummary(eventContext) : null;
  const contextLines = compactContextLines(eventContextSummary);
  const actionLines = compactActionLines(result, guidance, useExplainer ? laneExplainer : undefined, false);
  const lines = [
    ...formatHeader("ALPHA", "\u2764\uFE0F\u200D\u{1F525}", "PULSE"),
    "",
    rawDisplayLine("\u{1FAC0} Status \u00B7 no fresh Market Move"),
    rawLabelLine("Mode", compactModeLeaderLine(result)),
    rawLabelLine("Score", `${result.score}/100 \u00B7 ${heartbeatScoreStatus(result, previousResult)}`),
    "",
    ...formatPlanSection(buildMoveActionLabel(result, guidance), actionLines, useExplainer ? laneExplainer : undefined, result, guidance),
    ...formatContextSection(contextLines),
    ...formatNextScanSection(nextScan, contextLines.length > 0),
    ...formatFooter()
  ];

  return lines.join("\n");
}
export function formatHeader(leftTitle: string, emoji: string, rightTitle?: string): string[] {
  const title = rightTitle ? `${leftTitle} ${emoji} ${rightTitle}` : `${leftTitle} ${emoji}`;
  return [ALERT_SEPARATOR, `\u2022  <b>${escapeHtml(title)}</b>  \u2022`, ALERT_SEPARATOR];
}

export function formatFooter(): string[] {
  return [ALERT_SEPARATOR, FOOTER];
}

function formatTreeRows(rows: Array<[string | null, string]>): string[] {
  return rows.map(([label, value], index) => {
    const branch = index === rows.length - 1 ? "\u2514\u2500" : "\u251C\u2500";
    return label ? treeLine(branch, label, value) : `${branch} ${escapeHtml(titleCaseDisplay(value))}`;
  });
}

export function titleCaseDisplay(value: string): string {
  if (!value) return value;

  return value
    .split(/(\s+)/)
    .map((part) => titleCaseDisplayToken(part))
    .join("");
}

export function selectMarketMoveHeaderEmoji(scoreDelta: number | null | undefined, urgentOrBigMove = false): string {
  if (urgentOrBigMove) return "\u{1F6A8}";
  if (typeof scoreDelta === "number" && Number.isFinite(scoreDelta) && Math.abs(scoreDelta) >= MARKET_MOVE_BIG_DELTA_DISPLAY_THRESHOLD) return "\u{1F6A8}";
  if (typeof scoreDelta === "number" && scoreDelta > 0) return "\u{1F4C8}";
  if (typeof scoreDelta === "number" && scoreDelta < 0) return "\u{1F4C9}";
  return "\u26A1";
}

function splitContextRows(summary: string | null | undefined): Array<[string, string]> {
  if (!summary) return [];

  return summary
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): [string, string] => {
      const separatorIndex = part.indexOf(":");
      if (separatorIndex <= 0) return ["Context Only", stripContextOnlySuffix(part)];
      const rawLabel = part.slice(0, separatorIndex).trim();
      const rawValue = part.slice(separatorIndex + 1).trim();
      if (rawLabel === "Expiry") return ["Expiry", rawValue];
      return ["Context Only", stripContextOnlySuffix(part)];
    });
}

function stripContextOnlySuffix(value: string): string {
  return value.replace(/\s+-\s+context only$/i, "").trim();
}

function rawDisplayLine(value: string): string {
  return escapeHtml(value);
}

function rawLabelLine(label: string, value: string): string {
  return `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

function rawTreeLine(branch: "\u251C\u2500" | "\u2514\u2500", label: string, value: string): string {
  return `${branch} <b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

function rawTreeSection(branch: "\u251C\u2500" | "\u2514\u2500", icon: string, label: string): string {
  return `${branch} ${icon} <b>${escapeHtml(label)}</b>`;
}

function rawTreeContinuation(value: string): string {
  return `\u2502  \u2514\u2500 ${escapeHtml(value)}`;
}

function compactRegimeLeaderLine(result: RegimeScoreResult): string {
  return `${regimeIcon(result.regime)} ${compactRegimeLabel(result.regime)} \u00B7 ${result.leader}`;
}

function compactModeLeaderLine(result: RegimeScoreResult): string {
  return `${compactRegimeLabel(result.regime)} \u00B7 ${result.leader}`;
}

function regimeIcon(regime: RegimeScoreResult["regime"]): string {
  if (regime === "Risk-Off") return "\u{1F534}";
  if (regime === "Defensive") return "\u{1F6E1}\uFE0F";
  if (regime === "Neutral / Chop") return "\u{1F7E1}";
  return "\u{1F7E2}";
}

function compactRegimeLabel(regime: RegimeScoreResult["regime"]): string {
  if (regime === "Strong Risk-On / Rotation") return "Risk-On Rotation";
  return regime;
}

function compactActionLines(
  result: RegimeScoreResult,
  guidance: ActionGuidance,
  laneExplainer: LaneExplainerResult | undefined,
  marketMove: boolean
): { ifFlat: string; ifIn: string } {
  if (laneExplainer) {
    return { ifFlat: laneExplainer.ifFlatAction, ifIn: laneExplainer.ifInAction };
  }

  if (!marketMove) {
    return {
      ifFlat: "Avoid chasing stale moves",
      ifIn: isRiskOffish(result.regime) ? "Reduce risk; wait for repair" : "Hold clean winners; reduce if score weakens"
    };
  }

  return {
    ifFlat: fallbackIfFlat(result, guidance),
    ifIn: isRiskOffish(result.regime) ? "Protect capital; wait for repair" : "Hold winners; tighten if score weakens"
  };
}

function formatPlanSection(
  planLabel: string,
  actionLines: { ifFlat: string; ifIn: string },
  laneExplainer: LaneExplainerResult | undefined,
  result: RegimeScoreResult,
  guidance: ActionGuidance
): string[] {
  return [
    rawIconLabelLine("\u{1F3AF}", "Plan", planLabel),
    rawTreeLine("\u251C\u2500", "Best Lane", compactBestLaneLabel(laneExplainer, result, guidance)),
    rawTreeLine("\u251C\u2500", "If Flat", actionLines.ifFlat),
    rawTreeLine("\u2514\u2500", "If In", actionLines.ifIn)
  ];
}

function rawIconLabelLine(icon: string, label: string, value: string): string {
  return `${icon} <b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`;
}

function compactBestLaneLabel(
  laneExplainer: LaneExplainerResult | undefined,
  result: RegimeScoreResult,
  guidance: ActionGuidance
): string {
  if (laneExplainer?.bestLaneLabel) return laneExplainer.bestLaneLabel;
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Stables";
  if (guidance.action === "NO CLEAN EDGE") return "No clean lane";
  if (guidance.action.includes("BTC") || result.leader === "BTC-led") return "BTC Watch";
  if (guidance.action.includes("ETH") || result.leader === "ETH-led") return "ETH Watch";
  if (guidance.action.includes("SOL") || result.leader === "SOL-led") return "SOL Watch";
  return "Strongest lane";
}

function fallbackIfFlat(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Wait for BTC repair";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return "Wait for a cleaner lane";
  if (result.leader === "SOL-led") return "Wait for clean SOL/ETH follow-through";
  if (result.leader === "ETH-led") return "Wait for clean ETH/BTC follow-through";
  if (result.leader === "BTC-led") return "Wait for clean BTC follow-through";
  return "Wait for clean leader follow-through";
}

function compactMoveRead(
  result: RegimeScoreResult,
  guidance: ActionGuidance,
  laneExplainer: LaneExplainerResult | undefined
): string {
  if (result.regime === "Risk-Off") return "Risk-off pressure; stables first";
  if (result.regime === "Defensive") return "Defensive tape; risk not clean";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") {
    if (laneExplainer?.bestLane === "SOL") return "SOL leads; broad risk is not clean";
    return "Market is choppy; wait for confirmation";
  }
  if (laneExplainer?.bestLane === "BTC" || result.leader === "BTC-led") return "BTC leads; alts still need proof";
  if (laneExplainer?.bestLane === "ETH" || result.leader === "ETH-led") return "ETH leads; watch follow-through";
  if (laneExplainer?.bestLane === "SOL" || result.leader === "SOL-led") return "SOL leads; risk-on is selective";
  return "Risk is open; stay selective";
}

function compactHeartbeatRead(
  result: RegimeScoreResult,
  guidance: ActionGuidance,
  laneExplainer: LaneExplainerResult | undefined
): string {
  if (result.regime === "Risk-Off") return "Risk remains ugly; stables first";
  if (result.regime === "Defensive") return "Still defensive; wait for repair";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") {
    if (laneExplainer?.bestLane === "SOL") return "SOL still leads; risk is not clean";
    return "No clean edge; stay patient";
  }
  if (laneExplainer?.bestLane === "BTC" || result.leader === "BTC-led") return "BTC still leads; avoid late alts";
  if (laneExplainer?.bestLane === "ETH" || result.leader === "ETH-led") return "ETH still leads; watch follow-through";
  if (laneExplainer?.bestLane === "SOL" || result.leader === "SOL-led") return "SOL still leads; stay selective";
  return "Risk remains open; stay selective";
}

function heartbeatScoreStatus(result: RegimeScoreResult, previousResult: RegimeScoreResult | null | undefined): string {
  if (!previousResult) return "baseline";
  const delta = result.score - previousResult.score;
  if (delta === 0) return "unchanged";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function compactContextLines(summary: string | null | undefined): string[] {
  if (!summary) return [];

  return summary
    .split(" | ")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(compactContextLine)
    .filter((line): line is string => Boolean(line))
    .slice(0, 2);
}

function compactContextLine(value: string): string | null {
  const normalized = value.trim();
  if (/^Liquidity: thin weekend window - context only$/i.test(normalized)) return "Thin weekend liquidity";
  if (/^Liquidity: US Holiday/i.test(normalized)) return normalized.replace(/^Liquidity:\s*/i, "").replace(/ - context only$/i, "");
  if (/^Liquidity: month-end window - context only$/i.test(normalized)) return "Month-end liquidity window";
  if (/^Liquidity: quarter-end window - context only$/i.test(normalized)) return "Quarter-end liquidity window";
  if (/^Event Stack:/i.test(normalized)) return `${titleCaseDisplay(normalized)} \u00B7 context only`;
  if (/^Expiry:/i.test(normalized)) return normalized.replace(/ - context only$/i, " \u00B7 context only");
  if (/^Anomaly:/i.test(normalized)) return normalized.replace(/ - research-only$/i, " \u00B7 research-only");
  if (/^BTC halving window:/i.test(normalized)) return normalized.replace(/ - structural context only$/i, " \u00B7 structural context only");
  if (/^Macro: FRED context available/i.test(normalized)) return null;
  if (/^Macro: FRED unavailable/i.test(normalized)) return null;
  if (/^Liquidity: Treasury FiscalData available/i.test(normalized)) return null;
  if (/^Liquidity: Treasury FiscalData unavailable/i.test(normalized)) return null;
  if (/^Liquidity: Net liquidity proxy available/i.test(normalized)) return null;
  return normalized.replace(/ - context only$/i, " \u00B7 context only");
}

function formatContextSection(contextLines: string[]): string[] {
  if (contextLines.length === 0) return [];

  return [
    "",
    rawIconLabelLine("\u26A0\uFE0F", "Context", contextLines[0]),
    ...contextLines.slice(1).map((line) => rawTreeLine("\u251C\u2500", "Event Stack", line))
  ];
}

function formatNextScanSection(nextScan: string, followsContext: boolean): string[] {
  return followsContext
    ? [rawTreeLine("\u2514\u2500", "Next Scan", nextScan)]
    : ["", rawTreeLine("\u2514\u2500", "Next Scan", nextScan)];
}
function titleCaseDisplayToken(token: string): string {
  if (!/[A-Za-z]/.test(token)) return token;
  if (/^https?:\/\//i.test(token) || /^0x[0-9a-f]+$/i.test(token) || /[@_]/.test(token) || /\d/.test(token)) return token;

  return token.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
    const upper = word.toUpperCase();
    if (DISPLAY_ACRONYMS.has(upper)) return upper;
    if (upper === "RISK") return "Risk";
    if (upper === "ON") return "On";
    if (upper === "OFF") return "Off";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

function isCriticalMarketMove(result: RegimeScoreResult, previousResult: RegimeScoreResult | null | undefined): boolean {
  if (!previousResult) return false;
  return result.regime === "Risk-Off" || previousResult.regime === "Risk-Off";
}
function shouldUseLaneExplainer(laneExplainer: LaneExplainerResult | undefined): laneExplainer is LaneExplainerResult {
  return Boolean(laneExplainer) && process.env.ALPHA_PULSE_EXPLAINER_MODE?.trim().toLowerCase() !== "false";
}

function buildExplainerMoveReadLines(result: RegimeScoreResult, laneExplainer: LaneExplainerResult): string[] {
  if (result.regime === "Risk-Off") {
    if (laneExplainer.bestLane === "SOL") return ["Risk is ugly.", "SOL is leading, but no fresh risk." ];
    return ["Risk got ugly.", "Stables first until BTC repairs."];
  }

  if ((result.regime === "Defensive" || result.regime === "Neutral / Chop") && laneExplainer.bestLane === "SOL") {
    return ["Market is messy.", "SOL is leading, but broad risk is not clean."];
  }

  if (laneExplainer.chopState === "Choppy") return ["This is chop, not a clean move.", "Wait for confirmation."];
  if (laneExplainer.bestLane === "NO_CLEAR_LANE") return ["Market is messy.", "Wait for a cleaner lane."];
  if (laneExplainer.bestLane === "STABLES") return ["Broad risk is not clean.", "Weak alts need proof."];
  if (laneExplainer.bestLane === "BTC") return ["BTC is the cleanest lane.", "Alts still need proof."];
  if (laneExplainer.bestLane === "ETH") return ["ETH is improving versus BTC.", "Watch for follow-through."];
  return ["SOL is leading.", "Trail winners; do not chase flat."];
}

function buildExplainerRiskBackLines(laneExplainer: LaneExplainerResult): string[] {
  if (laneExplainer.bestLane === "SOL") return ["BTC repairs = broad risk improves", "SOL loses lead = lane weakens"];
  if (laneExplainer.bestLane === "BTC") return ["BTC holds = lane stays open", "BTC fails = back to stables"];
  if (laneExplainer.bestLane === "ETH") return ["ETH/BTC holds = ETH confirms", "ETH/BTC fails = wait"];
  if (laneExplainer.bestLane === "STABLES") return ["BTC repairs = first green light", "Risk assets confirm = confidence improves"];
  return ["Clear leader = lane opens", "Score improves = risk can reopen"];
}

function buildMoveAlertLabel(result: RegimeScoreResult, previousResult: RegimeScoreResult | null | undefined): string {
  if (!previousResult) {
    return isRiskOffish(result.regime) ? "Risk-Off Pressure \u{1F9CA}" : "Major Shift \u26A0\uFE0F";
  }

  const scoreDelta = result.score - previousResult.score;
  const regimeChanged = result.regime !== previousResult.regime;
  const becameLessDefensive = isLessDefensiveRegime(previousResult.regime, result.regime);

  if (regimeChanged && becameLessDefensive) {
    return "Risk Reopening \u{1F7E2}";
  }

  if (regimeChanged && result.regime === "Risk-Off") {
    return "Risk-Off Pressure \u{1F9CA}";
  }

  if (regimeChanged) {
    return "Major Shift \u26A0\uFE0F";
  }

  if (scoreDelta > 0) {
    return "Score Recovery \u{1F7E2}";
  }

  if (scoreDelta < 0) {
    return "Score Slip \u26A0\uFE0F";
  }

  return isRiskOffish(result.regime) ? "Risk-Off Pressure \u{1F9CA}" : "Major Shift \u26A0\uFE0F";
}
function buildMoveShiftLabel(result: RegimeScoreResult, previousResult: RegimeScoreResult | null | undefined): string {
  if (!previousResult) return "NEW SIGNAL";

  if (result.regime !== previousResult.regime) {
    return `${formatPublicStateLabel(previousResult)} \u2192 ${formatPublicStateLabel(result)}`;
  }

  if (result.leader !== previousResult.leader) {
    return `${formatLeaderLabel(previousResult.leader)} \u2192 ${formatLeaderLabel(result.leader)}`;
  }

  if (result.score !== previousResult.score) {
    return `Score ${previousResult.score}/100 \u2192 ${result.score}/100`;
  }

  return "NEW SIGNAL";
}

function buildMoveActionLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Mostly Stables";
  if (result.regime === "Neutral / Chop") return "Wait / Stables";
  if (result.regime === "Strong Risk-On / Rotation") return "Leading Rotation";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "BTC Favored";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH Favored";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL Favored";
  return "Leading Rotation";
}

function buildMoveWatchLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive" || result.regime === "Neutral / Chop") return "\u20BF BTC repair";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "\u20BF BTC trend";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH/BTC";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL/BTC";
  return "Strongest lane";
}

function buildMoveAvoidLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Weak Alts";
  if (result.regime === "Neutral / Chop") return "Forcing Trades";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Late Alts";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Weak SOL/Memes";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Dead Memes";
  return "Dead Charts";
}

function buildMovePressureLabel(
  result: RegimeScoreResult,
  guidance: ActionGuidance,
  tempoContext: TempoTapeContext
): string {
  if (isRiskOffish(result.regime)) return "Risk-off pressure";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return "Choppy pressure";
  if (tempoContext.tapeState === "fast improvement") return "Risk-on pressure";
  return sentenceCase(tempoContext.tapeState);
}
function buildMoveWhyLines(
  result: RegimeScoreResult,
  previousResult: RegimeScoreResult | null | undefined,
  alertReason: string
): Array<[string, string]> {
  if (!previousResult) {
    const fallback = parseReasonLines(alertReason);
    return fallback.length > 0
      ? [["Score", `${result.score}/100`], ["Risk Level", buildRiskLevelLabel(result)], ["Update", fallback[0]]]
      : [["Score", `${result.score}/100`], ["Risk Level", buildRiskLevelLabel(result)]];
  }

  const scoreDelta = result.score - previousResult.score;
  const lines: Array<[string, string]> = [
    ["Score", `${previousResult.score} \u2192 ${result.score}`],
    ["Risk Level", buildRiskLevelLabel(result)]
  ];

  if (result.regime !== previousResult.regime) {
    lines.push(["Mode Changed", `${formatCompactStateLabel(previousResult)} \u2192 ${formatCompactStateLabel(result)}`]);
  } else if (result.leader !== previousResult.leader && scoreDelta === 0) {
    lines.push(["Leader Changed", `${formatCompactLeaderLabel(previousResult.leader)} \u2192 ${formatCompactLeaderLabel(result.leader)}`]);
  }

  return lines.slice(0, 3);
}
function buildMoveReadLines(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off") return ["Risk got ugly.", "Stables first until BTC repairs."];
  if (result.regime === "Defensive") return ["Still defensive.", "Risk has not earned trust yet."];
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return ["Market is messy.", "Wait for a cleaner lane."];
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return ["BTC is the cleanest lane.", "Alts still need proof."];
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return ["ETH is gaining on BTC.", "Watch for follow-through."];
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return ["SOL is leading.", "Avoid weak memes until confirmation."];
  return ["Risk is open.", "Stick to the strongest lane."];
}

function buildMoveFlipLines(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") {
    return ["BTC repairs = first green light", "Risk assets confirm = confidence improves"];
  }

  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") {
    return ["Clear leader = lane opens", "Score improves = risk can reopen"];
  }

  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") {
    return ["BTC holds = lane stays open", "BTC fails = back to stables"];
  }

  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") {
    return ["ETH/BTC holds = ETH confirms", "ETH/BTC fails = wait"];
  }

  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") {
    return ["SOL/BTC holds = SOL confirms", "SOL cools = reduce risk"];
  }

  return ["Strongest lane holds = stay picky", "Score rolls over = tighten risk"];
}

function formatCompactStateLabel(result: RegimeScoreResult): string {
  if (result.regime === "Risk-Off") return "Risk-Off \u{1F9CA}";
  if (result.regime === "Defensive") return "Defensive \u{1F6E1}\uFE0F";
  if (result.regime === "Neutral / Chop") return "Chop";
  if (result.regime === "Strong Risk-On / Rotation") return "Risk-On Rotation \u{1F680}";
  if (result.regime === "Risk-On") return formatCompactLeaderLabel(result.leader);
  return formatCompactLeaderLabel(result.leader);
}

function formatCompactLeaderLabel(leader: RegimeScoreResult["leader"]): string {
  if (leader === "BTC-led") return "BTC Watch \u20BF";
  if (leader === "ETH-led") return "ETH Rotation";
  if (leader === "SOL-led") return "SOL Rotation";
  if (leader === "Defensive") return "Defensive \u{1F6E1}\uFE0F";
  if (leader === "Mixed") return "Mixed";
  return "Alt Rotation";
}

function formatPublicStateLabel(result: RegimeScoreResult): string {
  if (result.regime === "Risk-Off") return "Risk-Off \u{1F9CA}";
  if (result.regime === "Defensive") return "Defensive \u{1F6E1}\uFE0F";
  if (result.regime === "Neutral / Chop") return "Chop";
  if (result.regime === "Strong Risk-On / Rotation") return "Risk-On Rotation \u{1F680}";
  if (result.regime === "Risk-On") return formatLeaderLabel(result.leader);
  return formatLeaderLabel(result.leader);
}

function formatLeaderLabel(leader: RegimeScoreResult["leader"]): string {
  if (leader === "BTC-led") return "BTC Watch \u20BF";
  if (leader === "ETH-led") return "ETH Rotation";
  if (leader === "SOL-led") return "SOL Rotation";
  if (leader === "Defensive") return "Defensive \u{1F6E1}\uFE0F";
  if (leader === "Mixed") return "Mixed";
  return "Alt Rotation";
}

function isRotationLeader(leader: RegimeScoreResult["leader"]): boolean {
  return leader === "BTC-led" || leader === "ETH-led" || leader === "SOL-led";
}

function isRiskOffish(regime: RegimeScoreResult["regime"]): boolean {
  return regime === "Risk-Off" || regime === "Defensive";
}

function isStrongRiskOn(regime: RegimeScoreResult["regime"]): boolean {
  return regime === "Strong Risk-On / Rotation";
}

function parseReasonLines(alertReason: string): string[] {
  const cleaned = alertReason
    .split(/[;\.]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (cleaned.length > 0) {
    return cleaned;
  }

  return ["Signal changed.", "Review the new posture."];
}

export function getActionGuidance(result: RegimeScoreResult): ActionGuidance {
  return applyDefiGuidance(getBaseActionGuidance(result), result);
}

function labeledLine(label: string, value: string): string {
  return `<b>${escapeHtml(label)}:</b>${value ? ` ${escapeHtml(titleCaseDisplay(value))}` : ""}`;
}

function sectionLine(icon: string, label: string): string {
  return `${icon} <b>${escapeHtml(label)}:</b>`;
}

function treeHeaderLine(icon: string, label: string, value: string): string {
  return `${icon} <b>${escapeHtml(label)}:</b> ${escapeHtml(titleCaseDisplay(value))}`;
}

function treeLine(branch: "\u251C\u2500" | "\u2514\u2500", label: string, value: string): string {
  return `${branch} <b>${escapeHtml(label)}:</b> ${escapeHtml(titleCaseDisplay(value))}`;
}

function buildPulseActivitySection(
  marketActivity: string | undefined,
  tempoContext: TempoTapeContext,
  result: RegimeScoreResult,
  guidance: ActionGuidance,
  laneExplainer?: LaneExplainerResult
): string[] {
  const lines = [treeHeaderLine("\u{1F30A}", "Activity", marketActivity ?? sentenceCase(tempoContext.activityState))];
  lines.push(treeLine("\u251C\u2500", "Session", formatSessionLine(tempoContext)));
  if (laneExplainer) {
    lines.push(treeLine("\u2514\u2500", "Invalid If", laneExplainer.invalidIf));
  } else {
    lines.push(treeLine("\u2514\u2500", "Risk Back If", premiumPulseFlipSignal(result, guidance)));
  }
  return lines;
}

function formatSessionLine(tempoContext: TempoTapeContext): string {
  return `${tempoContext.sessionPhase} \u2022 ${tempoContext.activityState}`;
}

function buildRiskLevelLabel(result: RegimeScoreResult): string {
  if (result.regime === "Risk-Off") return "High";
  if (result.regime === "Defensive") return "Medium-High";
  if (result.regime === "Neutral / Chop") return "Medium";
  if (result.regime === "Strong Risk-On / Rotation") return "Medium-High";
  return "Medium";
}

function sentenceCase(value: string): string {
  if (!value) return value;
  const normalized = value.replace(/^risk-off\b/i, "Risk-off").replace(/^risk-on\b/i, "Risk-on");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isLessDefensiveRegime(previousRegime: RegimeScoreResult["regime"], currentRegime: RegimeScoreResult["regime"]): boolean {
  return regimeRank(currentRegime) > regimeRank(previousRegime) && isRiskOffish(previousRegime);
}

function regimeRank(regime: RegimeScoreResult["regime"]): number {
  if (regime === "Risk-Off") return 0;
  if (regime === "Defensive") return 1;
  if (regime === "Neutral / Chop") return 2;
  if (regime === "Risk-On") return 3;
  return 4;
}
function premiumModeLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off") return "Risk-Off \u{1F9CA}";
  if (result.regime === "Defensive") return "Defensive \u{1F6E1}\uFE0F";
  if (result.regime === "Neutral / Chop") return "Neutral";
  if (result.regime === "Strong Risk-On / Rotation") return "Risk-On Rotation";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Risk-On";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Risk-On";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Risk-On";
  return "Risk-On";
}
function premiumHoldNowLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Mostly Stables";
  if (result.regime === "Neutral / Chop") return "Wait / Stables";
  if (result.regime === "Strong Risk-On / Rotation") return "Leading Rotation";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "BTC Favored";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH Favored";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL Favored";
  return "Leading Rotation";
}

function premiumPulseWatchLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive" || result.regime === "Neutral / Chop") return "\u20BF BTC";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "\u20BF BTC trend";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH/BTC";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL/BTC";
  return "Strongest lane";
}

function premiumMoveWatchLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive" || result.regime === "Neutral / Chop") return "\u20BF BTC repair";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "\u20BF BTC trend";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH/BTC";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL/BTC";
  return "Strongest lane";
}

function premiumMoveAvoidLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Weak Alts \u{1F6AB}";
  if (result.regime === "Neutral / Chop") return "Forcing Trades \u{1F6AB}";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Late Alts \u{1F6AB}";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Weak SOL/Memes \u{1F6AB}";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Dead Memes \u{1F6AB}";
  return "Dead Charts \u{1F6AB}";
}

function premiumPulseAvoidLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Weak Alts";
  if (result.regime === "Neutral / Chop") return "Forcing Trades";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Late Alts";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Weak SOL/Memes";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Dead Memes";
  return "Dead Charts";
}

function premiumMoveReadLines(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off") return ["Risk is ugly.", "Stables still make sense."];
  if (result.regime === "Defensive") return ["Still defensive.", "Risk has not earned trust yet."];
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return ["Market is messy.", "Wait for a cleaner lane."];
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return ["BTC is the cleanest lane.", "Alts still need proof."];
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return ["ETH is gaining on BTC.", "Watch for follow-through."];
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return ["SOL is leading.", "Avoid weak memes until confirmation."];
  return ["Risk is open.", "Stick to the strongest lane."];
}

function premiumPulseFlipSignal(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "BTC repairs + risk assets confirm";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return "Clear leader = lane opens";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "BTC fails = back to stables";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH/BTC holds = ETH confirms";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL/BTC holds = SOL confirms";
  return "Score rolls over = tighten risk";
}

function premiumMoveFlipSignal(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "BTC repair = first green light";
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return "Clear leader = lane opens";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "BTC fails = back to stables";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH/BTC holds = ETH confirms";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL/BTC holds = SOL confirms";
  return "Score rolls over = tighten risk";
}
function premiumMoveFlipSignals(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return ["BTC repair = first green light", "ETH/BTC up = ETH rotation", "SOL/BTC up = SOL watch"];
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return ["Clear leader appears", "Score improves", "Chop breaks"];
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return ["BTC holds trend", "ETH/BTC rises", "BTC fails = back to stables"];
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return ["ETH/BTC holds", "BTC stalls", "ETH/BTC fails = wait"];
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return ["SOL/BTC holds", "SOL/ETH holds", "SOL cools = reduce risk"];
  return ["Strongest lane holds", "Score stays firm", "Score rolls over = tighten risk"];
}

function publicCallLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off") return "RISK-OFF \u{1F9CA}";
  if (result.regime === "Defensive") return "DEFENSIVE \u{1F6E1}\uFE0F";
  if (result.regime === "Neutral / Chop") return "CHOP / WAIT \u{1F4A4}";
  if (result.regime === "Strong Risk-On / Rotation") return "RISK-ON, PICKY \u26A1";

  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") {
    return "BTC WATCH \u20BF";
  }
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") {
    return "ETH ROTATION \u2666\uFE0F";
  }
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") {
    return "SOL ROTATION \u25CE";
  }

  return "RISK-ON, PICKY \u26A1";
}

function positionLabel(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "MOSTLY STABLES \u{1F6E1}\uFE0F";
  if (result.regime === "Neutral / Chop") return "WAIT / STABLES \u{1F4A4}";
  if (result.regime === "Strong Risk-On / Rotation") return "LEADING ROTATION \u26A1";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "BTC FAVORED \u20BF";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "ETH FAVORED \u2666\uFE0F";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "SOL FAVORED \u25CE";
  return "LEADING ROTATION \u26A1";
}

function watchLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "\u2666\uFE0F ETH";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "\u25CE SOL";
  return "\u20BF BTC";
}

function rotationLadder(action: ActionGuidance["action"]): [string, string, string] {
  if (action === "BTC FOCUS" || action === "BTC WATCH") {
    return [
      "\u20BF BTC while trend holds",
      "\u2666\uFE0F ETH if ETH/BTC wakes up",
      "\u25CE SOL if SOL leads both"
    ];
  }

  if (action === "ETH ROTATION" || action === "ETH WATCH") {
    return [
      "\u2666\uFE0F ETH while ETH/BTC holds",
      "\u25CE SOL if SOL leads both",
      "Stables if rotation fails"
    ];
  }

  if (action === "SOL ROTATION") {
    return [
      "\u25CE SOL while SOL/BTC + SOL/ETH hold",
      "Selective Solana ecosystem only",
      "Stables if SOL loses strength"
    ];
  }

  if (action === "SELECTIVE RISK-ON") {
    return [
      "Favor the strongest lane",
      "Keep risk tight",
      "Stables if score rolls over"
    ];
  }

  return [
    "\u20BF BTC if trend repairs",
    "\u2666\uFE0F ETH if ETH/BTC breaks",
    "\u25CE SOL if SOL leads both"
  ];
}

function avoidLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Weak Alts + meme traps \u{1F6AB}";
  if (result.regime === "Neutral / Chop") return "Forcing Trades + meme traps \u{1F6AB}";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Chasing late alts \u{1F6AB}";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Weak SOL/Memes \u{1F6AB}";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Dead Memes / weak charts \u{1F6AB}";
  if (guidance.action === "SELECTIVE RISK-ON" || result.regime === "Strong Risk-On / Rotation") return "Dead Charts + obvious rugs \u{1F6AB}";
  return "Forcing Trades + meme traps \u{1F6AB}";
}

function shortAvoidLine(result: RegimeScoreResult, guidance: ActionGuidance): string {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return "Weak Alts";
  if (result.regime === "Neutral / Chop") return "Forced entries";
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return "Late Alts";
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return "Weak SOL/Memes";
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return "Weak memes";
  return "Weak laggards";
}

function heatRows(result: RegimeScoreResult): Array<[string, string]> {
  const heat = result.derivativesHeat;
  if (!heat || heat.status === "Unavailable") return [];
  if (!heat.publicLabel || heat.publicLabel.startsWith("Unavailable")) return [];
  return [["Heat", heat.publicLabel]];
}

function defiLine(result: RegimeScoreResult): string | undefined {
  const defiStatus = result.defiConfirmation?.status ?? "Unavailable";
  switch (defiStatus) {
    case "Strong":
      return "Healthy";
    case "Mixed":
      return "Mixed";
    case "Weak":
      return "Weak";
    case "Unavailable":
      return undefined;
  }
}
function regimeConfidenceLabel(value: RegimeConfidence): string {
  if (value === "Confirmed") return "Confirmed \u2705";
  if (value === "Noisy") return "Noisy \u26A0\uFE0F";
  return "Caution";
}

export function buildTempoTapeContext(
  result: RegimeScoreResult,
  previousResult?: RegimeScoreResult | null
): TempoTapeContext {
  const session = buildSessionContext(result.timestamp);
  const activity = buildActivityState(result, previousResult, session);
  const phase = session.sessionElapsedMinutes === null ? session.sessionPhase : `${session.sessionPhase} +${session.sessionElapsedMinutes}m`;

  const tapeState = buildTapeState(result, previousResult, session);
  const activityState = activity.state === tapeState ? fallbackActivityForSession(session.sessionPhase) : activity.state;

  return {
    sessionPhase: session.sessionPhase,
    sessionElapsedMinutes: session.sessionElapsedMinutes,
    activityState,
    activityReason: activity.state === tapeState ? `${activity.reason}; separated tempo from tape` : activity.reason,
    tempo: `${phase} \u2022 ${activityState}`,
    tapeState
  };
}

export function deriveRegimeConfidence(
  result: RegimeScoreResult,
  previousResult?: RegimeScoreResult | null,
  tempoContext?: TempoTapeContext
): RegimeConfidence {
  const context = tempoContext ?? buildTempoTapeContext(result, previousResult);
  const btcScore = componentScore(result, "BTC trend / structure");
  const ethBtcScore = componentScore(result, "ETH/BTC relative strength");
  const solBtcScore = componentScore(result, "SOL/BTC relative strength");
  const solEthScore = componentScore(result, "SOL/ETH relative strength");
  const participation = summarizeParticipation([ethBtcScore, solBtcScore, solEthScore]);
  const activity = result.defiConfirmation?.status ?? "Unavailable";
  const btcSupports = regimeBtcSupport(result, btcScore);
  const participationSupports = regimeParticipationSupport(result, participation, ethBtcScore, solBtcScore, solEthScore);
  const participationContradicts = regimeParticipationContradiction(result, participation);
  const activitySupports = regimeActivitySupport(result, activity);
  const activityContradicts = regimeActivityContradiction(result, activity);
  const noisySession = isNoisySession(context);
  const changedRecently = Boolean(
    previousResult &&
      (previousResult.regime !== result.regime || previousResult.leader !== result.leader || Math.abs(result.score - previousResult.score) >= 10)
  );
  const stronglyConfirmed = btcSupports && participationSupports && activitySupports;

  let regimeConfidence: RegimeConfidence;
  if (btcSupports && participationSupports && !activityContradicts) {
    regimeConfidence = "Confirmed";
  } else if (!btcSupports || participationContradicts || activityContradicts) {
    regimeConfidence = "Noisy";
  } else {
    regimeConfidence = "Caution";
  }

  if (regimeConfidence === "Confirmed" && noisySession && !stronglyConfirmed) {
    regimeConfidence = "Caution";
  }

  if (regimeConfidence === "Caution" && noisySession && changedRecently && (!btcSupports || participationContradicts || activityContradicts)) {
    regimeConfidence = "Noisy";
  }

  return regimeConfidence;
}

function componentScore(result: RegimeScoreResult, name: string): number {
  return result.components.find((component) => component.name === name)?.score ?? 0;
}

function summarizeParticipation(scores: number[]): { total: number; bullishVotes: number; bearishVotes: number } {
  return {
    total: scores.reduce((sum, score) => sum + score, 0),
    bullishVotes: scores.filter((score) => score >= 4).length,
    bearishVotes: scores.filter((score) => score <= -4).length
  };
}

function regimeBtcSupport(result: RegimeScoreResult, btcScore: number): boolean {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return btcScore <= -8;
  if (result.regime === "Neutral / Chop") return btcScore > -8 && btcScore < 8;
  return btcScore >= 8;
}

function regimeParticipationSupport(
  result: RegimeScoreResult,
  participation: { total: number; bullishVotes: number; bearishVotes: number },
  ethBtcScore: number,
  solBtcScore: number,
  solEthScore: number
): boolean {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") {
    return participation.bearishVotes >= 2 || (participation.total <= -8 && participation.bullishVotes === 0);
  }

  if (result.regime === "Neutral / Chop") {
    return (participation.bullishVotes > 0 && participation.bearishVotes > 0) || Math.abs(participation.total) <= 6;
  }

  if (result.leader === "ETH-led") {
    return ethBtcScore > 0 && (participation.bullishVotes >= 2 || participation.total >= 6);
  }

  if (result.leader === "SOL-led") {
    return solBtcScore > 0 && solEthScore > 0;
  }

  if (result.leader === "BTC-led") {
    return participation.bullishVotes >= 1 && participation.total >= 0;
  }

  return participation.bullishVotes >= 2 && participation.total >= 8;
}

function regimeParticipationContradiction(
  result: RegimeScoreResult,
  participation: { total: number; bullishVotes: number; bearishVotes: number }
): boolean {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") {
    return participation.bullishVotes >= 2 && participation.total >= 6;
  }

  if (result.regime === "Neutral / Chop") {
    return (participation.bullishVotes >= 2 && participation.total >= 8) || (participation.bearishVotes >= 2 && participation.total <= -8);
  }

  return participation.bearishVotes >= 2 && participation.total <= -6;
}

function regimeActivitySupport(result: RegimeScoreResult, activity: string): boolean {
  if (activity === "Unavailable") return false;
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return activity === "Weak";
  if (result.regime === "Neutral / Chop") return activity === "Mixed";
  return activity === "Strong";
}

function regimeActivityContradiction(result: RegimeScoreResult, activity: string): boolean {
  if (activity === "Unavailable") return false;
  if (result.regime === "Neutral / Chop") return false;
  if (result.regime === "Risk-Off" || result.regime === "Defensive") return false;
  return activity === "Weak";
}

function isNoisySession(context: TempoTapeContext): boolean {
  return (
    context.sessionPhase.startsWith("Weekend") ||
    context.activityState === "chop risk high" ||
    context.activityState === "watch fake moves" ||
    context.activityState === "thin liquidity" ||
    context.activityState === "liquidity thinning" ||
    context.activityState === "activity slowing"
  );
}

interface SessionContext {
  sessionPhase: string;
  sessionElapsedMinutes: number | null;
  isWeekend: boolean;
  isMalformed: boolean;
}

interface ActivityContext {
  state: string;
  reason: string;
}

function buildSessionContext(timestamp: string): SessionContext {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) {
    return { sessionPhase: "Active session", sessionElapsedMinutes: null, isWeekend: false, isMalformed: true };
  }

  const day = date.getUTCDay();
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  const minutes = hour * 60 + minute;
  const isWeekend = day === 0 || day === 6;

  if (isWeekend) {
    if (minutes < 7 * 60) return { sessionPhase: "Weekend Asia", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
    if (minutes < 13 * 60) return { sessionPhase: "Weekend London", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
    if (minutes < 21 * 60) return { sessionPhase: "Weekend NY", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
    return { sessionPhase: "Weekend late", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  }

  if (minutes < 60) return { sessionPhase: "Asia open", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 6 * 60) return { sessionPhase: "Mid Asia", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 7 * 60) return { sessionPhase: "London pre-open", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 8 * 60 + 30) return { sessionPhase: "London open", sessionElapsedMinutes: minutes - 7 * 60, isWeekend, isMalformed: false };
  if (minutes < 12 * 60) return { sessionPhase: "Mid London", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 13 * 60) return { sessionPhase: "London fade", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 16 * 60) return { sessionPhase: "London/NY overlap", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 18 * 60) return { sessionPhase: "NY open", sessionElapsedMinutes: minutes - 16 * 60, isWeekend, isMalformed: false };
  if (minutes < 21 * 60) return { sessionPhase: "Mid NY", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  if (minutes < 23 * 60) return { sessionPhase: "NY fade", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
  return { sessionPhase: "Late session", sessionElapsedMinutes: null, isWeekend, isMalformed: false };
}

function buildActivityState(
  result: RegimeScoreResult,
  previousResult: RegimeScoreResult | null | undefined,
  session: SessionContext
): ActivityContext {
  if (session.isMalformed) return { state: "steady activity", reason: "timestamp unavailable" };

  const scoreDelta = previousResult ? result.score - previousResult.score : null;
  const regimeChanged = Boolean(previousResult && result.regime !== previousResult.regime);
  const leaderChanged = Boolean(previousResult && result.leader !== previousResult.leader);
  const meaningfulChange = Boolean(
    previousResult && (Math.abs(scoreDelta ?? 0) >= 10 || regimeChanged || leaderChanged)
  );
  const volume = volumeEvidence(result);
  const activeHeat = hasActiveDerivativesHeat(result);
  const sessionPhase = session.sessionPhase;

  if (scoreDelta !== null && scoreDelta >= 15) return { state: "fast improvement", reason: "score increased by 15+" };
  if (scoreDelta !== null && scoreDelta <= -15) return { state: "fast tape", reason: "score decreased by 15+" };

  if (regimeChanged && isRiskOffish(result.regime)) {
    return { state: "activity shifting", reason: "regime moved defensive" };
  }

  if (session.isWeekend) return weekendActivityState(sessionPhase, volume, meaningfulChange);

  if ((regimeChanged && result.regime === "Strong Risk-On / Rotation") || (leaderChanged && isRotationLeader(result.leader))) {
    return { state: "rotation active", reason: "regime or leader shifted toward rotation" };
  }

  if (sessionPhase === "London/NY overlap" && meaningfulChange) {
    return { state: "high activity", reason: "overlap window with score/regime/leader movement" };
  }

  if (volume.isStrong || activeHeat) {
    if (isOpeningOrOverlap(sessionPhase)) return { state: "high activity", reason: volume.reason ?? "active derivatives heat" };
    return { state: "activity rising", reason: volume.reason ?? "active derivatives heat" };
  }

  if (volume.isWeak) {
    if (session.isWeekend || isFadeOrLate(sessionPhase)) return { state: "liquidity thinning", reason: volume.reason ?? "weak volume during thin session" };
    return { state: "activity slowing", reason: volume.reason ?? "weak volume" };
  }

  if (sessionPhase === "London pre-open") return { state: "setup forming", reason: "session fallback" };
  if (sessionPhase === "London open" || sessionPhase === "NY open") return { state: "setup forming", reason: "opening window without activity confirmation" };
  if (sessionPhase === "London/NY overlap") return { state: "steady activity", reason: "overlap without activity confirmation" };
  if (sessionPhase === "London fade" || sessionPhase === "NY fade") return { state: "activity slowing", reason: "session fallback" };
  if (sessionPhase === "Late session") return { state: "liquidity thinning", reason: "session fallback" };
  if (sessionPhase === "Weekend Asia") return { state: "thin liquidity", reason: "weekend fallback" };
  if (sessionPhase === "Weekend London") return { state: "chop risk high", reason: "weekend fallback" };
  if (sessionPhase === "Weekend NY") return { state: "watch fake moves", reason: "weekend fallback" };
  if (sessionPhase === "Weekend late") return { state: "liquidity thinning", reason: "weekend fallback" };

  return { state: "steady activity", reason: "conservative fallback" };
}

function fallbackActivityForSession(sessionPhase: string): string {
  if (sessionPhase === "London pre-open" || sessionPhase === "London open" || sessionPhase === "NY open") return "setup forming";
  if (sessionPhase === "London fade" || sessionPhase === "NY fade") return "activity slowing";
  if (sessionPhase === "Late session" || sessionPhase === "Weekend late") return "liquidity thinning";
  if (sessionPhase === "Weekend Asia") return "thin liquidity";
  if (sessionPhase === "Weekend London") return "chop risk high";
  if (sessionPhase === "Weekend NY") return "watch fake moves";
  return "steady activity";
}
function weekendActivityState(
  sessionPhase: string,
  volume: { hasData: boolean; isStrong: boolean; isWeak: boolean; reason: string | null },
  meaningfulChange: boolean
): ActivityContext {
  if (sessionPhase === "Weekend Asia") return { state: "thin liquidity", reason: "weekend fallback" };
  if (sessionPhase === "Weekend late") return { state: "liquidity thinning", reason: "weekend fallback" };
  if (volume.isWeak || !volume.hasData) return { state: "chop risk high", reason: volume.reason ?? "weekend fallback" };
  if (meaningfulChange || volume.isStrong) return { state: "watch fake moves", reason: volume.reason ?? "weekend movement" };
  return { state: "chop risk high", reason: "weekend fallback" };
}
function buildTapeState(
  result: RegimeScoreResult,
  previousResult: RegimeScoreResult | null | undefined,
  session: SessionContext
): string {
  const scoreDelta = previousResult ? result.score - previousResult.score : null;
  const regimeChanged = Boolean(previousResult && result.regime !== previousResult.regime);
  const leaderChanged = Boolean(previousResult && result.leader !== previousResult.leader);
  const meaningfulChange = Boolean(
    previousResult && (Math.abs(scoreDelta ?? 0) >= 10 || regimeChanged || leaderChanged)
  );
  const volume = volumeEvidence(result);

  if (scoreDelta !== null && scoreDelta <= -15) return "fast risk-off pressure";
  if (scoreDelta !== null && scoreDelta >= 15) return "fast improvement";
  if (session.sessionPhase === "London/NY overlap" && meaningfulChange) return "fast tape";
  if (session.isWeekend && (volume.isWeak || !volume.hasData)) return "thin liquidity";

  if (isRiskOffish(result.regime)) {
    if ((scoreDelta !== null && scoreDelta < 0) || (previousResult && !isRiskOffish(previousResult.regime))) return "risk-off pressure";
    return "defensive tape";
  }

  if (result.regime === "Neutral / Chop") return "choppy / mixed";
  if (result.leader === "BTC-led") return "BTC-led tape";
  if (result.leader === "ETH-led") return "ETH rotation active";
  if (result.leader === "SOL-led") return "SOL rotation active";
  if (result.regime === "Strong Risk-On / Rotation") return "risk-on rotation";

  return "steady tape";
}

function isOpeningOrOverlap(sessionPhase: string): boolean {
  return sessionPhase === "London open" || sessionPhase === "NY open" || sessionPhase === "London/NY overlap";
}

function isFadeOrLate(sessionPhase: string): boolean {
  return sessionPhase === "London fade" || sessionPhase === "NY fade" || sessionPhase === "Late session" || sessionPhase === "Weekend late";
}

function hasActiveDerivativesHeat(result: RegimeScoreResult): boolean {
  const status = result.derivativesHeat?.status;
  return Boolean(status && status !== "Unavailable" && status !== "Clean");
}

function volumeEvidence(result: RegimeScoreResult): { hasData: boolean; isStrong: boolean; isWeak: boolean; reason: string | null } {
  const component = result.components.find((item) => item.name.toLowerCase().includes("volume"));
  if (!component) return { hasData: false, isStrong: false, isWeak: false, reason: null };

  const label = component.label.toLowerCase();
  const reason = `volume ${component.label}`;
  const isStrong =
    component.score >= 3 ||
    label.includes("strong") ||
    label.includes("bullish") ||
    label.includes("high") ||
    label.includes("rising") ||
    label.includes("improving");
  const isWeak =
    component.score <= -3 ||
    label.includes("weak") ||
    label.includes("bearish") ||
    label.includes("low") ||
    label.includes("falling") ||
    label.includes("thin") ||
    label.includes("declining");

  return { hasData: true, isStrong, isWeak, reason };
}
function buildMarketRead(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off") {
    return ["Risk is ugly.", "Stables are still doing their job."];
  }

  if (result.regime === "Defensive") {
    return ["Still defensive.", "Rotation is forming, not confirmed."];
  }

  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") {
    return ["Market is messy.", "Wait for a cleaner lane."];
  }

  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") {
    return ["BTC is the cleanest lane.", "Alts still need proof."];
  }

  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") {
    return ["ETH is gaining on BTC.", "Watch for follow-through."];
  }

  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") {
    return ["SOL is leading.", "Avoid weak memes until confirmation."];
  }

  return ["Risk is open.", "Stick to the strongest lane."];
}

function buildPulseRead(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off") return ["Risk is ugly."];
  if (result.regime === "Defensive") return ["Not safe enough yet."];
  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") return ["Market is messy."];
  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") return ["BTC is the cleanest lane."];
  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") return ["ETH is gaining on BTC."];
  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") return ["SOL is leading."];
  return ["Risk is open. Stay picky."];
}

function flipSignals(result: RegimeScoreResult, guidance: ActionGuidance): string[] {
  if (result.regime === "Risk-Off" || result.regime === "Defensive") {
    return [
      "BTC repair = first green light",
      "ETH/BTC up = ETH rotation",
      "SOL/BTC up = SOL watch"
    ];
  }

  if (guidance.action === "NO CLEAN EDGE" || result.regime === "Neutral / Chop") {
    return [
      "Clear leader appears",
      "Score improves",
      "Chop breaks"
    ];
  }

  if (guidance.action === "BTC WATCH" || guidance.action === "BTC FOCUS" || result.leader === "BTC-led") {
    return [
      "BTC holds trend",
      "ETH/BTC rises",
      "BTC fails = back to stables"
    ];
  }

  if (guidance.action === "ETH WATCH" || guidance.action === "ETH ROTATION" || result.leader === "ETH-led") {
    return [
      "ETH/BTC holds",
      "BTC stalls",
      "ETH/BTC fails = wait"
    ];
  }

  if (guidance.action === "SOL ROTATION" || result.leader === "SOL-led") {
    return [
      "SOL/BTC holds",
      "SOL/ETH holds",
      "SOL cools = reduce risk"
    ];
  }

  return [
    "Strongest lane holds",
    "Score holds",
    "Leadership fades = wait"
  ];
}

function formatRelativeNextScan(nextScanIso: string | undefined): string {
  if (!nextScanIso) return "~15m";

  const nextScanMs = new Date(nextScanIso).getTime();
  if (!Number.isFinite(nextScanMs)) return "~15m";

  const minutes = Math.max(1, Math.round((nextScanMs - Date.now()) / 60000));
  if (!Number.isFinite(minutes)) return "~15m";

  const date = new Date(nextScanMs);
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hour}:${minute} UTC (~${minutes}m)`;
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBaseActionGuidance(result: RegimeScoreResult): ActionGuidance {
  if (result.regime === "Risk-Off") {
    return {
      action: "STAY IN STABLES",
      focus: "Protect capital",
      avoid: "BTC, ETH, SOL, memes",
      risk: "High",
      confidence: "High",
      why: ["Market structure is weak and no clean leader is confirmed."],
      watch: defensiveWatch()
    };
  }

  if (result.regime === "Defensive") {
    return {
      action: "WAIT / MOSTLY STABLES",
      focus: "Preserve capital",
      avoid: "Weak Alts and memes",
      risk: "Medium-High",
      confidence: "Medium-High",
      why: ["Conditions are defensive and upside confirmation is not clean."],
      watch: defensiveWatch()
    };
  }

  if (result.regime === "Neutral / Chop") {
    return neutralActionGuidance(result.leader);
  }

  if (result.regime === "Strong Risk-On / Rotation") {
    return strongRiskOnActionGuidance(result.leader);
  }

  return riskOnActionGuidance(result.leader);
}

function applyDefiGuidance(guidance: ActionGuidance, result: RegimeScoreResult): ActionGuidance {
  const defi = result.defiConfirmation;
  if (!defi || defi.status === "Unavailable") return guidance;

  return {
    ...guidance,
    why: buildDefiWhy(result, guidance.why),
    watch: buildDefiWatch(result, guidance.watch)
  };
}

function buildDefiWhy(result: RegimeScoreResult, fallback: string[]): string[] {
  const defi = result.defiConfirmation;
  if (!defi || defi.status === "Unavailable") return fallback;

  if (result.regime === "Risk-Off" || result.regime === "Defensive") {
    if (defi.status === "Weak") return ["Conditions are defensive and DeFi activity is not confirming risk yet."];
    if (defi.status === "Strong") return ["Conditions are defensive, but DeFi activity and liquidity are improving under the surface."];
    return ["Conditions are defensive and DeFi confirmation is mixed."];
  }

  if (result.leader === "SOL-led") {
    if (defi.status === "Strong" && defi.solanaActivity === "Improving") {
      return ["SOL is outperforming BTC and ETH, and Solana activity is improving."];
    }
    if (defi.status === "Weak") {
      return ["SOL is outperforming, but DeFi activity and liquidity are not confirming risk yet."];
    }
    return ["SOL is leading, with mixed DeFi confirmation."];
  }

  if (defi.status === "Strong") return ["Market structure is constructive and DeFi activity confirms improving risk conditions."];
  if (defi.status === "Weak") return ["Price signals are present, but DeFi activity and liquidity do not confirm risk yet."];
  return ["Market signals are mixed and DeFi confirmation is not clean yet."];
}

function buildDefiWatch(result: RegimeScoreResult, fallback: string[]): string[] {
  const defi = result.defiConfirmation;
  if (!defi || defi.status === "Unavailable") return fallback;

  if (result.leader === "SOL-led" && defi.solanaActivity === "Improving") {
    return [
      "SOL/BTC continuation = rotation holds",
      "SOL/ETH continuation = SOL remains leader",
      "Solana activity cooling = reduce confidence"
    ];
  }

  if ((result.regime === "Risk-Off" || result.regime === "Defensive") && defi.liquidity !== "Unavailable") {
    return [
      "Score recovery = risk can reopen",
      "Stable liquidity improving = pressure eases",
      "BTC trend repair = first confirmation"
    ];
  }

  return fallback;
}
function neutralActionGuidance(leader: LeaderName): ActionGuidance {
  if (leader === "BTC-led") {
    return {
      action: "BTC WATCH",
      focus: "BTC strength",
      avoid: "Chasing alts early",
      risk: "Medium",
      confidence: "Medium",
      why: ["BTC is the clearest relative lane, but the broader market is still choppy."],
      watch: btcWatch()
    };
  }

  if (leader === "ETH-led") {
    return {
      action: "ETH WATCH",
      focus: "ETH rotation setup",
      avoid: "Chasing weak SOL/memes",
      risk: "Medium",
      confidence: "Medium",
      why: ["ETH is showing relative strength, but market confirmation is still incomplete."],
      watch: ethWatch()
    };
  }

  if (leader === "SOL-led") {
    return {
      action: "WAIT / MOSTLY STABLES",
      focus: "SOL strength building",
      avoid: "Chasing BTC or memes",
      risk: "Medium",
      confidence: "Medium",
      why: ["BTC is still weak, but SOL is outperforming.", "No full risk-on signal yet."],
      watch: solWatch()
    };
  }

  return {
    action: "NO CLEAN EDGE",
    focus: "Mostly Stables",
    avoid: "Forcing Trades",
    risk: "Medium",
    confidence: "Low-Medium",
    why: ["Signals are mixed and rotation is not confirmed."],
    watch: mixedWatch()
  };
}

function riskOnActionGuidance(leader: LeaderName): ActionGuidance {
  if (leader === "BTC-led") {
    return {
      action: "BTC FOCUS",
      focus: "BTC strength",
      avoid: "Chasing late alts",
      risk: "Medium",
      confidence: "Medium-High",
      why: ["BTC is leading while alt rotation is not the strongest lane yet."],
      watch: btcWatch()
    };
  }

  if (leader === "ETH-led") {
    return {
      action: "ETH ROTATION",
      focus: "ETH over BTC",
      avoid: "Weak SOL/Memes",
      risk: "Medium",
      confidence: "Medium-High",
      why: ["ETH is gaining relative strength and rotation is improving."],
      watch: ethWatch()
    };
  }

  if (leader === "SOL-led") {
    return {
      action: "SOL ROTATION",
      focus: "SOL strength",
      avoid: "Weak memes until confirmation",
      risk: "Medium-High",
      confidence: "Medium-High",
      why: ["SOL is outperforming BTC and ETH while market conditions are risk-on."],
      watch: solWatch()
    };
  }

  return {
    action: "SELECTIVE RISK-ON",
    focus: "Confirmed leaders only",
    avoid: "Weak laggards and memes",
    risk: "Medium-High",
    confidence: "Medium",
    why: ["Risk-on conditions are present, but leadership is not clean."],
    watch: mixedWatch()
  };
}

function strongRiskOnActionGuidance(leader: LeaderName): ActionGuidance {
  if (leader === "SOL-led") {
    return {
      action: "SELECTIVE RISK-ON",
      focus: "SOL + strong Solana ecosystem names",
      avoid: "Dead/weak memes",
      risk: "High",
      confidence: "High",
      why: ["Market structure supports rotation and SOL is the leading lane."],
      watch: solWatch()
    };
  }

  if (leader === "ETH-led") {
    return {
      action: "ETH ROTATION",
      focus: "ETH-led rotation",
      avoid: "Weak SOL/Memes",
      risk: "High",
      confidence: "High",
      why: ["Market structure supports rotation and ETH is the leading lane."],
      watch: ethWatch()
    };
  }

  if (leader === "BTC-led") {
    return {
      action: "BTC FOCUS",
      focus: "BTC trend strength",
      avoid: "Late weak alts",
      risk: "High",
      confidence: "High",
      why: ["Market structure supports risk-on exposure and BTC is leading."],
      watch: btcWatch()
    };
  }

  return {
    action: "SELECTIVE RISK-ON",
    focus: "Strongest confirmed lanes",
    avoid: "Dead/weak memes",
    risk: "High",
    confidence: "High",
    why: ["Market structure supports rotation, but leadership is broad."],
    watch: mixedWatch()
  };
}

function btcWatch(): string[] {
  return [
    "BTC continuation = BTC lane stays open",
    "Alt ratios weak = avoid chasing rotation",
    "BTC loses strength = reduce risk"
  ];
}

function ethWatch(): string[] {
  return [
    "ETH/BTC continuation = ETH rotation improves",
    "BTC stays stable = rotation has room",
    "ETH/BTC fails = reduce ETH focus"
  ];
}

function solWatch(): string[] {
  return [
    "BTC reclaim strength = BTC lane opens",
    "ETH/BTC breakout = ETH rotation",
    "SOL holds strength = SOL lane improves"
  ];
}

function defensiveWatch(): string[] {
  return [
    "Score recovery = risk can reopen",
    "Stable dominance cooling = pressure eases",
    "BTC trend repair = first confirmation"
  ];
}

function mixedWatch(): string[] {
  return [
    "BTC reclaim strength = BTC lane opens",
    "ETH/BTC breakout = ETH rotation",
    "SOL/BTC holds strength = SOL lane improves"
  ];
}









