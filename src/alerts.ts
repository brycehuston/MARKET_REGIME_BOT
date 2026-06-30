import { AlertDecision, BotConfig, RegimeConfidence, RegimeScoreResult, SavedState } from "./types";

export function decideAlert(
  config: BotConfig,
  state: SavedState,
  result: RegimeScoreResult,
  currentConfidence: RegimeConfidence,
  previousConfidence: RegimeConfidence | null
): AlertDecision {
  if (!config.alertRules.enabled) {
    return { shouldSend: false, reason: "Alerts disabled in config.", isCritical: false };
  }

  if (state.lastScore === null || state.lastRegime === null) {
    return {
      shouldSend: false,
      reason: "No market move: first scan baseline saved.",
      isCritical: false
    };
  }

  const previousScore = state.lastScore;
  const currentScore = result.score;
  const previousMode = state.lastRegime;
  const currentMode = result.regime;
  const scoreDelta = currentScore - previousScore;
  const boundaryCross = crossedRegimeBoundary(previousScore, currentScore);

  if (boundaryCross) {
    return {
      shouldSend: true,
      reason: boundaryCross,
      isCritical: currentMode === "Risk-Off" || previousMode === "Risk-Off"
    };
  }

  if (currentMode !== previousMode) {
    return {
      shouldSend: true,
      reason: `Mode changed ${previousMode} -> ${currentMode}`,
      isCritical: currentMode === "Risk-Off" || previousMode === "Risk-Off"
    };
  }

  if (scoreDelta <= -3) {
    return {
      shouldSend: true,
      reason: `Score dropped ${previousScore} -> ${currentScore}`,
      isCritical: currentMode === "Risk-Off"
    };
  }

  if (scoreDelta >= 5) {
    return {
      shouldSend: true,
      reason: `Score rose ${previousScore} -> ${currentScore}`,
      isCritical: false
    };
  }

  if (isMarketMoveConfidenceChange(previousConfidence, currentConfidence)) {
    return {
      shouldSend: true,
      reason: `Confidence changed ${previousConfidence} -> ${currentConfidence}`,
      isCritical: currentConfidence !== "Confirmed"
    };
  }

  return {
    shouldSend: false,
    reason: noMarketMoveReason(previousScore, currentScore, currentMode),
    isCritical: false
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

function crossedRegimeBoundary(previousScore: number, currentScore: number): string | null {
  const boundaries = [25, 45, 60, 75];

  for (const boundary of boundaries) {
    if (previousScore <= boundary && currentScore > boundary) {
      return `Score crossed above ${boundary}`;
    }

    if (previousScore > boundary && currentScore <= boundary) {
      return `Score crossed below ${boundary + 1}`;
    }
  }

  return null;
}

function isMarketMoveConfidenceChange(
  previousConfidence: RegimeConfidence | null,
  currentConfidence: RegimeConfidence
): boolean {
  if (previousConfidence === null || previousConfidence === currentConfidence) return false;
  if (previousConfidence === "Confirmed") return currentConfidence === "Caution" || currentConfidence === "Noisy";
  return currentConfidence === "Confirmed";
}

function noMarketMoveReason(previousScore: number, currentScore: number, currentMode: string): string {
  if (previousScore === currentScore) {
    return `No market move: score unchanged ${currentScore} stayed within ${currentMode}`;
  }

  return `No market move: score change ${previousScore} -> ${currentScore} stayed within ${currentMode}`;
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

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return (Date.now() - timestamp) / 60000;
}