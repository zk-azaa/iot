import "dotenv/config";
import Groq from "groq-sdk";

import {
    controlLamp,
    controlAllLamps,
    getHomeStatus,
    controlServo,
    controlWaterCannon
} from "./tools.js";


// ==============================
// KONEKSI KE AI
// ==============================

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

console.log(
  "GROQ KEY:",
  process.env.GROQ_API_KEY ? "ADA" : "KOSONG"
);


// ==============================
// TOOLS YANG BISA DIPAKAI AI
// ==============================

const tools = [
    {
        type: "function",
        function: {
            name: "control_lamp",
            description:
                "Mengontrol satu lampu di Smart Home. Gunakan untuk menyalakan atau mematikan lampu tertentu.",
            parameters: {
                type: "object",
                properties: {
                    lamp_id: {
                        type: "string",
                        enum: [
                            "ruang_tamu",
                            "kamar",
                            "dapur",
                            "teras"
                        ],
                        description: "ID lampu yang akan dikontrol."
                    },
                    state: {
                        type: "string",
                        enum: ["on", "off"],
                        description: "Status lampu."
                    }
                },
                required: ["lamp_id", "state"],
                additionalProperties: false
            }
        }
    },

    {
        type: "function",
        function: {
            name: "control_all_lamps",
            description:
                "Menyalakan atau mematikan seluruh lampu Smart Home.",
            parameters: {
                type: "object",
                properties: {
                    state: {
                        type: "string",
                        enum: ["on", "off"]
                    }
                },
                required: ["state"],
                additionalProperties: false
            }
        }
    },

    {
        type: "function",
        function: {
            name: "get_home_status",
            description:
                "Mengecek status seluruh lampu di Smart Home.",
            parameters: {
                type: "object",
                properties: {},
                additionalProperties: false
            }
        }
    },

    {
        type: "function",
        function: {
            name: "control_servo",
            description:
                "Mengontrol servo water cannon. Gunakan horizontal untuk mengatur arah kiri dan kanan, serta vertical untuk mengatur arah atas dan bawah.",
            parameters: {
                type: "object",
                properties: {
                    servo_id: {
                        type: "string",
                        enum: ["horizontal", "vertical"],
                        description:
                            "Pilih horizontal atau vertical."
                    },
                    angle: {
                        type: "integer",
                        minimum: 0,
                        maximum: 180,
                        description:
                            "Sudut servo dalam derajat."
                    }
                },
                required: ["servo_id", "angle"],
                additionalProperties: false
            }
        }
    }
];


// ==============================
// MENJALANKAN TOOL
// ==============================

async function executeTool(name, args) {

    switch (name) {

        case "control_lamp":
            return await controlLamp(
                args.lamp_id,
                args.state
            );

        case "control_all_lamps":
            return await controlAllLamps(
                args.state
            );

        case "get_home_status":
            return getHomeStatus();

        case "control_servo":
            return await controlServo(
                args.servo_id,
                args.angle
            );

        default:
            return {
                success: false,
                message: "Tool tidak ditemukan."
            };
    }
}


// ==============================
// MENJALANKAN AI AGENT
// ==============================

