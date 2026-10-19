# Panduan Instalasi & Menjalankan LAKH

Alur data: **Browser (React)** → **Vercel `/api/*`** → **Google Apps Script** (Sheets, Drive, Telegram) dan **VPS AI**.
Kunci rahasia (Apps Script, AI) hanya ada di server Vercel, tidak pernah di browser.

## 0. Prasyarat
- Node.js **20.19 atau lebih baru** (`node -v`), npm, Git
- Akun Google (untuk Apps Script, Sheets, Drive) dan akun Vercel + GitHub
- Bot Telegram dari @BotFather
- (Opsional) VPS dengan model AI yang punya endpoint OpenAI-compatible `/v1/chat/completions` (Ollama, llama.cpp, vLLM)

## 1. Coba cepat tanpa Google/AI (mode demo)
```bash
cd lakh
npm install
npm run dev:mock          # buka http://localhost:5173, token: demo
npm test                  # 32 tes harus lulus
```
Data demo hanya di memori dan hilang saat server dihentikan.

## 2. Apps Script (backend)
1. Buka https://script.google.com > **New project**.
2. Ganti isi `code.gs` dengan file `gas/code.gs`.
3. **Project Settings** > centang *Show "appsscript.json" manifest file*, lalu ganti isinya dengan `gas/appsscript.json`.
4. Pilih fungsi **`setupLakh`** di toolbar > **Run** > setujui izin Google.
   Fungsi ini membuat spreadsheet `LAKH_Database` (5 tab), folder Drive `Eviden_LLK`, dan trigger cron 5 menit.
5. Buka **Execution log**, salin baris `AUTH_TOKEN ...`. Token ini hanya tampil sekali; bisa dibaca lagi di **Project Settings > Script Properties**. Ini nilai untuk `LAKH_GAS_KEY`.
6. **Deploy > New deployment > Web app**: *Execute as* **Me**, *Who has access* **Anyone**. Salin URL yang berakhiran `/exec` (nilai `LAKH_GAS_URL`).
7. (Opsional) Isi Telegram lewat halaman **Telegram Bot** di aplikasi (langkah 5), tidak perlu mengubah Script Properties manual.

**Setiap kali `code.gs` diubah:** Deploy > **Manage deployments** > ikon pensil > Version: **New version** > Deploy. URL tetap sama. Tanpa langkah ini, fitur baru (log audit, pengaturan, Telegram) tidak aktif.

## 3. VPS AI (opsional, untuk generator jadwal)
Siapkan endpoint chat-completions yang bisa dijangkau dari internet lewat Cloudflare Tunnel (atau VPN yang terhubung ke Vercel).
Contoh Ollama: `AI_URL=https://ai.domain-anda/v1/chat/completions`, `AI_MODEL=nama-model-di-ollama`.
Jika tunnel dilindungi Cloudflare Access, buat service token dan isi `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.
Tanpa AI, halaman lain tetap berjalan; generator jadwal akan menampilkan pesan error dan jadwal bisa diisi manual.

## 4. Deploy ke Vercel
1. Push folder `lakh` ke repositori GitHub (pastikan `.env*` tidak ikut; sudah ada di `.gitignore`).
2. Vercel > **Add New > Project** > pilih repositori. Framework terdeteksi Vite; folder `api/` otomatis menjadi serverless function.
3. **Settings > Environment Variables**:

| Variabel | Isi |
|---|---|
| `LAKH_APP_TOKEN` | token login aplikasi. Buat: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `LAKH_GAS_URL` | URL `/exec` dari langkah 2 |
| `LAKH_GAS_KEY` | `AUTH_TOKEN` dari langkah 2 |
| `AI_URL`, `AI_MODEL` | endpoint dan nama model (langkah 3) |
| `AI_API_KEY`, `AI_TIMEOUT_MS`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` | opsional |

