import "dotenv/config";
import { pushAlert } from "./alerts.js";

// ========================================
// MONITOR WATER TANK
// Membaca level tangki dari Blynk secara berkala dan memberi peringatan
// (dashboard + Telegram) saat air hampir habis, kritis, penuh, atau sensor error.
// ========================================

const BLYNK_API = "https://blynk.cloud/external/api";
const TIMEOUT_MS = 8000;

export const TANK_PINS = {
  pump: "V6",
  level: "V7",
  auto: "V8",
  limits: "V9"
};

const getToken = () => process.env.BLYNK_TOKEN;

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] !== "" ? value : fallback;
};

// Pengaturan (bisa diubah lewat .env)
const MONITOR_MS = () => num("TANK_MONITOR_MS", 15000);
const CRITICAL_PCT = () => num("TANK_ALERT_CRITICAL", 10);  // kritis di bawah/sama dengan ini
const LOW_MARGIN = () => num("TANK_ALERT_LOW_MARGIN", 5);   // "hampir habis" = batas bawah otomatis + margin ini
const HYSTERESIS = () => num("TANK_ALERT_HYSTERESIS", 3);   // jarak agar status tidak bolak-balik
const REMIND_MS = () => num("TANK_ALERT_REMIND_MIN", 30) * 60 * 1000;

const DEFAULT_LOW = 20;
const DEFAULT_HIGH = 90;

// ========================================
// AKSES BLYNK
// ========================================