export async function runAgent(
    message,history = []) {
    const now = new Date()    

    const instructions = `
    WAKTU SISTEM SAAT INI:
    Tanggal: ${now.toLocaleDateString("id-ID")}
    Jam: ${now.toLocaleTimeString("id-ID")}
    Zona waktu: WIB

    ATURAN PENTING:
    - Anggap informasi waktu di atas adalah benar.
    - Jika pengguna menanyakan jam, tanggal, hari, atau waktu saat ini, gunakan informasi waktu di atas.
    - Jangan menebak tanggal atau jam dari pengetahuanmu sendiri.
    - Balas menggunakan teks biasa.
    - Jangan gunakan markdown.
    - Jangan gunakan **, *, #, _, atau tanda format lainnya.
    - Jangan gunakan blok kode kecuali diminta.


    IDENTITAS:
    Namamu adalah Afna.
    nama afna yang artinya Artificial Friend for Network Automation
    Kamu adalah AI Assistant pribadi yang menjadi pusat kecerdasan sistem Smart Home.

    Jika pengguna bertanya siapa namamu, jawab bahwa namamu Afna,Artificial Friend for Network Automation(A.F.N.A).
    Jangan pernah memperkenalkan dirimu sebagai Groq, OpenAI, atau AI Agent biasa.
    Kamu adalah Afna, asisten virtual Smart Home.

    KEPRIBADIAN:
    - selalu menyebut diri menggunakan nama "afna", contoh "ada yang bisa afna bantu?, afna sudah matikan atau nyalakan."
    - Ramah, cerdas, sopan, dan komunikatif.
    - Gunakan Bahasa Indonesia yang natural dan santai.
    - Bisa diajak ngobrol tentang berbagai topik.
    - Jangan terlalu kaku atau selalu menjawab seperti robot.
    - Sesuaikan gaya bicara dengan konteks percakapan.
    - Gunakan humor ringan jika situasinya sesuai.
    - Jawab pertanyaan dengan jelas dan tidak bertele-tele.

    TUGAS UTAMA:
    Kamu membantu pengguna mengelola dan mengontrol Smart Home.

    Kemampuan perangkat saat ini:
    1. Mengontrol lampu ruang tamu.
    2. Mengontrol lampu kamar.
    3. Mengontrol lampu dapur.
    4. Mengontrol lampu teras.
    5. Menyalakan seluruh lampu.
    6. Mematikan seluruh lampu.
    7. Mengecek status seluruh lampu.
    8. Mengontrol servo horizontal water cannon.
    9. Mengontrol servo vertikal water cannon.
    10. Mengatur sudut servo dari 0 sampai 180 derajat.

    - Gunakan control_lamp untuk mengontrol satu lampu.
    - Gunakan control_all_lamps untuk mengontrol seluruh lampu.
    - Gunakan get_home_status untuk mengecek kondisi lampu.
    - Gunakan tools jika pengguna meminta tindakan atau informasi aktual perangkat.
    - Jangan mengarang status perangkat.
    - Jangan mengatakan perintah berhasil sebelum tool memberikan hasil sukses.
    - Jika tool gagal, jelaskan bahwa perintah belum berhasil.

    - Gunakan control_servo untuk menggerakkan servo water cannon.
    - Servo horizontal digunakan untuk mengatur arah kiri dan kanan.
    - Servo vertical digunakan untuk mengatur arah atas dan bawah.
    - Jangan mengklaim servo bergerak secara fisik hanya berdasarkan respons Blynk.
    - Jika pengguna menyebut arah tanpa sudut, tentukan sudut secara wajar berdasarkan posisi yang diketahui.
    - Jika posisi awal tidak diketahui, tanyakan atau jelaskan asumsi sudut yang digunakan.

    ATURAN PERCAKAPAN:
    - kamu panggil aku boss
    - Kamu boleh menjawab pertanyaan umum tanpa menggunakan tools.
    - Kamu boleh mengobrol, bercanda, memberikan saran, dan menjelaskan sesuatu.
    - Jangan memaksakan pembicaraan selalu berkaitan dengan Smart Home.
    - Jika pengguna menyebut lampu tanpa menyebut ruangan, tanyakan ruangan yang dimaksud.
    - Pahami maksud pengguna meskipun menggunakan bahasa informal.

    IDENTITAS DAN BATASAN:
    - Kamu adalah Afna, asisten pribadi Smart Home.
    - Jangan mengaku memiliki kemampuan yang belum tersedia.
    - Jangan mengarang informasi tentang kondisi rumah.
    - Utamakan keselamatan dan keamanan pengguna.

    Selalu gunakan Bahasa Indonesia.
    `;


    const messages = [
        {
            role: "system",
            content: instructions
        },
        ...history,
        {
            role: "user",
            content: message
        }
    ];


    // Kirim pesan ke AI
    let response = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages,
        tools,
        tool_choice: "auto"
    });

    let assistantMessage = response.choices[0].message;

    // Jika AI ingin menggunakan tool
    while (assistantMessage.tool_calls) {

        // Masukkan respons AI ke riwayat percakapan
        messages.push(assistantMessage);

        for (const toolCall of assistantMessage.tool_calls) {

            const functionName =
                toolCall.function.name;

            const args =
                JSON.parse(
                    toolCall.function.arguments
                );

            console.log(
                "🤖 AI menjalankan:",
                functionName,
                args
            );

            // Jalankan fungsi asli dari tools.js
            const result =
                await executeTool(
                    functionName,
                    args
                );

            // Kirim hasil tool kembali ke AI
            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result)
            });
        }

        // AI melanjutkan setelah mendapatkan hasil tool
        response = await groq.chat.completions.create({
            model: "openai/gpt-oss-20b",
            messages,
            tools,
            tool_choice: "auto"
        });

        assistantMessage = response.choices[0].message;
    }

    // let cleanResponse = assistantMessage.content || "";

    // cleanResponse = cleanResponse
    // .replace(/\*\*/g, "")
    // .replace(/\*/g, "")
    // .replace(/#/g, "")
    // .replace(/`/g, "")
    // .replace(/__/g, "");

    return assistantMessage.content || "";
}