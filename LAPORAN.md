# Laporan Akhir: Perang Warna 7 Wilayah Nusantara

Game sudah selesai dan berjalan di laptop dari awal sampai Penobatan, tetapi **belum pernah dicoba di HP sungguhan, siaran TikTok asli, atau Windows**. Suaranya juga baru diverifikasi lewat pengukuran, belum didengar telinga manusia, jadi lakukan uji di bagian 6 sebelum siaran pertama.

Hasil uji di laptop:

- **Tes backend:** 111 tes `pytest` lulus.
- **Tes browser:** 58 uji di Chrome tanpa tampilan lulus.
- **Uji ketahanan:** 6 menit, 8 ronde, memori stabil di sekitar 2,7 MB, dan tanpa error. Bot darurat dan gift besar belum ikut di uji 6 menit ini; gift besar baru tercakup di uji 3 menit berikutnya.

## 1. Pohon berkas

```
perang-warna/
├── backend/  server.py  tiktok_adapter.py  parser.py  gifts.py  simulator.py  storage.py
├── data/     wilayah.json  blocklist.txt
├── public/   index.html  style.css  silence.mp4  silence.webm
│   └── js/   game.js  net.js  audio.js  sfxtest.js  localsim.js
├── tests/    conftest.py  test_parser.py  test_gifts.py  test_storage.py  test_server.py  test_adapter.py
├── config.json  requirements.txt  pytest.ini  .gitignore  run.sh  run.bat  README.md
```

## 2. Cara menjalankan

Pemasangan dan tes berjalan otomatis setiap kali skrip dijalankan.

**Linux/macOS**

```bash
cd ~/Desktop/Note/perang-warna
./run.sh --simulate                # uji simulasi
./run.sh --simulate --rate high    # uji beban
./run.sh --username @akunku        # live
```

**Windows** (dari folder proyek)

```bat
run.bat --simulate
run.bat --simulate --rate high
run.bat --username @akunku
```

## 3. Menghubungkan HP

1. Sambungkan HP dan laptop ke Wi-Fi yang sama.
2. Pindai QR di terminal atau buka alamat yang tercetak di sana. IP laptop sempat berubah selama pengerjaan, jadi selalu pakai alamat terbaru.
3. Di Windows, izinkan Python di Firewall untuk jaringan **Private**.
4. Pakai Chrome di Android, karena Safari di iPhone tidak mendukung fullscreen.

Untuk pratinjau di laptop, selalu buka `/?role=view`. Membuka alamat utama di perangkat lain akan mengambil alih peran host dari HP.

## 4. Urutan saat live

Mulai siaran layar di TikTok → jalankan backend dengan `--username` → buka game di HP → tekan **MULAI**.

## 5. Panduan audio siaran

- **Suara internal:** cek pengaturan siaran layar di HP. Jika suara internal tidak didukung, suara game hanya tertangkap mikrofon dari speaker.
- **Volume:** atur volume media HP sekitar 60–70%.
- **Keseimbangan:** masuk ke siaran dengan akun kedua, lalu dengarkan suara game dan suara host bersamaan. Atur lewat panel audio dengan menekan lama pojok kanan atas.
- **Saat bicara:** Mode Bicara menurunkan semua audio -12 dB. Panel audio lebih besar dari zona yang tertutup UI TikTok, jadi mungkin terlihat penonton saat dibuka.

## 6. Status checklist

| Item | Status | Catatan |
| --- | --- | --- |
| `pytest`, 38 provinsi, `balikpapan` | Lulus | |
| `run.sh --simulate` | Lulus | Termasuk dari salinan bersih tanpa venv |
| `run.bat --simulate` | **Belum diuji** | Laptop ini Linux |
| `--username` tetap hidup dan mencoba ulang | Lulus | Hanya dengan akun fiktif |
| Chat dan gift dari live asli | **Belum diuji** | Baru event protobuf asli tanpa jaringan; kebutuhan `SIGN_API_KEY` juga belum diketahui |
| Underdog, batas 15%, `ROUND_RESULT` ganda | Lulus | |
| Restart HP tidak menghilangkan Win | Lulus | Dengan reload halaman di HP tiruan |
| Isi komentar tidak tampil, nickname terfilter | Lulus | |
| FPS ≥ 55 dengan 300 prajurit | **Belum di HP** | Di laptop dengan CPU diperlambat 4x: rata-rata 59, terendah 53 saat efek besar |
| 24 suara berbunyi, spam gift tidak pecah | Lulus secara terukur | Puncak 0,85, tanpa sampel pecah; **kualitasnya belum didengar** |
| Musik pindah intensitas dan tepat tempo | Lulus | Terukur 110 dan 132 BPM (target 112 dan 132) |
| Musik di-duck saat momen besar | **Belum diukur** | Sudah ada di kode |
| Audio pulih setelah layar dikunci atau ada telepon | Sebagian | Baru simulasi `suspend`; penguncian dan telepon asli belum |
| Penahan layar (video senyap) | **Belum diuji** | Tetap naikkan batas layar mati di HP |
| Panel audio dan Mode Bicara | Lulus | Tombol dan statusnya saja; penurunan -12 dB belum diukur |
| Tanpa TODO atau berkas kosong | Lulus | |

