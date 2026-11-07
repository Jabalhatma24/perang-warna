# Perang Pulau Nusantara: 4 Pulau Besar

Game interaktif untuk TikTok LIVE. Penonton membela 1 dari 4 pulau besar (1 JAWA, 2 SUMATERA, 3 KALIMANTAN, 4 SULAWESI) lewat komentar, lalu prajurit mereka mengecat arena. Warna terluas di akhir ronde mendapat 1 Win.

Satu proses Python melayani game dan WebSocket di port 8080. Game berjalan di browser HP atau PC tanpa build step, tanpa internet untuk aset, dan tanpa berkas audio.

Versi sebelumnya ada di riwayat git: 7 wilayah Nusantara (`data/wins.json`) dan Continental War 4 benua (`data/wins.continental.json`, branch `fitur/kristal-studio-v2`). Klasemen 4 pulau disimpan di berkas sendiri, `data/wins.pulau4.json`, jadi data versi lama tidak tersentuh.

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
| `--simulate` | Bot penonton. Hasilnya disimpan terpisah di `data/wins.pulau4.sim.json` |
| `--rate low\|normal\|high` | Kepadatan bot |
| `--username @akun` | Terhubung ke live TikTok, mencoba ulang otomatis jika live belum mulai |
| `--keep-session` | Melanjutkan Win sesi setelah crash |
| `--reset-all` | Menghapus Klasemen Abadi dan Hall of Fame 4 pulau |
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

Ronde yang tercampur bot darurat tetap menambah Win sesi, tetapi tidak masuk Klasemen Abadi dan Hall of Fame.

## Aturan untuk penonton

| Komentar | Efek |
| --- | --- |
| `1`-`4`, nama pulau, provinsi, kota, singkatan, sebutan gaul, atau `plat B` | Gabung pulau |
| `gas`, `gaskeun`, `gaspol`, `serbu`, `serang`, atau `rush` | Menyerbu: prajurit melesat dan memanggil 3 prajurit tambahan (jeda 10 detik) |
| Komentar lain | Prajurit melesat sebentar (jeda 3 detik). Prajurit yang kalah muncul lagi |

Pindah pulau hanya bisa saat PERSIAPAN. Pulau: 1 JAWA (merah), 2 SUMATERA (kuning), 3 KALIMANTAN (hijau), 4 SULAWESI (biru). Penonton dari Bali, Nusa Tenggara, Maluku, dan Papua ikut dengan angka 1-4.

Setiap markas menempati satu sudut arena, jadi jarak dan wilayah awal semua pulau sama. Ronde pertama mengikuti peta (Sumatera kiri atas, Kalimantan kanan atas, Sulawesi kanan bawah, Jawa kiri bawah), lalu posisinya berputar searah jarum jam setiap ronde.

| Gift | Koin per unit | Efek |
| --- | --- | --- |
| MICRO (Rose) | 1-9 | +10 prajurit bonus per koin (maksimal 30 per event), cipratan cat, Combo. Prajurit bonus lebih lemah, tanpa Underdog, hilang setelah 30 detik |
| MID (Donut) | 10-99 | Titan Raksasa 15 detik: besar, kuat, dan mengecat lebih lebar |
| SULTAN | 100-999 | Meteor di wilayah pulau terdepan. Jika penyawer dari pulau terdepan, Meteor jatuh di peringkat kedua |
| MEGA | 1000+ | Ambil Alih: gelombang warna, pulau 2x kuat 20 detik, Perisai 10 detik, nama masuk Prasasti Sultan |

Selama Perisai aktif, prajurit pulau itu tidak bisa mati oleh tabrakan atau Meteor. Wilayahnya tetap bisa dicat lawan.

Gift yang datang di luar pertempuran ditahan dan efeknya aktif saat perang berikutnya mulai.

## Kamus wilayah

`data/wilayah.json` berisi 4 pulau dan 27 provinsinya (Jawa 6, Sumatera 10, Kalimantan 5, Sulawesi 6), dengan sekitar 500 nama kota, kabupaten, singkatan, sebutan gaul, nama suku, dan klub sepak bola, ditambah 47 kode plat nomor.

