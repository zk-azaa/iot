import "dotenv/config";

import express from "express";
import cors from "cors";

import path from "path";
import { fileURLToPath } from "url";

import { createClient } from "@supabase/supabase-js";

// import { runAgent } from "./agent.js";

// import {
//   controlLamp,
//   controlAllLamps,
//   controlServo,
//   controlWaterCannon,
//   getHomeStatus
// } from "./tools.js";
console.log("SERVER START");
console.log("SUPABASE_URL =", process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY =", !!process.env.SUPABASE_ANON_KEY);
console.log("GROQ_API_KEY =", !!process.env.GROQ_API_KEY);

const app = express();

const __dirname = path.dirname(
  fileURLToPath(import.meta.url)
);

app.use(
  express.static(
    path.join(__dirname, "../public")
  )
);

// ==============================
// SUPABASE AUTHENTICATION
// ==============================

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Middleware untuk memeriksa login
async function verifyUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Silakan login terlebih dahulu."
      });
    }

    const token = authHeader.substring(7);

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({
        success: false,
        message: "Session tidak valid. Silakan login kembali."
      });
    }

    req.user = data.user;

    next();

  } catch (error) {
    console.error("Auth error:", error);

    return res.status(401).json({
      success: false,
      message: "Gagal memverifikasi autentikasi."
    });
  }
}

// ==============================
// MIDDLEWARE
// ==============================

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

app.use((req, res, next) => {
  console.log("REQ:", req.method, req.url);
  next();
});


// TEST VERCEL ENV
app.get("/api/test", (req, res) => {
  res.json({
    node: process.version,
    supabase: !!process.env.SUPABASE_URL,
    anon: !!process.env.SUPABASE_ANON_KEY,
    groq: !!process.env.GROQ_API_KEY
  });
});

// ==============================
// API CONFIG
// ==============================

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY
  });
});

// ==============================
// API AI AGENT (WAJIB LOGIN)
// ==============================

app.post("/api/agent", verifyUser, async (req, res) => {
  try {
    const {
      message,
      history = []
    } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Instruksi tidak boleh kosong."
      });
    }

    console.log("📩 Instruksi:", message);
    console.log("👤 User:", req.user.email);

    const reply = await runAgent(message, history);

    return res.json({
      success: true,
      reply: reply
    });

  } catch (error) {
    console.error("❌ Terjadi error pada AI Agent:", error);

    return res.status(500).json({
      success: false,
      error: "Terjadi kesalahan pada AI Agent."
    });
  }
});

// ==============================
// API DEVICE (WAJIB LOGIN)
// ==============================

app.post("/api/device", verifyUser, async (req, res) => {
  try {
    const { type } = req.body;

    console.log("👤 Device request dari:", req.user.email);

    switch (type) {

      case "lamp":
        return res.json(
          await controlLamp(
            req.body.lampId,
            req.body.state
          )
        );

      case "all_lamps":
        return res.json(
          await controlAllLamps(
            req.body.state
          )
        );

      case "servo":
        return res.json(
          await controlServo(
            req.body.servo,
            Number(req.body.angle)
          )
        );

      case "cannon":
        return res.json(
          await controlWaterCannon(
            Number(req.body.x),
            Number(req.body.y)
          )
        );

      case "status":
        return res.json(getHomeStatus());

      default:
        return res.status(400).json({
          success: false,
          message: "Perintah tidak dikenal."
        });
    }

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ==============================
// MENJALANKAN SERVER
// ==============================

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server berjalan di port ${PORT}`);
  });
}

export default app;