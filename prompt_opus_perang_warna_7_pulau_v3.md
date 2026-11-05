# MASTER EXECUTION PROMPT v3: IMPLEMENTASI "PERANG WARNA 7 WILAYAH NUSANTARA" (TIKTOK LIVE INTERACTIVE)

## 0. PERAN & CARA KERJA

Anda adalah Full-Stack Lead Engineer & Real-Time Systems Specialist. Tugas Anda: membangun game interaktif TikTok Live "Perang Warna 7 Wilayah Nusantara" sampai **100% jalan (runnable)**, sesuai spesifikasi di bawah.

Aturan kerja:

1. Baca seluruh dokumen ini dulu, lalu tulis **rencana singkat (maks 15 baris)**: urutan berkas yang akan dibuat dan keputusan teknis yang tidak dijelaskan di sini. Setelah itu langsung eksekusi.
2. **Tanpa TODO, stub, atau placeholder.** Setiap fungsi yang disebut harus benar-benar bekerja.
3. **Jangan menebak API pustaka `TikTokLive`.** Pasang dulu, cek versi yang terpasang (`pip show TikTokLive`), lalu baca nama kelas event dan atributnya dari source/dokumentasi versi itu. Kunci (pin) versi tersebut di `requirements.txt`.
4. Jangan bertanya balik kecuali benar-benar terblokir. Jika ada keputusan kecil yang tidak diatur, pilih yang paling sederhana dan catat di laporan akhir.
5. **Audio adalah fitur inti, bukan hiasan.** Bagian 9 wajib diimplementasikan penuh, termasuk halaman uji suara.
6. Akhiri dengan laporan sesuai **Bagian 17**.

---

## 1. ARSITEKTUR

**Satu proses Python, satu port.** Server `aiohttp` di port **8080** melayani:

- File statis frontend dari folder `public/` → HP membuka `http://<IP-Laptop>:8080`
- WebSocket di path `/ws` → frontend terhubung ke `ws://${location.host}/ws` (tanpa IP yang ditulis manual)

Pembagian tanggung jawab:

| Komponen | Tanggung jawab |
| --- | --- |
| Backend | Terhubung ke TikTok, parsing chat, kamus wilayah, cooldown, moderasi, hitung delta streak gift & tier, simpan Win, mode simulasi |
| Frontend (role `host`) | **Otoritas game**: simulasi arena, wilayah, prajurit, fase ronde, penentuan pemenang, Underdog, Rage, Balas Dendam, Overtime |
| Frontend (role `view`) | Hanya menonton state (misal pratinjau di laptop). Tidak mengirim `ROUND_RESULT` |

Role ditentukan lewat URL: `http://<IP>:8080/?role=host` (default `host`) atau `?role=view`. Backend hanya menerima `ROUND_RESULT` dari klien `host` dan membuang `roundId` yang sudah pernah diterima.

### Struktur berkas

```
perang-warna/
├── backend/
│   ├── server.py          # aiohttp app, hub WebSocket, CLI, cetak IP + QR
│   ├── tiktok_adapter.py  # SATU-SATUNYA berkas yang menyentuh TikTokLive
│   ├── parser.py          # normalisasi teks, pencocokan wilayah, perintah, moderasi
│   ├── gifts.py           # delta streak, tier
│   ├── simulator.py       # bot penonton
│   └── storage.py         # wins.json (tulis atomik)
├── data/
│   ├── wilayah.json       # 7 kubu, 38 provinsi, alias (bisa diedit operator)
│   └── blocklist.txt      # kata kasar & ejekan SARA, satu per baris
├── public/
│   ├── index.html
│   ├── style.css
│   └── js/                # modul ES tanpa build step
│       ├── game.js        # loop, arena, fase, gift
│       ├── net.js         # WebSocket + reconnect
│       ├── audio.js       # SELURUH suara: synth, bus, musik, limiter
│       └── sfxtest.js     # halaman uji suara (?sfxtest=1)
├── tests/
│   ├── test_parser.py
│   └── test_gifts.py
├── config.json            # durasi, ambang tier, cooldown, ukuran grid, volume
├── requirements.txt
├── run.sh                 # Linux/macOS
├── run.bat                # Windows
└── README.md
```

`tiktok_adapter.py` mengubah event TikTok menjadi event internal yang netral. Jika TikTok atau pustakanya berubah, hanya berkas ini yang perlu disentuh.

---

## 2. DATA WILAYAH (`data/wilayah.json`)

### Kubu, warna, dan label