- **Provinsi dan kota:** `jabar`, `bandung`, `bdg`, `jogja`, `sby`, `mdn`, `plg`, `pku`, `bpp`, `ptk`, `mks`, `manado`. Provinsi yang ditulis lengkap lebih utama daripada nama pulau di dalamnya: `jawa barat` adalah Jawa Barat, bukan sekadar Jawa.
- **Sebutan gaul dan identitas daerah:** `jekardah`, `ngalam`, `suroboyo`, `ngapak`, `urang sunda`, `horas`, `urang awak`, `wong kito galo`, `urang banjar`, `dayak`, `ewako`, `kawanua`, serta suporter `bonek`, `bobotoh`, `jakmania`, `aremania`.
- **Absen plat nomor:** `plat B`, `pelat AB`, `plat BK`, `plat KT`, `plat DD`. Huruf plat tanpa kata `plat` tidak dihitung.
- **Label markas 2 huruf (`JW`, `SM`, `KL`, `SL`) hanya sah jika berdiri sendiri,** supaya `i love kl` tidak bergabung ke Kalimantan.
- **Kata di daftar `ambiguous` hanya sah jika berdiri sendiri:** `malang`, `medan`, `padang`, `solo`, `palu`, `batu`, `kudus`, `pati`, `tegal`, dan lainnya. `medan` bergabung ke Sumatera Utara, tetapi `medan perang` dan `nasib malang` tidak.
- **Ejekan tidak dihitung sebagai gabung.** Komentar yang menyebut pulau bersama kata di daftar `hostile` (`serbu`, `hajar`, `cupu`, `kalah`, `vs`, `bukan`, dan lainnya) bukan perintah gabung, jadi `sumatera cupu` dari pendukung Jawa tetap menggerakkan prajurit Jawa dan like-nya tetap untuk Jawa. Kata di dalam nama daerah tidak dihitung, jadi `kota serang` tetap masuk Banten.
- **Dua pulau dalam satu komentar diabaikan,** misalnya `jawa vs sumatera` atau `bandung palembang`.
- **Nama yang dipakai di dua pulau** diberikan ke yang paling dikenal: `banjar` (Kalsel, Kota Banjar di Jabar memakai `kota banjar`), `martapura` (Kalsel), `ketapang` (Kalbar).
- **Sengaja tidak dipakai:** `nusantara` (judul game sekaligus nama IKN, IKN memakai `ikn`), `serang` sendirian (berarti menyerang), `metro` (Kota Metro memakai `kota metro`), `indonesia`, dan 🇮🇩, karena keempat pulau sama-sama Indonesia.

Backend mengingat provinsi terakhir setiap penonton dan menyertakannya di setiap aksi, sehingga label nama tetap membawa provinsinya setelah host memuat ulang halaman.

## Siaran tanpa suara host

Game menjelaskan dirinya sendiri:

Seluruh teks di layar berbahasa Indonesia.

- **Kartu Cara Main** tampil selama 12 detik pertama PERSIAPAN, lalu berganti ke Klasemen Abadi. Selama klasemen masih kosong, kartu ini tampil sepanjang PERSIAPAN.
- **Papan skor** berupa tabel 4 kolom: `1 JAWA`, `2 SUMATERA`, `3 KALIMANTAN`, `4 SULAWESI`, persen wilayah, jumlah menang, dan bonus Underdog (`▲1.5`). Pulau yang memimpin diberi bingkai emas, dan mahkota menggantikan bintang setelah 3 kemenangan beruntun.
- **Markas** menampilkan label pulau (`JW`, `SM`, `KL`, `SL`) dan angka untuk bergabung.
- **Strip gift** di atas arena selalu tampil: 1 koin, 10+, 100+, dan 1000+ koin beserta efeknya. Kotaknya berkedip saat ada yang mengirim gift dari tingkat itu, dan diberi tanda `x2` saat Waktu Tambahan.
- **Baris tips** di antara strip gift dan arena berganti tiap 5 detik, termasuk contoh kota per pulau dan contoh plat nomor. Saat ada pengumuman gift, baris ini dipakai pengumuman itu.
- **Top Likes** di baris paling atas: 3 penonton dengan like terbanyak selama server menyala, masing-masing dengan chip pulaunya (`JW`, `SM`, `KL`, `SL`) kalau sudah bergabung. Sebelum ada like, baris ini menampilkan judul game. Bot darurat tidak pernah masuk papan ini.
- **Layar juara** menampilkan `PULAU <NAMA>`, persen wilayah, jumlah kemenangan beruntun (mulai 2x), MVP, Hall of Fame, dan Top Liker ronde itu beserta pulaunya.
- **Nama prajurit** satu baris dengan singkatan provinsinya berwarna emas, misalnya `Budi JATIM` atau `Ucok SUMUT`. Kalau tidak muat, nama yang dipendekkan, bukan singkatannya. Nama hanya digambar di tempat kosong, jadi tidak pernah menumpuk. Paling banyak 14 nama sekaligus (`gameplay.maxLabels`).

Durasinya diatur lewat `help.prepHowToSeconds` dan `help.tipSeconds` di `config.json`.

Teks siap tempel untuk TikTok:

- **Judul live:** `PERANG PULAU NUSANTARA! Bela pulaumu, ketik 1-4 🔥`
- **Komentar yang disematkan:** `Ketik angka atau kotamu: 1 Jawa 2 Sumatera 3 Kalimantan 4 Sulawesi. Absen plat juga bisa: plat B, plat BK, plat KT, plat DD!`

## TikTok LIVE Studio di PC

Bagian ini belum diuji di Windows atau di TikTok LIVE Studio sungguhan, jadi lakukan gladi bersih sebelum siaran.

