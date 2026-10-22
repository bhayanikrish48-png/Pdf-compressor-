(() => {
  const $ = (id) => document.getElementById(id);

  const introSection = $('introSection');
  const fileSection = $('fileSection');
  const resultSection = $('resultSection');

  const dropZone = $('dropZone');
  const fileInput = $('fileInput');
  const chooseBtn = $('chooseBtn');
  const removeFileBtn = $('removeFileBtn');
  const errorMsg = $('errorMsg');
  const limitHint = $('limitHint');

  const fileNameEl = $('fileName');
  const fileSizeEl = $('fileSize');
  const qualitySection = $('qualitySection');
  const compressBtn = $('compressBtn');

  const progressWrap = $('progressWrap');
  const progressFill = $('progressFill');
  const progressPct = $('progressPct');
  const progressLabel = $('progressLabel');
  const cancelBtn = $('cancelBtn');

  const statOriginal = $('statOriginal');
  const statCompressed = $('statCompressed');
  const statSaved = $('statSaved');
  const downloadBtn = $('downloadBtn');
  const anotherBtn = $('anotherBtn');
  const themeToggle = $('themeToggle');

  let selectedFile = null;
  let currentXHR = null;
  let maxFileMB = 300;

  // ---------- Theme ----------
  const savedTheme = localStorage.getItem('pdfc-theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
  }
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('pdfc-theme', 'light');
      themeToggle.textContent = '🌙';
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('pdfc-theme', 'dark');
      themeToggle.textContent = '☀️';
    }
  });

  // ---------- Limits ----------
  fetch('/api/limits').then((r) => r.json()).then((d) => {
    maxFileMB = d.maxFileMB || 300;
    limitHint.textContent = `Maximum supported file size: ${maxFileMB} MB`;
  }).catch(() => {
    limitHint.textContent = '';
  });

  function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let val = bytes, i = -1;
    do { val /= 1024; i++; } while (val >= 1024 && i < units.length - 1);
    return `${val.toFixed(2)} ${units[i]}`;
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.hidden = false;
  }
  function clearError() {
    errorMsg.hidden = true;
    errorMsg.textContent = '';
  }

  // ---------- File selection ----------
  chooseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  function handleFile(file) {
    clearError();
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      showError('Please choose a PDF file.');
      return;
    }
    if (file.size > maxFileMB * 1024 * 1024) {
      showError(`This file is larger than the ${maxFileMB} MB limit for this server.`);
      return;
    }
    selectedFile = file;
    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = humanSize(file.size);
    introSection.hidden = true;
    fileSection.hidden = false;
    resultSection.hidden = true;
    progressWrap.hidden = true;
    qualitySection.hidden = false;
    progressFill.style.width = '0%';
  }

  removeFileBtn.addEventListener('click', resetToStart);

  function resetToStart() {
    selectedFile = null;
    fileInput.value = '';
    introSection.hidden = false;
    fileSection.hidden = true;
    resultSection.hidden = true;
    clearError();
  }

  anotherBtn.addEventListener('click', resetToStart);

  // ---------- Compress ----------
  compressBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    clearError();

    const quality = document.querySelector('input[name="quality"]:checked').value;
    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('quality', quality);

    qualitySection.hidden = true;
    progressWrap.hidden = false;
    progressLabel.textContent = 'Uploading...';
    progressFill.style.width = '0%';
    progressPct.textContent = '0%';

    const xhr = new XMLHttpRequest();
    currentXHR = xhr;
    xhr.open('POST', '/api/compress');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        progressFill.style.width = pct + '%';
        progressPct.textContent = pct + '%';
        if (pct >= 100) progressLabel.textContent = 'Compressing... this can take a moment for large files';
      }
    });

    xhr.onload = () => {
      currentXHR = null;
      let data;
      try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }

      if (xhr.status >= 200 && xhr.status < 300 && data && data.success) {
        showResult(data);
      } else {
        const msg = (data && data.error) || 'Compression failed. Please try again.';
        showError(msg);
        qualitySection.hidden = false;
        progressWrap.hidden = true;
      }
    };

    xhr.onerror = () => {
      currentXHR = null;
      showError('Network error. Please check your connection and try again.');
      qualitySection.hidden = false;
      progressWrap.hidden = true;
    };

    xhr.onabort = () => {
      currentXHR = null;
      progressWrap.hidden = true;
      qualitySection.hidden = false;
    };

    xhr.send(formData);
  });

  cancelBtn.addEventListener('click', () => {
    if (currentXHR) currentXHR.abort();
  });

  function showResult(data) {
    fileSection.hidden = true;
    resultSection.hidden = false;

    statOriginal.textContent = data.originalSizeHuman;
    statCompressed.textContent = data.compressedSizeHuman;
    statSaved.textContent = data.savedPercent + '%';

    downloadBtn.href = `/api/download/${data.downloadToken}`;
    downloadBtn.setAttribute('download', 'compressed.pdf');
  }
})();