**Uji sebelum siaran pertama:**

1. Buka `?sfxtest=1` di HP dan dengarkan semua suara.
2. Jalankan `--simulate --rate high` dengan `?debug=1` dan lihat FPS-nya.
3. Lakukan satu siaran percobaan dengan `--username`.

## 7. Keputusan teknis dan batasan

Selain 12 usulan yang sudah disetujui, keputusan berikut juga diambil:

- **Kemenangan tabrakan menguras massa, lalu pulih perlahan.** Tanpa ini, tes menunjukkan satu penyawer menguasai 99% arena melawan kubu berisi 50 orang. Setelah diperbaiki, skenario 50 lawan 1 menjadi 93% lawan 7%, dan kubu berisi 40% penonton menguasai 34%.
- **Persentase wilayah dihitung dari sel yang sudah dicat.** Kalau dihitung dari seluruh arena, ronde dengan sedikit penonton membuat semua kubu berada di bawah ambang Rage.
- **Gift di luar pertempuran ditahan** sampai perang berikutnya mulai, karena saat itu arena kosong.
- **Nama prajurit dibatasi.** Di atas 120 prajurit, dan saat Persiapan, hanya nama yang baru beraksi yang tampil agar tetap terbaca.
- **Tambahan di luar prompt:**
  - Pesan `STATE_SNAPSHOT` dan `HOST_INFO`.
  - Berkas `localsim.js`.
  - Parameter uji `?speed=`.
  - Kecepatan prajurit diturunkan dari 150 ke 120 di `config.json`.
  - Not musik tidak dihitung dalam batas 24 suara.

Batasan yang perlu diketahui:

- **`TikTokLive` tidak resmi dan bisa rusak saat TikTok berubah.** Versi 7.0.1 yang dikunci punya dua bug yang sudah dihindari di `tiktok_adapter.py`: `client.on(Event, f)` crash, dan `client.close()` tidak aman dipakai.
- **Lisensi `TikTokLive` adalah Modified AGPL-3.0.** Periksa ketentuannya jika game ini akan didistribusikan.
- **Efek gift bisa cepat tertimpa.** Wilayah hasil Meteor atau Takeover bisa dicat ulang dalam hitungan detik saat arena ramai. Jika terasa kurang berkesan bagi penyawer, turunkan `soldierSpeed`.
- **Prajurit yang kalah hanya bangkit saat pemiliknya chat.** Arena bisa terasa sepi jika chat jarang.
- **Versi Python.** Hanya Python 3.14 yang teruji, walau pustakanya menyatakan mendukung 3.10 ke atas.

## 8. Saran siaran dan retensi

- Buka siaran dengan satu kalimat ajakan: "Ketik nomor pulaumu, 1 sampai 7."
- Bacakan nama MVP dan penyawer MEGA dengan Mode Bicara, karena disebut namanya mendorong orang menyawer lagi.
- Manfaatkan 20 detik Persiapan untuk memanas-manasi persaingan dari Klasemen Abadi.
- Sebut kubu Underdog saat lencananya muncul, supaya penonton terdorong membela kubu kecil.
- Di Overtime, ingatkan bahwa efek gift sedang 2x lipat. Itu momen paling kuat untuk memancing gift.
- Satu ronde sekitar 4 menit, jadi target 5–6 ronde per sesi 30 menit sudah cukup untuk membangun streak dan mahkota.

## 9. Pembaruan: siaran tanpa suara host

Host memutuskan untuk sementara tidak bersuara, jadi saran di bagian 8 yang mengandalkan ucapan host dan Mode Bicara di bagian 5 belum terpakai. Penjelasan kini ada di dalam game; rinciannya ada di bagian "Siaran tanpa suara host" di `README.md`.

Karena suara game menjadi satu-satunya audio siaran, pastikan suara internal HP benar-benar masuk ke siaran. Keterbacaan teks barunya baru diperiksa lewat tangkapan layar di laptop, belum di HP sungguhan.

## 10. Pembaruan: kunci host dan kebocoran alamat

Peringatan di bagian 3 tentang perangkat lain yang bisa mengambil alih host tidak berlaku lagi untuk perangkat tanpa kunci. Server kini selalu memakai kunci host, dan klien tanpa kunci hanya bisa menonton. Panduan lengkap ada di bagian "Keamanan" pada `README.md`.

Sudah diuji di Chrome tanpa tampilan terhadap server sungguhan, termasuk upaya merebut host, tetapi belum di HP, HTTPS, atau VPS sungguhan.

---

Saat laporan ini pertama ditulis, tidak ada commit karena folder ini bukan repositori git. Data uji di `data/` sudah dibersihkan, jadi Klasemen Abadi mulai dari nol, dan `.venv` tetap ada supaya `run.sh` langsung siap dipakai.
