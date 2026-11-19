// Server Smart Home: menyajikan file statis + proxy aman ke Groq dan Blynk.
// Semua rahasia (GROQ_API_KEY, BLYNK_TOKEN) dibaca dari .env dan TIDAK pernah dikirim ke browser.
require("dotenv").config();

const path = require("path");
const express = require("express");

const PORT = Number(process.env.PORT) || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const BLYNK_TOKEN = process.env.BLYNK_TOKEN;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const BLYNK_URL = "https://blynk.cloud/external/api/update";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT =
  "Kamu adalah asisten rumah pintar yang ramah. Jawab dalam bahasa Indonesia, singkat dan jelas. " +
  "Kamu belum bisa mengendalikan perangkat secara langsung; arahkan pengguna memakai menu di dashboard.";

for (const [name, value] of Object.entries({ GROQ_API_KEY, BLYNK_TOKEN })) {
  if (!value) console.warn(`[peringatan] ${name} belum diisi di .env`);
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.static(path.join(__dirname, "public")));

const fail = (res, status, error) =>
  res.status(status).json({ success: false, error });

/** Ambil riwayat dari client dan buang yang formatnya tidak valid. */
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string",
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }));
}

// ---------- AI chat (Groq) ----------
app.post("/api/chat", async (req, res) => {
  if (!GROQ_API_KEY)
    return fail(res, 500, "GROQ_API_KEY belum diatur di server.");

  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) return fail(res, 400, "Pesan kosong.");
  if (message.length > MAX_MESSAGE_LENGTH)
    return fail(res, 400, "Pesan terlalu panjang.");

  try {
    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.6,
        max_tokens: 512,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...sanitizeHistory(req.body.history),
          { role: "user", content: message },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("[groq]", upstream.status, data?.error?.message);
      return fail(
        res,
        502,
        data?.error?.message || `Groq error (${upstream.status})`,
      );
    }

    res.json({
      reply:
        data.choices?.[0]?.message?.content?.trim() ||
        "Maaf, tidak ada balasan.",
    });
  } catch (err) {
    console.error("[groq]", err.message);
    fail(res, 502, "Gagal menghubungi Groq.");
  }
});

// ---------- Kontrol perangkat (Blynk) ----------
app.post("/api/blynk", async (req, res) => {
  if (!BLYNK_TOKEN)
    return fail(res, 500, "BLYNK_TOKEN belum diatur di server.");

  const { pin, value } = req.body || {};
  if (typeof pin !== "string" || !/^V\d{1,3}$/.test(pin))
    return fail(res, 400, "Pin tidak valid.");
  const number = Number(value);
  if (value === "" || value === null || !Number.isFinite(number))
    return fail(res, 400, "Nilai tidak valid.");

  const url = new URL(BLYNK_URL);
  url.searchParams.set("token", BLYNK_TOKEN);
  url.searchParams.set(pin, String(number));

  try {
    const upstream = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!upstream.ok) return fail(res, 502, `Blynk error (${upstream.status})`);
    res.json({ success: true });
  } catch (err) {
    console.error("[blynk]", err.message);
    fail(res, 502, "Gagal menghubungi Blynk.");
  }
});

app.use("/api", (_req, res) => fail(res, 404, "Endpoint tidak ditemukan."));

app.listen(PORT, () =>
  console.log(`Smart Home berjalan di http://localhost:${PORT}`),
);
