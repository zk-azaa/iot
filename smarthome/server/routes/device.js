/* ==============================================
   Route perangkat: Dashboard -> Backend -> Blynk -> ESP32 -> Arduino Mega
   Token Blynk dibaca dari .env (BLYNK_TOKEN), tidak ada di browser.
================================================ */
import { Router } from "express";
import rateLimit from "express-rate-limit";
 
const router = Router();
 
// Pemetaan perangkat -> virtual pin Blynk
const LAMP_PINS = ["V0", "V1", "V2", "V3"];   // Tamu, Kamar, Dapur, Teras
const SERVO_PINS = { x: "V4", y: "V5" };
 
router.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 600,             // joystick bisa ~8 request/detik
    standardHeaders: true,
    legacyHeaders: false
}));
 
/* ---------- helper kirim ke Blynk ---------- */
// Token dibaca saat dipanggil (bukan saat import), karena import ESM
// dijalankan sebelum dotenv.config() di server.js.
function getToken() {
    const token = process.env.BLYNK_TOKEN;
    if (!token) throw new Error("BLYNK_TOKEN belum di-set di .env");
    return token;
}
 
async function blynkUpdate(values) {
    const params = new URLSearchParams({ token: getToken(), ...values });
    const res = await fetch(`https://blynk.cloud/external/api/update?${params}`);
 
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Blynk ${res.status}: ${text || res.statusText}`);
    }
}
 
async function isDeviceOnline() {
    try {
        const res = await fetch(
            `https://blynk.cloud/external/api/isHardwareConnected?token=${getToken()}`
        );
        return (await res.text()).trim() === "true";
    } catch {
        return false;
    }
}
 
const isInt = (v) => Number.isInteger(v);
 
/* ---------- ROUTES ---------- */
 
router.get("/health", async (req, res) => {
    res.json({ ok: true, deviceOnline: await isDeviceOnline() });
});
 
// body: { "index": 0-3, "state": true/false }
router.post("/lamp", async (req, res) => {
    const { index, state } = req.body || {};
 
    if (!isInt(index) || index < 0 || index >= LAMP_PINS.length) {
        return res.status(400).json({ error: "index harus 0-3" });
    }
    if (typeof state !== "boolean") {
        return res.status(400).json({ error: "state harus true/false" });
    }
 
    try {
        await blynkUpdate({ [LAMP_PINS[index]]: state ? 1 : 0 });
        res.json({ ok: true, index, state });
    } catch (err) {
        console.error(err.message);
        res.status(502).json({ error: "Gagal menghubungi Blynk" });
    }
});
 
// body: { "x": 0-180, "y": 0-180 }
router.post("/servo", async (req, res) => {
    const { x, y } = req.body || {};
 
    if (![x, y].every(v => isInt(v) && v >= 0 && v <= 180)) {
        return res.status(400).json({ error: "x dan y harus bilangan bulat 0-180" });
    }
 
    try {
        await blynkUpdate({ [SERVO_PINS.x]: x, [SERVO_PINS.y]: y });
        res.json({ ok: true, x, y });
    } catch (err) {
        console.error(err.message);
        res.status(502).json({ error: "Gagal menghubungi Blynk" });
    }
});
 
export default router;
 