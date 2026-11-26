
window.SMART_HOME_CONFIG = {
  PINS: {
    lampu: ["V0", "V1", null, null],

    // Water Tank dikontrol melalui API server,
    // bukan langsung dari browser.
    pompaTangki: V6,
    autoPompa: V8,
    levelTangki: V7,
    batasPompa: V9,

    waterCannon: null,
    waterCannonServoX: "V4",
    waterCannonServoY: "V5",
  },

  CAMERAS: {
    waterCannon: "/cam/waterCannon",
    cctv1: "",
    cctv2: "",
    cctv3: "",
    cctv4: "",
  },
};

// URL kamera dengan token autentikasi
window.camUrl = function (path) {
  if (!path) return "";

  const token = localStorage.getItem("access_token") || "";
  return `${path}?token=${encodeURIComponent(token)}`;
};
