// Halaman utama: jam, dropdown pengaturan, dan tombol logout.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- Tanggal & waktu ----------
  const dateTime = $("dateTime");
  const formatter = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function updateDateTime() {
    if (dateTime) dateTime.textContent = formatter.format(new Date());
  }
  updateDateTime();
  setInterval(updateDateTime, 60_000);

  // ---------- Dropdown pengaturan ----------
  const toggle = $("settingsToggle");
  const menu = $("settingsMenu");
  const logout = $("logoutButton");
  if (!toggle || !menu) return;

  function setMenu(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".settings-wrap")) setMenu(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setMenu(false);
  });

  // Titik integrasi autentikasi (Supabase/Firebase/dll).
  logout?.addEventListener("click", () => {
    if (!window.confirm("Yakin ingin keluar dari akun?")) return;
    setMenu(false);
  });

  document
  .getElementById("logoutButton")
    .addEventListener("click", () => {

      localStorage.removeItem(
        "access_token"
      );

      location.href = "/login.html";
  });
})();
