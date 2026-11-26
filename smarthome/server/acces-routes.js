import { Router } from "express";
import { supabase } from "./supabase.js";

const router = Router();

const BLYNK_API = "https://blynk.cloud/external/api";
const TIMEOUT_MS = 8000;

// Jika papan akses memakai device Blynk terpisah, isi BLYNK_ACCESS_TOKEN di .env.
// Jika tidak diisi, dipakai BLYNK_TOKEN yang sama seperti fitur lain.
const getToken = () => process.env.BLYNK_ACCESS_TOKEN || process.env.BLYNK_TOKEN;

// ========================================
// DATASTREAM BLYNK (Virtual Pin)
// ========================================
// V10-V13 : status/perintah pintu (0 = terkunci, 1 = terbuka)
// V14     : mode kunci RFID (1 = RFID diblokir, 0 = RFID diizinkan)
// V15     : event RFID terakhir (string, ditulis oleh ESP)
// V16     : Arduino Mega hidup (1 = kirim heartbeat ke ESP, ditulis oleh ESP)

const DOORS = {
  gerbang_depan: { pin: "V10", name: "Gerbang Depan" },
  pintu_utama: { pin: "V11", name: "Pintu Utama" },
  pintu_kamar: { pin: "V12", name: "Pintu Kamar" },
  pintu_belakang: { pin: "V13", name: "Pintu Belakang" }
};

const MODE_PIN = "V14";
const EVENT_PIN = "V15";
const MEGA_PIN = "V16";

const RESULT_TEXT = {
  DIBUKA: "akses diberikan",
  MODE_KUNCI: "ditolak, mode kunci RFID aktif",
  TIDAK_DIKENAL: "ditolak, kartu tidak dikenal"
};

// ========================================
// HELPER
// ========================================

function fail(res, status, error) {
  return res.status(status).json({ success: false, error });
}

async function blynk(endpoint) {
  const response = await fetch(`${BLYNK_API}/${endpoint}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Blynk HTTP ${response.status}: ${detail}`);
  }

  return (await response.text()).trim();
}

function cleanValue(value) {
  if (value === null || value === undefined) return null;
  return String(value).replace(/[\[\]"]/g, "").trim();
}

function toBool(value) {
  const clean = cleanValue(value);
  if (clean === null || clean === "") return null;
  return Number(clean) === 1;
}

const readPin = (pin) =>
  blynk(`get?token=${encodeURIComponent(getToken())}&${pin}`);

const writePin = (pin, value) =>
  blynk(
    `update?token=${encodeURIComponent(getToken())}&${pin}=${encodeURIComponent(value)}`
  );

// ESP harus online di Blynk dan Arduino Mega harus mengirim heartbeat ke ESP
async function deviceStatus() {
  const esp =
    (await blynk(`isHardwareConnected?token=${encodeURIComponent(getToken())}`))
      .toLowerCase() === "true";

  if (!esp) return { online: false, reason: "esp" };

  const mega = toBool(await readPin(MEGA_PIN)) === true;

  return mega ? { online: true } : { online: false, reason: "mega" };
}

// ========================================
// AUTENTIKASI (token login Supabase dari dashboard)
// ========================================

async function requireUser(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) return fail(res, 401, "Belum login.");

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) return fail(res, 401, "Sesi tidak valid.");

    req.user = data.user;
    next();
  } catch (err) {
    console.error("[ACCESS AUTH]", err.message);
    return fail(res, 401, "Sesi tidak valid.");
  }
}

router.use(requireUser);

// ========================================
// RIWAYAT AKSES (disimpan di memori server)
// ========================================

const MAX_HISTORY = 30;
const history = [];
let lastEventRaw = null;

function pushHistory(entry) {
  history.unshift(entry);
  if (history.length > MAX_HISTORY) history.pop();
}

// Format dari ESP: "<millis>|<uid>|<nama>|<pintu>|<hasil>"
function trackRfidEvent(raw) {
  const clean = cleanValue(raw);

  if (!clean || clean === lastEventRaw) return;

  const firstRead = lastEventRaw === null;
  lastEventRaw = clean;

  const [, uid, name, door, result] = clean.split("|");

  if (!uid || !result) return;

  pushHistory({
    source: "rfid",
    // event pertama yang terbaca saat server baru menyala tidak punya waktu pasti
    at: firstRead ? null : new Date().toISOString(),
    uid,
    name: name || "-",
    door: door || "-",
    result,
    text: `${name || uid} → ${door || "-"}: ${RESULT_TEXT[result] || result}`
  });
}

