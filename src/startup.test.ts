import assert from "node:assert";
import { MarketRegimeBot } from "./app";
import { loadConfig } from "./config";
import { TelegramClient } from "./telegram";
import * as utils from "./utils";

// We mock sleep so the infinite loop breaks immediately
const originalSleep = utils.sleep;
let sleepCalled = false;

// We need a dummy TelegramClient that tracks sends
class DummyTelegramClient extends TelegramClient {
  public sends = 0;
  public lastMessage = "";
  public configured = true;
  public failNext = false;

  constructor() {
    // @ts-ignore
    super();
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async sendMessage(text: string): Promise<void> {
    console.log("Dummy sendMessage called with:\n" + text);
    this.sends++;
    this.lastMessage = text;
    if (this.failNext) {
      this.failNext = false;
      throw new Error("Simulated Telegram send failure");
    }
  }
}

async function runTest() {
  const config = loadConfig();

  // @ts-ignore
  const originalMsUntilNextScan = MarketRegimeBot.prototype.msUntilNextScan;

  // Replace msUntilNextScan to throw and break loop
  // @ts-ignore
  MarketRegimeBot.prototype.msUntilNextScan = () => {
    throw new Error("BREAK_LOOP");
  };

  try {
    // 1. STARTUP_ENABLED_SEND_COUNT=1
    console.log("Testing STARTUP_ENABLED_SEND_COUNT=1...");
    const botEnabled = new MarketRegimeBot();
    // @ts-ignore
    botEnabled.telegram = new DummyTelegramClient();
    // @ts-ignore
    botEnabled.config.alertRules.sendStartupAlert = true;

    try {
      await botEnabled.runLoop();
    } catch (e) {
      if ((e as Error).message !== "BREAK_LOOP") throw e;
    }
    // @ts-ignore
    assert.equal(botEnabled.telegram.sends, 1, "Enabled should send 1 startup alert");
    // @ts-ignore
    const startupOutput = botEnabled.telegram.lastMessage;
    const expectedHtml = [
      "<b>─────────────</b>",
      "<b>ᴀʟᴘʜᴀ ᴘᴜʟꜱᴇ │</b> ᴏɴʟɪɴᴇ <b>◉</b>",
      "<b>────────────╮</b>",
      " <b>≋ ᴘᴜʟꜱᴇ ꜱᴇɴꜱᴏʀꜱ</b>:",
      "<b>├─ ʀᴇɢɪᴍᴇ</b>",
      "<b>├─ ᴅᴇʀɪᴠᴀᴛɪᴠᴇꜱ</b>",
      "<b>└─ ʀɪꜱᴋ</b>",
      "",
      "<b>◷ ɴᴇxᴛ ꜱᴄᴀɴ │</b> ~15ᴍ",
      "<b>─────────────</b>",
      "ᴘᴜʟꜱᴇ <b>©</b> ᴀʟᴘʜᴀ ᴀʟᴇʀᴛꜱ <b>|</b> v1.01",
      "╰<b>───────</b>╯"
    ].join("\n");
    assert.strictEqual(startupOutput, expectedHtml, "Startup alert HTML structure must exactly match locked design");

    // 2. STARTUP_DISABLED_SEND_COUNT=0
    console.log("Testing STARTUP_DISABLED_SEND_COUNT=0...");
    const botDisabled = new MarketRegimeBot();
    // @ts-ignore
    botDisabled.telegram = new DummyTelegramClient();
    // @ts-ignore
    botDisabled.config.alertRules.sendStartupAlert = false;

    try {
      await botDisabled.runLoop();
    } catch (e) {
      if ((e as Error).message !== "BREAK_LOOP") throw e;
    }
    // @ts-ignore
    assert.equal(botDisabled.telegram.sends, 0, "Disabled should send 0 startup alerts");

    // 3. STARTUP_SEND_FAILURE_LOOP_CONTINUES=YES
    console.log("Testing STARTUP_SEND_FAILURE_LOOP_CONTINUES=YES...");
    const botFail = new MarketRegimeBot();
    const dummyFail = new DummyTelegramClient();
    dummyFail.failNext = true; // Will throw on send
    // @ts-ignore
    botFail.telegram = dummyFail;
    // @ts-ignore
    botFail.config.alertRules.sendStartupAlert = true;

    try {
      await botFail.runLoop();
    } catch (e) {
      if ((e as Error).message !== "BREAK_LOOP") {
        throw new Error("Loop crashed due to Telegram failure instead of sleep break!");
      }
    }
    assert.equal(dummyFail.sends, 1, "Failed send should have attempted 1 send");

    console.log("All startup tests passed.");

  } finally {
    // @ts-ignore
    MarketRegimeBot.prototype.msUntilNextScan = originalMsUntilNextScan;
  }
}

runTest().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
