# Kit Promosi & Merek — VeilFace

Semua berkas di folder ini siap pakai untuk README, media sosial, presentasi, dan cetak.
Tidak ada mockup: setiap tangkapan layar diambil dari ekstensi yang benar-benar berjalan di Chrome.

**Galeri interaktif:** buka [`index.html`](index.html) di browser (klik dua kali dari folder ini).
Halaman itu memutar film promosi, menampilkan seluruh aset, dan punya panel studio untuk
mengubah gaya pratinjau lalu mengekspor bingkai PNG 1920×1080.

---

## Video

| Berkas | Spesifikasi | Kegunaan |
| --- | --- | --- |
| [`veil-suite-promo.mp4`](veil-suite-promo.mp4) | 1920×1080 · 28,0 s · 30 fps · H.264 High + AAC 48 kHz stereo · 15,1 MB | Film utama: pemindaian data VeilKit, katalog 14 efek dengan pratinjau hidup, sensor 12 wajah oleh VeilFace, statistik, kartu pemasangan. Musik dan efek suara asli. |
| [`veil-suite-preview.gif`](veil-suite-preview.gif) | 560×315 · 10 fps · 7,0 MB | Pratinjau bergerak untuk README, surel, dan tempat yang tidak memutar MP4. |
| [`video-poster.jpg`](video-poster.jpg) | 1920×1080 · JPEG | Kartu penutup film; poster pemutar dan thumbnail tautan. |

Garis waktu film:

| Waktu | Adegan |
| --- | --- |
| 00:00–00:03 | Pembuka Veil Suite |
| 00:03–00:09 | VeilKit menyapu halaman: 58 nilai pribadi tersensor |
| 00:09–00:13 | 14 efek VFX + pratinjau langsung pada data fiktif |
| 00:13–00:19 | VeilFace menutup 12 wajah pada 6 media |
| 00:19–00:23 | Statistik: 0 byte diunggah, 28 efek, sidebar ¼ layar |
| 00:23–00:28 | Pasang gratis di Chrome + tautan repo |

## Kotak perangkat lunak

| Berkas | Ukuran | Kegunaan |
| --- | --- | --- |
| [`box-veilface.png`](box-veilface.png) | 1600×1200 | Render kemasan 3D VeilFace dengan pantulan lantai |
| [`box-veil-suite.png`](box-veil-suite.png) | 1800×1200 | Dua kotak berdampingan: VeilKit + VeilFace |

## Poster & hero

| Berkas | Ukuran | Kegunaan |
| --- | --- | --- |
| [`poster-veilface.png`](poster-veilface.png) | 1240×1754 (A4) | Poster cetak utama |
| [`poster-veil-suite.png`](poster-veil-suite.png) | 1240×1754 (A4) | Poster dwiproduk |
| [`hero-1920x1080.png`](hero-1920x1080.png) | 1920×1080 | Hero halaman muka, slide 16:9, layar acara |
| [`hero-veil-suite-1920x1080.png`](hero-veil-suite-1920x1080.png) | 1920×1080 | Hero pengumuman bundel |
| [`compare-1600x900.png`](compare-1600x900.png) | 1600×900 | Perbandingan sebelum → sesudah |

## Aset sosial

| Berkas | Ukuran | Kegunaan |
| --- | --- | --- |
| [`social-square-1080.png`](social-square-1080.png) | 1080×1080 | Instagram / LinkedIn / Facebook feed |
| [`story-1080x1920.png`](story-1080x1920.png) | 1080×1920 | Story, Reels, status WhatsApp (9:16) |
| [`og-1200x630.png`](og-1200x630.png) | 1200×630 | Open Graph / kartu tautan X, Telegram, WhatsApp |
| [`og-veil-suite-1200x630.png`](og-veil-suite-1200x630.png) | 1200×630 | Kartu tautan Veil Suite |
| [`banner-1500x500.png`](banner-1500x500.png) | 1500×500 | Header profil X/Twitter, spanduk surel |

Untuk *social preview* GitHub: **Settings → General → Social preview**, unggah `og-1200x630.png`.

## Logo

Berkas logo ada di [`../brand/`](../brand/): 7 SVG (font tersemat, jadi teks tetap benar
saat SVG dibuka sendiri) dan 5 PNG.

| Berkas | Ukuran | Kegunaan |
| --- | --- | --- |
| `brand/logo.svg` | vektor | Lockup utama untuk latar gelap |
| `brand/logo-1600.png` | 1600×356 | Versi raster transparan |
| `brand/logo-1600-light.png` | 1600×356 | Untuk latar terang / cetak |
| `brand/logo-stacked.svg` · `logo-stacked-900.png` | 900×643 | Lockup bertumpuk untuk ruang persegi |
| `brand/logomark.svg` · `logomark-1024.png` | 1024×1024 | Ikon tanpa teks: avatar, favicon, ikon toko |
| `brand/logo-mono-light.svg` · `logo-mono-dark.svg` · `logo-mono-white.png` | 1200×267 | Satu warna untuk cetak, emboss, sponsor bar |
| `brand/logomark-mono-light.svg` · `logomark-mono-dark.svg` | vektor | Ikon satu warna |

### Palet

| Peran | Hex |
| --- | --- |
| Primer | `#FFB020` |
| Sekunder | `#FF6B3D` |
| Tersier | `#FF3D71` |
| Aksen / sukses | `#B4FF39` |
| Bahaya | `#FF3D71` |
| Peringatan | `#FFB020` |
| Informasi | `#3DA5FF` |
| Latar | `#0D0810` |
| Permukaan | `#1A1018` |
| Teks | `#FDF1E4` |

Gradien utama: `linear-gradient(112deg, #FFB020, #FF6B3D 52%, #FF3D71)`.
Wordmark dikunci pada **Sora 800**; monospace pada **JetBrains Mono**.

### Aturan singkat

- Sisakan ruang kosong minimal setinggi logomark di setiap sisi.
- Di bawah lebar 120 px, pakai logomark saja.
- Jangan mengganti rona gradien, memiringkan, atau menambah bayangan jatuh.
- Jangan menulis ulang wordmark dengan font lain.
- Palet VeilKit dan VeilFace hanya boleh bertemu pada aset bertanda “Veil Suite”.

## Cara pakai cepat

```markdown
![VeilFace](brand/logo-1600.png)
![Pratinjau](promo/veil-suite-preview.gif)
```

```html
<meta property="og:image" content="promo/og-1200x630.png">
<video src="promo/veil-suite-promo.mp4" poster="promo/video-poster.jpg" controls></video>
```

## Lisensi

Seluruh aset di `brand/` dan `promo/` mengikuti [lisensi MIT](../LICENSE) yang sama dengan kode
ekstensi: boleh dipakai ulang, diubah, dan disebarluaskan, termasuk komersial, selama pemberitahuan
hak cipta dan lisensi disertakan. Font tetap di bawah SIL OFL 1.1 ([`../fonts/OFL.txt`](../fonts/OFL.txt)).

Data dan foto pada tangkapan layar berasal dari halaman demo di [`../demo/`](../demo/) yang dibuat khusus untuk proyek ini. Deteksi wajah berjalan sepenuhnya lokal; tidak ada gambar yang diunggah.