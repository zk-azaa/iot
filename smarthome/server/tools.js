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