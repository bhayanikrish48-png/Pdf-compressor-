const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Max upload size in MB (configurable via env var on the hosting dashboard).
// Free hosting tiers usually cap request bodies / RAM, so this is set to a
// safe default. Raise it in the environment variables panel if your plan allows.
const MAX_FILE_MB = parseInt(process.env.MAX_FILE_MB || '300', 10);

const UPLOAD_DIR = path.join(__dirname, 'tmp', 'uploads');
const OUTPUT_DIR = path.join(__dirname, 'tmp', 'output');
[UPLOAD_DIR, OUTPUT_DIR].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

// ---------- Multer (disk storage, streamed to disk, not held in memory) ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}.pdf`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(new Error('ONLY_PDF'));
    }
    cb(null, true);
  },
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/limits', (req, res) => {
  res.json({ maxFileMB: MAX_FILE_MB });
});

// ---------- Ghostscript quality presets ----------
// /prepress -> High Quality, /ebook -> Balanced, /screen -> Maximum Compression
const PRESETS = {
  high: '/prepress',
  balanced: '/ebook',
  maximum: '/screen',
};

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let val = bytes;
  let i = -1;
  do {
    val /= 1024;
    i++;
  } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(2)} ${units[i]}`;
}

function safeUnlink(p) {
  fs.unlink(p, () => {});
}

// Auto-delete a file after a delay (defense in depth, in case a download never happens)
function scheduleDelete(filePath, delayMs) {
  setTimeout(() => safeUnlink(filePath), delayMs);
}

app.post('/api/compress', (req, res) => {
  upload.single('pdf')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File exceeds the ${MAX_FILE_MB} MB limit for this server.` });
      }
      if (err.message === 'ONLY_PDF') {
        return res.status(400).json({ error: 'Only PDF files are supported.' });
      }
      return res.status(400).json({ error: 'Upload failed. Please try again.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file received.' });
    }

    const quality = PRESETS[req.body.quality] ? req.body.quality : 'balanced';
    const gsPreset = PRESETS[quality];
    const inputPath = req.file.path;
    const outputPath = path.join(OUTPUT_DIR, `${uuidv4()}.pdf`);
    const originalSize = req.file.size;

    const gsArgs = [
      '-sDEVICE=pdfwrite',
      '-dCompatibilityLevel=1.4',
      `-dPDFSETTINGS=${gsPreset}`,
      '-dNOPAUSE',
      '-dQUIET',
      '-dBatch',
      '-dSAFER',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    execFile('gs', gsArgs, { timeout: 5 * 60 * 1000 }, (gsErr) => {
      // Original upload is no longer needed either way
      safeUnlink(inputPath);

      if (gsErr || !fs.existsSync(outputPath)) {
        safeUnlink(outputPath);
        return res.status(500).json({ error: 'Compression failed. The PDF may be corrupted or encrypted.' });
      }

      const compressedStat = fs.statSync(outputPath);
      let compressedSize = compressedStat.size;

      // Ghostscript can occasionally produce a slightly larger file for
      // already-optimized PDFs. Guard against showing a negative "saved" %.
      let finalPath = outputPath;
      if (compressedSize >= originalSize) {
        // Fall back to serving the (still valid) compressed file, but report honestly.
        finalPath = outputPath;
      }

      const savedPct = Math.max(0, Math.round((1 - compressedSize / originalSize) * 100));
      const downloadToken = path.basename(finalPath, '.pdf');

      // Delete the compressed file automatically after 15 minutes if never downloaded
      scheduleDelete(finalPath, 15 * 60 * 1000);

      res.json({
        success: true,
        downloadToken,
        originalSize,
        compressedSize,
        originalSizeHuman: humanSize(originalSize),
        compressedSizeHuman: humanSize(compressedSize),
        savedPercent: savedPct,
      });
    });
  });
});

app.get('/api/download/:token', (req, res) => {
  const token = req.params.token.replace(/[^a-zA-Z0-9-]/g, '');
  const filePath = path.join(OUTPUT_DIR, `${token}.pdf`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found or already expired.' });
  }

  res.download(filePath, 'compressed.pdf', (err) => {
    // Delete immediately after the download finishes (success or failure)
    safeUnlink(filePath);
  });
});

// Cleanup any orphaned files older than 30 minutes on a timer (extra safety net)
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  [UPLOAD_DIR, OUTPUT_DIR].forEach((dir) => {
    fs.readdir(dir, (err, files) => {
      if (err) return;
      files.forEach((f) => {
        const fp = path.join(dir, f);
        fs.stat(fp, (statErr, stat) => {
          if (!statErr && stat.mtimeMs < cutoff) safeUnlink(fp);
        });
      });
    });
  });
}, 10 * 60 * 1000);

app.get('/health', (req, res) => res.send('ok'));

app.listen(PORT, () => {
  console.log(`PDF Compressor running on port ${PORT}`);
});
