// Logika halaman fitur: lampu, water tank, water cannon, CCTV, akses.
// Perintah ke perangkat dikirim lewat server (/api/blynk); token Blynk ada di .env.
(() => {
  "use strict";

  const CFG = window.SMART_HOME_CONFIG || {};
  const PINS = CFG.PINS || {};
  const CAMERAS = CFG.CAMERAS || {};

  const $ = (id) => document.getElementById(id);
  const bind = (id, handler) => $(id)?.addEventListener("click", handler);
  const isOn = (el) => el.getAttribute("aria-checked") === "true";
  const setSwitch = (el, on) => el?.setAttribute("aria-checked", String(!!on));

  async function deviceCommand(type, payload = {}) {

    try {

      const response = await fetch("/api/device", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type,
          ...payload
        })
      });

      return await response.json();

    } catch (err) {

      console.error(err);

      return {
        success: false
      };

    }

  }

  
  // ---------------------------------------------------------------
  // Lampu
  // ---------------------------------------------------------------
  function initLamps() {
    const pins = PINS.lampu || [];
    const switches = [...document.querySelectorAll(".lamp-switch")];
    const states = switches.map(() => false);
    const masterText = $("lampMasterText");

    const lampIds = [
      "ruang_tamu",
      "kamar",
      "dapur",
      "teras"
    ];

    async function setLamp(i, on) {

      states[i] = on;
      setSwitch(switches[i], on);

      masterText.textContent =
        states.some(Boolean) ? "MENYALA" : "OFF";

      await deviceCommand("lamp", {
        lampId: lampIds[i],
        state: on ? "on" : "off"
      });

    } 

    switches.forEach((el, i) =>
      el.addEventListener("click", () => setLamp(i, !states[i])),
    );

    bind("lampMasterOn", async () => {
      await deviceCommand(
        "all_lamps",
        {
          state: "on"
        }
      );

      states.forEach((_, i) => {
        states[i] = true;
        setSwitch(switches[i], true);
      });

      masterText.textContent = "MENYALA";

    });

    bind("lampMasterOff", async () => {

      await deviceCommand(
        "all_lamps",
        {
          state: "off"
        }
      );

      states.forEach((_, i) => {
        states[i] = false;
        setSwitch(switches[i], false);
      });

      masterText.textContent = "OFF";

    });

    // Jadwal: hanya tampilan, belum dijalankan oleh ESP/Blynk.
    const days = [...document.querySelectorAll(".day")];
    days.forEach((d) =>
      d.addEventListener("click", () => d.classList.toggle("selected")),
    );

    const status = $("scheduleStatus");
    let scheduleOn = false;

    bind("scheduleToggle", () => {
      scheduleOn = !scheduleOn;
      setSwitch($("scheduleToggle"), scheduleOn);
      status.textContent = scheduleOn
        ? "Jadwal aktif di tampilan ini; penyimpanan perangkat belum dikonfigurasi."
        : "Jadwal dinonaktifkan.";
    });

    bind("saveSchedule", () => {
      const picked = days
        .filter((d) => d.classList.contains("selected"))
        .map((d) => d.textContent);
      status.textContent =
        `Jadwal ${$("startTime").value}–${$("endTime").value} disimpan di tampilan. ` +
        `Hari: ${picked.join(", ") || "belum dipilih"}.`;
    });
  }

  // ---------------------------------------------------------------
  // Water tank (simulasi sampai pin sensor/relay dikonfigurasi)
  // ---------------------------------------------------------------
  function initTank() {
    const slider = $("tankLevel");
    const autoSwitch = $("tankAuto");
    const autoStatus = $("tankAutoStatus");
    let pumpOn = false;

    function setPump(on) {
      pumpOn = on;
      $("pumpStatus").textContent = on ? "ON (simulasi)" : "OFF";
      $("pumpOn").classList.toggle("active", on);
      $("pumpOff").classList.toggle("active", !on);
    }

    function runAutomation() {
      const level = Number(slider.value);
      const low = Number($("tankLow").value);
      const high = Number($("tankHigh").value);

      if (low >= high) {
        autoStatus.textContent =
          "Batas minimum harus lebih kecil dari batas maksimum.";
        return;
      }
      if (level <= low) setPump(true);
      else if (level >= high) setPump(false);
      autoStatus.textContent = `Otomatisasi simulasi: pompa ${pumpOn ? "ON" : "OFF"}.`;
    }

    function updateTank() {
      const v = Number(slider.value);
      $("tankPercent").textContent = `${v}%`;
      $("tankLiters").textContent = `${Math.round(v * 10)} L / 1.000 L`;
      $("tankRing").style.background =
        `conic-gradient(#39baff 0 ${v}%,#2a3c56 ${v}% 100%)`;
      $("tankStatus").textContent =
        v < 20 ? "Rendah" : v > 90 ? "Penuh" : "Normal";
      if (isOn(autoSwitch)) runAutomation();
    }

    slider.addEventListener("input", updateTank);
    bind("pumpOn", () => setPump(true));
    bind("pumpOff", () => setPump(false));
    bind("tankAuto", () => {
      const on = !isOn(autoSwitch);
      setSwitch(autoSwitch, on);
      autoStatus.textContent = on
        ? "Otomatisasi simulasi aktif."
        : "Otomatisasi nonaktif.";
      if (on) runAutomation();
    });

    updateTank();
  }

  // ---------------------------------------------------------------
  // Water cannon: joystick -> servo X/Y
  // ---------------------------------------------------------------
  function initCannon() {
    const pad = $("joystick");
    const knob = $("joyKnob");
    const RADIUS = 68; // jarak maksimum knob (px)
    const SEND_INTERVAL_MS = 130; // batasi frekuensi kirim ke Blynk

    let x = 90;
    let y = 90;
    let dragging = false;
    let lastSent = 0;

    
    function render({ send = true } = {}) {
      $("servoX").textContent = `${Math.round(x)}°`;
      $("servoY").textContent = `${Math.round(y)}°`;
      knob.style.transform = `translate(${((x - 90) / 90) * RADIUS}px,${((90 - y) / 90) * RADIUS}px)`;

      const now = Date.now();
          if (send && now - lastSent > SEND_INTERVAL_MS) {
        lastSent = now;

        deviceCommand("cannon", {
          x: Math.round(x),
          y: Math.round(y)
        });
      }
    }

    function moveKnob(e) {
      const rect = pad.getBoundingClientRect();
      let dx = e.clientX - (rect.left + rect.width / 2);
      let dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      if (dist > RADIUS) {
        dx = (dx / dist) * RADIUS;
        dy = (dy / dist) * RADIUS;
      }
      x = Math.max(0, Math.min(180, 90 + (dx / RADIUS) * 90));
      y = Math.max(0, Math.min(180, 90 - (dy / RADIUS) * 90));
      render();
    }

    pad.addEventListener("pointerdown", (e) => {
      dragging = true;
      pad.setPointerCapture(e.pointerId);
      moveKnob(e);
    });
    pad.addEventListener("pointermove", (e) => dragging && moveKnob(e));
    pad.addEventListener("pointerup", () => (dragging = false));
    pad.addEventListener("pointercancel", () => (dragging = false));

    bind("centerCannon", () => {
      x = 90;
      y = 90;
      lastSent = 0; // pastikan posisi tengah langsung terkirim
      render();
    });

    // Aliran air (pin belum dikonfigurasi -> hanya UI)
    let waterOn = false;
    const waterBtn = $("waterToggle");
    waterBtn.addEventListener("click", async () => {
      waterOn = !waterOn;
      waterBtn.textContent = waterOn ? "MATIKAN AIR" : "NYALAKAN AIR";
      waterBtn.classList.toggle("danger", waterOn);
      $("waterState").textContent = waterOn ? "ON (UI)" : "OFF";

      const result = await deviceCommand(
        "lamp",
        {
          lampId: "water_cannon",
          state: waterOn ? "on" : "off"
        }
      );

      const ok = result.success;

      if (PINS.waterCannon && !ok)
        $("waterState").textContent = "Gagal mengirim perintah";
    });

    let autoOn = false;
    bind("cannonAuto", () => {
      autoOn = !autoOn;
      setSwitch($("cannonAuto"), autoOn);
      $("cannonAutoText").textContent = autoOn
        ? "Otomatisasi UI aktif (belum ada aturan perangkat)."
        : "Otomatisasi nonaktif.";
    });

    if (CAMERAS.waterCannon) {
      const cam = $("cannonCamera");
      cam.style.backgroundImage = `url("${CAMERAS.waterCannon}")`;
      cam.style.backgroundSize = "cover";
      cam.querySelector(".camlabel").textContent = "CAMERA STREAM";
    }

    
  }
  

  // ---------------------------------------------------------------
  // CCTV: pilihan layout 1x1 / 2x2
  // ---------------------------------------------------------------
  function initCctv() {
    $("cctvLayout").addEventListener("change", (e) => {
      const single = e.target.value === "1";
      document.querySelectorAll(".cctv-tile").forEach((tile, i) => {
        tile.style.display = single && i > 0 ? "none" : "grid";
      });
      $("cctvGrid").style.gridTemplateColumns = single
        ? "1fr"
        : "repeat(2,1fr)";
    });
  }

  // ---------------------------------------------------------------
  // Akses & RFID (simulasi UI; mode kunci RFID menolak scan)
  // ---------------------------------------------------------------
  function initAccess() {
    const log = (text) => ($("accessLog").textContent = text);

    function renderLock(card, locked) {
      const btn = card.querySelector(".lock-btn");
      card.querySelector(".lockstate").textContent = locked
        ? "TERKUNCI"
        : "TERBUKA (UI)";
      btn.textContent = locked ? "UNLOCK" : "LOCK";
      btn.classList.toggle("danger", !locked);
      btn.classList.toggle("primary", locked);
    }

    document.querySelectorAll(".lock-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        const card = btn.closest(".access-card");
        const willUnlock = btn.textContent === "UNLOCK";
        renderLock(card, !willUnlock);
        log(
          `${card.dataset.door}: ${willUnlock ? "dibuka" : "dikunci"} pada sesi ini.`,
        );
      }),
    );

    bind("rfidLockMode", () => {
      const on = !isOn($("rfidLockMode"));
      setSwitch($("rfidLockMode"), on);
      $("rfidModeText").textContent = on
        ? "RFID diblokir oleh mode kunci."
        : "RFID diizinkan (simulasi).";
    });

    bind("rfidTest", () => {
      log(
        isOn($("rfidLockMode"))
          ? "Scan ditolak: mode kunci RFID aktif."
          : "Scan diterima: akses simulasi diberikan.",
      );
    });

    bind("lockAll", () => {
      document
        .querySelectorAll(".access-card")
        .forEach((card) => renderLock(card, true));
      log("Semua pintu dan gerbang ditandai terkunci (UI).");
    });
  }

  // ---------- Jalankan sesuai halaman ----------
  if ($("lampList")) initLamps();
  if ($("tankLevel")) initTank();
  if ($("joystick")) initCannon();
  if ($("cctvLayout")) initCctv();
  if ($("accessGrid")) initAccess();
})();
