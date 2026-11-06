# Continental War: Battle of Nations

Game interaktif untuk TikTok LIVE. Penonton memilih 1 dari 4 benua lewat komentar, lalu prajurit mereka mengecat arena. Warna terluas di akhir ronde mendapat 1 Win.

Satu proses Python melayani game dan WebSocket di port 8080. Game berjalan di browser HP atau PC tanpa build step, tanpa internet untuk aset, dan tanpa berkas audio.

Versi Perang Warna Nusantara ada di riwayat git, dan datanya tetap tersimpan di `data/wins.json`.

## Menjalankan

Butuh Python 3.10 atau lebih baru.

**Linux/macOS**
```bash
./run.sh --simulate                # uji dengan bot penonton
./run.sh --simulate --rate high    # uji beban 300 prajurit
./run.sh --username @akunku        # mode live
```

**Windows**
```bat
run.bat --simulate
run.bat --simulate --rate high
run.bat --username @akunku
```

Skrip membuat virtualenv, memasang dependensi, menjalankan `pytest`, lalu menyalakan server. Terminal menampilkan alamat dan QR code untuk dipindai HP.

| Flag | Fungsi |
| --- | --- |
| `--simulate` | Bot penonton. Hasilnya disimpan terpisah di `data/wins.continental.sim.json` |
| `--rate low\|normal\|high` | Kepadatan bot |
| `--username @akun` | Terhubung ke live TikTok, mencoba ulang otomatis jika live belum mulai |
| `--keep-session` | Melanjutkan Win sesi setelah crash |
| `--reset-all` | Menghapus All-Time Ranking dan Hall of Fame benua |
| `--port N` | Mengganti port |

## Menghubungkan HP

1. Sambungkan HP dan laptop ke Wi-Fi yang sama.
2. Pindai QR di terminal, atau buka **tautan operator** yang tercetak di sana. Tautan ini berisi kunci host, jadi jangan dibagikan. Cukup sekali per perangkat, karena kuncinya tersimpan di HP dan langsung dihapus dari alamat.
3. Di Windows, izinkan Python di Windows Firewall untuk jaringan **Private**.
4. Tekan **START** sebelum siaran layar dimulai. Satu ketukan itu membuka fullscreen, mengunci potret, dan menyalakan audio.

Pakai **Chrome di Android**. Safari di iPhone tidak mendukung fullscreen untuk halaman biasa.

**Layar HP:** game dibuka lewat HTTP, sehingga Wake Lock API tidak tersedia. Game memakai video senyap sebagai gantinya, tetapi tetap naikkan batas waktu layar mati di pengaturan HP ke maksimum.

## Alamat khusus

| Alamat | Fungsi |
| --- | --- |
| `/` tanpa kunci | Penonton. Hanya menonton dan tidak bersuara |
| `/#key=<kunci>` | Tautan operator, menyimpan kunci di perangkat itu |
| `/?role=view` | Pratinjau di perangkat yang sudah menyimpan kunci, tanpa mengambil alih host |
| `/?debug=1` | Menampilkan FPS, prajurit, partikel, dan antrean |
| `/?sfxtest=1` | Uji semua suara, intensitas musik, dan spam gift |

**Hanya satu host yang aktif.** Perangkat kedua yang menyimpan kunci akan mengambil alih peran host saat START ditekan, dan layar lama berubah menjadi penonton. Perangkat tanpa kunci tidak bisa mengambil alih.

## Keamanan

Server selalu berjalan dengan kunci host, dan kunci diperiksa di server. Tanpa kunci, klien hanya bisa menonton. Hasil ronde, simulasi, dan snapshot darinya diabaikan.

**Sumber kunci**, dari yang paling diutamakan: `--key`, env `PERANG_HOST_KEY`, berkas `data/host.key`. Jika ketiganya kosong, kunci dibuat otomatis di `data/host.key` dan tidak ikut ke git. Minimal 16 karakter.

**Jika kunci bocor:** hapus `data/host.key`, jalankan ulang server, lalu buka tautan operator yang baru. Perangkat dengan kunci lama otomatis turun menjadi penonton.

**Batas penonton:** `server.maxViewers` di `config.json`, bawaan 10. Host tetap bisa masuk saat kursi penuh. Isi `0` jika tidak butuh penonton, karena setiap ada penonton HP operator ikut mengirim snapshot.

**Bilah alamat di siaran:** urutannya buka game, tekan START, baru mulai siaran layar. Jika fullscreen tertutup, bilah alamat muncul lagi sampai layar diketuk, dan browser tidak mengizinkan halaman menutupnya sendiri.

