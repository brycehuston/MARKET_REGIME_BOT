import assert from "node:assert/strict";
import { shouldSendTelegramHeartbeat } from "./alerts";
import { BotConfig, SavedState } from "./types";
import { readFileSync } from "node:fs";

function testCollisionEligibility(): void {
  const config = {
    alertRules: {
      enabled: true,
      telegramHeartbeatEnabled: true,
      telegramHeartbeatIntervalMinutes: 15
    }
  } as unknown as BotConfig;

  const state: SavedState = {
    lastHeartbeatAt: null,
    lastRegime: null,
    lastScore: null,
    currentResult: null
  } as unknown as SavedState;

  const originalDate = global.Date;
  global.Date = class extends originalDate {
    getUTCMinutes() { return 15; }
  } as any;

  try {
    const heartbeatEligible = shouldSendTelegramHeartbeat(
      config,
      state,
      true, // telegramConfigured
      true  // normalAlertWanted
    );

    assert.equal(
      heartbeatEligible,
      true,
      "A Market Move must no longer suppress an independently due Pulse."
    );
  } finally {
    global.Date = originalDate;
  }
}

function testCollisionExecutionOrder(): void {
  // To prove the execution order without invoking full network-heavy runOnce,
  // we statically verify the sequential structure of the logic in app.ts.
  const appTs = readFileSync("./src/app.ts", "utf-8");

  const sendAlertIndex = appTs.indexOf("if (decision.shouldSend) {");
  const sendHeartbeatIndex = appTs.indexOf("if (heartbeatWanted) {");

  assert.ok(sendAlertIndex > 0, "Could not find Market Move dispatch block");
  assert.ok(sendHeartbeatIndex > 0, "Could not find Alpha Pulse dispatch block");
  
  assert.ok(
    sendAlertIndex < sendHeartbeatIndex,
    "Market Move must be sent first, Alpha Pulse sent second."
  );

  // Ensure it's an independent if, not an else if
  const heartbeatIfContext = appTs.substring(sendHeartbeatIndex - 10, sendHeartbeatIndex + 22);
  assert.doesNotMatch(
    heartbeatIfContext,
    /else\s+if\s*\(heartbeatWanted\)/,
    "Heartbeat should be independent, not mutually exclusive via else-if"
  );
}

testCollisionEligibility();
testCollisionExecutionOrder();
console.log("Collision regression tests passed.");
