
import { Bot } from "grammy";
import { runAgent } from "./agent.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

// Jangan crash jika token belum tersedia
if (!token) {
  console.warn("⚠️ Telegram dinonaktifkan: token belum tersedia.");
} else {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    await ctx.reply("Halo Boss 👋 Afna siap membantu.");
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
      console.error("Telegram error:", err);

      await ctx.reply(
        "Maaf Boss, Afna sedang mengalami gangguan."
      );
    }
  });

  // Polling hanya untuk server lokal.
  // Vercel menggunakan serverless dan tidak cocok
  // untuk polling Telegram yang berjalan terus-menerus.
  if (!process.env.VERCEL) {
    bot.start().catch((err) => {
      console.error("Telegram polling error:", err);
    });

    console.log("✅ Telegram aktif");
  } else {
    console.log("ℹ️ Telegram polling tidak dijalankan di Vercel.");
  }
}
