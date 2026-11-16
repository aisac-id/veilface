# Berkontribusi pada VeilFace

Terima kasih sudah mau ikut memperbaiki VeilFace. Proyek ini tanpa langkah build: JavaScript dan CSS murni, dengan model deteksi wajah yang dibundel lokal.

## Menyiapkan lingkungan

1. Fork dan clone repositori.
2. Buka `chrome://extensions`, aktifkan **Developer mode**, lalu **Load unpacked** ke folder repositori.
3. Jalankan halaman uji lewat server statis:

   ```bash
   python3 -m http.server 8080
   # buka http://localhost:8080/demo/index.html
   ```

4. Setiap selesai mengubah berkas, klik **Reload** pada kartu ekstensi lalu muat ulang halaman uji.

## Aturan main

- **Privasi dulu.** Tidak ada unggahan gambar, telemetri, maupun CDN. Model dan font harus tetap dibundel di dalam paket.
- **Gagal = tertutup.** Kalau deteksi gagal, media lintas-origin tidak terbaca, atau model belum siap, media harus tetap tertutup. Jangan pernah menampilkan wajah asli sebagai "fallback".
- **Sidebar tetap 1/4 layar dengan tab vertikal.** Tata letak ini identitas produk.
- **Setiap kontrol live.** Perubahan slider, efek, dan toggle harus terlihat di overlay tanpa tombol simpan.
- **Satu loop render.** Jangan menambah `requestAnimationFrame` atau `setInterval` baru untuk menggambar overlay; pakai loop yang sudah ada di `src/engine.js`.
- **Jangan dispose tensor model.** Tensor hasil `tf.io.decodeWeights` menjadi milik model setelah `loadFromWeightMap`.
- **Perhatikan biaya CPU.** Uji perubahan deteksi pada mesin tanpa GPU; jaga agar video tetap responsif.

## Menambah efek wajah

Tambahkan entri di `EFFECTS` pada `src/effects.js` (id, label, desc, tone, params, animated), lalu tangani di `drawEffect`. Efek menerima kotak dalam koordinat sumber alami dan `rect` dalam piksel overlay, jadi ia harus bekerja pada skala apa pun. Pastikan efek tetap menutup wajah saat `intensity` rendah.

## Gaya kode

- Dua spasi, titik koma, kutip tunggal, `const`/`let`.
- Komentar dan seluruh teks antarmuka dalam bahasa Indonesia.
- Hindari alokasi kanvas atau gradien baru di dalam loop render bila bisa dipakai ulang.

## Sebelum mengirim pull request

- [ ] `node --check` lulus untuk setiap berkas yang diubah.
- [ ] Model termuat dan wajah terdeteksi pada foto tim, foto rapat, potret, video, dan kanvas di halaman demo.
- [ ] Gambar lintas-origin tetap tertangani (relay atau tutup penuh).
- [ ] Ekspor PNG menghasilkan gambar tersensor pada resolusi asli.
- [ ] Panic, intip semua, dan master switch bekerja dua arah.
- [ ] Buka/tutup sidebar berulang tidak menduplikasi overlay, listener, atau loop.
- [ ] Tidak ada error di konsol halaman maupun service worker.
- [ ] Tata letak diuji pada lebar 1440 px dan 390 px.

## Melaporkan bug

Sertakan versi Chrome, jenis media (gambar/video/kanvas), URL atau cuplikan HTML, langkah reproduksi, dan tangkapan layar sidebar beserta tab Status. Gunakan wajah sintetis atau foto stok, jangan foto orang nyata tanpa izin.

## Lisensi

Dengan berkontribusi, kamu setuju kontribusimu dirilis di bawah lisensi MIT proyek ini. Perhatikan bahwa `vendor/face-api.min.js` dan `models/` berasal dari pihak ketiga dengan lisensi masing-masing (lihat README).