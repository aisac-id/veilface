# Pemberitahuan pihak ketiga

## face-api.js

`vendor/face-api.min.js` dan seluruh bobot model di `models/` berasal dari
[face-api.js](https://github.com/justadudewhohacks/face-api.js) oleh Vincent Mühler dan kontributor,
dirilis di bawah lisensi MIT:

```
MIT License

Copyright (c) 2020 Vincent Mühler

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## TensorFlow.js

face-api.js membundel [TensorFlow.js](https://github.com/tensorflow/tfjs)
(c) Google LLC, lisensi Apache-2.0. Arsitektur SSD MobileNet v1 yang menjadi dasar
bobot `models/ssd_mobilenetv1_model-*` berasal dari model TensorFlow (Apache-2.0).
Teks lisensi: https://www.apache.org/licenses/LICENSE-2.0

## Font

| Berkas | Keluarga | Lisensi |
| --- | --- | --- |
| `fonts/sora.woff2` | Sora — (c) Sora Project Authors | SIL OFL 1.1 |
| `fonts/jetbrains.woff2` | JetBrains Mono — (c) JetBrains s.r.o. | SIL OFL 1.1 |

Teks lengkap lisensi font ada di `fonts/OFL.txt`.

## Aset demo

Foto dan video di `demo/assets/` dibuat khusus untuk proyek ini (wajah sintetis),
bukan foto orang nyata, dan mengikuti lisensi MIT repositori.

Seluruh kode lain di repositori ini ditulis untuk proyek VeilFace dan dirilis di bawah lisensi MIT (`LICENSE`).
