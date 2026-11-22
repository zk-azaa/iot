import { Bot } from "grammy";
import { runAgent } from "./agent.js";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Halo Boss 👋 Afna siap membantu."
  );
});

bot.on("message:text", async (ctx) => {

  try {

    const text = ctx.message.text;

    console.log("📩 Telegram:", text);

    const reply = await runAgent(text);

    await ctx.reply(
      reply || "Afna tidak menemukan jawaban."
    );

  } catch (err) {

    console.error(err);

    await ctx.reply(
      "Maaf Boss, Afna sedang error."
    );

  }

});

bot.start();

console.log("✅ Telegram aktif");