4. **Deploy**. Setelah mengubah variabel, lakukan **Redeploy** agar berlaku.
5. Buka situs, masukkan `LAKH_APP_TOKEN` sekali (disimpan di localStorage browser itu).

## 5. Telegram
1. Chat @BotFather > `/newbot` > salin token bot.
2. Kirim satu pesan (mis. `/start`) ke bot Anda dari akun/grup tujuan. Bot tidak bisa mengirim ke chat yang belum pernah menghubunginya.
3. Cari Chat ID: kirim pesan ke @userinfobot (untuk akun pribadi), atau untuk grup buka `https://api.telegram.org/bot<TOKEN>/getUpdates` dan lihat `chat.id` (grup diawali `-`).
4. Di aplikasi: menu **Telegram Bot** > isi token dan Chat ID, pilih lead time > **Simpan Konfigurasi** > **Kirim Pesan Uji Coba**.
5. Isi **URL Aplikasi** di **Pengaturan > Integrasi API & GAS** agar pesan eviden memuat tautan ke aplikasi.

## 6. Daftar periksa setelah deploy
- [ ] Login berhasil dengan `LAKH_APP_TOKEN`
- [ ] **GAS Trigger Sync**: ping `200 OK`, Target Sheets "Terhubung", cron "Aktif"
- [ ] **Telegram Bot**: pesan uji coba masuk
- [ ] **Generator Jadwal**: buat jadwal, **Finalisasi & Sync**, cek tab `DATA_LLK_AUTOMATION` di Sheets
- [ ] **Eviden Uploader**: unggah foto, cek folder `Eviden_LLK/YYYY/MM` di Drive
- [ ] **Problem Solve**: simpan satu kasus, cek tab `PROBLEM_SOLVE`

## 7. Pengembangan lokal dengan backend asli
```bash
npm i -g vercel
# buat .env.local berisi variabel dari tabel langkah 4
vercel dev --listen 3000      # terminal 1
npm run dev                   # terminal 2, buka http://localhost:5173
```
`npm run build` membuat folder `dist/`; `npm run preview` mencobanya.

## 8. Pemecahan masalah
| Gejala | Penyebab / solusi |
|---|---|
| Login "Token salah" | `LAKH_APP_TOKEN` di Vercel berbeda, atau belum Redeploy |
| "Respons API tidak valid" | folder `api/` tidak ikut ter-deploy, atau membuka lewat `npm run dev` tanpa `vercel dev` |
| `Unauthorized` dari Apps Script | `LAKH_GAS_KEY` tidak sama dengan Script Property `AUTH_TOKEN` |
| Respons berupa halaman login Google | Web app belum diset *Anyone*, atau URL bukan `/exec` |
| Fitur baru (log audit, pengaturan) error "Unknown action" | `code.gs` baru belum di-deploy sebagai **New version** |
| Telegram gagal terkirim | token/chat ID salah, atau bot belum pernah dichat; lihat tab `TELEGRAM_LOG` |
| Pengingat tidak datang | jalankan `installTriggers` dari editor Apps Script; cron hanya Sen-Jum 07:00-16:30 WIB |
| VPS AI "Offline" | `AI_URL` salah, tunnel mati, atau Cloudflare Access menolak (cek service token) |
| Foto ditolak | batas server 1 MB; aplikasi mengompres ke di bawah 500 KB, jadi pastikan formatnya JPG/PNG/WebP |

## 9. Keamanan
- Jangan commit token apa pun. `LAKH_GAS_URL`, `LAKH_GAS_KEY`, `AI_*` hanya di Vercel.
- Ganti `LAKH_APP_TOKEN` berkala (ubah di Vercel, Redeploy, login ulang).
- Mengganti `AUTH_TOKEN` di Apps Script berarti `LAKH_GAS_KEY` harus diubah juga.
- Tombol **Jalankan Cron Sekarang** mengirim pengingat sungguhan; gunakan **Dry Run** untuk sekadar mengecek.
