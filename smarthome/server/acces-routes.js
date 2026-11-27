import { Router } from "express";
import { requireUser } from "./auth.js";

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

export const ACCESS_DOORS = DOORS;

const MODE_PIN = "V14";
const EVENT_PIN = "V15";
const MEGA_PIN = "V16";

const RESULT_TEXT = {
  DIBUKA: "akses diberikan",
  MODE_KUNCI: "ditolak, mode kunci RFID aktif",
  TIDAK_DIKENAL: "ditolak, kartu tidak dikenal"
};

// Siapa yang mengirim perintah (untuk riwayat akses)
const SOURCE_LABEL = {
  dashboard: "dari dashboard",
  afna: "lewat Afna"
};

// Error dengan kode HTTP, dipakai route maupun tool AI
export class AccessError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ========================================
// HELPER BLYNK
// ========================================

async function blynk(endpoint) {
  const response = await fetch(`${BLYNK_API}/${endpoint}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160);
    // label tanpa token, supaya aman ditampilkan: contoh "get?V16"
    const label = endpoint.replace(/token=[^&]*&?/, "").replace(/[?&]$/, "");
    throw new Error(`Blynk HTTP ${response.status} pada ${label}: ${detail}`);
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

function requireToken() {
  if (!getToken()) {
    throw new AccessError(500, "BLYNK_TOKEN belum diatur di .env");
  }
}

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
// FUNGSI BERSAMA (dipakai route dan tool AI Afna)
// ========================================

// Membaca status asli dari perangkat.
// Hasil: { online:false, reason } atau { online:true, doors, rfidBlocked }
export async function readAccessStatus() {
  requireToken();

  try {
    const status = await deviceStatus();

    // Perangkat offline: nilai di cloud bisa sudah basi, jangan ditampilkan sebagai status
    if (!status.online) return status;

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

    return { online: true, doors, rfidBlocked: toBool(modeRaw) };
  } catch (err) {
    console.error("[ACCESS READ]", err.message);
    throw new AccessError(502, `Gagal membaca data dari Blynk. ${err.message}`);
  }
}

// Pastikan ESP dan Mega hidup sebelum mengirim perintah
async function ensureOnline() {
  requireToken();

  let status;

  try {
    status = await deviceStatus();
  } catch (err) {
    console.error("[ACCESS ONLINE]", err.message);
    throw new AccessError(502, "Gagal menghubungi Blynk.");
  }

  if (!status.online) {
    throw new AccessError(
      503,
      status.reason === "mega"
        ? "Arduino Mega tidak merespons."
        : "Perangkat akses (ESP) sedang offline."
    );
  }
}

async function writeOrFail(pin, value, failMessage) {
  try {
    await writePin(pin, value);
  } catch (err) {
    console.error("[ACCESS WRITE]", err.message);
    throw new AccessError(502, failMessage);
  }
}

export async function sendDoorCommand(door, open, source = "dashboard") {
  const target = DOORS[door];

  if (!target) throw new AccessError(400, "Pintu tidak dikenal.");
  if (typeof open !== "boolean") {
    throw new AccessError(400, "Field open harus true atau false.");
  }

  await ensureOnline();
  await writeOrFail(target.pin, open ? 1 : 0, "Gagal mengirim perintah pintu.");

  pushHistory({
    source,
    at: new Date().toISOString(),
    door: target.name,
    text: `${target.name} ${open ? "dibuka" : "dikunci"} ${SOURCE_LABEL[source] || ""}`.trim()
  });

  return { door, name: target.name, open };
}

export async function sendLockAll(source = "dashboard") {
  await ensureOnline();

  try {
    await Promise.all(Object.values(DOORS).map((d) => writePin(d.pin, 0)));
  } catch (err) {
    console.error("[ACCESS LOCK ALL]", err.message);
    throw new AccessError(502, "Gagal mengirim perintah kunci semua.");
  }

  pushHistory({
    source,
    at: new Date().toISOString(),
    door: "Semua",
    text: `Semua pintu dan gerbang dikunci ${SOURCE_LABEL[source] || ""}`.trim()
  });
}

export async function sendRfidMode(blocked, source = "dashboard") {
  if (typeof blocked !== "boolean") {
    throw new AccessError(400, "Field blocked harus true atau false.");
  }

  await ensureOnline();
  await writeOrFail(MODE_PIN, blocked ? 1 : 0, "Gagal mengirim mode RFID.");

  pushHistory({
    source,
    at: new Date().toISOString(),
    door: "RFID",
    text: blocked
      ? `Mode kunci RFID diaktifkan ${SOURCE_LABEL[source] || ""}`.trim()
      : `Mode kunci RFID dimatikan ${SOURCE_LABEL[source] || ""}, kartu boleh membuka akses`.trim()
  });
}

// ========================================
// ROUTE (wajib login)
// ========================================

router.use(requireUser);

function handleError(res, err, fallback) {
  if (err instanceof AccessError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }

  console.error("[ACCESS]", err);
  return res.status(502).json({ success: false, error: fallback });
}

// GET /api/access
router.get("/", async (req, res) => {
  res.set("Cache-Control", "no-store");

  try {
    const status = await readAccessStatus();
    return res.json({ success: true, ...status, history });
  } catch (err) {
    return handleError(res, err, "Gagal membaca data dari Blynk.");
  }
});

// POST /api/access/door   { door, open }
router.post("/door", async (req, res) => {
  try {
    const { door, open } = req.body || {};
    const result = await sendDoorCommand(door, open, "dashboard");

    console.log("[ACCESS DOOR]", result.name, open ? "UNLOCK" : "LOCK", "by", req.user.email);

    return res.json({ success: true, door, open });
  } catch (err) {
    return handleError(res, err, "Gagal mengirim perintah pintu.");
  }
});

// POST /api/access/lock-all
router.post("/lock-all", async (req, res) => {
  try {
    await sendLockAll("dashboard");

    console.log("[ACCESS LOCK ALL] by", req.user.email);

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, "Gagal mengirim perintah kunci semua.");
  }
});

// POST /api/access/rfid-mode   { blocked }
router.post("/rfid-mode", async (req, res) => {
  try {
    const { blocked } = req.body || {};
    await sendRfidMode(blocked, "dashboard");

    console.log("[ACCESS RFID MODE]", blocked ? "BLOCKED" : "ALLOWED", "by", req.user.email);

    return res.json({ success: true, blocked });
  } catch (err) {
    return handleError(res, err, "Gagal mengirim mode RFID.");
  }
});

export default router;
