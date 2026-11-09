import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";

import { fileURLToPath } from "url";

import { runAgent } from "./agent.js";


const app = express();


// ==============================
// MIDDLEWARE
// ==============================

app.use(cors());
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

        const { message } = req.body;


        // Cek pesan
        if (!message) {

            return res.status(400).json({
                success: false,
                error: "Instruksi tidak boleh kosong."
            });

        }


        console.log("📩 Instruksi:", message);


        // Kirim instruksi ke AI Agent
        const reply = await runAgent(message);


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

app.listen(PORT, () => {

    console.log("");
    console.log("🏠 Smart Home Server berjalan!");
    console.log(
        `🌐 Buka: http://localhost:${PORT}`
    );
    console.log("");

});