**Pasang sebagai aplikasi (PWA):** Chrome hanya mengizinkan lewat HTTPS. Di `http://IP:port` ia menolak dengan `not-from-secure-origin`, jadi PWA butuh domain dan HTTPS.

### Memilih tempat server

| | Laptop, Wi-Fi privat | VPS, HTTP saja | VPS, domain + HTTPS |
| --- | --- | --- | --- |
| Alamat bocor di siaran | Tidak berguna bagi orang luar | Bisa dibuka siapa pun, hanya sebagai penonton | Bisa dibuka siapa pun, hanya sebagai penonton |
| Kunci di jaringan | Hanya di Wi-Fi sendiri | **Tidak terenkripsi** di internet | Terenkripsi |
| Tanpa bilah alamat (PWA) | Tidak bisa, tapi alamatnya tidak berguna | Tidak bisa | Bisa |
| Ketergantungan | Laptop dan Wi-Fi menyala | VPS | VPS, domain, sertifikat |

Rekomendasi: **laptop dengan Wi-Fi privat** untuk siaran biasa. Jika harus VPS, pakai domain dan HTTPS.

### Menjalankan di VPS dengan HTTPS

Contoh ini belum diuji di VPS sungguhan.

```bash
./run.sh --username @akunku --bind 127.0.0.1 --public-url https://game.domainku.id
```

```
# Caddyfile: sertifikat HTTPS dan WebSocket diurus otomatis oleh Caddy
game.domainku.id {
    reverse_proxy 127.0.0.1:8080
}
```

Tutup port 8080 di firewall VPS, lalu pasang lewat Chrome di HP: buka tautan operator, menu ⋮, **Tambahkan ke Layar Utama**. Tautan operator tercetak di terminal dan log layanan, jadi jangan bagikan log itu.

## Kontrol operator

| Aksi | Hasil |
| --- | --- |
| Tekan lama 2 detik pojok **kiri atas** | Bot darurat on/off. Jika backend putus, bot berjalan di HP |
| Tekan lama 2 detik pojok **kanan atas** | Panel audio: volume, musik, Mode Bicara |
| Tombol `M` (laptop) | Bisukan |
| Tombol `T` (laptop) | Mode Bicara, menurunkan semua audio -12 dB |

Ronde yang tercampur bot darurat tetap menambah Win sesi, tetapi tidak masuk All-Time Ranking dan Hall of Fame.

## Aturan untuk penonton

| Komentar | Efek |
| --- | --- |
| `1`-`4`, nama benua, negara, atau emoji bendera | Gabung benua |
| `gas` atau `rush` | Menyerbu: prajurit melesat dan memanggil 3 prajurit tambahan (jeda 10 detik) |
| Komentar lain | Prajurit melesat sebentar (jeda 3 detik). Prajurit yang kalah muncul lagi |

Pindah benua hanya bisa saat PREPARATION. Benua: 1 ASIA, 2 EUROPE, 3 N.AMERICA, 4 S.AMERICA.

Keempatnya dipilih karena jumlah pengguna TikTok-nya terbanyak. Setiap markas menempati satu sudut arena, jadi jarak dan wilayah awal semua benua sama. Posisinya berputar searah jarum jam setiap ronde.

| Gift | Koin per unit | Efek |
| --- | --- | --- |
| MICRO (Rose) | 1-9 | +10 prajurit bonus per koin (maksimal 30 per event), cipratan cat, Combo. Prajurit bonus lebih lemah, tanpa Underdog, hilang setelah 30 detik |
| MID (Donut) | 10-99 | Giant Titan Warrior 15 detik: besar, kuat, dan mengecat lebih lebar |
| SULTAN | 100-999 | Meteor di wilayah benua terdepan. Jika penyawer dari benua terdepan, Meteor jatuh di peringkat kedua |
| MEGA | 1000+ | Takeover: gelombang warna, benua 2x kuat 20 detik, Shield 10 detik, nama masuk Sultan Wall |

Selama Shield aktif, prajurit benua itu tidak bisa mati oleh tabrakan atau Meteor. Wilayahnya tetap bisa dicat lawan.

Gift yang datang di luar pertempuran ditahan dan efeknya aktif saat perang berikutnya mulai.

## Kamus negara

`data/wilayah.json` berisi 4 benua dan 104 negara dengan alias Inggris, Indonesia, sebagian aksara lokal, dan kode ISO.

Negara Timur Tengah, Afrika, dan Oseania sengaja tidak ada. Komentar berisi nama atau bendera negara itu diabaikan, tetapi penontonnya tetap bisa ikut dengan mengetik angka 1-4. Daftar lengkapnya masih ada di riwayat git (commit `86029bc`).

