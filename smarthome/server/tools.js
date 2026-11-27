import "dotenv/config";

import {
    readTankStatus,
    classifyTank,
    writeTankPin,
    TANK_PINS
} from "./tank-monitor.js";

import {
    
    ACCESS_DOORS,
    AccessError,
    readAccessStatus,
    sendDoorCommand,
    sendLockAll,
    sendRfidMode
} from "./acces-routes.js";

const BLYNK_TOKEN = process.env.BLYNK_TOKEN;


// ==============================
// DATA PERANGKAT SMART HOME
// ==============================

const lamps = [
    {
        id: "ruang_tamu",
        name: "Lampu Ruang Tamu",
        pin: "V0",
        state: false
    },
    {
        id: "kamar",
        name: "Lampu Kamar",
        pin: "V1",
        state: false
    },
    {
        id: "dapur",
        name: "Lampu Dapur",
        pin: "V2",
        state: false
    },
    {
        id: "teras",
        name: "Lampu Teras",
        pin: "V3",
        state: false
    }
];

const SERVO_PINS = {
    horizontal: "V4",
    vertical: "V5"
};


// ==============================
// TOOL: KONTROL SATU LAMPU
// ==============================

export async function controlLamp(lampId, state) {

    const lamp = lamps.find(
        item => item.id === lampId
    );

    // Cek apakah lampu ditemukan
    if (!lamp) {
        return {
            success: false,
            message: "Lampu tidak ditemukan."
        };
    }

    // Cek apakah lampu sudah terhubung ke Blynk
    if (!lamp.pin) {
        return {
            success: false,
            message: `${lamp.name} belum terhubung ke Blynk.`
        };
    }

    const value = state === "on" ? 1 : 0;

    const url =
        `https://blynk.cloud/external/api/update?token=${BLYNK_TOKEN}&${lamp.pin}=${value}`;

    try {

        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `Blynk error ${response.status}: ${errorText}`
            );
        }

        // Simpan status terbaru
        lamp.state = state === "on";

        return {
            success: true,
            device: lamp.name,
            state: state,
            message: `${lamp.name} berhasil ${
                state === "on"
                    ? "dinyalakan"
                    : "dimatikan"
            }.`
        };

    } catch (error) {

        console.error(
            "Gagal mengontrol lampu:",
            error
        );

        return {
            success: false,
            message: `Gagal mengontrol ${lamp.name}.`
        };
    }
}


// ==============================
// TOOL: KONTROL SEMUA LAMPU
// ==============================

export async function controlAllLamps(state) {

    const results = [];

    for (const lamp of lamps) {

        // Lewati perangkat yang belum terhubung
        if (!lamp.pin) {
            continue;
        }

        const result = await controlLamp(
            lamp.id,
            state
        );

        results.push(result);
    }

    return {
        success: true,
        message: `Perintah untuk ${
            state === "on"
                ? "menyalakan"
                : "mematikan"
        } semua lampu telah dijalankan.`,
        results
    };
}


// ==============================
// TOOL: CEK STATUS RUMAH
// ==============================