| Kode | Nama tampil | No | Warna | Label 2 huruf |
| --- | --- | --- | --- | --- |
| `JAWA` | Jawa | 1 | `#FF3B30` merah | JW |
| `SULAWESI` | Sulawesi | 2 | `#007AFF` biru | SL |
| `KALIMANTAN` | Kalimantan | 3 | `#34C759` hijau | KL |
| `SUMATERA` | Sumatera | 4 | `#FFCC00` kuning | SM |
| `BALI_NUSRA` | Bali & Nusa Tenggara | 5 | `#FF9500` oranye | BN |
| `MALUKU` | Maluku | 6 | `#AF52DE` ungu | ML |
| `PAPUA` | Papua | 7 | `#30B0C7` sian | PP |

Label 2 huruf wajib tampil di markas dan papan Win, supaya penonton buta warna tetap bisa membedakan kubu.

### Provinsi dan alias

Struktur JSON: daftar `kubu` (kode, nama, warna, label, alias tingkat pulau) dan daftar `provinces` (nama resmi, kode kubu, alias). **Wajib berisi tepat 38 provinsi.** Alias provinsi dan kota besar dipetakan ke nama provinsinya, karena nama provinsi tampil sebagai label kecil di bawah nama prajurit.

| Kubu | Alias tingkat pulau | Provinsi → alias provinsi & kota |
| --- | --- | --- |
| JAWA | jawa | DKI Jakarta: jakarta, jkt, dki · Jawa Barat: jabar, bandung, bogor, bekasi, depok · Banten: banten, tangerang, serang · Jawa Tengah: jateng, semarang, solo · DI Yogyakarta: jogja, yogya, yogyakarta, diy · Jawa Timur: jatim, surabaya, malang, madura |
| SULAWESI | sulawesi | Sulawesi Utara: sulut, manado · Gorontalo: gorontalo · Sulawesi Tengah: sulteng, palu · Sulawesi Barat: sulbar, mamuju · Sulawesi Selatan: sulsel, makassar · Sulawesi Tenggara: sultra, kendari |
| KALIMANTAN | kalimantan, borneo | Kalimantan Barat: kalbar, pontianak · Kalimantan Tengah: kalteng, palangkaraya · Kalimantan Selatan: kalsel, banjarmasin · Kalimantan Timur: kaltim, samarinda, balikpapan, ikn · Kalimantan Utara: kaltara, tarakan |
| SUMATERA | sumatera, sumatra | Aceh: aceh · Sumatera Utara: sumut, medan · Sumatera Barat: sumbar, padang · Riau: riau, pekanbaru · Kepulauan Riau: kepri, batam · Jambi: jambi · Bengkulu: bengkulu · Sumatera Selatan: sumsel, palembang · Kepulauan Bangka Belitung: babel, bangka, belitung · Lampung: lampung |
| BALI_NUSRA | nusra, nusa tenggara | Bali: bali, denpasar · Nusa Tenggara Barat: ntb, lombok, mataram, sumbawa · Nusa Tenggara Timur: ntt, kupang, flores, sumba, labuan bajo |
| MALUKU | maluku | Maluku: ambon · Maluku Utara: malut, maluku utara, ternate, halmahera |
| PAPUA | papua | Papua: jayapura · Papua Barat: pabar, papua barat, manokwari · Papua Barat Daya: pbd, papua barat daya, sorong · Papua Tengah: papua tengah, nabire, timika · Papua Pegunungan: papua pegunungan, wamena · Papua Selatan: papua selatan, merauke |

Nama resmi setiap provinsi (misal "jawa barat", "kalimantan timur") juga otomatis menjadi alias.

### Aturan pencocokan (wajib, karena di sinilah bug paling sering terjadi)

1. **Normalisasi**: huruf kecil, emoji & tanda baca jadi spasi, spasi ganda dirapatkan, huruf yang berulang 3 kali atau lebih diringkas (`jawaaaa` → `jawa`).
2. **Cocokkan per kata utuh, bukan substring.** `balikpapan` harus masuk KALIMANTAN, bukan BALI_NUSRA.
3. **Alias terpanjang dulu**: `papua barat daya` dicek sebelum `papua barat`, lalu `papua`.
4. **Angka 1-7 hanya dihitung sebagai gabung jika komentarnya hanya berisi angka itu** (boleh ditambah emoji/spasi). "aku 2 kali" bukan perintah gabung.
5. **Jika komentar menyebut 2 kubu berbeda** ("jawa vs papua"), jangan dianggap gabung.
6. Alias tingkat pulau (misal "jawa") → `province: null`.

---

## 3. PARSING CHAT (BACKEND)

| Kondisi komentar | Event yang dikirim |
| --- | --- |
| Cocok dengan kubu (aturan di atas) | `CHAT_ACTION` aksi `TEAM_JOIN` + `team` + `province` |
| Kata "gas" dari penonton yang sudah punya kubu | `CHAT_ACTION` aksi `RALLY` (cooldown 10 detik per akun) |
| Komentar lain dari penonton yang sudah punya kubu | `CHAT_ACTION` aksi `DASH` (cooldown 3 detik per akun) |
| Komentar dari penonton yang belum punya kubu | Tidak dikirim (cukup dihitung untuk statistik) |

