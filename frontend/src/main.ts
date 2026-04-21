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
<div class="max-w-[1200px] mx-auto px-[20px] pb-[60px]">

  <!-- Header -->
  <header class="text-center pt-[56px] px-[20px] pb-[40px]">
    <div class="inline-flex items-center gap-[8px] bg-accent-glow border border-[rgba(56,189,248,0.3)] rounded-[100px] py-[6px] px-[16px] text-[12px] font-semibold text-accent tracking-[0.05em] uppercase mb-[20px]">
      <span>🦁</span> YOLOv11 · Powered by AI
    </div>
    <h1 class="font-space text-[clamp(2rem,5vw,3.5rem)] font-bold leading-[1.15] mb-[14px] bg-clip-text text-transparent bg-gradient-to-br from-[#f0f6ff] from-[30%] via-accent via-[70%] to-accent-2 to-[100%]">Wildlife Animal<br/>Detection</h1>
    <p class="text-[1.05rem] text-[#94a3b8] max-w-[520px] mx-auto mb-[28px] leading-[1.6]">Live webcam stream. Our trained YOLOv11 model will instantly identify wild and domestic animals.</p>
    <div class="flex flex-wrap justify-center gap-[8px]">
      ${ALL_CLASSES.map(cls => {
    const m = CLASS_META[cls];
    return `<span class="text-[11px] font-semibold py-[4px] px-[12px] rounded-[100px] border tracking-[0.04em] opacity-90" style="color:${m.color};border-color:${m.color}40;background:${m.color}10">${m.emoji} ${cls}</span>`;
  }).join('')}
    </div>
  </header>

  <!-- Main Grid -->
  <main class="grid grid-cols-1 md:grid-cols-2 gap-[24px]">

    <!-- Left: Camera & Controls -->
    <div>
      <div class="bg-card border border-[rgba(99,179,237,0.12)] rounded-[14px] p-[24px] transition-all duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[rgba(99,179,237,0.3)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div class="font-space text-[15px] font-semibold text-[#94a3b8] uppercase tracking-[0.08em] mb-[16px] flex items-center gap-[8px]"><span class="text-[16px]">📷</span> Live Camera</div>

        ${isStreaming ? buildLiveStream() : buildCameraStartZone()}

        <div id="error-slot"></div>
      </div>
    </div>

    <!-- Right: Results -->
    <div>
      <div class="bg-card border border-[rgba(99,179,237,0.12)] rounded-[14px] p-[24px] transition-all duration-[220ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[rgba(99,179,237,0.3)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
        <div class="font-space text-[15px] font-semibold text-[#94a3b8] uppercase tracking-[0.08em] mb-[16px] flex items-center gap-[8px]"><span class="text-[16px]">📊</span> Detection Results</div>
        <div id="results-slot">
          <div class="flex flex-col items-center justify-center min-h-[240px] text-[#475569] text-center gap-[12px]">
            <span class="text-[52px] opacity-30">🐾</span>
            <p class="text-[14px]">Start the camera to see live wildlife detection results here.</p>
          </div>
        </div>
      </div>
    </div>

  </main>

  <!-- Footer -->
  <footer class="text-center pt-[32px] px-[20px] pb-0 text-[12px] text-[#475569]">
    <span class="text-[#94a3b8]">Wildlife Detection</span> · YOLOv11s trained on 10,737 images · SMTP Alerts Enabled
  </footer>

</div>`;
}

function buildCameraStartZone(): string {
  return `
<div class="border-2 border-dashed border-[rgba(99,179,237,0.12)] rounded-[14px] py-[40px] px-[20px] text-center bg-surface relative overflow-hidden flex flex-col items-center justify-center gap-[16px] hover:border-accent transition-all duration-[220ms]" id="camera-start-zone">
  <span class="text-[48px] mb-[12px] block">📷</span>
  <h3 class="text-[16px] font-semibold text-[#f0f6ff] mb-[6px]">Camera is Off</h3>
  <p class="text-[13px] text-[#475569]">Click below to start detecting wildlife via your webcam.</p>
  <button id="btn-start-camera" class="py-[10px] px-[20px] bg-[rgba(56,189,248,0.15)] border border-[rgba(56,189,248,0.4)] rounded-[100px] text-accent font-inherit text-[14px] font-semibold cursor-pointer transition-all duration-[220ms] hover:bg-[rgba(56,189,248,0.25)] hover:-translate-y-[1px]">Start Camera</button>
</div>`;
}

function buildLiveStream(): string {
  return `
<div class="relative rounded-[8px] overflow-hidden bg-surface mt-[16px] w-full aspect-[4/3] flex items-center justify-center border border-[rgba(99,179,237,0.12)]">
  <!-- Hidden video element to capture feed -->
  <video id="webcam-video" autoplay playsinline muted style="display:none;"></video>
  
  <!-- Image element to display the processed frames from the backend -->
  <img id="processed-stream" class="w-full h-full object-contain block" alt="Live Stream Processing..." style="display:none;" />
  
  <!-- Fallback/loading view while first frame is processed -->
  <div id="stream-loading" class="flex flex-col items-center justify-center min-h-[240px] text-[#475569] text-center gap-[12px]">
     <div class="w-[18px] h-[18px] border-2 border-[rgba(10,15,30,0.3)] border-t-[#0a0f1e] rounded-full animate-spin"></div>
     <p class="text-[14px] mt-[10px]">Initializing Video Stream...</p>
  </div>

  <div class="absolute top-[10px] right-[10px]">
    <button class="bg-[rgba(0,0,0,0.7)] border border-[rgba(99,179,237,0.12)] text-[#94a3b8] rounded-[8px] py-[6px] px-[12px] text-[12px] cursor-pointer transition-all duration-[220ms] font-inherit hover:bg-[rgba(248,113,113,0.2)] hover:border-danger hover:text-danger" id="btn-stop-camera">⏹ Stop Camera</button>
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
      <div class="flex flex-col items-center justify-center min-h-[240px] text-[#475569] text-center gap-[12px]">
        <span class="text-[52px] opacity-30">🐾</span>
        <p class="text-[14px]">Start the camera to see live wildlife detection results here.</p>
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
    slot.innerHTML = `<div class="bg-[rgba(248,113,113,0.08)] border border-[rgba(248,113,113,0.3)] text-danger rounded-[8px] py-[12px] px-[16px] text-[13px] mt-[14px] flex items-center gap-[8px]">⚠️ ${msg}</div>`;
  }
}