- **Kode 2 huruf hanya sah jika berdiri sendiri.** `it` bergabung ke Italy, tetapi `i love it` tidak.
- **Kode yang merupakan kata sehari-hari tidak dipakai:** `no`, `me`, `so`, `to`, `is`, `am`, `at`, `be`, `do`, `si`, `la`, `pa`, `by`, `ai`. Benderanya tetap berlaku.
- **Label di layar lebih utama daripada kode negara.** `SA` berarti S.AMERICA dan `AS` berarti ASIA. Arab Saudi memakai `ksa` atau `saudi`.
- **Kata di daftar `ambiguous` hanya sah jika berdiri sendiri,** misalnya `cuba`, `chad`, `turkey`, dan `french`.
- **Emoji bendera selalu sah,** kecuali komentar menyebut dua benua berbeda.

## Siaran tanpa suara host

Game menjelaskan dirinya sendiri:

- **Kartu How to Play** tampil selama 12 detik pertama PREPARATION, lalu berganti ke All-Time Ranking. Selama ranking masih kosong, kartu ini tampil sepanjang PREPARATION.
- **Papan skor** berupa tabel 4 kolom: `1 ASIA`, persen wilayah, jumlah menang, dan bonus Underdog (`▲1.5`). Kubu yang memimpin diberi bingkai emas.
- **Markas** menampilkan singkatan benua dan angka untuk bergabung.
- **Strip gift** di atas arena selalu tampil: 1 koin, 10+, 100+, dan 1000+ koin beserta efeknya. Kotaknya berkedip saat ada yang mengirim gift dari tingkat itu, dan diberi tanda `x2` saat Overtime.
- **Baris tips** di antara strip gift dan arena berganti tiap 5 detik, sebagian berbahasa Indonesia. Saat ada pengumuman gift, baris ini dipakai pengumuman itu.
- **Nama prajurit** satu baris dengan bendera negaranya (atau kode negara kalau perangkat tidak bisa menampilkan bendera). Nama hanya digambar di tempat kosong, jadi tidak pernah menumpuk. Paling banyak 14 nama sekaligus (`gameplay.maxLabels`).

Durasinya diatur lewat `help.prepHowToSeconds` dan `help.tipSeconds` di `config.json`.

Teks siap tempel untuk TikTok:

- **Judul live:** `Continental War: Type 1-4!`
- **Komentar yang disematkan:** `Type your number: 1 Asia 2 Europe 3 N.America 4 S.America. Biggest color wins!`

## TikTok LIVE Studio di PC

Bagian ini belum diuji di Windows atau di TikTok LIVE Studio sungguhan, jadi lakukan gladi bersih sebelum siaran.

1. Jalankan `run.bat --username @akunku` (Windows). Terminal mencetak perintah **Jendela untuk TikTok LIVE Studio**.
2. Salin perintah itu ke terminal kedua. Perintah ini membuka jendela Chrome 9:16 tanpa bilah alamat. Isinya memuat kunci host, jadi jangan disiarkan.
3. Tekan **START** di jendela itu. Di PC game tidak masuk fullscreen, supaya tetap 9:16.
4. Di Studio, pilih tata letak **potret** dengan kanvas 1080x1920.
5. **Add source > Window Capture**, lalu pilih jendela Continental War dan sesuaikan ukurannya mengisi kanvas. Jika hasilnya hitam, pakai Screen Capture lalu potong areanya.
6. Aktifkan suara desktop atau aplikasi di Studio. Cek lewat akun kedua bahwa suara game masuk.
7. Baru tekan **Go LIVE**.

Jangan meminimalkan jendela game. Flag di perintah tadi menjaga game tetap berjalan saat jendelanya tertutup jendela lain, tetapi tidak saat diminimalkan.

**OBS sebagai alternatif:** tambahkan Browser Source ke `http://localhost:8080/#key=<kunci>` dengan ukuran 1080x1920, centang kontrol audio lewat OBS, lalu klik kanan > Interact untuk menekan START.

## Siaran dari OBS di Linux

TikTok LIVE Studio tidak tersedia untuk Linux, jadi siaran memakai OBS dan jalur RTMP.

**Sekali saja, dengan OBS tertutup:**

```bash
python3 tools/setup_obs_profile.py    # 1080x1920, 60 FPS, NVENC, 6000 Kbps
```

**Setiap siaran:**

```bash
./run.sh --username @akunku    # terminal 1
./tools/start_obs.sh           # terminal 2
```