- Backend menyimpan kubu terakhir tiap user selama sesi live. **Frontend** yang memutuskan apakah pindah kubu diterima (hanya di fase Persiapan).
- Event yang terkena cooldown dibuang di backend, tidak dikirim ke frontend.

---

## 4. GIFT (BACKEND)

- Tier ditentukan dari koin per unit gift (`diamond_count`): `MICRO` 1-9, `MID` 10-99, `SULTAN` 100-999, `MEGA` 1000+. Ambang disimpan di `config.json`.
- **Delta streak**: untuk gift yang bisa di-streak, TikTok mengirim event berulang dengan jumlah kumulatif. Simpan jumlah terakhir per `streakId` (user + gift + grup), kirim hanya selisihnya. Bersihkan entri streak yang sudah selesai atau tidak aktif lebih dari 60 detik.
- `team` diisi dari kubu terakhir penyawer. Jika `null`, frontend memasukkannya ke kubu dengan wilayah terkecil.
- **Balas Dendam ditangani frontend, bukan backend**, karena hanya frontend yang tahu kubu mana yang terkena Meteor.

Event tambahan yang juga diteruskan:

- **Like**: dikumpulkan per kubu, dikirim sebagai `LIKE_BATCH` setiap 1 detik.
- **Follow / Share**: dikirim sebagai `CAPTAIN` (prajurit penonton naik pangkat sampai akhir ronde).

---

## 5. BONUS UNDERDOG (FRONTEND)

```
anggota_aktif(k) = penonton kubu k yang gabung ronde ini dan beraksi dalam 90 detik terakhir
rata2           = total anggota aktif / jumlah kubu yang punya ≥ 1 anggota aktif
multiplier(k)   = clamp( sqrt(rata2 / anggota_aktif(k)), 1.0, 3.0 )
```

- Dihitung ulang setiap 5 detik, perubahannya dihaluskan (lerp) agar tidak melompat.
- **Berlaku untuk**:
  - kekuatan dorong dan "massa" prajurit saat bertabrakan,
  - ukuran prajurit (maks +30%),
  - kecepatan gerak: `1 + (multiplier - 1) × 0.4`,
  - jangkauan cat: radius 2 sel (bukan 1) jika multiplier ≥ 1.7.
- Alasan dua poin terakhir: wilayah dihitung dari sel yang dicat, jadi bonus yang hanya memengaruhi tabrakan tidak cukup. Di uji simulasi, kubu dengan 40% penonton tetap menguasai lebih dari 60% arena tanpa bonus kecepatan dan jangkauan cat.
- **Tidak berlaku untuk efek gift.** Efek gift hanya diskalakan oleh koin, Overtime, dan Balas Dendam. Tanpa aturan ini, satu sultan dari kubu kecil bisa mendapat efek Meteor 3x lipat dan merusak keseimbangan.
- Badge "Underdog x2.0" tampil di papan Win jika multiplier ≥ 1.2.

---

## 6. LOOP RONDE & MEKANIK (FRONTEND)

| Fase | Durasi | Isi |
| --- | --- | --- |
| Persiapan | 20 detik | Arena dikosongkan, Klasemen Abadi tampil, pindah kubu diizinkan |
| Pertempuran | 180 detik | Gameplay normal |
| Overtime | 30 detik | Efek gift 2x, tepi layar berdenyut merah, musik dipercepat |
| Sudden Death | 20 detik (opsional) | Hanya jika selisih 2 kubu teratas < 1%; maksimal sekali per ronde |
| Penobatan | 20 detik | Pemenang +1 Win, MVP, update Hall of Fame |

Total sekitar 4 menit 10 detik per ronde. Timer di HUD menghitung mundur fase yang sedang berjalan.

Mekanik wajib:

