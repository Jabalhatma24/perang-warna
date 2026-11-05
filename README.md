# Perang Warna 7 Wilayah Nusantara

Game interaktif untuk TikTok Live. Penonton memilih kubu lewat komentar, lalu prajurit mereka mengecat arena. Wilayah terluas di akhir ronde mendapat 1 Win.

Satu proses Python melayani game dan WebSocket di port 8080. Game berjalan di browser HP tanpa build step, tanpa internet untuk aset, dan tanpa berkas audio.

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
| `--simulate` | Bot penonton. Hasilnya disimpan terpisah di `data/wins.sim.json` |
| `--rate low\|normal\|high` | Kepadatan bot |
| `--username @akun` | Terhubung ke live TikTok, mencoba ulang otomatis jika live belum mulai |
| `--keep-session` | Melanjutkan Win sesi setelah crash |
| `--reset-all` | Menghapus Klasemen Abadi dan Hall of Fame |
| `--port N` | Mengganti port |

## Menghubungkan HP

1. Sambungkan HP dan laptop ke Wi-Fi yang sama.
2. Pindai QR di terminal, atau buka **tautan operator** yang tercetak di sana. Tautan ini berisi kunci host, jadi jangan dibagikan. Cukup sekali per perangkat, karena kuncinya tersimpan di HP dan langsung dihapus dari alamat.
3. Di Windows, izinkan Python di Windows Firewall untuk jaringan **Private**.
4. Tekan **MULAI** sebelum siaran layar dimulai. Satu ketukan itu membuka fullscreen, mengunci potret, dan menyalakan audio.

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

**Hanya satu host yang aktif.** Perangkat kedua yang menyimpan kunci akan mengambil alih peran host saat MULAI ditekan, dan layar lama berubah menjadi penonton. Perangkat tanpa kunci tidak bisa mengambil alih.

## Keamanan

Server selalu berjalan dengan kunci host, dan kunci diperiksa di server. Tanpa kunci, klien hanya bisa menonton. Hasil ronde, simulasi, dan snapshot darinya diabaikan.

**Sumber kunci**, dari yang paling diutamakan: `--key`, env `PERANG_HOST_KEY`, berkas `data/host.key`. Jika ketiganya kosong, kunci dibuat otomatis di `data/host.key` dan tidak ikut ke git. Minimal 16 karakter.

**Jika kunci bocor:** hapus `data/host.key`, jalankan ulang server, lalu buka tautan operator yang baru. Perangkat dengan kunci lama otomatis turun menjadi penonton.

**Batas penonton:** `server.maxViewers` di `config.json`, bawaan 10. Host tetap bisa masuk saat kursi penuh. Isi `0` jika tidak butuh penonton, karena setiap ada penonton HP operator ikut mengirim snapshot.

**Bilah alamat di siaran:** urutannya buka game, tekan MULAI, baru mulai siaran layar. Jika fullscreen tertutup, bilah alamat muncul lagi sampai layar diketuk, dan browser tidak mengizinkan halaman menutupnya sendiri.

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
| `1`-`7`, nama pulau, provinsi, atau kota | Gabung kubu |
| `gas` | RALLY: memanggil 3 prajurit tambahan (jeda 10 detik) |
| Komentar lain | DASH: prajurit melesat sebentar (jeda 3 detik). Prajurit yang kalah muncul lagi |

Pindah kubu hanya bisa saat fase Persiapan. Kubu: 1 Jawa, 2 Sulawesi, 3 Kalimantan, 4 Sumatera, 5 Bali & Nusa Tenggara, 6 Maluku, 7 Papua.

| Gift | Koin per unit | Efek |
| --- | --- | --- |
| MICRO | 1-9 | Prajurit bonus, cipratan cat, COMBO |
| MID | 10-99 | Prajurit Elite 15 detik |
| SULTAN | 100-999 | Meteor di wilayah kubu terdepan. Jika penyawer dari kubu terdepan, Meteor jatuh di peringkat kedua |
| MEGA | 1000+ | Takeover: gelombang warna, kubu 2x kuat 20 detik, nama masuk Prasasti Sultan |

Gift yang datang di luar pertempuran ditahan dan efeknya aktif saat perang berikutnya mulai.

## Siaran tanpa suara host

Game menjelaskan dirinya sendiri, jadi host tidak perlu bicara:

- **Kartu Cara Main** tampil selama 12 detik pertama Persiapan, lalu berganti ke Klasemen Abadi. Selama Klasemen masih kosong, kartu ini tampil sepanjang Persiapan.
- **Papan nama markas** menampilkan angka dan nama lengkap kubu, misalnya `1 Jawa`.
- **Papan Win** menampilkan nama di samping singkatan, misalnya `JW Jawa 0`.
- **Baris tips** di bawah banner selalu tampil dan berganti tiap 5 detik, termasuk saat banner ramai oleh gift.

Durasinya diatur lewat `help.prepHowToSeconds` dan `help.tipSeconds` di `config.json`. Nama pendek kubu ada di kolom `short` pada `data/wilayah.json`.

Teks siap tempel untuk TikTok:

- **Judul live:** `Perang Warna! Ketik 1-7`
- **Komentar yang disematkan:** `Ketik angka kubumu: 1 Jawa 2 Sulawesi 3 Kalimantan 4 Sumatera 5 Bali-Nusra 6 Maluku 7 Papua. Warna terluas menang!`

## Mengubah data

- `config.json`: durasi fase, ambang tier, cooldown, keseimbangan, batas zona layar, audio. Muat ulang server setelah mengubahnya.
- `data/wilayah.json`: kubu, provinsi, alias. Harus tetap 38 provinsi. Kata di daftar `ambiguous` hanya dihitung jika komentar hanya berisi kata itu.
- `data/blocklist.txt`: kata terlarang untuk nickname, satu per baris.

Zona 0-10% dan 68-100% tertutup UI TikTok. Jika HP Anda berbeda, sesuaikan `layout` di `config.json`.

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
