# Smart Home

Dashboard rumah pintar: kontrol lampu, water tank, water cannon, CCTV, akses, plus AI Assistant (Groq).

## Menjalankan

```bash
npm install
cp .env.example .env     # lalu isi GROQ_API_KEY, BLYNK_TOKEN, PORT
npm start                # buka http://localhost:3000
```

Butuh Node.js 18+.

## Struktur

```
server.js          Server Express: file statis + /api/chat (Groq) + /api/blynk (Blynk)
.env               Rahasia (tidak di-commit)
public/
  *.html           Halaman
  css/             style.css (home), feature.css (halaman fitur)
  js/config.js     Mapping pin & URL kamera (non-rahasia)
  js/features.js   Logika halaman fitur
  js/ai-chat.js    Widget AI (dipakai semua halaman)
  js/home.js       Jam & menu pengaturan di halaman utama
```

## Pin Blynk

Lampu ruang tamu V0, kamar V1, servo water cannon X V4 / Y V5. Pin lain (`null` di `config.js`)
masih simulasi UI dan tidak mengirim perintah.

## Catatan keamanan

Server belum memakai login. Siapa pun yang bisa membuka alamatnya bisa mengontrol perangkat,
jadi jangan expose ke internet tanpa autentikasi.