- **Markas**: 7 markas di tepi arena (4 sudut + tengah sisi atas, kiri, kanan). Posisi awal: JAWA kiri-atas, SULAWESI kanan-atas, SUMATERA kiri-bawah, KALIMANTAN kanan-bawah, PAPUA tengah-atas, MALUKU tengah-kiri, BALI_NUSRA tengah-kanan. Susunan ini menjauhkan warna yang mirip (merah, oranye, kuning). **Posisi diputar setiap ronde** supaya tidak ada kubu yang selalu untung posisi.
- **Prajurit** mewarnai sel grid yang dilewati. Prajurit beda kubu yang bertabrakan: yang massanya lebih besar menang, yang kalah hilang.
- **Rage Mode**: kubu dengan wilayah < 7% mendapat kecepatan 1.5x selama 20 detik (jeda antar-aktivasi 30 detik).
- **Efek gift**: MICRO = 1 prajurit bonus per koin + cipratan kecil + penghitung COMBO · MID = Prajurit Elite 15 detik · SULTAN = Meteor di wilayah kubu terdepan · MEGA = Takeover (gelombang warna + kubu 2x kuat 20 detik + nama ke Prasasti Sultan). Skala efek logaritmik terhadap koin; satu event maksimal mengubah 15% wilayah.
- **Balas Dendam**: kubu yang terkena SULTAN/MEGA mendapat efek gift 1.5x selama 15 detik.
- **Bar Semangat**: diisi dari `LIKE_BATCH`; penuh = gelombang 10 prajurit gratis.
- **Win & penobatan**: pemenang = wilayah terluas. MVP = penyawer koin terbanyak di kubu pemenang pada ronde itu. Hall of Fame menyimpan 5 MVP terakhir. Prasasti Sultan berisi semua nama MEGA sepanjang sesi.
- **Streak**: 3 kemenangan beruntun = mahkota di markas. Kubu yang memutusnya mendapat banner "PEMUTUS STREAK".

---

## 7. TATA LETAK (VERTIKAL 9:16)

Canvas logis 1080 x 1920, diskalakan agar pas di layar (letterbox jika rasio HP berbeda). `devicePixelRatio` dibatasi maksimal 2.

| Zona (% tinggi) | Isi |
| --- | --- |
| 0-10% | **Kosong** (hanya latar). Area ini tertutup profil host & jumlah penonton di aplikasi TikTok |
| 10-20% | HUD: timer + fase, papan Win 2 baris (4 + 3) dengan label & badge Underdog, bar persentase wilayah 7 warna |
| 20-60% | Arena + 7 markas |
| 60-68% | Banner event (nama penyawer, COMBO), saat sepi menampilkan instruksi "Ketik 1-7 atau nama provinsimu" |
| 68-100% | Hanya dekorasi (boleh Prasasti Sultan berjalan pelan, opasitas rendah). Tertutup komentar & tombol TikTok |

Ukuran minimum di resolusi logis: nama prajurit 22 px, label provinsi 16 px, angka persentase 40 px. Batas zona disimpan di `config.json` agar operator bisa menyesuaikan dengan HP-nya.

Layar pembuka: tombol besar **MULAI**. Satu ketukan sekaligus: membuka fullscreen, mengunci orientasi potret (jika didukung), mengaktifkan audio, dan menyalakan penahan layar.

---

## 8. KINERJA 60 FPS DI HP KELAS MENENGAH

- Grid wilayah `Uint8Array` berukuran sesuai rasio arena (default 96 x 68 di `config.json`). Digambar ke offscreen canvas seukuran grid, lalu diperbesar dengan `imageSmoothingEnabled = false`.
- Jumlah sel per kubu diperbarui setiap kali sel berubah warna (O(1)), tidak pernah memindai ulang grid.
- Object pool: maks 300 prajurit, 800 partikel. Jika prajurit penuh, prajurit tertua tanpa gift dilebur menjadi "batalion" yang lebih besar di kubu yang sama.
- Tabrakan memakai spatial hash.
- Dilarang `shadowBlur` dan `ctx.filter`. Glow memakai sprite gradasi yang dirender sekali + `globalCompositeOperation = 'lighter'`.
- Nama + label provinsi di-cache ke canvas kecil per prajurit.
- Tidak ada alokasi objek baru di dalam loop render. `dt` dibatasi maksimal 50 ms.
- Event WebSocket masuk antrean, diproses maksimal 30 per frame.
- `?debug=1` menampilkan FPS, jumlah prajurit, partikel, dan ukuran antrean.
- Semua visual murni canvas 2D: partikel, gradasi, teks. Tanpa gambar eksternal.

---

## 9. AUDIO & SOUND EFFECT (WAJIB, TANPA FILE AUDIO)

Semua suara dibuat **prosedural dengan Web Audio API**: tanpa mp3/wav, tanpa musik berlisensi. Ini sesuai aturan zero asset, dan menghindari siaran dibisukan karena musik berhak cipta.

### 9.1 Arsitektur `audio.js`

API minimal yang dipakai `game.js`:

```js
Audio.init()                       // dipanggil dari tombol MULAI
Audio.play(name, { team, streak, intensity })
Audio.setVolume(bus, value)        // bus: 'master' | 'sfx' | 'music' | 'ui'
Audio.setMusicIntensity(level)     // 0-3, lihat 9.4
Audio.duck(db, seconds)            // tekan volume musik sementara
Audio.talkMode(on)                 // mode host bicara, lihat 9.6
```

