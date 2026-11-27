
import { Bot } from "grammy";
import { runAgent } from "./agent.js";
import { onAlert } from "./alerts.js";
import { startTankMonitor } from "./tank-monitor.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

// Daftar chat ID yang diizinkan, pisahkan dengan koma. Contoh: 123456789,987654321
// - Jika diisi: hanya chat ini yang dilayani dan boleh mengontrol pintu/gerbang.
// - Jika kosong: bot tetap melayani seperti sebelumnya, tetapi kontrol pintu/gerbang DIMATIKAN.
const allowedIds = new Set(
  (process.env.TELEGRAM_ALLOWED_IDS || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
);

// Penerima peringatan tangki. Jika kosong, dipakai daftar chat yang diizinkan.
const alertIds = (process.env.TELEGRAM_ALERT_CHAT_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

// Jangan crash jika token belum tersedia
if (!token) {
  console.warn("⚠️ Telegram dinonaktifkan: token belum tersedia.");
} else {
  const bot = new Bot(token);

  bot.command("start", async (ctx) => {
    const chatId = String(ctx.chat.id);

    if (allowedIds.size > 0 && !allowedIds.has(chatId)) {
      console.warn("⚠️ Telegram: chat tidak terdaftar:", chatId);
      await ctx.reply(`Maaf, chat ini belum terdaftar. ID chat: ${chatId}`);
      return;
    }

    await ctx.reply("Halo Boss 👋 Afna siap membantu.");
  });

  bot.on("message:text", async (ctx) => {
    try {
      const text = ctx.message.text;
      const chatId = String(ctx.chat.id);

      if (allowedIds.size > 0 && !allowedIds.has(chatId)) {
        console.warn("⚠️ Telegram: pesan dari chat tidak terdaftar:", chatId);
        await ctx.reply(`Maaf, chat ini belum terdaftar. ID chat: ${chatId}`);
        return;
      }

      console.log("📩 Telegram:", text);

      const reply = await runAgent(text, [], {
        userKey: `tg:${chatId}`,
        canControlAccess: allowedIds.has(chatId),
        source: "telegram",
      });

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

  // Peringatan tangki (hampir habis, kritis, penuh, sensor error) dikirim ke Telegram
  const recipients = alertIds.length > 0 ? alertIds : [...allowedIds];

  if (recipients.length === 0) {
    console.warn(
      "⚠️ Peringatan tangki ke Telegram nonaktif: isi TELEGRAM_ALLOWED_IDS atau TELEGRAM_ALERT_CHAT_IDS."
    );
  } else {
    onAlert(async (alert) => {
      for (const chatId of recipients) {
        try {
          await bot.api.sendMessage(chatId, `🚰 ${alert.text}`);
        } catch (err) {
          console.error("Gagal kirim peringatan ke Telegram:", err.message);
        }
      }
    });
  }

  // Jika telegram.js dijalankan sebagai proses sendiri, monitor tangki ikut berjalan
  // (aman dipanggil dua kali, hanya berjalan sekali per proses).
  startTankMonitor();

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
