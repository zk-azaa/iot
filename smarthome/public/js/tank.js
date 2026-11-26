// Halaman Water Tank (data NYATA): level dari sensor ultrasonik (Mega -> ESP32 -> Blynk),
// kontrol pompa, mode otomatis, dan batas otomatis yang bisa diubah.
// Lewat server: GET /api/tank, POST /api/tank/pump, /api/tank/auto, /api/tank/limits.
(() => {
  "use strict";

  const TANK_LITERS = (window.SMART_HOME_CONFIG || {}).TANK_LITERS || 1000;
  const POLL_MS = 5000;
  const CONFIRM_TIMEOUT_MS = 10000; // waktu menunggu Mega mengonfirmasi batas baru

  // Harus sama dengan batas di server dan sketch Mega.
  const LIMIT_MIN_LOW = 5;
  const LIMIT_MAX_HIGH = 95;
  const LIMIT_MIN_GAP = 10;

  const $ = (id) => document.getElementById(id);
  if (!$("tankLevel")) return;

  const ring = $("tankRing");
  const conn = $("tankConn");
  const pumpStatus = $("pumpStatus");
  const pumpOnBtn = $("pumpOn");
  const pumpOffBtn = $("pumpOff");
  const autoBtn = $("tankAuto");
  const lowInput = $("tankLow");
  const highInput = $("tankHigh");
  const saveBtn = $("tankSave");
  const autoStatus = $("tankAutoStatus");

  let autoOn = null; // true / false / null (belum diketahui)
  let limitsDirty = false; // pengguna sedang mengedit; jangan timpa isian
  let pending = null; // { low, high, at } menunggu konfirmasi dari perangkat
  let note = ""; // pesan sementara untuk status otomatisasi
  let online = false;

  // Level asli tidak bisa digeser manual.
  $("tankLevel").disabled = true;

  function setPumpButtons({ enabled, on }) {
    pumpOnBtn.disabled = !enabled;
    pumpOffBtn.disabled = !enabled;
    pumpOnBtn.classList.toggle("active", on);
    pumpOffBtn.classList.toggle("active", !on);
  }

  function setAutoControls(enabled) {
    autoBtn.disabled = !enabled;
    lowInput.disabled = !enabled;
    highInput.disabled = !enabled;
    saveBtn.disabled = !enabled;
  }

  function renderLevel(level, low = 20, high = 90) {
    if (!Number.isFinite(level) || level < 0) {
      const label = Number.isNaN(level) ? "Belum ada data" : "Sensor error";
      $("tankPercent").textContent = "--";
      $("tankLiters").textContent = label;
      ring.style.background = "#2a3c56";
      $("tankStatus").textContent = label;
      return;
    }
    $("tankPercent").textContent = `${level}%`;
    $("tankLiters").textContent =
      `${Math.round((level / 100) * TANK_LITERS)} L / ${TANK_LITERS.toLocaleString("id-ID")} L`;
    ring.style.background = `conic-gradient(#39baff 0 ${level}%,#2a3c56 ${level}% 100%)`;
    $("tankStatus").textContent =
      level < low ? "Rendah" : level > high ? "Penuh" : "Normal";
  }

  function renderAuto(data) {
    autoOn =
    data.auto === null || data.auto === undefined
      ? null
      : data.auto === true ||
        data.auto === 1 ||
        data.auto === "1";
    autoBtn.setAttribute("aria-checked", String(autoOn === true));
    autoBtn.classList.toggle("on", autoOn === true);

    const hasLimits = Number.isFinite(data.low) && Number.isFinite(data.high);

    if (pending) {
      if (hasLimits && data.low === pending.low && data.high === pending.high) {
        note = `Batas tersimpan di perangkat: nyala ≤ ${data.low}%, mati ≥ ${data.high}%.`;
        pending = null;
        limitsDirty = false;
      } else if (Date.now() - pending.at > CONFIRM_TIMEOUT_MS) {
        note =
          "Perangkat tidak mengonfirmasi batas baru (ditolak atau tidak terjangkau). Nilai di bawah adalah yang berlaku di perangkat.";
        pending = null;
        limitsDirty = false;
      } else {
        note = "Menunggu konfirmasi dari perangkat...";
      }
    }

    // Isi kolom dengan nilai ASLI dari perangkat, kecuali sedang diedit.
    if (hasLimits && !limitsDirty) {
      lowInput.value = data.low;
      highInput.value = data.high;
    }

    if (note) {
      autoStatus.textContent = note;
    } else if (autoOn === null) {
      autoStatus.textContent = "Status otomatisasi tidak diketahui.";
    } else if (autoOn) {
      autoStatus.textContent = hasLimits
        ? `Otomatis aktif: pompa nyala di ≤ ${data.low}%, mati di ≥ ${data.high}%.`
        : "Otomatis aktif.";
    } else {
      autoStatus.textContent = "Otomatisasi nonaktif. Pompa dikendalikan manual.";
    }
  }

  /** Data tidak bisa dipercaya: kosongkan tampilan dan matikan semua kontrol. */
  function showUnavailable(message, label) {
    online = false;
    conn.textContent = message;
    pumpStatus.textContent = "Tidak diketahui";
    renderLevel(NaN);
    $("tankLiters").textContent = label;
    $("tankStatus").textContent = label;
    autoBtn.setAttribute("aria-checked", "false");
    autoBtn.classList.remove("on");
    autoStatus.textContent = "Otomatisasi tidak bisa diatur saat perangkat tidak terjangkau.";
    setPumpButtons({ enabled: false, on: false });
    setAutoControls(false);
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* respons bukan JSON */
    }
    if (!res.ok || data.success === false)
      throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function refresh() {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/tank");
      const data = await res.json();
      if (!res.ok || data.success === false)
        throw new Error(data.error || `HTTP ${res.status}`);

      if (!data.online) {
        showUnavailable(
          "ESP32 offline — data terakhir tidak ditampilkan.",
          "Offline",
        );
        return;
      }
      online = true;

      const level = data.level;
      if (level === null || level === undefined) {
        conn.textContent =
          "Data level belum ada. Cek datastream V7 di Blynk dan firmware ESP32.";
      } else {
        conn.textContent = `Terhubung · diperbarui ${new Date().toLocaleTimeString("id-ID")}`;
      }

      renderLevel(
        level === null || level === undefined ? NaN : Number(level),
        Number.isFinite(data.low) ? data.low : 20,
        Number.isFinite(data.high) ? data.high : 90,
      );
     const pumpOn =
      data.pump === true ||
      data.pump === 1 ||
      data.pump === "1";
      setPumpButtons({ enabled: true, on: pumpOn });
      setAutoControls(true);
      renderAuto(data);
    } catch (err) {
      console.error("Tank refresh failed", err);
      showUnavailable("Server dashboard tidak terjangkau.", "Tidak terhubung");
    }
  }

  async function sendPump(on) {
    pumpStatus.textContent = "Mengirim...";
    setPumpButtons({ enabled: false, on });
    try {
      await postJSON("/api/tank/pump", { on });
      // Tampilkan status SEBENARNYA setelah Mega sempat memproses
      // (Mega bisa menolak ON saat tangki penuh atau sensor error).
      setTimeout(refresh, 1500);
    } catch (err) {
      console.error("Pump command failed", err);
      pumpStatus.textContent = "Gagal mengirim perintah";
      setPumpButtons({ enabled: true, on: !on });
    }
  }

  async function sendAuto(on) {
    note = "Mengirim...";
    autoStatus.textContent = note;
    autoBtn.disabled = true;
    try {
      await postJSON("/api/tank/auto", { on });
      note = "";
      setTimeout(refresh, 1500);
    } catch (err) {
      console.error("Auto command failed", err);
      note = `Gagal mengirim perintah: ${err.message}`;
      autoStatus.textContent = note;
      autoBtn.disabled = !online;
    }
  }

  function readLimits() {
    const low = Number(lowInput.value);
    const high = Number(highInput.value);
    if (
      lowInput.value.trim() === "" ||
      highInput.value.trim() === "" ||
      !Number.isInteger(low) ||
      !Number.isInteger(high)
    )
      return { error: "Isi kedua batas dengan bilangan bulat." };
    if (low < LIMIT_MIN_LOW)
      return { error: `Batas nyala minimal ${LIMIT_MIN_LOW}%.` };
    if (high > LIMIT_MAX_HIGH)
      return { error: `Batas mati maksimal ${LIMIT_MAX_HIGH}%.` };
    if (high - low < LIMIT_MIN_GAP)
      return {
        error: `Batas mati harus minimal ${LIMIT_MIN_GAP}% di atas batas nyala.`,
      };
    return { low, high };
  }

  async function saveLimits() {
    const limits = readLimits();
    if (limits.error) {
      note = limits.error;
      autoStatus.textContent = note;
      return;
    }
    note = "Mengirim batas...";
    autoStatus.textContent = note;
    saveBtn.disabled = true;
    try {
      await postJSON("/api/tank/limits", limits);
      pending = { low: limits.low, high: limits.high, at: Date.now() };
      note = "Menunggu konfirmasi dari perangkat...";
      autoStatus.textContent = note;
      setTimeout(refresh, 2500);
    } catch (err) {
      console.error("Limits command failed", err);
      note = `Gagal menyimpan batas: ${err.message}`;
      autoStatus.textContent = note;
    } finally {
      saveBtn.disabled = !online;
    }
  }

  function markDirty() {
    limitsDirty = true;
    note = "";
  }

  pumpOnBtn.addEventListener("click", () => sendPump(true));
  pumpOffBtn.addEventListener("click", () => sendPump(false));
  autoBtn.addEventListener("click", () => sendAuto(autoOn !== true));
  saveBtn.addEventListener("click", saveLimits);
  lowInput.addEventListener("input", markDirty);
  highInput.addEventListener("input", markDirty);
  document.addEventListener("visibilitychange", refresh);

  conn.textContent = "Menghubungkan...";
  setAutoControls(false);
  refresh();
  setInterval(refresh, POLL_MS);
})();