// ========================================
// GET /api/access
// ========================================

router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");

  if (!getToken()) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  try {
    const status = await deviceStatus();

    // Perangkat offline: nilai di cloud bisa sudah basi, jangan ditampilkan sebagai status
    if (!status.online) {
      return res.json({
        success: true,
        online: false,
        reason: status.reason,
        history
      });
    }

    const ids = Object.keys(DOORS);

    const [modeRaw, eventRaw, ...doorRaw] = await Promise.all([
      readPin(MODE_PIN),
      readPin(EVENT_PIN),
      ...ids.map((id) => readPin(DOORS[id].pin))
    ]);

    trackRfidEvent(eventRaw);

    const doors = {};
    ids.forEach((id, i) => {
      doors[id] = toBool(doorRaw[i]) === true;
    });

    return res.json({
      success: true,
      online: true,
      doors,
      rfidBlocked: toBool(modeRaw),
      history
    });
  } catch (err) {
    console.error("[ACCESS GET]", err.message);
    return fail(res, 502, "Gagal membaca data dari Blynk.");
  }
});

// ========================================
// Pastikan ESP online sebelum mengirim perintah
// ========================================

async function ensureOnline(res) {
  try {
    const status = await deviceStatus();

    if (!status.online) {
      fail(
        res,
        503,
        status.reason === "mega"
          ? "Arduino Mega tidak merespons."
          : "Perangkat akses (ESP) sedang offline."
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error("[ACCESS ONLINE]", err.message);
    fail(res, 502, "Gagal menghubungi Blynk.");
    return false;
  }
}

// ========================================
// POST /api/access/door   { door, open }
// ========================================

router.post("/door", async (req, res) => {
  if (!getToken()) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  const { door, open } = req.body || {};
  const target = DOORS[door];

  if (!target) return fail(res, 400, "Pintu tidak dikenal.");
  if (typeof open !== "boolean") {
    return fail(res, 400, "Field open harus true atau false.");
  }

  if (!(await ensureOnline(res))) return;

  try {
    await writePin(target.pin, open ? 1 : 0);

    console.log("[ACCESS DOOR]", target.name, open ? "UNLOCK" : "LOCK", "by", req.user.email);

    pushHistory({
      source: "dashboard",
      at: new Date().toISOString(),
      door: target.name,
      text: `${target.name} ${open ? "dibuka" : "dikunci"} dari dashboard`
    });

    return res.json({ success: true, door, open });
  } catch (err) {
    console.error("[ACCESS DOOR]", err.message);
    return fail(res, 502, "Gagal mengirim perintah pintu.");
  }
});

// ========================================
// POST /api/access/lock-all
// ========================================

router.post("/lock-all", async (req, res) => {
  if (!getToken()) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  if (!(await ensureOnline(res))) return;

  try {
    await Promise.all(Object.values(DOORS).map((d) => writePin(d.pin, 0)));

    console.log("[ACCESS LOCK ALL] by", req.user.email);

    pushHistory({
      source: "dashboard",
      at: new Date().toISOString(),
      door: "Semua",
      text: "Semua pintu dan gerbang dikunci dari dashboard"
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[ACCESS LOCK ALL]", err.message);
    return fail(res, 502, "Gagal mengirim perintah kunci semua.");
  }
});

// ========================================
// POST /api/access/rfid-mode   { blocked }
// ========================================

router.post("/rfid-mode", async (req, res) => {
  if (!getToken()) {
    return fail(res, 500, "BLYNK_TOKEN belum diatur di .env");
  }

  const { blocked } = req.body || {};

  if (typeof blocked !== "boolean") {
    return fail(res, 400, "Field blocked harus true atau false.");
  }

  if (!(await ensureOnline(res))) return;

  try {
    await writePin(MODE_PIN, blocked ? 1 : 0);

    console.log("[ACCESS RFID MODE]", blocked ? "BLOCKED" : "ALLOWED", "by", req.user.email);

    pushHistory({
      source: "dashboard",
      at: new Date().toISOString(),
      door: "RFID",
      text: blocked
        ? "Mode kunci RFID diaktifkan"
        : "Mode kunci RFID dimatikan, kartu boleh membuka akses"
    });

    return res.json({ success: true, blocked });
  } catch (err) {
    console.error("[ACCESS RFID MODE]", err.message);
    return fail(res, 502, "Gagal mengirim mode RFID.");
  }
});

export default router;
