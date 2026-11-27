import { Router } from "express";
import { requireUser } from "./auth.js";

// Umpan peringatan dari Afna (air tangki hampir habis, penuh, dsb).
// Disimpan di memori server. Dashboard membacanya lewat GET /api/alerts,
// Telegram menerimanya lewat onAlert().

const MAX_ALERTS = 50;
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // peringatan lebih tua dari 6 jam tidak dikirim lagi

const alerts = [];
const listeners = new Set();
let lastId = 0;

export function pushAlert({ kind, level = null, text }) {
  // id berbasis waktu dan selalu naik, supaya tetap valid walau server restart
  lastId = Math.max(Date.now(), lastId + 1);

  const alert = {
    id: lastId,
    at: new Date().toISOString(),
    kind,
    level,
    text
  };

  alerts.push(alert);
  if (alerts.length > MAX_ALERTS) alerts.shift();

  console.log("[ALERT]", kind, text);

  for (const listener of listeners) {
    Promise.resolve()
      .then(() => listener(alert))
      .catch((err) => console.error("[ALERT LISTENER]", err.message));
  }

  return alert;
}

export function onAlert(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listAlerts(afterId = 0) {
  const oldest = Date.now() - MAX_AGE_MS;
  return alerts.filter((a) => a.id > afterId && a.id > oldest);
}

// ========================================
// GET /api/alerts?after=<id>   (wajib login)
// ========================================

const router = Router();

router.use(requireUser);

router.get("/", (req, res) => {
  res.set("Cache-Control", "no-store");

  const after = Number(req.query.after);

  res.json({
    success: true,
    alerts: listAlerts(Number.isFinite(after) ? after : 0)
  });
});

export default router;
