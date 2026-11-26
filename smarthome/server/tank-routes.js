
import { Router } from "express";

const router = Router();

const BLYNK_API = "https://blynk.cloud/external/api";

const LEVEL_PIN = "V7";
const PUMP_PIN = "V6";
const AUTO_PIN = "V8";
const LIMIT_PIN = "V9";

const TIMEOUT_MS = 8000;

const getToken = () => process.env.BLYNK_TOKEN;

function fail(res, status, error) {
  return res.status(status).json({
    success: false,
    error
  });
}

// Mengakses Blynk External API
async function blynk(endpoint) {
  const token = getToken();

  const url = `${BLYNK_API}/${endpoint}`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Blynk HTTP ${response.status}: ${detail}`);
  }

  return (await response.text()).trim();
}

// Membersihkan respons Blynk
function cleanValue(value) {
  if (value === null || value === undefined) return null;

  return String(value)
    .replace(/[\[\]"]/g, "")
    .trim();
}

function toNumber(value) {
  const clean = cleanValue(value);

  if (clean === null || clean === "") return null;

  const number = Number(clean);

  return Number.isFinite(number) ? number : null;
}

// Membaca batas low dan high dari V9
function parseLimits(value) {
  const clean = cleanValue(value);

  if (!clean) return {
    low: null,
    high: null
  };

  const parts = clean.split(",");

  if (parts.length !== 2) {
    return {
      low: null,
      high: null
    };
  }

  const low = Number(parts[0]);
  const high = Number(parts[1]);

  if (!Number.isFinite(low) || !Number.isFinite(high)) {
    return {
      low: null,
      high: null
    };
  }

  return { low, high };
}

// Membaca satu datastream Blynk
async function readPin(pin) {
  const token = encodeURIComponent(getToken());

  return blynk(`get?token=${token}&${pin}`);
}

// Mengirim nilai ke datastream Blynk
async function writePin(pin, value) {
  const token = encodeURIComponent(getToken());

  return blynk(
    `update?token=${token}&${pin}=${encodeURIComponent(value)}`
  );
}

// ========================================
// GET /api/tank
// Membaca status perangkat sebenarnya
// ========================================

router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");

  const token = getToken();

  if (!token) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  try {
    const t = encodeURIComponent(token);

    const [
      online,
      level,
      pump,
      auto,
      limits
    ] = await Promise.all([
      blynk(`isHardwareConnected?token=${t}`),
      readPin(LEVEL_PIN),
      readPin(PUMP_PIN),
      readPin(AUTO_PIN),
      readPin(LIMIT_PIN)
    ]);

    const pumpValue = toNumber(pump);
    const autoValue = toNumber(auto);
    const parsedLimits = parseLimits(limits);

    res.json({
      success: true,
      online: online.toLowerCase() === "true",

      level: toNumber(level),

      pump:
        pumpValue === null
          ? null
          : pumpValue === 1,

      auto:
        autoValue === null
          ? null
          : autoValue === 1,

      low: parsedLimits.low,
      high: parsedLimits.high
    });

  } catch (err) {
    console.error("[TANK GET]", err.message);

    return fail(
      res,
      502,
      "Gagal membaca data dari Blynk."
    );
  }
});

// ========================================
// POST /api/tank/pump
// Kontrol pompa melalui V6
// ========================================

router.post("/pump", async (req, res) => {
  const token = getToken();

  if (!token) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  const { on } = req.body || {};

  if (typeof on !== "boolean") {
    return fail(res, 400, "Field on harus true atau false.");
  }

  try {
    await writePin(PUMP_PIN, on ? 1 : 0);

    console.log("[TANK PUMP]", on ? "ON" : "OFF");

    return res.json({
      success: true,
      command: on ? 1 : 0
    });

  } catch (err) {
    console.error("[TANK PUMP]", err.message);

    return fail(res, 502, "Gagal mengirim perintah pompa.");
  }
});

// ========================================
// POST /api/tank/auto
// Kontrol otomatis melalui V8
// ========================================

router.post("/auto", async (req, res) => {
  const token = getToken();

  if (!token) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  const { on } = req.body || {};

  if (typeof on !== "boolean") {
    return fail(res, 400, "Field on harus true atau false.");
  }

  try {
    await writePin(AUTO_PIN, on ? 1 : 0);

    console.log(
      "[TANK AUTO]",
      on ? "ON" : "OFF",
      "-> Blynk V8"
    );

    return res.json({
      success: true,
      command: on ? 1 : 0,
      message: "Perintah otomatisasi dikirim ke Blynk."
    });

  } catch (err) {
    console.error("[TANK AUTO]", err.message);

    return fail(res, 502, "Gagal mengirim perintah otomatisasi.");
  }
});

// ========================================
// POST /api/tank/limits
// Simpan batas melalui V9
// ========================================

router.post("/limits", async (req, res) => {
  const token = getToken();

  if (!token) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  const low = Number(req.body?.low);
  const high = Number(req.body?.high);

  if (
    !Number.isInteger(low) ||
    !Number.isInteger(high) ||
    low < 5 ||
    high > 95 ||
    high - low < 10
  ) {
    return fail(res, 400, "Batas tangki tidak valid.");
  }

  try {
    const limits = `${low},${high}`;

    await writePin(LIMIT_PIN, limits);

    console.log(
      "[TANK LIMIT]",
      limits,
      "-> Blynk V9"
    );

    return res.json({
      success: true,
      low,
      high,
      message: "Batas dikirim ke Blynk."
    });

  } catch (err) {
    console.error("[TANK LIMIT]", err.message);

    return fail(res, 502, "Gagal mengirim batas otomatis.");
  }
});

export default router;