Jalur sinyal:

```
sumber suara → bus SFX ┐
sumber musik → bus MUSIC ├→ master gain → DynamicsCompressor (limiter) → speaker
suara operator → bus UI ┘
```

- Limiter: threshold -10 dB, knee 6, ratio 12, attack 0.003 s, release 0.25 s. Suara tidak boleh pecah walau gift di-spam.
- **Unlock audio**: `AudioContext` dibuat dan di-`resume()` di dalam handler tombol MULAI. Panggil `resume()` lagi saat `visibilitychange` kembali `visible` dan saat `statechange` berubah ke `suspended`/`interrupted` (misal setelah telepon masuk).
- Buffer white noise 2 detik dan kurva `WaveShaper` dibuat **sekali** saat init, lalu dipakai ulang. Tidak ada alokasi buffer per suara.
- Setiap node di-`disconnect()` pada `onended` agar memori tidak bocor selama live 30 menit.

### 9.2 Identitas nada tiap kubu

Gunakan tangga nada pentatonik bernuansa slendro (5 nada, diulang ke oktaf atas untuk kubu 6-7). Setiap kubu punya nada dasarnya sendiri: JAWA nada 1, SULAWESI nada 2, dan seterusnya. Akibatnya, rentetan penonton yang gabung terdengar seperti melodi, dan penonton bisa "mendengar" kubu mana yang sedang ramai. Nada dasar kubu dipakai di `join`, `rally`, dan `victory`.

### 9.3 Peta event ke suara

| Event | Nama suara | Resep synth | Batas |
| --- | --- | --- | --- |
| TEAM_JOIN | `join` | Pop: oscillator triangle, nada kubu, glide naik 1 oktaf dalam 80 ms, envelope cepat | 1 per 60 ms; join tambahan dalam jeda itu menaikkan volume sedikit (maks +3 dB) |
| DASH | `dash` | Whoosh: noise lewat bandpass yang menyapu 600 → 2400 Hz, 180 ms | 1 per 100 ms |
| RALLY ("gas") | `rally` | Chord stab: 3 sawtooth (nada kubu, kuint, oktaf), lowpass terbuka cepat, 250 ms | 1 per 300 ms |
| Prajurit kalah | `clash` | Klik square 1200 Hz, 25 ms, sangat pelan | 1 per 50 ms |
| Gift MICRO | `coin` | Dua nada sine (988 lalu 1319 Hz, masing-masing 60 ms). **Pitch naik 1 semitone per langkah COMBO**, kembali ke awal setelah 12 | 1 per 70 ms |
| COMBO 10 / 25 / 50 | `combo` | Arpeggio 4 nada naik, makin panjang di milestone lebih tinggi | sekali per milestone |
| Gift MID | `elite` | Power-up: sawtooth 220 → 660 Hz dalam 400 ms + lowpass membuka + ekor noise pendek | 1 per 200 ms |
| Gift SULTAN (jatuh) | `meteorFall` | Siulan turun: sine 2000 → 300 Hz, **durasinya sama dengan animasi jatuh (0.9 s)** | per meteor |
| Gift SULTAN (hantam) | `impact` | Ledakan: noise lowpass 300 Hz meluruh 0.9 s + sub sine 80 → 40 Hz 0.7 s + sedikit distorsi WaveShaper | per meteor |
| Gift MEGA | `takeover` | Riser 1.5 s (noise highpass menyapu naik + pitch naik), lalu `impact`, lalu **gong**: 4-6 parsial sine inharmonik (rasio sekitar 1 : 1.48 : 2.1 : 2.7 dari 110 Hz) meluruh 3 s | per event |
| Balas Dendam mulai | `revenge` | Dua stab sawtooth rendah bernada minor | per event |
| Rage Mode mulai | `rage` | Sirene pendek 2 siklus (sine 500 ↔ 900 Hz) | per kubu per aktivasi |
| Bar Semangat penuh | `wave` | Arpeggio 5 nada naik dengan nada kubu | per event |
| Kapten (follow/share) | `captain` | Denting lonceng terang (sine 1568 Hz + parsial 2.76x, decay 0.6 s) | 1 per 300 ms |
| Hitung mundur Persiapan (5 detik terakhir) | `tick` | Kentongan: noise bandpass 1.8 kHz, 30 ms | per detik |
| Pertempuran mulai | `start` | Kentongan 3 kali cepat + peluit (sine 2.2 kHz, vibrato) | per ronde |
| Overtime mulai | `overtime` | Sirene sapuan naik + musik pindah ke intensitas 2 | per ronde |
| 10 detik terakhir Overtime / Sudden Death | `tickHot` | Seperti `tick`, makin keras tiap detik | per detik |
| Sudden Death | `suddenDeath` | Detak jantung: 2 dentuman sine 60 Hz, berulang selama fase | loop |
| Penobatan | `victory` | Fanfare 6-8 nada dari tangga nada kubu pemenang + gong di akhir | per ronde |
| MVP tampil | `mvp` | Denting naik 3 nada | per ronde |
| Streak 3 (mahkota) | `crown` | Arpeggio panjang + kilau noise highpass | per event |
| Pemutus streak | `streakBreak` | Pecahan kaca: burst noise highpass 4 kHz, beberapa klik acak | per event |
| Koneksi backend putus | `disconnect` (bus UI) | Dua nada turun lembut | per kejadian |