async function blynk(endpoint) {
  const response = await fetch(`${BLYNK_API}/${endpoint}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160);
    const label = endpoint.replace(/token=[^&]*&?/, "").replace(/[?&]$/, "");
    throw new Error(`Blynk HTTP ${response.status} pada ${label}: ${detail}`);
  }

  return (await response.text()).trim();
}

const clean = (value) =>
  value === null || value === undefined
    ? null
    : String(value).replace(/[\[\]"]/g, "").trim();

function toNumber(value) {
  const c = clean(value);
  if (c === null || c === "") return null;
  const n = Number(c);
  return Number.isFinite(n) ? n : null;
}

function parseLimits(value) {
  const c = clean(value);
  if (!c) return { low: null, high: null };

  const parts = c.split(",");
  if (parts.length !== 2) return { low: null, high: null };

  const low = Number(parts[0]);
  const high = Number(parts[1]);

  return Number.isFinite(low) && Number.isFinite(high)
    ? { low, high }
    : { low: null, high: null };
}

const readPin = (pin) =>
  blynk(`get?token=${encodeURIComponent(getToken())}&${pin}`);

export async function writeTankPin(pin, value) {
  return blynk(
    `update?token=${encodeURIComponent(getToken())}&${pin}=${encodeURIComponent(value)}`
  );
}

// Membaca status tangki yang sebenarnya.
// Hasil: { online, level, pump, auto, low, high }
export async function readTankStatus() {
  if (!getToken()) throw new Error("BLYNK_TOKEN belum diatur di .env");

  const t = encodeURIComponent(getToken());

  const [online, level, pump, auto, limits] = await Promise.all([
    blynk(`isHardwareConnected?token=${t}`),
    readPin(TANK_PINS.level),
    readPin(TANK_PINS.pump),
    readPin(TANK_PINS.auto),
    readPin(TANK_PINS.limits)
  ]);

  const pumpValue = toNumber(pump);
  const autoValue = toNumber(auto);
  const { low, high } = parseLimits(limits);

  return {
    online: online.toLowerCase() === "true",
    level: toNumber(level),
    pump: pumpValue === null ? null : pumpValue === 1,
    auto: autoValue === null ? null : autoValue === 1,
    low,
    high
  };
}

// ========================================
// KLASIFIKASI LEVEL
// ========================================
// zone: offline | unknown | sensor_error | critical | low | normal | full
// prev dipakai untuk histeresis supaya status tidak bolak-balik di sekitar batas.

export function classifyTank(status, prev = "normal") {
  if (!status.online) return "offline";

  const level = status.level;
  if (level === null) return "unknown";
  if (level < 0) return "sensor_error";

  const low = status.low ?? DEFAULT_LOW;
  const high = status.high ?? DEFAULT_HIGH;
  const critical = CRITICAL_PCT();
  const lowLimit = low + LOW_MARGIN();
  const hyst = HYSTERESIS();

  let zone;
  if (level <= critical) zone = "critical";
  else if (level <= lowLimit) zone = "low";
  else if (level >= high) zone = "full";
  else zone = "normal";

  // histeresis: tetap di zona sebelumnya sampai level menjauh dari batas
  if (prev === "critical" && zone === "low" && level <= critical + hyst) return "critical";
  if (prev === "critical" && zone === "normal" && level <= lowLimit + hyst) return "low";
  if (prev === "low" && zone === "normal" && level <= lowLimit + hyst) return "low";
  if (prev === "full" && zone === "normal" && level >= high - hyst) return "full";

  return zone;
}

// ========================================
// PESAN PERINGATAN (gaya Afna)
// ========================================

function pumpNote(status) {
  if (status.pump) return "Pompa sedang menyala dan mengisi tangki.";
  if (status.auto) return "Mode otomatis aktif, pompa akan menyala sendiri saat level menyentuh batas bawah.";
  return "Pompa dan mode otomatis sedang mati. Kalau boss mau, afna bisa nyalakan pompanya.";
}

function alertText(zone, status, reminder) {
  const level = status.level;
  const prefix = reminder ? "Pengingat boss, " : "Boss, ";

  switch (zone) {
    case "critical":
      return `${prefix}air tangki sudah kritis, tinggal ${level}%. Segera isi ya. ${pumpNote(status)}`;
    case "low":
      return `${prefix}air tangki hampir habis, tinggal ${level}%. ${pumpNote(status)}`;
    case "full":
      return status.pump
        ? `${prefix}tangki sudah terisi ${level}% (batas atas ${status.high ?? DEFAULT_HIGH}%) tapi pompa masih menyala. Afna sarankan pompa dimatikan.`
        : `${prefix}tangki sudah penuh, terisi ${level}% (batas atas ${status.high ?? DEFAULT_HIGH}%). Pompa sudah mati.`;
    case "sensor_error":
      return `${prefix}sensor level tangki bermasalah, afna tidak bisa membaca ketinggian air. Pompa dimatikan otomatis demi keamanan, tolong cek sensornya.`;
    default:
      return `${prefix}ada perubahan status tangki.`;
  }
}

// ========================================
// LOOP MONITOR
// ========================================

const SEVERITY = { critical: 2, low: 1 };

let started = false;
let zone = "unknown";            // zona terakhir yang diketahui
let lastAlertAt = 0;
let sensorErrorStreak = 0;
let failStreak = 0;

export async function checkTank() {
  let status;

  try {
    status = await readTankStatus();
    failStreak = 0;
  } catch (err) {
    // Gagal membaca bukan berarti tangki bermasalah, jadi tidak ada peringatan air
    if (failStreak++ % 20 === 0) {
      console.error("[TANK MONITOR]", err.message);
    }
    return;
  }

  // Perangkat offline atau belum ada data: nilai di cloud bisa basi, jangan dinilai
  if (!status.online || status.level === null) return;

  // Sensor error harus terbaca 2 kali berturut-turut supaya tidak salah alarm
  if (status.level < 0) {
    sensorErrorStreak++;
    if (sensorErrorStreak < 2) return;
  } else {
    sensorErrorStreak = 0;
  }

  const prev = zone === "unknown" ? "normal" : zone;
  const next = classifyTank(status, prev);
  const now = Date.now();

  const changed = next !== zone;

  // Peringatan saat masuk zona berbahaya (naik tingkat), bukan saat membaik
  let shouldAlert = false;

  if (changed) {
    if (next === "full" || next === "sensor_error") shouldAlert = true;
    else if (next === "critical") shouldAlert = true;
    else if (next === "low") shouldAlert = (SEVERITY[zone] || 0) < SEVERITY.low;
  }

  // Pengingat berkala selama masih rendah / kritis, atau penuh tapi pompa belum mati
  let reminder = false;
  if (!changed && now - lastAlertAt >= REMIND_MS()) {
    if (next === "low" || next === "critical") reminder = true;
    else if (next === "full" && status.pump) reminder = true;
    shouldAlert = reminder;
  }

  zone = next;

  if (!shouldAlert) return;

  lastAlertAt = now;

  pushAlert({
    kind: next,
    level: status.level,
    text: alertText(next, status, reminder)
  });
}

export function startTankMonitor() {
  if (started) return;
  started = true;

  if (process.env.VERCEL) {
    console.log("ℹ️ Monitor tangki tidak dijalankan di Vercel (butuh proses yang terus hidup).");
    return;
  }

  if (!getToken()) {
    console.warn("⚠️ Monitor tangki dinonaktifkan: BLYNK_TOKEN belum diatur.");
    return;
  }

  console.log(`✅ Monitor tangki aktif (cek tiap ${MONITOR_MS() / 1000} detik)`);

  setTimeout(checkTank, 5000);
  setInterval(checkTank, MONITOR_MS());
}
