import { runAgent } from "../server/agent.js";

export default async (request) => {
    // Hanya menerima POST
    if (request.method !== "POST") {
        return new Response(
            JSON.stringify({
                success: false,
                error: "Method tidak diizinkan"
            }),
            {
                status: 405,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }

    try {
        const body = await request.json();

        const message = body.message;

        if (!message) {
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "Pesan tidak boleh kosong"
                }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json"
                    }
                }
            );
        }

        console.log("📩 Pesan untuk Afna:", message);

        // Jalankan AI Agent
        const reply = await runAgent(message);

        return new Response(
            JSON.stringify({
                success: true,
                reply: reply
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

    } catch (error) {

        console.error("❌ Error AI:", error);

        return new Response(
            JSON.stringify({
                success: false,
                error: "Terjadi kesalahan pada AI Agent."
            }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
    }
};