Variasi wajib: setiap pemutaran diberi detune acak ±30 cent dan gain acak ±10%, supaya suara yang berulang ratusan kali tidak terdengar robotik.

### 9.4 Musik latar prosedural

- Loop 8 bar, default 112 BPM: kick (sine 150 → 50 Hz), hi-hat (noise highpass 40 ms), bass triangle mengikuti tangga nada pentatonik, plus pad lembut.
- Penjadwalan pakai pola **lookahead scheduler**: `setInterval` 25 ms yang menjadwalkan not 100 ms ke depan memakai `audioCtx.currentTime`. Jangan pakai `setTimeout` per not, karena tempo akan meleset saat frame berat.

| Intensitas | Kapan | Isi |
| --- | --- | --- |
| 0 | Persiapan | Pad + hi-hat pelan saja |
| 1 | Pertempuran | Loop lengkap 112 BPM |
| 2 | Overtime | 132 BPM + perkusi tambahan |
| 3 | Sudden Death | Hanya kick + detak jantung |
| - | Penobatan | Musik berhenti, `victory` diputar |

- Musik otomatis di-duck -8 dB selama 1.5 detik saat `impact`, `takeover`, dan `victory`, supaya momen besar terdengar jelas.

### 9.5 Mixing & batas performa

- Maksimal **24 suara bersamaan**. Jika penuh, suara prioritas terendah dibuang.
- Urutan prioritas: MEGA / SULTAN / suara fase > MID / `victory` > MICRO / `join` > `dash` / `clash`.
- Suara terberat (gong) maksimal 6 oscillator.
- Penjadwalan audio tidak boleh menahan loop render; semua pembuatan node terjadi di handler event, bukan di loop render.
- Volume default (bisa diubah di `config.json`): master 0.8, sfx 0.7, music 0.25, ui 0.5.

### 9.6 Kontrol untuk host

- Tombol MULAI menyalakan audio. Ikon speaker kecil di layar pembuka untuk memulai tanpa suara.
- **Panel audio tersembunyi**: tekan lama 2 detik di **pojok kanan atas** (zona 0-10%, tertutup UI TikTok bagi penonton). Isinya slider master/sfx/musik, sakelar musik on/off, dan tombol **Mode Bicara**.
- **Mode Bicara**: menurunkan seluruh audio -12 dB selama aktif, supaya suara host jelas saat menjelaskan aturan atau membacakan nama sultan.
- Saat pratinjau di laptop: tombol `M` mute, `T` mode bicara.
- Pengaturan volume disimpan di `localStorage` (dibungkus try/catch).

### 9.7 Halaman uji suara

`http://<IP>:8080/?sfxtest=1` menampilkan satu tombol per suara di tabel 9.3, tombol intensitas musik 0-3, tombol "spam 50 gift" untuk menguji limiter dan batas 24 suara, serta meter level sederhana (dari `AnalyserNode`).

---

## 10. KONTRAK PESAN WEBSOCKET

Semua pesan memakai amplop: `{ "v": 1, "type": "...", "id": "...", "ts": <ms>, "user": {...}?, "data": {...} }`. Objek `user` = `{ "id", "handle", "nick", "isFollower" }`; `nick` sudah difilter moderasi dan dipotong 12 karakter.

**Backend → frontend**

| type | data |
| --- | --- |
| `STATUS` | `{ "source": "tiktok" \| "simulate", "connected": true, "detail": "..." }` |
| `JOIN` | `{ "viewerCount": 87 }` |
| `CHAT_ACTION` | `{ "action": "TEAM_JOIN" \| "DASH" \| "RALLY", "team": "KALIMANTAN", "province": "Kalimantan Timur" \| null }` |
| `GIFT_TRIGGER` | `{ "giftId", "giftName", "unitCoins", "delta", "coins", "streakTotal", "streakId", "streakEnded", "tier", "team" }` |
| `LIKE_BATCH` | `{ "likes": { "JAWA": 120, "PAPUA": 15 } }` |
| `CAPTAIN` | `{ "reason": "follow" \| "share", "team": "JAWA" }` |
| `SCOREBOARD` | `{ "session": {...7 kubu}, "allTime": {...7 kubu}, "streak": { "team", "count" }, "hallOfFame": [...] }` |

