# LAKH: LLK Automator & Knowledge Hub

React frontend (Vite + Tailwind v4) and Vercel API proxy in one project.
Browser → `/api/*` (Vercel functions) → Google Apps Script (`code.gs`) / VPS AI.

## Pages built
- **Dashboard** `/`: today's metrics, AI schedule generator (generate → edit draft → sync to Sheets), recent problem-solving with search and system filter, system status strip.
- **Eviden Uploader** `/eviden`: drag/drop or camera, client-side compression to under 500 KB (1080p or 720p profile), link each photo to a schedule slot, upload to Drive, queue status.
- **Generator Jadwal** `/generator`: AI prompt to LLK slots, editable matrix (time normalisation, overlap/format validation, evidence toggle, skip, add/delete), date picker, copy LLK text, export JSON, "Finalisasi & Sync" replaces that date in Google Sheets.
- **GAS Trigger Sync** `/gas-trigger`: GAS ping, SYNC_LOG audit trail (auto-refresh 15 s), cron status/next run, Telegram test, cron dry run, flush cache, and "Jalankan Cron Sekarang" (sends REAL reminders, asks for a second click).
- **Problem Solve Tracker** `/problem-solve`: knowledge base list with tag filters (counts), server-side keyword search (Ctrl+K), real metrics, new-case form with validation, local draft, CSV export, copy solution.
- **Telegram Bot** `/telegram`: bot identity (getMe), delivery rate from TELEGRAM_LOG, token / chat ID / lead time (0, 5, 15 min) / silent mode, live message preview from today's schedule, test ping, delivery history (CSV export). The bot token is **write-only**: it is never sent back to the browser.
- **Pengaturan** `/pengaturan`: access token (masked), optional idle auto-logout, GAS/Sheets/Drive status, eviden sharing mode, app URL, AI status (read-only), JSON/CSV export, clear local draft.

> The GAS Trigger page needs the new `LOG_LIST`, `TELEGRAM_LOG_LIST`, `TELEGRAM_STATUS`, `SETTINGS_GET` and `SETTINGS_SET` actions: **re-deploy** the updated `gas/code.gs` (Deploy > Manage deployments > New version).

Panduan lengkap (Bahasa Indonesia): **PANDUAN.md**.

## Run locally (no Google, no AI needed)
```bash
npm install
npm run dev:mock      # open http://localhost:5173, token: demo
npm test              # 32 tests (API proxy + frontend helpers)
```
Against the real backend: `vercel dev` in one terminal, then `npm run dev` (proxies `/api` to localhost:3000).

## Deploy (Vercel)
1. Push this folder to GitHub, import it in Vercel (framework: Vite is auto-detected).
2. Add the variables from `.env.example` (LAKH_APP_TOKEN, LAKH_GAS_URL, LAKH_GAS_KEY, AI_URL, ...).
3. Open the site and enter `LAKH_APP_TOKEN` once; it is kept in that browser's localStorage.

## API
See the table in `api/[...path].js`. All routes need `Authorization: Bearer <LAKH_APP_TOKEN>`;
responses are `{ok:true,data}` or `{ok:false,error,code}`. `GET /api/ai/status` is the VPS liveness probe used by the dashboard.
