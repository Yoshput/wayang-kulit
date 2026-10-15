# PROMPT ANTIGRAVITY — Wayang Kulit Digital v2: "Pertarungan Lintas Budaya"

Kamu adalah senior creative developer (WebGL2 + Computer Vision + game feel). Kerjakan update besar untuk project **Wayang Kulit Digital Indonesia** (https://wayang-kulit.vercel.app/, repo milik Yossika Putra / @yoshput).

**Aturan kerja:**
1. Baca dulu seluruh codebase yang ada (struktur folder, pipeline WebGL2, modul MediaPipe Tasks Vision, beat-grid gamelan, state kalibrasi, UI hotkey `D F G H C V P M`). Tulis ringkasan arsitektur singkat sebelum coding.
2. **Jangan merusak fitur existing:** tracking 60 FPS, soft shadow blencong, gestur gapit/tuding/tilt/kedalaman/kelingking (Kiprahan), mode mouse/touch, demo, responsive iPhone–desktop, cookie/localStorage notice.
3. Kerjakan bertahap per fase di bawah, commit per fase, jalankan build + test manual tiap fase. Jangan lanjut fase berikutnya kalau fase sebelumnya error.
4. Semua kode baru data-driven (konfigurasi JSON), bukan hardcode, supaya karakter/skill mudah ditambah.
5. Target performa: tetap ≥ 55 FPS di laptop menengah, ≥ 30 FPS di HP. Gunakan object pooling untuk partikel, hindari alokasi per-frame.

---

## KONTEKS & TUJUAN

Wayang kulit saat ini = 2 karakter di kiri/kanan kelir, tiap tangan menggerakkan 1 wayang. Update ini mengubahnya menjadi **pertunjukan duel interaktif** yang menggabungkan budaya Jawa dengan kolaborasi karakter fighting game terkenal (gaya Tekken 8), agar wayang kulit lebih mudah dipahami generasi muda dan dikenal sampai luar negeri.

Prinsip desain: **edukasi budaya tetap utama.** Setiap karakter/skill menampilkan konteks pewayangan (nama lakon, filosofi, asal-usul) agar pemain belajar sambil bermain.

---

## FASE 1 — Sistem Pertarungan Dasar (Combat Core)

- Tambah **HP bar** (nama "Nyawa") dan **Tenaga/Sakti bar** untuk tiap wayang, gaya ukiran/tatahan Jawa (bukan UI game modern generik): bingkai ornamen kawung/parang, warna emas-merah-hitam, konsisten dengan tema kelir.
- **Hitbox/hurtbox** per wayang (kepala, badan, lengan tuding). Deteksi tabrakan antar wayang + antar proyektil/skill.
- Serangan basic: gerakan lengan (tuding) yang cepat ke arah lawan = sabetan. Hitung damage dari kecepatan gerak tangan (velocity threshold, cooldown anti-spam).
- **Game feel:** hit-stop 60–90 ms, screen shake halus, wayang terpental (knockback) dengan fisika sederhana, bayangan blencong ikut bereaksi (flicker saat hit), SFX hit bernuansa gamelan (kenong/kendang/gong) bukan SFX generik.
- **Ronde:** best of 3, timer 60 detik, layar **K.O.** dengan gaya "tancep kayon" (Gunungan turun menutup layar), lalu hasil + tombol Ulang/Ganti Karakter.
- Mode: `Duel 2 Tangan` (kiri vs kanan), `Lawan AI` (AI sederhana: bergerak, menyerang, bertahan, level mudah/sedang/sulit), `Demo` (AI vs AI), `Mouse/Touch` tetap jalan.
- **Toggle mode damai:** pemain bisa kembali ke mode pagelaran tanpa pertarungan (perilaku lama).

## FASE 2 — Efek Darah (Stylized)

Ketika wayang saling menyerang dan kena hit:
- Efek darah **bergaya wayang/batik**, bukan realistis: percikan tinta merah (merah gincu/ssindur), cipratan berpola, tetesan yang mengalir di permukaan kulit wayang, dan noda yang memudar pelan. Gunakan partikel 2D di WebGL2 + decal/mask pada tekstur wayang (shader blend multiply di area hit).
- Intensitas tergantung damage (hit ringan = percikan kecil, skill = cipratan besar, finisher = ledakan + slow-motion 0.3 detik).
- Ada **pengaturan "Efek Darah"** di menu Settings (⚙️): `Nyala` / `Mati` / `Gaya Tinta Merah Saja`. Simpan di localStorage. Sediakan **Mode Edukasi** (default untuk pengunjung baru di layar sentuh kecil) yang otomatis mematikan efek darah.
- Performa: batasi maksimum partikel aktif (mis. 400), pooling, auto-turunkan kualitas kalau FPS < 45.

## FASE 3 — Skill Gestur Tangan

Gunakan MediaPipe **Gesture/Hand Landmarker** yang sudah ada (21 landmark). Buat modul `GestureSkillEngine` dengan state machine, debounce, dan cooldown. Gestur wajib dikalibrasi lewat tombol `C` (recalibrate) dan bekerja untuk tangan kiri/kanan.

| Gestur | Skill | Efek |
|---|---|---|
| Kepalan (fist) tahan 0.4 dtk lalu buka cepat | **Pukulan Pancanaka** | Dorongan jarak dekat, damage menengah, knockback kuat |
| Pinch (jempol + telunjuk) tarik lalu lepas | **Panah Pasopati** | Proyektil lurus, bisa di-charge (makin lama makin kuat) |
| Telapak terbuka mendorong ke kamera | **Aji Tameng / Blok** | Tameng cahaya blencong, kurangi damage 70% selama 1.5 dtk |
| Dua jari (telunjuk+tengah) menyapu cepat | **Sabetan Kilat** | Combo 2-hit jarak menengah |
| Kelingking saja (existing Kiprahan) | **Kiprahan** | Tetap tarian; saat pertarungan = counter/taunt yang mengisi Sakti |
| Tangan naik cepat ke atas | **Terbang / Lompat** (khusus Gatotkaca dkk.) | Serangan udara (dive attack) |
| Sakti penuh + dua tangan membuka lebar | **Ultimate (Aji Pamungkas)** | Cinematic singkat + efek besar, tiap karakter punya ultimate unik |

- Tiap karakter punya **set skill sendiri** (diatur di JSON): nama skill Jawa, gestur pemicu, damage, cooldown, biaya Sakti, VFX, SFX.
- Tampilkan **overlay panduan gestur** (ikon tangan + nama skill) di pojok bawah, bisa disembunyikan dengan `H`. Tambah halaman **"Latihan Gestur"** (tutorial interaktif, tidak ada lawan).
- Tambah indikator real-time: gestur yang terdeteksi + confidence, agar pemain tahu kenapa skill belum keluar.
- Fallback mouse/touch: tombol skill di layar + hotkey (`1–5` skill, `Space` ultimate).

## FASE 4 — Sistem Heal & Bertahan Hidup

- **Tirta Amerta (heal pickup):** sesekali muncul item air kehidupan/kendi di kelir; sentuh dengan wayang untuk memulihkan nyawa.
- **Pulung Wahyu:** orb cahaya langka (muncul saat HP salah satu pemain rendah) memberi buff sementara: regen / damage up / shield.
- **Heal gestur "Sembah" (Namaste):** dua telapak tangan dirapatkan di depan dada & ditahan 2 detik → channeling heal bertahap, tapi wayang rentan (tidak bisa bergerak; terkena hit membatalkan channeling). Cooldown 20 detik.
- **Berkah Semar (revive 1x per ronde):** saat HP 0, Kyai Semar muncul sebentar; kalau pemain melakukan gestur tertentu (kedua tangan menengadah) dalam 3 detik, wayang bangkit dengan 25% HP. Sertakan penjelasan filosofi Semar (pamong sejati) di tooltip.
- **Gunungan Penyembuh:** Gunungan muncul di tengah layar tiap 25 detik, pukul/sentuh untuk mengambil heal besar — tetapi memunculkan risiko karena dua pemain bisa berebut.
- Anti-abuse: heal total dibatasi per ronde, diminishing returns, tampilkan HUD heal (angka hijau/emas melayang).

## FASE 5 — Pemilihan Karakter & Roster

Buat **layar Pilih Karakter** bergaya pagelaran (kartu wayang di atas kelir, ada preview animasi + info singkat):

**Roster Wayang (budaya Jawa):**
Yudhistira, Bima Werkudara, Arjuna, Gatotkaca, Kyai Semar, Srikandi (sudah ada) + **tambahkan:** Rahwana (Dasamuka), Sri Rama, Hanoman, Karna (Adipati Karna), Kresna, Baladewa, Sengkuni, Cakil (buto), Anoman Obong, Buto Cakil, Dursasana — minimal total 12 karakter di rilis ini; struktur harus mudah menambah lebih banyak.

**Setiap karakter punya data:**
`id, nama, tokoh/lakon, watak (filosofi), stat (HP, kecepatan, damage, sakti), skill[] (gestur+VFX), ultimate, tekstur wayang (webp + normal map), warna aksen, SFX/gamelan motif`.
Tampilkan **kartu edukasi**: asal tokoh (Mahabharata/Ramayana), watak, dan fun-fact singkat dalam Bahasa Indonesia + English (toggle bahasa ID/EN).

Pemilihan: P1 dan P2 memilih karakter masing-masing (kiri/kanan), bisa pilih karakter yang sama (beda warna aksen), tombol "Acak".

## FASE 6 — Mode Kolaborasi "Lintas Budaya" (Tekken-inspired)

Tambahkan **mode/tab "Kolaborasi Global"** di layar pilih karakter untuk karakter bergaya fighting game populer (terinspirasi Tekken 8). Ide yang ingin saya wujudkan: karakter game terkenal di-*reinterpretasi sebagai wayang kulit* (tatahan kulit, ornamen, bayangan blencong) agar budaya Jawa mudah dikenali audiens internasional.

**PENTING — hak cipta & lisensi (wajib dipatuhi):**
- Tekken dan karakternya adalah IP milik Bandai Namco. **Jangan** mengambil/scrape/menyalin model 3D, sprite, artwork resmi, logo, audio, atau musik dari game.
- Buat semua aset sebagai **ilustrasi orisinal bergaya wayang kulit** (siluet + ornamen tatahan) yang terinspirasi ciri khas visual tiap karakter. Aset digambar/dibuat manual atau lewat pipeline kreatif sendiri, bukan hasil ekstraksi dari game.
- Susun sistem agar **mudah dilepas:** pack kolaborasi ada di folder terpisah (`/packs/collab-tekken/`), bisa dimatikan lewat feature flag `ENABLE_COLLAB_PACK`. Default saat deploy publik: `false` sampai izin/lisensi dari pemegang IP diperoleh atau nama diganti dengan karakter orisinal "terinspirasi".
- Tambahkan disclaimer di UI: *"Proyek budaya non-komersial. Karakter kolaborasi adalah interpretasi fan-art bergaya wayang; seluruh hak atas karakter asli dimiliki pemegang hak masing-masing."* 
- Siapkan **placeholder orisinal** (mis. "Ksatria Jepang Bertanduk", "Petarung Raja Harimau") sebagai nama alternatif aman jika lisensi belum ada. Nama karakter ditaruh di config sehingga bisa diganti tanpa ubah kode.

**Kandidat roster kolaborasi (arketipe, 8–10 karakter):** petarung karate bergaya keluarga Mishima, petarung bertopeng harimau/raja, ninja-samurai bergaya robotik, petarung kung fu, petarung kapoeira/lincah, pemburu wanita lincah, dst. Masing-masing diberi:
- Tampilan wayang (siluet tatahan, gapit & tuding sesuai struktur wayang existing).
- Skill khas yang dipetakan ke gestur (mis. kombo pukulan, tendangan sapuan, counter) dengan nama dwi-bahasa (Jawa + nama aslinya jika lisensi ada).
- **Kartu budaya silang:** tiap karakter dipasangkan dengan padanan arketipe wayang (mis. petarung pukulan berat ↔ Bima; petarung lincah ↔ Gatotkaca/Arjuna) beserta penjelasan "Kalau di wayang, tokoh ini mirip…" sebagai jembatan edukasi.
- Pasangan duel spesial (mis. Bima vs petarung kolaborasi) dengan teks intro pendek ala "janturan" dalang.

## FASE 7 — Polesan, Edukasi, & Rilis

- Panggung baru: pilihan latar kelir (Taman Sari, Hutan Dandaka, Kurusetra, Alengka) dengan lighting blencong berbeda.
- Narasi dalang (teks + opsional suara) di awal ronde & saat K.O. dalam Bahasa Indonesia/English.
- Halaman landing: update bagian "Karakter" dan "Panduan Gestur" untuk fitur baru, tambahkan section **"Wayang × Dunia"** yang menjelaskan misi pengenalan budaya.
- SEO/OG: update meta description & og:image untuk mencerminkan fitur duel & kolaborasi.
- Aksesibilitas: opsi kurangi gerakan (`prefers-reduced-motion`), kontras UI, kontrol keyboard lengkap.
- Analitik ringan tanpa data pribadi (opsional, hanya agregat). Kamera tetap diproses lokal on-device.

---

## DELIVERABLE

1. Kode lengkap tiap fase, ter-commit rapi dengan pesan commit jelas.
2. Folder konfigurasi: `characters.json`, `skills.json`, `stages.json`, dan `packs/collab-tekken/*` (terpisah, bisa dinonaktifkan).
3. `docs/GESTURES.md` (panduan gestur), `docs/ADDING_CHARACTERS.md` (cara menambah karakter), `docs/LICENSING-NOTES.md` (catatan IP kolaborasi).
4. Hasil test manual: checklist per fase (tracking, hit detection, heal, efek darah, performa, mobile).
5. Deploy preview ke Vercel (branch terpisah `feat/v2-duel`), jangan langsung timpa production.

## KRITERIA SELESAI (Acceptance Criteria)

- [ ] Dua pemain dapat duel dengan gestur tangan; HP, Sakti, ronde, K.O. berfungsi.
- [ ] Efek darah bergaya tinta muncul saat hit dan bisa dimatikan; Mode Edukasi aman.
- [ ] Minimal 5 skill + 1 ultimate per karakter bisa dipicu lewat gestur, dengan fallback mouse/touch.
- [ ] Heal lewat Tirta Amerta, Pulung Wahyu, gestur Sembah, Berkah Semar, dan Gunungan berfungsi dan seimbang.
- [ ] ≥ 12 karakter wayang tersedia di layar pilih karakter, + pack kolaborasi (flag-able) dengan ≥ 8 karakter.
- [ ] FPS stabil sesuai target, tidak ada memory leak setelah 10 menit bermain.
- [ ] Semua fitur lama tetap bekerja.

Mulai dari **Fase 1**. Setelah menyelesaikan tiap fase, berikan ringkasan singkat (apa yang dibuat, file yang berubah, cara test) lalu lanjut ke fase berikutnya.