**Frontend → backend**

| type | data |
| --- | --- |
| `HELLO` | `{ "role": "host" \| "view" }` → backend membalas `STATUS` + `SCOREBOARD` terbaru |
| `ROUND_RESULT` | `{ "roundId", "round", "winner", "territory": {...7 kubu}, "mvp": { "id", "nick", "coins" } \| null }` |
| `SIM_TOGGLE` | `{ "on": true }` → menyalakan/mematikan bot simulasi di backend |

Saat baru terhubung (misal HP restart di tengah live), frontend langsung menerima `SCOREBOARD` terakhir sehingga Win tidak hilang. Frontend otomatis reconnect dengan backoff (1, 2, 5, 10 detik).

---

## 11. PERSISTENSI (`storage.py`)

- `wins.json` berisi `session`, `allTime`, `streak`, `hallOfFame`, dan daftar `roundId` terakhir (untuk dedupe).
- **Tulis secara atomik**: tulis ke berkas sementara lalu `os.replace`, agar tidak rusak jika laptop mati mendadak.
- `session` direset otomatis setiap backend dinyalakan (dianggap live baru). Flag `--keep-session` untuk melanjutkan sesi setelah crash. Flag `--reset-all` untuk menghapus Klasemen Abadi.

---

## 12. MODE SIMULASI & KETAHANAN KONEKSI

- `--simulate`: bot penonton dari berbagai provinsi (pakai alias acak dari `wilayah.json`, termasuk singkatan dan kota), spam chat, like, follow, Mawar beruntun, sesekali MID/SULTAN/MEGA. Flag `--rate low|normal|high`; `high` dipakai untuk uji beban 300 prajurit.
- Mode normal: `--username @akun`. Jika live belum dimulai atau koneksi putus, backend **tetap jalan** dan mencoba ulang dengan backoff (5, 10, 20, 60 detik), sambil mengirim `STATUS` ke frontend (titik kecil hijau/merah di HUD).
- Jika versi `TikTokLive` yang terpasang membutuhkan API key untuk signing, baca dari environment variable dan jelaskan di README.
- Tombol darurat di HP: **tekan lama 2 detik di pojok kiri atas** untuk mengirim `SIM_TOGGLE`, dan jika WebSocket juga putus, jalankan bot simulasi lokal di frontend. (Tekan lama dipilih karena ketukan 3 kali bisa memicu zoom aksesibilitas di Android.)
- Saat start, backend mencetak URL `http://<IP-LAN>:8080` dan QR code ASCII di terminal agar HP tinggal memindai.

---

## 13. MODERASI

- **Game tidak pernah menampilkan isi komentar.** Yang tampil di canvas hanya nickname (sudah difilter) dan label provinsi dari kamus.
- Nickname yang mengandung kata di `blocklist.txt` diganti "Penonton" + 4 digit acak.
- Pencocokan blocklist memakai normalisasi tambahan (leetspeak: 4→a, 3→e, 1→i, 0→o, 5→s, huruf berulang diringkas). Normalisasi leetspeak hanya untuk cek blocklist, tidak untuk parsing perintah angka.
- Sediakan blocklist awal berisi kata kasar umum bahasa Indonesia dan ejekan bernada SARA yang umum; operator bisa menambah sendiri.

---

## 14. KONFIGURASI (`config.json`)

Minimal berisi: durasi tiap fase, ambang tier gift, cooldown DASH/RALLY, ambang Rage & Sudden Death, batas Underdog, ukuran grid, batas prajurit/partikel, batas zona layout. Backend menyajikannya ke frontend (misal di `/config.json`) supaya satu sumber kebenaran.

Bagian `audio` minimal berisi: volume tiap bus, musik on/off, BPM normal & Overtime, batas suara bersamaan, cooldown tiap suara, besar ducking, dan level Mode Bicara. Backend menyajikannya ke frontend (misal di `/config.json`) supaya satu sumber kebenaran.

---

## 15. PENGUJIAN

`pytest` wajib lulus. Kasus minimal di `tests/test_parser.py`:

| Input | Hasil |
| --- | --- |
| `"3"` | KALIMANTAN, province null |
| `"aku 2 kali"` | bukan gabung |
| `"balikpapan"` | KALIMANTAN, Kalimantan Timur |
| `"BALI!!"` | BALI_NUSRA, Bali |
| `"papua barat daya"` | PAPUA, Papua Barat Daya |
| `"kepri"` | SUMATERA, Kepulauan Riau |
| `"jawaaaa 🔥"` | JAWA, province null |
| `"jogja"` | JAWA, DI Yogyakarta |
| `"jawa vs papua"` | bukan gabung |
| Jumlah provinsi di `wilayah.json` | tepat 38, semua kubu punya ≥ 1 provinsi |

