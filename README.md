# 🎭 Wayang Kulit Digital Indonesia — Hand Puppetry

> **Mahakarya Seni Tradisional Wayang Kulit & Teknologi AI Pelacakan Gestur Tangan Real-Time.**  
> *Product by [Yossika Putra](https://yossikaputra.my.id/)*

[![Portfolio](https://img.shields.io/badge/Portfolio-yossikaputra.my.id-blue?style=flat-square&logo=safari)](https://yossikaputra.my.id/)
[![GitHub](https://img.shields.io/badge/GitHub-yoshput-black?style=flat-square&logo=github)](https://github.com/yoshput)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-yossikaputraerlangga-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/yossikaputraerlangga/)

---

## ✨ Fitur Utama (Features)

1. **Simulasi Kelir & Tata Cahaya Blencong Nyata (WebGL2)**
   - Simulasi bayangan dinamis lembut (*soft shadow*) di atas kain kelir.
   - Efek kedalaman 3D (*depth factor*): semakin dekat tangan ke kamera, wayang terangkat dari kelir dan bayangannya semakin membesar dan memudar lembut.
   - Pencahayaan minyak kelapa tradisional (*blencong*) yang berkedip dan bergoyang alami.
   - Tekstur tatahan kulit asli wayang dengan efek *tangent-space normal bump mapping*.

2. **Kontrol Gestur Tangan Cerdas (MediaPipe AI)**
   - **1 Tangan atau 2 Tangan**:
     - *Dua Wayang*: Tangan kiri mengendalikan wayang kiri, tangan kanan mengendalikan wayang kanan.
     - *Satu Wayang*: Satu tangan memegang cempurit badan (*gapit*), tangan lainnya menggerakkan tangkai tangan (*tuding*).
   - **Telapak Tangan (*Palm*)**: Menggerakkan cempurit badan (*gapit*) wayang mengikuti posisi tangan.
   - **Ibu Jari & Telunjuk / Kelingking**: Menggerakkan tuding (lengan & tangan wayang).
   - **Kemiringan Tangan (*Tilt*)**: Wayang ikut membungkuk dan condong secara dinamis.
   - **Jari Kelingking (*Pinky Gesture*)**: Memicu tarian khas wayang **Kiprahan** berirama gamelan (*sembahan, ulap-ulap, kiprah, ombak banyu, srisig, besut, sabetan, tancep*).

3. **Fallback Mouse & Keyboard Shortcut Lengkap**
   - Mendukung kontrol mouse dengan *scroll wheel* untuk mengatur kedalaman (*depth*).
   - Shortcut keyboard:
     - <kbd>D</kbd> : Memicu tarian Kiprahan (*dance*).
     - <kbd>F</kbd> / <kbd>G</kbd> : Membalik arah hadap wayang kiri / kanan (*turn*).
     - <kbd>H</kbd> : Sembunyikan / tampilkan semua UI (*immersive mode*).
     - <kbd>C</kbd> : Kalibrasi ulang kedalaman tangan (*recalibrate depth*).
     - <kbd>V</kbd> : Tampilkan / sembunyikan kotak preview kamera (*camera toggle*).
     - <kbd>P</kbd> : *Pop out* jendela kamera terpisah (berguna untuk multi-monitor/layar kedua).
     - <kbd>M</kbd> : Nyalakan / matikan suara gamelan (*music*).

4. **Sinkronisasi Musik Gamelan Asli (Wirama Audio Clock)**
   - Gamelan Jawa asli yang tersinkronisasi dengan ketukan gerakan wayang melalui beat grid timecode.

5. **Pop-out Camera Window**
   - Fitur jendela kamera mandiri (`camera.html`) yang dapat dipindahkan ke monitor kedua sambil menampilkan skema *skeleton landmarks* tangan secara real-time.

6. **Badge Hak Cipta & Portfolio Kreator Eksklusif**
   - Sesuai identitas karya kreator **Yossika Putra** dilengkapi foto profil, tautan langsung ke portfolio resmi, GitHub, dan LinkedIn.

---

## 🚀 Cara Menjalankan Proyek Secara Lokal

Karena MediaPipe dan kamera browser membutuhkan akses WebCam yang aman (*Secure Context*), jalankan proyek menggunakan server lokal:

### Menggunakan Node.js:
```bash
npm install
npm start
```
Buka browser di: `http://localhost:3000`

### Atau Menggunakan Python:
```bash
python -m http.server 3000
```
Buka browser di: `http://localhost:3000`

---

## 🌐 Cara Deploy ke Vercel

1. Buka [Vercel](https://vercel.com/)
2. Hubungkan repository GitHub ini
3. Pilih framework: **Other** (Pure HTML/JS)
4. Klik **Deploy** — selesai! Proyek langsung live dengan HTTPS aktif.

---

## 👤 Author & Hak Cipta

Dibuat dengan dedikasi dan kecintaan terhadap budaya nusantara oleh:

- **Nama**: Yossika Putra Erlangga
- **Portfolio**: [https://yossikaputra.my.id/](https://yossikaputra.my.id/)
- **GitHub**: [@yoshput](https://github.com/yoshput)
- **LinkedIn**: [Yossika Putra Erlangga](https://www.linkedin.com/in/yossikaputraerlangga/)