Selalu buka OBS lewat `tools/start_obs.sh`. Skrip ini membuat OBS merender di GPU NVIDIA; tanpa itu sekitar 14% frame tertinggal pada 60 FPS. Jika driver NVIDIA Flatpak tidak ada, pakai `python3 tools/setup_obs_profile.py --encoder qsv --fps 30 --bitrate 4000`.

Di Browser Source, game otomatis berjalan tepat 1:1 pada 1080x1920 dan langsung mulai lewat `?autostart=1`.

### Mengambil Stream Key

Jika TikTok tidak memberi Stream Key, ada alat pihak ketiga yang mengambilnya lewat akun Streamlabs:

```bash
python3 tools/get_stream_key.py
```

- **Risiko:** alat ini bukan produk TikTok atau Streamlabs, dan menyamar sebagai Streamlabs Desktop. Ini bisa melanggar ketentuan layanan, dan risikonya ada pada akun Anda.
- **Syarat:** akun tetap harus punya akses Streamlabs TikTok LIVE. Alat ini tidak bisa memberikannya.
- **Rahasia:** token tersimpan tanpa enkripsi di `tools/.streamlabs-keygen/repo/config.json` dan tidak ikut ke git. Jangan tampilkan jendela alat ini saat siaran.
- **Mengakhiri siaran:** pakai tombol END LIVE di alat ini, bukan tombol berhenti di OBS.

Skrip mengunci alat pada satu commit yang sudah dibaca kodenya. Alatnya sendiri belum pernah dijalankan dalam pengujian proyek ini.

`Loukious/TikTokStreamKeyGenerator` sengaja tidak dipakai: alat itu menyamar sebagai TikTok LIVE Studio dengan sidik jari perangkat acak dan butuh layanan penandatanganan berbayar milik pihak ketiga untuk lolos pemeriksaan integritas TikTok.

## Mengubah data

- `config.json`: durasi fase, ambang tier, cooldown, keseimbangan, batas zona layar, audio. Muat ulang server setelah mengubahnya.
- `data/wilayah.json`: benua, negara, alias. Setiap alias hanya boleh dimiliki satu negara. Kata di daftar `ambiguous` hanya dihitung jika komentar hanya berisi kata itu.
- `data/blocklist.txt`: kata terlarang untuk nickname, satu per baris. Awalan `=` memaksa cek kata utuh, untuk kata yang menjadi bagian nama wajar.

Zona layar diukur dari tangkapan layar TikTok di HP 1182x2560: profil host menutupi bagian teratas, dan kolom komentar mulai sekitar 51% dari atas (`layout.commentTop`). Urutan dari atas: judul, papan skor, strip gift dan pengumuman, lalu arena. Sepertiga bawah arena boleh tertutup komentar, tetapi markas dan nama prajurit hanya ditaruh di bagian yang terlihat. Teks dijauhkan `safeX` = 100 piksel dari tepi kiri-kanan, berjaga kalau TikTok memotong sisi video 9:16.

## API key TikTok

`TikTokLive` memakai layanan signing pihak ketiga. Jika koneksi ditolak karena batas pemakaian atau butuh kunci, set environment variable sebelum menjalankan:

```bash
export SIGN_API_KEY="kunci-anda"        # Linux/macOS
```
```bat
set SIGN_API_KEY=kunci-anda             &rem Windows
```

## Berkas sumber

| Bagian | Isi |
| --- | --- |
| `backend/server.py` | Server, hub WebSocket, CLI |
| `backend/tiktok_adapter.py` | Satu-satunya berkas yang menyentuh `TikTokLive` |
| `backend/parser.py` | Pencocokan wilayah, perintah, cooldown, moderasi |
| `backend/gifts.py` | Delta streak dan tier |
| `backend/simulator.py` | Bot penonton |
| `backend/storage.py` | Penyimpanan Win dengan tulis atomik |
| `public/js/game.js` | Arena, fase, gift, render |
| `public/js/audio.js` | Seluruh suara |
| `public/js/net.js` | WebSocket dan reconnect |
| `public/js/localsim.js` | Bot darurat di HP |
| `public/js/sfxtest.js` | Halaman uji suara |

Jalankan tes dengan `.venv/bin/python -m pytest -q` (Windows: `.venv\Scripts\python -m pytest -q`).

## Risiko yang perlu diketahui

`TikTokLive` adalah pustaka tidak resmi dan bisa rusak saat TikTok berubah. Versinya dikunci di `requirements.txt`. Selalu uji dengan `--username` sebelum siaran penting, dan siapkan tombol bot darurat sebagai cadangan. Lisensi pustaka ini adalah Modified AGPL-3.0, jadi periksa ketentuannya jika game ini akan didistribusikan.
