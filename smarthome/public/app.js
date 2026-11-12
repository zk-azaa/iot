const BLYNK_TOKEN = "iSq-7rW22aLSC5cRUKMQIE1HSWKiaE2F";

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

/* Virtual pin Blynk untuk servo (nilai 0-180).
   Di Datastream Blynk buat V4 & V5 bertipe Integer, min 0, max 180. */
const SERVO_PINS = { x: "V4", y: "V5" };

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


/* ==============================
   JOYSTICK SERVO
================================ */

const pad = document.getElementById("pad");
const knob = document.getElementById("knob");
const sxEl = document.getElementById("sx");
const syEl = document.getElementById("sy");
const servoModeEl = document.getElementById("servoMode");
const servoLogEl = document.getElementById("servoLog");

const arrows = {
    up: document.getElementById("aUp"),
    down: document.getElementById("aDown"),
    left: document.getElementById("aLeft"),
    right: document.getElementById("aRight")
};

const KNOB_MAX = 62;          // jarak maksimum knob (px) dari pusat
const SERVO_INTERVAL = 120;   // jeda minimum antar kirim ke Blynk (ms)
const KEY_STEP = 5;           // derajat per tekan tombol panah
const INVERT_Y = true;       // ubah ke true kalau gerak vertikal terbalik

let servo = { x: 90, y: 90 };          // sudut servo saat ini
let servoSent = { x: null, y: null };  // sudut terakhir yang terkirim
let servoTimer = null;
let lastServoSend = 0;
let dragging = false;

const clampAngle = (v) => Math.max(0, Math.min(180, Math.round(v)));

/* Kirim X & Y sekaligus dalam satu request, dengan pembatas kecepatan.
   Nilai terbaru selalu yang dikirim, jadi posisi akhir pasti sampai. */
function scheduleServoSend() {
    if (servoTimer) return;

    const wait = Math.max(
        0,
        SERVO_INTERVAL - (Date.now() - lastServoSend)
    );

    servoTimer = setTimeout(flushServo, wait);
}

async function flushServo() {
    servoTimer = null;

    if (servo.x === servoSent.x && servo.y === servoSent.y) return;

    const { x, y } = servo;
    servoSent = { x, y };

    try {
        await fetch(
            `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&V4=${x}`
        );

        await fetch(
            `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&V5=${y}`
        );

        servoLogEl.classList.remove("error");
        servoLogEl.textContent =
            `Terkirim: X=${x}° Y=${y}°`;

    } catch (error) {
        console.error("Gagal mengirim servo ke Blynk:", error);
        servoLogEl.classList.add("error");
        servoLogEl.textContent = "Gagal terhubung ke Blynk. Cek koneksi internet.";
    }
}

/* Setel sudut servo (0-180) dan gambar posisi knob + angka. */
function setServo(x, y, { moveKnob = true, send = true } = {}) {
    servo.x = clampAngle(x);
    servo.y = clampAngle(y);

    sxEl.textContent = servo.x + "°";
    syEl.textContent = servo.y + "°";

    const dx = (servo.x - 90) / 90 * KNOB_MAX;
    const dy = (servo.y - 90) / 90 * KNOB_MAX * (INVERT_Y ? -1 : 1);

    if (moveKnob) knob.style.transform = `translate(${dx}px, ${dy}px)`;

    updateArrows(dx, dy);

    if (send) scheduleServoSend();
}

function updateArrows(dx, dy) {
    const t = KNOB_MAX * 0.4;
    arrows.up.classList.toggle("on", dy < -t);
    arrows.down.classList.toggle("on", dy > t);
    arrows.left.classList.toggle("on", dx < -t);
    arrows.right.classList.toggle("on", dx > t);
}

/* Dari posisi pointer -> sudut servo */
function moveFromPointer(e) {
    const r = pad.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);

    const d = Math.hypot(dx, dy);
    if (d > KNOB_MAX) {
        dx = dx / d * KNOB_MAX;
        dy = dy / d * KNOB_MAX;
    }

    const x = 90 + dx / KNOB_MAX * 90;
    const y = 90 + (INVERT_Y ? -dy : dy) / KNOB_MAX * 90;

    setServo(x, y);
}

function centerServo() {
    setServo(90, 90);
}

pad.addEventListener("pointerdown", (e) => {
    dragging = true;
    knob.classList.add("drag");
    pad.setPointerCapture(e.pointerId);
    pad.focus({ preventScroll: true });
    moveFromPointer(e);
});

pad.addEventListener("pointermove", (e) => {
    if (dragging) moveFromPointer(e);
});

function endDrag() {
    if (!dragging) return;

    dragging = false;
    knob.classList.remove("drag");

    const mode = servoModeEl.value;

    if (mode === "spring") {
        // knob dan servo sama-sama kembali ke 90°
        setServo(90, 90);

    } else if (mode === "latch") {
        // knob kembali ke tengah, servo tetap di sudut terakhir
        knob.style.transform = "translate(0, 0)";
        updateArrows(0, 0);
        scheduleServoSend(); // pastikan nilai akhir terkirim
    } else {
        scheduleServoSend();
    }
}

pad.addEventListener("pointerup", endDrag);
pad.addEventListener("pointercancel", endDrag);

/* Keyboard: aktif hanya saat joystick sedang difokuskan,
   jadi tidak bentrok dengan kolom chat. */
pad.addEventListener("keydown", (e) => {
    const dir = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0]
    }[e.key];

    if (!dir) return;
    e.preventDefault();

    setServo(
        servo.x + dir[0] * KEY_STEP,
        servo.y + dir[1] * KEY_STEP * (INVERT_Y ? -1 : 1)
    );
});


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
   Fungsi ini harus mengembalikan teks balasan. Untuk mengontrol
   perangkat dari AI: setLamp(index, state), allLamp(state),
   setServo(x, y) (0-180), centerServo(), dan baca status dari
   array `lamps` / objek `servo`.
   ============================================================ */
async function getAgentReply(text, history) {
    const response = await fetch("https://homebyzk-ai.fly.dev/api/agent", {
    //const response = await fetch("http://localhost:3000/api/agent", {
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
setServo(90, 90, { send: false });
