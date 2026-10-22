# PDF Compressor

A real, working PDF compression website: Node/Express backend + Ghostscript
(the industry-standard tool real compressors use) + a mobile-first frontend.
No PC, terminal, or local install needed — everything below is done from your
Android phone's browser.

## What's inside
- `server.js` — API: `/api/compress`, `/api/download/:token`, auto-delete of files
- `public/` — the mobile-first frontend (HTML/CSS/JS, dark mode, drag&drop)
- `Dockerfile` — installs Node + Ghostscript automatically on the cloud host
- `render.yaml` — one-tap config for Render.com

## Deploy entirely from your phone (no PC)

### Step 1 — Put the code on GitHub (via phone browser)
1. Open **github.com** in your phone browser (or the GitHub Android app) and sign in / create a free account.
2. Tap **+ → New repository**. Name it `pdf-compressor`. Create it.
3. Tap **Add file → Upload files**.
4. Upload every file from this project, keeping the folder structure
   (`public/index.html`, `public/style.css`, `public/app.js`,
   `public/favicon.svg`, `server.js`, `package.json`, `Dockerfile`,
   `render.yaml`, `.gitignore`). GitHub's mobile upload page lets you
   select multiple files and preserves folders if you drag a folder on
   desktop-web-view, or you can create the `public` folder first (type
   `public/index.html` as the filename when creating a new file) and paste
   each file's content in on mobile — either way works.
5. Commit the files.

### Step 2 — Deploy on Render.com (free tier, dashboard-only)
1. Open **render.com** in your phone browser, sign up with your GitHub account.
2. Tap **New → Blueprint**.
3. Select your `pdf-compressor` GitHub repo. Render reads `render.yaml`
   automatically and pre-fills everything (Docker build, health check,
   `MAX_FILE_MB`).
4. Tap **Apply / Create**. Render builds the Docker image (installs Node
   and Ghostscript for you) and deploys it. This takes a few minutes —
   you'll see live build logs in the dashboard.
5. When it says **Live**, tap the generated URL
   (like `https://pdf-compressor-xxxx.onrender.com`). Your site is now public.

That's the whole deployment — no command line at any point.

### Updating the site later
Edit files directly in the GitHub mobile web UI (open a file → pencil icon →
edit → commit). Render auto-redeploys on every commit to your repo.

## Configuration (all in the Render dashboard, no code changes needed)
- **MAX_FILE_MB** — under your service → Environment. Render's free tier has
  limited RAM/CPU and a request timeout of about 100 seconds, so very large
  scanned PDFs may need a paid instance type to finish compressing in time.
  Raise `MAX_FILE_MB` once you've upgraded the plan if you need bigger files.
- **Custom domain** — service → Settings → Custom Domain, all from the dashboard.

## How compression actually works
Ghostscript re-encodes the PDF: it downsamples embedded images to a
resolution appropriate for the chosen quality level, recompresses streams,
and subsets fonts. This is a real, widely-used compression pipeline (it's
what many desktop PDF tools call under the hood), not a simulation:
- **High Quality** → Ghostscript `/prepress` preset (mild downsampling, best fidelity)
- **Balanced** → `/ebook` preset (good middle ground)
- **Maximum Compression** → `/screen` preset (aggressive downsampling, smallest file)

It works on scanned/image-heavy PDFs (where most of the size lives in
embedded images) and on text-based PDFs (font subsetting, stream compression).

## Privacy & auto-delete
- Uploaded PDFs are streamed straight to a private temp folder on the server
  (never a public path) and deleted the moment compression finishes.
- The compressed output is deleted immediately after it's downloaded, and a
  15-minute timer deletes it anyway if it's never downloaded.
- A background sweep every 10 minutes removes anything older than 30 minutes
  as a safety net.

## Limits to be aware of
- Free hosting tiers cap request time and RAM — a very large (many-hundred-MB,
  hundreds of pages of scans) PDF may need a paid plan tier to avoid timing out.
- Encrypted/password-protected PDFs cannot be compressed until unlocked.
