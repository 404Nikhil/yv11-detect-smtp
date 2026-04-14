import './style.css';

const API_URL = 'http://localhost:8000';

const CLASS_META: Record<string, { color: string; emoji: string }> = {
  bird: { color: '#38bdf8', emoji: '🦅' },
  cat: { color: '#a78bfa', emoji: '🐱' },
  dog: { color: '#22d3ee', emoji: '🐕' },
  horse: { color: '#fb923c', emoji: '🐴' },
  sheep: { color: '#f472b6', emoji: '🐑' },
  cow: { color: '#34d399', emoji: '🐄' },
  elephant: { color: '#fbbf24', emoji: '🐘' },
  bear: { color: '#f87171', emoji: '🐻' },
  zebra: { color: '#818cf8', emoji: '🦓' },
  giraffe: { color: '#fcd34d', emoji: '🦒' },
};

const ALL_CLASSES = Object.keys(CLASS_META);

// State
let isStreaming = false;
let videoElement: HTMLVideoElement | null = null;
let streamInterval: number | null = null;
let currentStream: MediaStream | null = null;
let isDetecting = false; // Prevents overlapping requests

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
    <p>Live webcam stream. Our trained YOLOv11 model will instantly identify wild and domestic animals.</p>
    <div class="class-pills">
      ${ALL_CLASSES.map(cls => {
    const m = CLASS_META[cls];
    return `<span class="class-pill" style="color:${m.color};border-color:${m.color}40;background:${m.color}10">${m.emoji} ${cls}</span>`;
  }).join('')}
    </div>
  </header>

  <!-- Main Grid -->
  <main class="main-grid">

    <!-- Left: Camera & Controls -->
    <div>
      <div class="card">
        <div class="card-title"><span class="icon">📷</span> Live Camera</div>

        ${isStreaming ? buildLiveStream() : buildCameraStartZone()}

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
            <p>Start the camera to see live wildlife detection results here.</p>
          </div>
        </div>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="footer">
    <span>Wildlife Detection</span> · YOLOv11s trained on 10,737 images · SMTP Alerts Enabled
  </footer>

</div>`;
}

function buildCameraStartZone(): string {
  return `
<div class="camera-zone" id="camera-start-zone">
  <span class="camera-icon">📷</span>
  <h3>Camera is Off</h3>
  <p>Click below to start detecting wildlife via your webcam.</p>
  <button id="btn-start-camera" class="btn-start-cam">Start Camera</button>
</div>`;
}

function buildLiveStream(): string {
  return `
<div class="preview-container">
  <!-- Hidden video element to capture feed -->
  <video id="webcam-video" autoplay playsinline muted style="display:none;"></video>
  
  <!-- Image element to display the processed frames from the backend -->
  <img id="processed-stream" alt="Live Stream Processing..." style="display:none;" />
  
  <!-- Fallback/loading view while first frame is processed -->
  <div id="stream-loading" class="placeholder">
     <div class="spinner"></div>
     <p style="margin-top: 10px;">Initializing Video Stream...</p>
  </div>

  <div class="preview-overlay">
    <button class="btn-clear" id="btn-stop-camera">⏹ Stop Camera</button>
  </div>
</div>`;
}

function attachEvents() {
  document.getElementById('btn-start-camera')?.addEventListener('click', startCamera);
  document.getElementById('btn-stop-camera')?.addEventListener('click', stopCamera);
}

async function startCamera() {
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    
    isStreaming = true;
    render();
    
    videoElement = document.getElementById('webcam-video') as HTMLVideoElement;
    if (videoElement) {
      videoElement.srcObject = currentStream;
      await videoElement.play();
      
      // Start capturing frames
      streamInterval = window.setInterval(captureAndDetect, 500); // 2 FPS
    }
    
  } catch (err: any) {
    showError("Could not access camera. Please grant permissions.");
    console.error(err);
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }
  if (streamInterval) {
    clearInterval(streamInterval);
  }
  
  currentStream = null;
  videoElement = null;
  isStreaming = false;
  isDetecting = false;
  
  document.getElementById('results-slot')!.innerHTML = `
      <div class="placeholder">
        <span class="ph-icon">🐾</span>
        <p>Start the camera to see live wildlife detection results here.</p>
      </div>`;
  
  render();
}

async function captureAndDetect() {
  if (!videoElement || !isStreaming || isDetecting) return;
  
  isDetecting = true;
  
  // Create a canvas to extract the frame
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 480;
  
  if (canvas.width === 0) {
      isDetecting = false;
      return;
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
      isDetecting = false;
      return;
  }
  
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  
  // Convert canvas to blob
  canvas.toBlob(async (blob) => {
    if (!blob) {
        isDetecting = false;
        return;
    }
    
    const form = new FormData();
    form.append('file', blob, 'frame.jpg');

    try {
      const res = await fetch(`${API_URL}/detect`, { method: 'POST', body: form });

      if (!res.ok) {
        throw new Error(`Server error ${res.status}`);
      }

      const data = await res.json();
      showResults(data);
      
      // Update the processed image
      if (data.annotated_image) {
          const img = document.getElementById('processed-stream') as HTMLImageElement;
          const loading = document.getElementById('stream-loading');
          if (img) {
              img.src = `data:image/jpeg;base64,${data.annotated_image}`;
              img.style.display = 'block';
          }
          if (loading) {
              loading.style.display = 'none';
          }
      }
      
    } catch (e: any) {
      // Don't show constant errors if the stream gets interrupted, just log
      console.warn('Frame detection failed', e);
    } finally {
      isDetecting = false;
    }
  }, 'image/jpeg', 0.8);
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
        <div class="stat-label">Frame Latency</div>
      </div>
    </div>`;

  if (data.count === 0) {
    html += `<div class="no-detections">✅ No animals detected in current frame.</div>`;
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
