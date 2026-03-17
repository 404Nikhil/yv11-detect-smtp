import './style.css';

const API_URL = 'http://localhost:8000';

const CLASS_META: Record<string, { color: string; emoji: string }> = {
  Chicken: { color: '#38bdf8', emoji: '🐔' },
  Horses: { color: '#fb923c', emoji: '🐴' },
  buffalo: { color: '#34d399', emoji: '🐃' },
  cat: { color: '#a78bfa', emoji: '🐱' },
  cows: { color: '#f472b6', emoji: '🐄' },
  dog: { color: '#22d3ee', emoji: '🐕' },
  elephant: { color: '#fbbf24', emoji: '🐘' },
  goat: { color: '#4ade80', emoji: '🐐' },
  monkeys: { color: '#f87171', emoji: '🐒' },
  rooster: { color: '#818cf8', emoji: '🐓' },
};

const ALL_CLASSES = Object.keys(CLASS_META);

let selectedFile: File | null = null;
let isLoading = false;

function render() {
  const app = document.getElementById('app')!;
  app.innerHTML = buildHTML();
  attachEvents();
}

function buildHTML(): string {
  return `
<div class="app-wrapper">

  <!-- Header -->
  <header class="header">
    <div class="header-badge">
      <span>🦁</span> YOLOv11 · Powered by AI
    </div>
    <h1>Wildlife Animal<br/>Detection</h1>
    <p>Upload any photo and our trained YOLOv11 model will instantly identify wild and domestic animals.</p>
    <div class="class-pills">
      ${ALL_CLASSES.map(cls => {
    const m = CLASS_META[cls];
    return `<span class="class-pill" style="color:${m.color};border-color:${m.color}40;background:${m.color}10">${m.emoji} ${cls}</span>`;
  }).join('')}
    </div>
  </header>

  <!-- Main Grid -->
  <main class="main-grid">

    <!-- Left: Upload & Controls -->
    <div>
      <div class="card">
        <div class="card-title"><span class="icon">📁</span> Upload Image</div>

        ${selectedFile ? buildPreview() : buildDropzone()}

        <button
          id="btn-detect"
          class="btn-detect"
          ${!selectedFile || isLoading ? 'disabled' : ''}
        >
          ${isLoading
      ? '<div class="spinner"></div> Detecting…'
      : '<span>🔍</span> Detect Animals'
    }
        </button>

        <div id="error-slot"></div>
      </div>
    </div>

    <!-- Right: Results -->
    <div>
      <div class="card">
        <div class="card-title"><span class="icon">📊</span> Detection Results</div>
        <div id="results-slot">
          <div class="placeholder">
            <span class="ph-icon">🐾</span>
            <p>Upload an image and click <strong>Detect Animals</strong><br/>to see results here.</p>
          </div>
        </div>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="footer">
    <span>Wildlife Detection</span> · YOLOv11s trained on 10,737 images · 10 animal classes
  </footer>

</div>`;
}

function buildDropzone(): string {
  return `
<div class="upload-zone" id="drop-zone">
  <input type="file" id="file-input" accept="image/*" />
  <span class="upload-icon">🖼️</span>
  <h3>Drop image here</h3>
  <p>or click to browse · JPG, PNG, WEBP · max 20 MB</p>
</div>`;
}

function buildPreview(): string {
  const url = URL.createObjectURL(selectedFile!);
  return `
<div class="preview-container">
  <img src="${url}" alt="Preview" id="preview-img" />
  <div class="preview-overlay">
    <button class="btn-clear" id="btn-clear">✕ Clear</button>
  </div>
</div>`;
}

function attachEvents() {
  const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
  fileInput?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) handleFileSelected(f);
  });

  // Drag & drop
  const dropZone = document.getElementById('drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const f = e.dataTransfer?.files[0];
      if (f && f.type.startsWith('image/')) handleFileSelected(f);
    });
  }

  // Clear button
  document.getElementById('btn-clear')?.addEventListener('click', () => {
    selectedFile = null;
    document.getElementById('results-slot')!.innerHTML = `
      <div class="placeholder">
        <span class="ph-icon">🐾</span>
        <p>Upload an image and click <strong>Detect Animals</strong><br/>to see results here.</p>
      </div>`;
    render();
  });

  document.getElementById('btn-detect')?.addEventListener('click', runDetection);
}

function handleFileSelected(file: File) {
  selectedFile = file;
  render();
}

async function runDetection() {
  if (!selectedFile || isLoading) return;

  isLoading = true;
  render();

  const form = new FormData();
  form.append('file', selectedFile);

  try {
    const res = await fetch(`${API_URL}/detect`, { method: 'POST', body: form });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
      showError(err.detail ?? `Server error ${res.status}`);
      return;
    }

    const data = await res.json();
    showResults(data);
  } catch (e: any) {
    showError(`Cannot reach the backend. Make sure the FastAPI server is running on port 8000. (${e?.message ?? e})`);
  } finally {
    isLoading = false;
    const btn = document.getElementById('btn-detect') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔍</span> Detect Animals';
    }
  }
}

function showError(msg: string) {
  const slot = document.getElementById('error-slot');
  if (slot) {
    slot.innerHTML = `<div class="error-banner">⚠️ ${msg}</div>`;
  }
}

function showResults(data: any) {
  const slot = document.getElementById('results-slot');
  if (!slot) return;

  const topClasses = [...new Set<string>(data.detections.map((d: any) => d.class))];

  let html = '';

  if (data.annotated_image) {
    html += `
      <div class="result-image-wrap">
        <img src="data:image/jpeg;base64,${data.annotated_image}" alt="Detection result" />
      </div>`;
  }

  html += `
    <div class="stats-row">
      <div class="stat-box">
        <div class="stat-value">${data.count}</div>
        <div class="stat-label">Animals Found</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${topClasses.length}</div>
        <div class="stat-label">Species</div>
      </div>
      <div class="stat-box">
        <div class="stat-value">${data.inference_ms}<small style="font-size:12px">ms</small></div>
        <div class="stat-label">Inference Time</div>
      </div>
    </div>`;

  if (data.count === 0) {
    html += `<div class="no-detections">✅ No animals detected — try a different image or lower the confidence threshold.</div>`;
  } else {
    html += `<div class="detections-list" id="det-list">`;
    data.detections.forEach((det: any, i: number) => {
      const meta = CLASS_META[det.class] ?? { color: '#94a3b8', emoji: '🐾' };
      const pct = Math.round(det.confidence * 100);
      html += `
        <div class="detection-item" style="animation-delay:${i * 50}ms">
          <div class="det-color-dot" style="background:${meta.color}"></div>
          <span class="det-class">${meta.emoji} ${det.class}</span>
          <div class="conf-bar-wrap">
            <div class="conf-bar" style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <span class="det-conf" style="color:${meta.color}">${pct}%</span>
        </div>`;
    });
    html += `</div>`;
  }

  slot.innerHTML = html;
}

render();