function showResults(data: any) {
  const slot = document.getElementById('results-slot');
  if (!slot) return;

  const topClasses = [...new Set<string>(data.detections.map((d: any) => d.class))];

  let html = '';

  html += `
    <div class="grid grid-cols-3 gap-[12px] mt-[16px]">
      <div class="bg-surface border border-[rgba(99,179,237,0.12)] rounded-[8px] p-[14px] text-center">
        <div class="font-space text-[22px] font-bold text-accent leading-none mb-[4px]">${data.count}</div>
        <div class="text-[11px] text-[#475569] uppercase tracking-[0.06em]">Animals Found</div>
      </div>
      <div class="bg-surface border border-[rgba(99,179,237,0.12)] rounded-[8px] p-[14px] text-center">
        <div class="font-space text-[22px] font-bold text-accent leading-none mb-[4px]">${topClasses.length}</div>
        <div class="text-[11px] text-[#475569] uppercase tracking-[0.06em]">Species</div>
      </div>
      <div class="bg-surface border border-[rgba(99,179,237,0.12)] rounded-[8px] p-[14px] text-center">
        <div class="font-space text-[22px] font-bold text-accent leading-none mb-[4px]">${data.inference_ms}<small style="font-size:12px">ms</small></div>
        <div class="text-[11px] text-[#475569] uppercase tracking-[0.06em]">Frame Latency</div>
      </div>
    </div>`;

  if (data.count === 0) {
    html += `<div class="text-center py-[32px] text-[#475569] text-[14px]">✅ No animals detected in current frame.</div>`;
  } else {
    html += `<div class="mt-[16px] flex flex-col gap-[8px] max-h-[320px] overflow-y-auto pr-[4px] custom-scrollbar" id="det-list">`;
    data.detections.forEach((det: any, i: number) => {
      const meta = CLASS_META[det.class] ?? { color: '#94a3b8', emoji: '🐾' };
      const pct = Math.round(det.confidence * 100);
      html += `
        <div class="flex items-center gap-[12px] py-[10px] px-[14px] bg-surface border border-[rgba(99,179,237,0.12)] rounded-[8px] transition-all duration-[220ms] opacity-0 animate-[slideIn_0.25s_ease_forwards] hover:border-[rgba(99,179,237,0.3)]" style="animation-delay:${i * 50}ms">
          <div class="w-[10px] h-[10px] rounded-full shrink-0" style="background:${meta.color}"></div>
          <span class="font-semibold text-[14px] flex-1 capitalize">${meta.emoji} ${det.class}</span>
          <div class="flex-1 h-[4px] bg-deep rounded-[2px] overflow-hidden">
            <div class="h-full rounded-[2px] transition-[width] duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)]" style="width:${pct}%;background:${meta.color}"></div>
          </div>
          <span class="text-[12px] font-semibold py-[2px] px-[10px] rounded-[100px] bg-glass" style="color:${meta.color}">${pct}%</span>
        </div>`;
    });
    html += `</div>`;
  }

  slot.innerHTML = html;
}

render();
