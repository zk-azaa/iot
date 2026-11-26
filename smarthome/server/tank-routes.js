// Route Water Tank untuk server ESM:
//   GET  /api/tank        -> { success, online, level, pump }
//   POST /api/tank/pump   -> body { on: true|false }
//
// Pasang di server.js (sebelum app.listen):
//   import tankRoutes from "./tank-routes.js";
//   app.use("/api/tank", tankRoutes);
//
// Memakai BLYNK_TOKEN dari .env (ganti nama variabelnya di bawah bila beda).
import { Router } from "express";

const BLYNK_API = "https://blynk.cloud/external/api";
const LEVEL_PIN = "V7"; // level tangki 0-100 (-1 = sensor error), ditulis ESP32
const PUMP_PIN = "V6"; // pompa 0/1
const TIMEOUT_MS = 8000;

const router = Router();

const getToken = () => process.env.BLYNK_TOKEN;
const fail = (res, status, error) =>
  res.status(status).json({ success: false, error });

async function blynk(query) {
  const res = await fetch(`${BLYNK_API}/${query}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok ? (await res.text()).trim() : null;
}

/** "72" / '["72"]' -> 72; kosong atau bukan angka -> null. */
function toNumber(text) {
  if (text === null) return null;
  const clean = text.replace(/[\[\]"]/g, "").trim();
  const n = Number(clean);
  return clean === "" || !Number.isFinite(n) ? null : n;
}

router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store");
  const token = getToken();
  if (!token) return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");

  const t = encodeURIComponent(token);
  try {
    const [online, level, pump] = await Promise.all([
      blynk(`isHardwareConnected?token=${t}`),
      blynk(`get?token=${t}&${LEVEL_PIN}`),
      blynk(`get?token=${t}&${PUMP_PIN}`),
    ]);

    const pumpValue = toNumber(pump);
    res.json({
    success: true,
    online: online === "true",
    level: toNumber(level),
    pump: pumpValue === null ? null : pumpValue === 1,
    auto: autoEnabled,
    low: lowLevel,
    high: highLevel
  });
  } catch (err) {
    console.error("[tank] gagal membaca Blynk:", err.message);
    fail(res, 502, "Gagal menghubungi Blynk.");
  }
});

router.post("/pump", async (req, res) => {
  const token = getToken();
  if (!token) return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");

  const { on } = req.body || {};
  if (typeof on !== "boolean")
    return fail(res, 400, "Field 'on' harus true atau false.");

  try {
    const result = await blynk(
      `update?token=${encodeURIComponent(token)}&${PUMP_PIN}=${on ? 1 : 0}`,
    );
    if (result === null) return fail(res, 502, "Blynk menolak perintah.");
    res.json({ success: true });
  } catch (err) {
    console.error("[tank] gagal menulis pompa:", err.message);
    fail(res, 502, "Gagal menghubungi Blynk.");
  }
});

let autoEnabled = false;
let lowLevel = 20;
let highLevel = 90;

router.post("/auto", (req, res) => {

  autoEnabled = Boolean(req.body.on);

  console.log(
    "[TANK AUTO]",
    autoEnabled
  );

  res.json({
    success: true,
    enabled: autoEnabled
  });
});

router.post("/limits", (req, res) => {

  lowLevel = Number(req.body.low);
  highLevel = Number(req.body.high);

  console.log(
    "[TANK LIMIT]",
    lowLevel,
    highLevel
  );

  res.json({
    success: true,
    low: lowLevel,
    high: highLevel
  });
});

export default router;
