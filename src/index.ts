import { MarketRegimeBot } from "./app";
import { parseCliFlag } from "./utils";

async function main(): Promise<void> {
  const bot = new MarketRegimeBot();
  const loop = parseCliFlag("--loop");

  if (loop) {
    await bot.runLoop();
    return;
  }

  await bot.runOnce();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
