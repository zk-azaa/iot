const LAMP_NAMES = [
    "Lampu Ruang Tamu",
    "Lampu Kamar",
    "Lampu Dapur",
    "Lampu Teras"
];

const LAMP_PINS = [
    "V0",
    "V1",
    null,
    null
];

let lamps = [false, false, false, false];


/* ==============================
   KONTROL PERANGKAT
================================ */

async function sendToBlynk(index, state) {

    const pin = LAMP_PINS[index];

    if (!pin) {
        console.warn("Lampu belum memiliki pin Blynk");
        return;
    }

    const value = state ? 1 : 0;

    const url =
        `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&${pin}=${value}`;

    try {

        const response = await fetch(url);

        console.log(
            `PIN: ${pin} | VALUE: ${value} | STATUS: ${response.status}`
        );

    } catch (error) {

        console.error(
            "Gagal mengirim perintah ke Blynk:",
            error
        );

    }
}


/* ==============================
   SET LAMPU
================================ */

async function setLamp(index, state) {

    lamps[index] = state;

    await sendToBlynk(index, state);

    updateDashboard();
}


async function toggleLamp(index) {

    await setLamp(index, !lamps[index]);

}


async function allLamp(state) {

    lamps = lamps.map(() => state);

    for (let i = 0; i < lamps.length; i++) {

        await sendToBlynk(i, state);

    }

    updateDashboard();

}


/* ==============================
   UPDATE DASHBOARD
================================ */

function updateDashboard() {

    lamps.forEach((state, index) => {

        const card =
            document.getElementById("card" + index);

        const status =
            document.getElementById("status" + index);

        const button =
            card.querySelector("button");


        if (state) {

            card.classList.add("active");

            status.innerText = "● MENYALA";

            button.innerText = "MATIKAN";

        } else {

            card.classList.remove("active");

            status.innerText = "● MATI";

            button.innerText = "NYALAKAN";

        }

    });


    const active =
        lamps.filter(Boolean).length;


    document.getElementById("totalLamp").innerText =
        lamps.length;

    document.getElementById("activeLamp").innerText =
        active;

    document.getElementById("offLamp").innerText =
        lamps.length - active;

}


/* ================= CHATBOX ================= */

        const chatMessages = document.getElementById("chatMessages");
        const chatInput = document.getElementById("chatInput");
        const chatSend = document.getElementById("chatSend");

        // Riwayat percakapan, siap dikirim ke API AI nanti.
        const chatHistory = [];

        function addMessage(role, text) {
            const el = document.createElement("div");
            el.className = "msg " + (role === "user" ? "user" : "bot");
            el.textContent = text;
            chatMessages.appendChild(el);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return el;
        }

        async function sendChat() {
            const text = chatInput.value.trim();
            if (!text) return;

            chatInput.value = "";
            addMessage("user", text);
            chatHistory.push({ role: "user", content: text });

            chatSend.disabled = true;
            const typing = addMessage("bot", "Mengetik...");
            typing.classList.add("typing");

            let reply;
            try {
                reply = await getAgentReply(text, chatHistory);
            } catch (err) {
                console.error(err);
                reply = "Maaf, terjadi kesalahan. Coba lagi sebentar.";
            }

            typing.remove();
            addMessage("bot", reply);
            chatHistory.push({ role: "assistant", content: reply });

            chatSend.disabled = false;
            chatInput.focus();
        }

        chatInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") sendChat();
        });

        /* ============================================================
           TITIK INTEGRASI AI AGENT
           Ganti isi fungsi ini dengan panggilan ke AI kamu
           (mis. backend / n8n / API LLM). Fungsi harus mengembalikan
           teks balasan. Untuk mengontrol lampu, panggil setLamp(index, state)
           atau allLamp(state), dan baca status dari array `lamps`.
           ============================================================ */
        async function getAgentReply(text, history) {
            const response = await fetch("http://localhost:3000/api/agent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    message: text,
                    history: history
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "AI Agent gagal merespons");
            }

            return data.reply || data.response || data.message;
        }

        // Versi demo tanpa AI: mengenali perintah sederhana.
        async function ruleBasedReply(text) {
            const t = text.toLowerCase();

            const turnOn = /(nyala|hidup)/.test(t) && !/(matikan|padam)/.test(t);
            const turnOff = /(mati|padam)/.test(t) && !/(nyalakan|hidupkan)/.test(t);
            const isAll = /(semua|seluruh)/.test(t);

            const keywords = [
                ["tamu"],
                ["kamar"],
                ["dapur"],
                ["teras"]
            ];
            const target = keywords.findIndex(k => k.some(w => t.includes(w)));

            if (/(status|berapa|kondisi|cek)/.test(t)) {
                const on = lamps
                    .map((s, i) => (s ? LAMP_NAMES[i] : null))
                    .filter(Boolean);
                return on.length
                    ? `Lampu yang menyala (${on.length}): ${on.join(", ")}.`
                    : "Semua lampu sedang mati.";
            }

            if (turnOn || turnOff) {
                const state = turnOn;
                const verb = state ? "dinyalakan" : "dimatikan";

                if (isAll) {
                    await allLamp(state);
                    return `Semua lampu sudah ${verb}.`;
                }

                if (target >= 0) {
                    await setLamp(target, state);
                    return `${LAMP_NAMES[target]} sudah ${verb}.`;
                }

                return "Lampu mana yang dimaksud? Sebutkan ruang tamu, kamar, dapur, teras, atau semua.";
            }

            return "Saya bisa menyalakan atau mematikan lampu, dan mengecek status. Coba: \"matikan semua lampu\" atau \"nyalakan lampu dapur\".";
        }

        /* ================= INIT ================= */

        updateDashboard();
        addMessage("bot", "Halo! Saya bisa membantu mengontrol lampu rumah. Coba ketik: \"nyalakan lampu kamar\".");