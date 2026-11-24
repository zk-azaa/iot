window.SMART_HOME_CONFIG = {
  PINS: {
    lampu: ["V0", "V1", null, null],
    pompaTangki: null,
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

// Tambahkan token login ke URL kamera (tag <img> tidak bisa kirim header)
window.camUrl = function (path) {
  if (!path) return "";
  const token = localStorage.getItem("access_token") || "";
  return `${path}?token=${encodeURIComponent(token)}`;
};