export async function getHomeStatus() {

    // Baca nilai terakhir dari Blynk. Jika gagal, pakai cache di memori.
    await Promise.all(
        lamps.map(async lamp => {

            if (!lamp.pin || !BLYNK_TOKEN) return;

            try {
                const response = await fetch(
                    `https://blynk.cloud/external/api/get?token=${BLYNK_TOKEN}&${lamp.pin}`,
                    { signal: AbortSignal.timeout(8000) }
                );

                if (!response.ok) return;

                const value = (await response.text())
                    .replace(/[\[\]"]/g, "")
                    .trim();

                if (value !== "") lamp.state = Number(value) === 1;

            } catch {
                // abaikan, pakai cache
            }
        })
    );

    return {
        note: "Status lampu adalah perintah terakhir yang tercatat di Blynk.",
        lamps: lamps.map(lamp => ({
            id: lamp.id,
            name: lamp.name,
            state: lamp.state
                ? "on"
                : "off",
            connected: lamp.pin !== null
        }))
    };
}

// ==============================
// TOOL: KONTROL SERVO WATER CANNON
// ==============================

const servoPositions = {
    horizontal: 90,
    vertical: 90
};

export async function controlServo(servo_id, angle) {

    const pin = SERVO_PINS[servo_id];

    // Validasi servo dan sudut
    if (
        !pin ||
        !Number.isInteger(angle) ||
        angle < 0 ||
        angle > 180
    ) {
        return {
            success: false,
            message: "Servo atau sudut tidak valid."
        };
    }

    // Pastikan token tersedia
    if (!BLYNK_TOKEN) {
        return {
            success: false,
            message: "BLYNK_TOKEN belum dikonfigurasi."
        };
    }

    const url = new URL(
        "https://blynk.cloud/external/api/update"
    );

    url.searchParams.set("token", BLYNK_TOKEN);
    url.searchParams.set(pin, angle);

    try {

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Blynk error ${response.status}: ${await response.text()}`
            );
        }

        servoPositions[servo_id] = angle;

        return {
            success: true,
            servo: servo_id,
            pin: pin,
            angle: angle,
            message: `Perintah servo ${servo_id} sebesar ${angle} derajat berhasil dikirim ke Blynk.`
        };

    } catch (error) {

        console.error("Gagal mengontrol servo:", error);

        return {
            success: false,
            message: `Gagal mengirim perintah servo ${servo_id} ke Blynk.`
        };
    }

    
}
// ==============================
    // TOOL: KONTROL KEDUA SERVO SEKALIGUS
    // ==============================

    export async function controlWaterCannon(
        horizontal_angle,
        vertical_angle
    ) {

        const results = await Promise.all([
            controlServo("horizontal", horizontal_angle),
            controlServo("vertical", vertical_angle)
        ]);

        const success = results.every(
            result => result.success
        );

        return {
            success,
            horizontal: results[0],
            vertical: results[1],
            message: success
                ? "Perintah kedua servo berhasil dikirim ke Blynk."
                : "Sebagian atau seluruh perintah servo gagal dikirim."
        };
    }


// ==============================
// UTIL
// ==============================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Waktu tunggu agar ESP dan Mega sempat menjalankan perintah dan melapor balik ke Blynk
const SETTLE_MS = 1500;


// ==============================
// TOOL: MONITORING WATER TANK
// ==============================

const ZONE_TEXT = {
    critical: "kritis, hampir kosong",
    low: "hampir habis",
    normal: "normal",
    full: "penuh, sudah mencapai batas atas",
    sensor_error: "sensor level error",
    offline: "perangkat offline",
    unknown: "belum ada data"
};

function describeTank(status) {

    const zone = classifyTank(status);

    return {
        online: status.online,
        level_percent: status.level,
        pump_on: status.pump,
        auto_mode: status.auto,
        auto_low_percent: status.low,
        auto_high_percent: status.high,
        condition: zone,
        condition_text: ZONE_TEXT[zone] || zone
    };
}

export async function getTankStatus() {

    try {

        const status = await readTankStatus();

        if (!status.online) {
            return {
                success: false,
                online: false,
                message: "Perangkat tangki sedang offline, data level tidak bisa dipercaya."
            };
        }

        return {
            success: true,
            ...describeTank(status)
        };

    } catch (error) {

        console.error("Gagal membaca tangki:", error.message);

        return {
            success: false,
            message: "Gagal membaca status tangki dari Blynk."
        };
    }
}

// Pompa dan mode otomatis dijaga oleh Arduino Mega (cut-off penuh, batas waktu,
// sensor error), jadi perintah ON bisa ditolak. Hasil dibaca ulang dari perangkat.
async function sendTankCommand(pin, value, check) {

    let before;

    try {
        before = await readTankStatus();
    } catch (error) {
        console.error("Gagal membaca tangki:", error.message);
        return { success: false, message: "Gagal menghubungi Blynk." };
    }

    if (!before.online) {
        return {
            success: false,
            message: "Perangkat tangki sedang offline, perintah tidak dikirim."
        };
    }

    try {
        await writeTankPin(pin, value);
    } catch (error) {
        console.error("Gagal mengirim perintah tangki:", error.message);
        return { success: false, message: "Gagal mengirim perintah ke Blynk." };
    }

    await sleep(SETTLE_MS);

    try {

        const after = await readTankStatus();
        const applied = check(after);

        return {
            success: applied,
            ...describeTank(after),
            message: applied
                ? "Perintah dijalankan dan sudah terkonfirmasi dari perangkat."
                : "Perintah terkirim, tetapi perangkat tidak menjalankannya. Pengaman Arduino Mega bisa menolak, misalnya karena tangki sudah penuh atau sensor error."
        };

    } catch (error) {

        return {
            success: false,
            message: "Perintah terkirim, tetapi hasilnya belum bisa dipastikan."
        };
    }
}

export async function controlTankPump(state) {

    if (state !== "on" && state !== "off") {
        return { success: false, message: "State pompa harus on atau off." };
    }

    const on = state === "on";

    return sendTankCommand(
        TANK_PINS.pump,
        on ? 1 : 0,
        status => status.pump === on
    );
}

export async function setTankAuto(state) {

    if (state !== "on" && state !== "off") {
        return { success: false, message: "State otomatis harus on atau off." };
    }

    const on = state === "on";

    return sendTankCommand(
        TANK_PINS.auto,
        on ? 1 : 0,
        status => status.auto === on
    );
}

export async function setTankLimits(low, high) {

    if (
        !Number.isInteger(low) ||
        !Number.isInteger(high) ||
        low < 5 ||
        high > 95 ||
        high - low < 10
    ) {
        return {
            success: false,
            message: "Batas tidak valid. Batas bawah minimal 5, batas atas maksimal 95, dan selisihnya minimal 10."
        };
    }

    return sendTankCommand(
        TANK_PINS.limits,
        `${low},${high}`,
        status => status.low === low && status.high === high
    );
}


// ==============================
// TOOL: AKSES GERBANG DAN PINTU
// ==============================
// Aturan keamanan:
// - Hanya pengguna yang login di dashboard, atau chat Telegram yang terdaftar.
// - Mengunci selalu langsung dijalankan.
// - Membuka pintu/gerbang atau mengizinkan RFID WAJIB konfirmasi "ya" dari pengguna.
//   Konfirmasi dicek di server dari pesan asli pengguna, bukan dari keputusan AI.
// - Lewat suara, membuka pintu dinonaktifkan (mikrofon aktif terus dan bisa salah dengar).

const CONFIRM_TTL_MS = 60 * 1000;

const pendingAccess = new Map();

const CONFIRM_PATTERN =
    /^\s*(ya|iya+|yes|y|ok|oke|okay|lanjut|lanjutkan|gas|konfirmasi|setuju|boleh|silakan|yakin)(\s+(boss|bos|afna|deh|dong|aja|saja|buka|sekarang))*\s*[.!]*\s*$/i;

export function isConfirmation(text) {
    return CONFIRM_PATTERN.test(String(text || ""));
}

// Pesan selain konfirmasi membatalkan tindakan yang sedang menunggu
export function resetPendingUnlessConfirm(userKey, text) {
    if (!isConfirmation(text)) pendingAccess.delete(userKey);
}

export function describePendingAccess(userKey) {

    const pending = pendingAccess.get(userKey);

    if (!pending || pending.expires < Date.now()) return null;

    return pending.description;
}

function accessGuard(context) {

    if (!context?.canControlAccess) {
        return {
            success: false,
            message: "Kontrol dan status pintu atau gerbang lewat Afna hanya untuk pengguna yang sudah login di dashboard, atau chat Telegram yang terdaftar."
        };
    }

    return null;
}

function voiceUnlockBlocked(context) {

    if (
        context.source === "voice" &&
        process.env.AFNA_ALLOW_VOICE_UNLOCK !== "true"
    ) {
        return {
            success: false,
            message: "Membuka pintu atau gerbang lewat suara dinonaktifkan demi keamanan. Minta boss mengetik perintahnya di chat."
        };
    }

    return null;
}

function stateText(open) {
    return open ? "terbuka" : "terkunci";
}

function accessError(error) {

    if (error instanceof AccessError) {
        return { success: false, message: error.message };
    }

    console.error("Gagal kontrol akses:", error);

    return { success: false, message: "Gagal mengirim perintah akses." };
}

async function runDoorCommand(door, open) {

    try {

        const sent = await sendDoorCommand(door, open, "afna");

        await sleep(SETTLE_MS);

        let actual = null;

        try {
            const status = await readAccessStatus();
            if (status.online) actual = status.doors[door];
        } catch {
            // status gagal dibaca, laporkan apa adanya
        }

        const verified = actual === open;

        return {
            success: true,
            door,
            name: sent.name,
            requested: stateText(open),
            actual: actual === null ? "tidak diketahui" : stateText(actual),
            verified,
            message: verified
                ? `${sent.name} sudah ${stateText(open)} (terkonfirmasi dari perangkat).`
                : `Perintah untuk ${sent.name} sudah dikirim, tetapi status perangkat belum terkonfirmasi ${stateText(open)}.`
        };

    } catch (error) {
        return accessError(error);
    }
}

async function runRfidMode(blocked) {

    try {

        await sendRfidMode(blocked, "afna");

        await sleep(SETTLE_MS);

        let actual = null;

        try {
            const status = await readAccessStatus();
            if (status.online) actual = status.rfidBlocked;
        } catch {
            // abaikan
        }

        const verified = actual === blocked;

        return {
            success: true,
            rfid_blocked: actual,
            verified,
            message: verified
                ? `Mode kunci RFID sekarang ${blocked ? "aktif, kartu tidak bisa membuka akses" : "mati, kartu terdaftar bisa membuka akses"}.`
                : "Perintah mode RFID sudah dikirim, tetapi belum terkonfirmasi dari perangkat."
        };

    } catch (error) {
        return accessError(error);
    }
}

export async function getAccessStatus(context) {

    const denied = accessGuard(context);
    if (denied) return denied;

    try {

        const status = await readAccessStatus();

        if (!status.online) {
            return {
                success: false,
                online: false,
                message: status.reason === "mega"
                    ? "Arduino Mega tidak merespons, status akses tidak bisa dipercaya."
                    : "Perangkat akses sedang offline."
            };
        }

        const doors = {};

        for (const [id, door] of Object.entries(ACCESS_DOORS)) {
            doors[id] = {
                name: door.name,
                state: stateText(status.doors[id])
            };
        }

        return {
            success: true,
            online: true,
            doors,
            rfid_mode: status.rfidBlocked === null
                ? "tidak diketahui"
                : status.rfidBlocked
                    ? "diblokir (kartu tidak bisa membuka akses)"
                    : "diizinkan (kartu terdaftar bisa membuka akses)"
        };

    } catch (error) {
        return accessError(error);
    }
}

export async function controlAccess(context, door, action) {

    const denied = accessGuard(context);
    if (denied) return denied;

    const target = ACCESS_DOORS[door];

    if (!target || (action !== "unlock" && action !== "lock")) {
        return { success: false, message: "Pintu atau aksi tidak valid." };
    }

    // Mengunci selalu aman, langsung dijalankan
    if (action === "lock") {
        return runDoorCommand(door, false);
    }

    const blocked = voiceUnlockBlocked(context);
    if (blocked) return blocked;

    pendingAccess.set(context.userKey, {
        kind: "door",
        door,
        description: `Membuka ${target.name}`,
        expires: Date.now() + CONFIRM_TTL_MS
    });

    return {
        success: false,
        needs_confirmation: true,
        message: `Membuka ${target.name} butuh konfirmasi. Minta boss membalas "ya" dalam 60 detik untuk melanjutkan. Belum ada yang dibuka.`
    };
}

export async function lockAllAccess(context) {

    const denied = accessGuard(context);
    if (denied) return denied;

    try {

        await sendLockAll("afna");

        await sleep(SETTLE_MS);

        let doors = null;

        try {
            const status = await readAccessStatus();
            if (status.online) {
                doors = {};
                for (const [id, door] of Object.entries(ACCESS_DOORS)) {
                    doors[door.name] = stateText(status.doors[id]);
                }
            }
        } catch {
            // abaikan
        }

        const allLocked = doors !== null && Object.values(doors).every(v => v === "terkunci");

        return {
            success: true,
            verified: allLocked,
            doors,
            message: allLocked
                ? "Semua pintu dan gerbang sudah terkunci (terkonfirmasi dari perangkat)."
                : "Perintah kunci semua sudah dikirim, tetapi belum semua terkonfirmasi terkunci."
        };

    } catch (error) {
        return accessError(error);
    }
}

export async function setRfidMode(context, blocked) {

    const denied = accessGuard(context);
    if (denied) return denied;

    if (typeof blocked !== "boolean") {
        return { success: false, message: "Nilai blocked harus true atau false." };
    }

    // Memblokir RFID aman, langsung dijalankan
    if (blocked) {
        return runRfidMode(true);
    }

    const voice = voiceUnlockBlocked(context);
    if (voice) return voice;

    pendingAccess.set(context.userKey, {
        kind: "rfid",
        description: "Mematikan mode kunci RFID (mengizinkan kartu membuka akses)",
        expires: Date.now() + CONFIRM_TTL_MS
    });

    return {
        success: false,
        needs_confirmation: true,
        message: "Mengizinkan kartu RFID membuka akses butuh konfirmasi. Minta boss membalas \"ya\" dalam 60 detik untuk melanjutkan. Belum ada yang diubah."
    };
}

// Dijalankan hanya jika pesan ASLI pengguna adalah konfirmasi.
export async function confirmAccess(context) {

    const denied = accessGuard(context);
    if (denied) return denied;

    const pending = pendingAccess.get(context.userKey);

    if (!pending || pending.expires < Date.now()) {
        pendingAccess.delete(context.userKey);
        return {
            success: false,
            message: "Tidak ada tindakan yang sedang menunggu konfirmasi."
        };
    }

    if (!isConfirmation(context.userMessage)) {
        return {
            success: false,
            message: "Belum ada konfirmasi dari boss. Tindakan belum dijalankan."
        };
    }

    pendingAccess.delete(context.userKey);

    if (pending.kind === "door") return runDoorCommand(pending.door, true);
    if (pending.kind === "rfid") return runRfidMode(false);

    return { success: false, message: "Tindakan tidak dikenal." };
}
