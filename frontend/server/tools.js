import "dotenv/config";

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
        pin: null,
        state: false
    },
    {
        id: "teras",
        name: "Lampu Teras",
        pin: null,
        state: false
    }
];


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

export function getHomeStatus() {

    return {
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