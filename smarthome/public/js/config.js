// Konfigurasi sisi browser — HANYA data non-rahasia.
// Token Blynk dan API key Groq ada di file .env (dibaca server.js), bukan di sini.
window.SMART_HOME_CONFIG = {
  // Mapping virtual pin Blynk. null = belum ada mapping (kontrol hanya simulasi UI).
  PINS: {
    lampu: ["V0", "V1", null, null], // Ruang tamu, kamar, dapur, teras
    pompaTangki: null,
    waterCannon: null,
    waterCannonServoX: "V4",
    waterCannonServoY: "V5",
  },


  CAMERAS: {
    waterCannon: "http://192.168.137.11/stream",
    cctv1: "",
    cctv2: "",
    cctv3: "",
    cctv4: "",
  },
};