1. Jalankan `run.bat --username @akunku` (Windows). Terminal mencetak perintah **Jendela untuk TikTok LIVE Studio**.
2. Salin perintah itu ke terminal kedua. Perintah ini membuka jendela Chrome 9:16 tanpa bilah alamat. Isinya memuat kunci host, jadi jangan disiarkan.
3. Tekan **START** di jendela itu. Di PC game tidak masuk fullscreen, supaya tetap 9:16.
4. Di Studio, pilih tata letak **potret** dengan kanvas 1080x1920.
5. **Add source > Window Capture**, lalu pilih jendela Perang Pulau Nusantara dan sesuaikan ukurannya mengisi kanvas. Jika hasilnya hitam, pakai Screen Capture lalu potong areanya.
6. Aktifkan suara desktop atau aplikasi di Studio. Cek lewat akun kedua bahwa suara game masuk.
7. Baru tekan **Go LIVE**.

Jangan meminimalkan jendela game. Flag di perintah tadi menjaga game tetap berjalan saat jendelanya tertutup jendela lain, tetapi tidak saat diminimalkan.

### Sumber Link (lebih tajam daripada Window Capture)

Window Capture menangkap jendela yang lebih kecil dari 1080x1920 lalu memperbesarnya, jadi hasilnya lebih buram. Sumber **Link** merender game langsung:

1. **Add source > Link**, isi alamat operator dengan tambahan `?autostart=1&check=1`, misalnya `http://localhost:8080/?autostart=1&check=1#key=<kunci>`. Kalau ada kolom lebar dan tinggi, isi **1080** dan **1920**.
2. Lihat kotak di tengah pratinjau. **Hijau "OK: 1080x1920 TAJAM"** berarti kanvas tepat 1:1 dengan siaran dan baris `font` berisi `Inter Siaran`. Kalau **merah**, ukuran sumber belum pas atau font gagal dimuat; perbaiki sampai hijau.
3. Hapus `&check=1` dari alamat, lalu muat ulang sumbernya. Kotak itu ikut tersiar kalau dibiarkan.

Di PC dan dengan `?autostart=1`, resolusi game dikunci penuh. Dulu game menurunkan resolusi sampai 72% kalau FPS di bawah 45. Padahal sumber Link dan Browser Source sering dibatasi 30 FPS oleh aplikasinya, jadi siaran menjadi buram tanpa terlihat. Penurunan otomatis itu kini hanya berlaku di HP yang menyiarkan layarnya sendiri. Kalau PC Anda benar-benar terlalu lemah untuk 1080x1920, tambahkan `&adaptive=1`.

### Siaran masih buram?

Periksa berurutan, dari penyebab terbesar:

1. **Pakai sumber Link, bukan Window Capture.** Jendela dari perintah `--app` hanya 608x1080 pada skala tampilan 100%, jadi Window Capture memperbesarnya sekitar 1,78x sebelum dikirim ke TikTok.
2. **Kotak `?check=1` harus hijau** dengan `kanvas 1080x1920`, `kualitas 1.00 (dikunci)`, dan `font Inter Siaran`.
3. **Pengaturan video TikTok LIVE Studio:** resolusi 1080p, 30 FPS, dan bitrate setinggi yang masih stabil di koneksi Anda. Pada bitrate yang sama, 30 FPS memberi tiap frame dua kali lebih banyak data daripada 60 FPS, jadi teks lebih tajam.
4. **Kualitas di HP penonton** dipilih TikTok sesuai jaringan HP itu. Saat menguji dengan HP kedua, pakai Wi-Fi yang kencang dan pilih kualitas tertinggi kalau menunya tersedia.

Game memakai font sendiri (Inter, di `public/fonts`) supaya huruf di Windows sama dengan di HP dan OBS. Dulu game memakai font sistem: Windows menampilkan bobot 800 sebagai Segoe UI Black, dan bersama outline tebal lubang huruf tertutup sehingga teks menggumpal setelah dikompres. Outline kini 12% dari besar huruf, dan teks di chip kuning dan hijau berwarna gelap.

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
- `data/wilayah.json`: pulau, provinsi (`tag` untuk label, `plates` untuk plat nomor), alias. Setiap alias hanya boleh dimiliki satu provinsi. Kata di daftar `ambiguous` hanya dihitung jika komentar hanya berisi kata itu, dan kata di daftar `hostile` membatalkan gabung.
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
| `public/fonts/` | Font Inter 700 dan 800 (lisensi SIL OFL 1.1 di `OFL.txt`) |

Jalankan tes dengan `.venv/bin/python -m pytest -q` (Windows: `.venv\Scripts\python -m pytest -q`).

## Risiko yang perlu diketahui

`TikTokLive` adalah pustaka tidak resmi dan bisa rusak saat TikTok berubah. Versinya dikunci di `requirements.txt`. Selalu uji dengan `--username` sebelum siaran penting, dan siapkan tombol bot darurat sebagai cadangan. Lisensi pustaka ini adalah Modified AGPL-3.0, jadi periksa ketentuannya jika game ini akan didistribusikan.
