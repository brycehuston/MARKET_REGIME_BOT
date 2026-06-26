import dotenv from "dotenv";
import { TelegramClient } from "./telegram";

dotenv.config();

async function main(): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();

  if (!botToken) {
    console.error("Missing TELEGRAM_BOT_TOKEN in .env.");
    process.exit(1);
  }

  if (!chatId) {
    console.error("Missing TELEGRAM_CHAT_ID in .env.");
    process.exit(1);
  }

  const client = new TelegramClient();
  await client.sendMessage("✅ MARKET REGIME BOT Telegram test alert working.");
  console.log("Telegram test alert sent successfully.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Telegram test failed: ${message}`);
  process.exit(1);
});
