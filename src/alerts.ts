import { AlertDecision, BotConfig, RegimeScoreResult, SavedState } from "./types";

export function decideAlert(config: BotConfig, state: SavedState, result: RegimeScoreResult): AlertDecision {
  if (!config.alertRules.enabled) {
    return { shouldSend: false, reason: "Alerts disabled in config.", isCritical: false };
  }

  if (state.lastScore === null || state.lastRegime === null) {
    return {
      shouldSend: config.alertRules.sendStartupAlert,
      reason: config.alertRules.sendStartupAlert ? "First run / startup snapshot." : "First run saved silently.",
      isCritical: false
    };
  }

  const scoreDelta = Math.abs(result.score - state.lastScore);
  const regimeChanged = result.regime !== state.lastRegime;
  const leaderChanged = result.leader !== state.lastLeader;
  const meaningfulScoreChange = scoreDelta >= config.alertRules.minScoreDelta;
  const critical = regimeChanged || crossesMajorRiskBoundary(state.lastScore, result.score);

  if (!regimeChanged && !meaningfulScoreChange && !leaderChanged) {
    return {
      shouldSend: false,
      reason: `No major change. Score delta ${scoreDelta}, regime still ${result.regime}.`,
      isCritical: false
    };
  }

  const lastAlertAgeMinutes = minutesSince(state.lastAlertAt);
  const cooldown = critical ? config.alertRules.criticalCooldownMinutes : config.alertRules.cooldownMinutes;

  if (lastAlertAgeMinutes !== null && lastAlertAgeMinutes < cooldown) {
    return {
      shouldSend: false,
      reason: `Cooldown active. Last alert was ${Math.round(lastAlertAgeMinutes)} minutes ago.`,
      isCritical: critical
    };
  }

  const reasons: string[] = [];
  if (regimeChanged) reasons.push(`Regime changed from ${state.lastRegime} to ${result.regime}`);
  if (leaderChanged) reasons.push(`Leader changed from ${state.lastLeader ?? "unknown"} to ${result.leader}`);
  if (meaningfulScoreChange) reasons.push(`Score changed by ${scoreDelta} points (${state.lastScore} â†’ ${result.score})`);

  return {
    shouldSend: true,
    reason: reasons.join("; "),
    isCritical: critical
  };
}

export function shouldSendTelegramHeartbeat(
  config: BotConfig,
  state: SavedState,
  telegramConfigured: boolean,
  normalAlertWanted: boolean
): boolean {
  if (!config.alertRules.telegramHeartbeatEnabled) return false;
  if (!telegramConfigured) return false;
  if (normalAlertWanted) return false;

  const intervalMinutes = config.alertRules.telegramHeartbeatIntervalMinutes;
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) return false;

  if (Number.isInteger(intervalMinutes) && 60 % intervalMinutes === 0) {
    const currentBoundaryMs = currentUtcBoundaryMs(intervalMinutes);
    if (currentBoundaryMs === null) return false;

    const lastHeartbeatMs = state.lastHeartbeatAt ? new Date(state.lastHeartbeatAt).getTime() : null;
    return lastHeartbeatMs === null || !Number.isFinite(lastHeartbeatMs) || lastHeartbeatMs < currentBoundaryMs;
  }

  const lastHeartbeatAgeMinutes = minutesSince(state.lastHeartbeatAt);
  return lastHeartbeatAgeMinutes === null || lastHeartbeatAgeMinutes >= intervalMinutes;
}

function currentUtcBoundaryMs(intervalMinutes: number): number | null {
  const now = new Date();
  const utcMinutes = now.getUTCMinutes();

  if (utcMinutes % intervalMinutes !== 0) return null;

  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    utcMinutes,
    0,
    0
  );
}

function crossesMajorRiskBoundary(previousScore: number, currentScore: number): boolean {
  const wasRiskOff = previousScore <= 45;
  const isRiskOn = currentScore >= 61;
  const wasRiskOn = previousScore >= 61;
  const isDefensive = currentScore <= 45;
  return (wasRiskOff && isRiskOn) || (wasRiskOn && isDefensive);
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return (Date.now() - timestamp) / 60000;
}