`tests/test_gifts.py`: streak Mawar 1 → 5 → 12 menghasilkan delta 1, 4, 7; tier benar di batas 9/10, 99/100, 999/1000; streak tidak terhitung ganda saat event akhir dikirim.

Uji manual:

- `--simulate --rate high` di HP kelas menengah dengan `?debug=1`, target FPS ≥ 55 dengan 300 prajurit **dengan audio dan musik menyala**.
- `?sfxtest=1`: setiap suara di tabel 9.3 berbunyi, tombol "spam 50 gift" tidak membuat suara pecah, dan musik tetap tepat tempo saat Overtime.
- Kunci layar HP lalu buka lagi: audio harus kembali tanpa perlu reload.

---

## 16. INSTALASI & SKRIP

- Python 3.10+. `requirements.txt`: `TikTokLive` (versi terkunci yang sudah Anda verifikasi), `aiohttp`, `qrcode`, `pytest`.
- `run.sh` dan `run.bat`: buat virtualenv jika belum ada, install dependensi, jalankan `pytest -q`, lalu start server. Argumen diteruskan apa adanya, contoh:
  - `./run.sh --simulate`
  - `run.bat --username @akunku`
- Frontend tidak butuh build step, npm, atau internet (semua berkas lokal).

**Batasan HTTP yang wajib ditangani:** HP membuka game lewat `http://192.168.x.x`, yang bukan "secure context". Akibatnya **Wake Lock API tidak tersedia** dan PWA tidak bisa di-install. Maka:

1. Pakai `navigator.wakeLock` jika tersedia.
2. Jika tidak, fallback ke teknik video senyap berulang (gaya NoSleep.js) yang disimpan lokal di `public/`.
3. Di README, sarankan operator juga menaikkan batas waktu layar mati di pengaturan HP ke maksimum.
4. Fullscreen tetap lewat `requestFullscreen` dari tombol MULAI.

---

## 17. FORMAT LAPORAN AKHIR

1. Pohon berkas final.
2. Langkah menjalankan, **copy-paste**, terpisah untuk Windows dan Linux/macOS: install, uji simulasi, dan mode live.
3. Cara menghubungkan HP: Wi-Fi yang sama, alamat dari terminal/QR, izinkan Python di Windows Firewall (jaringan Private).
4. Urutan saat live: mulai siaran layar di TikTok → jalankan backend dengan `--username` → buka game di HP → tekan MULAI.
5. Panduan audio siaran: cara memastikan suara internal HP ikut tersiar (cek pengaturan siaran layar di HP operator; jika tidak didukung, suara hanya tertangkap mikrofon dari speaker), volume media HP yang disarankan (sekitar 60-70%), dan cara menguji keseimbangan suara game dengan suara host memakai akun kedua.
6. Keputusan teknis yang Anda ambil sendiri dan batasan yang diketahui (termasuk risiko `TikTokLive` sebagai pustaka tidak resmi yang bisa rusak saat TikTok berubah).
7. Saran teknis siaran dan retensi penonton.

---

## 18. CHECKLIST SEBELUM SELESAI

- [ ] `pytest` lulus, termasuk semua kasus di Bagian 15.
- [ ] `run.sh --simulate` dan `run.bat --simulate` berjalan; game terbuka di HP lewat `http://<IP>:8080`.
- [ ] Mode `--username` tetap hidup dan mencoba ulang saat live belum mulai.
- [ ] `wilayah.json` berisi tepat 38 provinsi; `balikpapan` tidak masuk BALI_NUSRA.
- [ ] Underdog bekerja dan tidak memperbesar efek gift.
- [ ] Restart HP di tengah live tidak menghilangkan Win; `ROUND_RESULT` ganda dibuang.
- [ ] Tidak ada isi komentar yang tampil di layar; nickname terfilter.
- [ ] FPS ≥ 55 dengan 300 prajurit di mode `--rate high`.
- [ ] Semua suara di tabel 9.3 ada dan bisa diputar dari `?sfxtest=1`.
- [ ] Musik latar berpindah intensitas sesuai fase dan di-duck saat momen besar.
- [ ] Spam gift tidak membuat suara pecah (limiter + batas 24 suara bekerja).
- [ ] Audio pulih otomatis setelah layar dikunci atau ada telepon masuk.
- [ ] Panel audio tersembunyi dan Mode Bicara berfungsi.
- [ ] Tidak ada TODO, stub, atau berkas kosong.
