import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";

import { runAgent } from "./agent.js";


const app = express();

app.use((req, res, next) => {
    console.log("REQ:", req.method, req.url);

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();
});


// ==============================
// MIDDLEWARE
// ==============================

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());


// ==============================
// MENENTUKAN FOLDER PUBLIC
// ==============================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Menampilkan dashboard dari folder public
 app.use(
     express.static(
         path.join(__dirname, "../public")
     )
);


// ==============================
// API AI AGENT
// ==============================

app.post("/api/agent", async (req, res) => {

    try {

        const { 
            message,
            history = []
         } = req.body;


        // Cek pesan
        if (!message) {

            return res.status(400).json({
                success: false,
                error: "Instruksi tidak boleh kosong."
            });

        }


        console.log("📩 Instruksi:", message);


        // Kirim instruksi ke AI Agent
        const reply = await runAgent(
            message,
            history
        );


        // Kirim hasil kembali ke dashboard
        res.json({
            success: true,
            reply: reply
        });


    } catch (error) {

        console.error(
            "❌ Terjadi error pada AI Agent:",
            error
        );


        res.status(500).json({
            success: false,
            error: "Terjadi kesalahan pada AI Agent."
        });

    }

});


// ==============================
// MENJALANKAN SERVER
// ==============================

const PORT = process.env.PORT || 3000;

app.listen(PORT,"0.0.0.0",() => {

    console.log("");
    console.log("🏠 Smart Home Server berjalan!");
    console.log(`server listening on 0.0.0.0:${PORT}`);
    console.log(
        `🌐 Buka: http://localhost:${PORT}`
    );
    console.log("");

});