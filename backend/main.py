"""
  POST /detect  — accept image, return JSON detections + base64 annotated image
  GET  /health  — simple health check
"""

import base64
import os
import time
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
import smtplib
from email.mime.text import MIMEText
import logging

BASE_DIR   = Path(__file__).parent
MODEL_PATH = BASE_DIR / "yolo11n.pt"
CONF_THRES = float(os.getenv("CONFIDENCE_THRESHOLD", "0.35"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# SMTP Config
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
ALERT_RECIPIENT = os.getenv("ALERT_RECIPIENT", "")
ALERT_FROM_NAME = os.getenv("ALERT_FROM_NAME", "Wildlife Detection System")
ALERT_COOLDOWN_SECONDS = int(os.getenv("ALERT_COOLDOWN_SECONDS", "30"))

# State for cooldowns
last_alert_time: dict[str, float] = {}

COCO_ANIMALS = {
    14: "bird",
    15: "cat",
    16: "dog",
    17: "horse",
    18: "sheep",
    19: "cow",
    20: "elephant",
    21: "bear",
    22: "zebra",
    23: "giraffe"
}

CLASS_NAMES = list(COCO_ANIMALS.values())

CLASS_COLORS = {
    "bird":     (56,  189, 248),
    "cat":      (167, 139, 250),
    "dog":      (34,  211, 238),
    "horse":    (251, 146,  60),
    "sheep":    (244, 114, 182),
    "cow":      (52,  211, 153),
    "elephant": (250, 204,  21),
    "bear":     (248, 113, 113),
    "zebra":    (129, 140, 248),
    "giraffe":  (251, 191,  36)
}

app = FastAPI(title="Wildlife Detection API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"🔄 Loading model from: {MODEL_PATH}")
if not MODEL_PATH.exists():
    print(f"Model not found at {MODEL_PATH}. Ultralytics will auto-download it.")

model = YOLO(str(MODEL_PATH))
print("✅ Model loaded successfully")


def draw_boxes(img_bgr: np.ndarray, detections: list[dict]) -> np.ndarray:
    """Draw bounding boxes + labels on the image."""
    annotated = img_bgr.copy()
    font      = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = max(0.5, min(img_bgr.shape[1], img_bgr.shape[0]) / 1000)
    thickness  = max(2, int(font_scale * 3))

    for det in detections:
        cls   = det["class"]
        conf  = det["confidence"]
        x1, y1, x2, y2 = det["bbox"]
        color = CLASS_COLORS.get(cls, (255, 255, 255))

        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, thickness)

        label   = f"{cls}  {conf:.0%}"
        (tw, th), baseline = cv2.getTextSize(label, font, font_scale, thickness)
        lbl_y1  = max(y1 - th - baseline - 6, 0)
        lbl_y2  = lbl_y1 + th + baseline + 6
        cv2.rectangle(annotated, (x1, lbl_y1), (x1 + tw + 8, lbl_y2), color, -1)
        cv2.putText(annotated, label,
                    (x1 + 4, lbl_y2 - baseline - 2),
                    font, font_scale, (10, 10, 10), thickness, cv2.LINE_AA)

    return annotated


def image_to_b64(img_bgr: np.ndarray) -> str:
    _, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
    return base64.b64encode(buf.tobytes()).decode("utf-8")


def send_sms_alert(classes_detected: list[str]):
    """Sends an email/SMS using SMTP."""
    if not SMTP_USER or not SMTP_PASSWORD or not ALERT_RECIPIENT:
        logging.warning("SMTP credentials not fully set up. Skipping alert.")
        return
        
    class_str = ", ".join(classes_detected)
    subject = f"🚨 Wildlife Alert: {class_str} Detected"
    body = f"The following wildlife was just detected by the system: {class_str}."

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = f"{ALERT_FROM_NAME} <{SMTP_USER}>"
    msg["To"] = ALERT_RECIPIENT

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        logging.info(f"✅ Alert sent successfully for: {class_str}")
    except Exception as e:
        logging.error(f"❌ Failed to send SMTP alert: {e}")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model" : MODEL_PATH.name,
        "classes": CLASS_NAMES,
        "conf_threshold": CONF_THRES,
    }


@app.post("/detect")
async def detect(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    try:
        if not file.content_type.startswith("image/"):
            raise HTTPException(status_code=400, detail="File must be an image.")

        raw = await file.read()
        if len(raw) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image too large (max 20 MB).")

        arr     = np.frombuffer(raw, dtype=np.uint8)
        img_bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img_bgr is None:
            raise HTTPException(status_code=400, detail="Could not decode image. Send a valid JPG/PNG/WEBP.")
        h, w = img_bgr.shape[:2]

        t0      = time.perf_counter()
        results = model.predict(
            source    = img_bgr,
            conf      = CONF_THRES,
            iou       = 0.45,
            imgsz     = 640,
            verbose   = False,
        )
        inference_ms = round((time.perf_counter() - t0) * 1000, 1)

        detections: list[dict] = []
        for r in results:
            for box in r.boxes:
                cls_id   = int(box.cls[0])
                if cls_id not in COCO_ANIMALS:
                    continue  # Only detect wildlife/animals!
                    
                cls_name = COCO_ANIMALS[cls_id]
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
                detections.append({
                    "class"     : cls_name,
                    "confidence": round(float(box.conf[0]), 4),
                    "bbox"      : [x1, y1, x2, y2],
                    "bbox_norm" : [
                        round(x1 / w, 4), round(y1 / h, 4),
                        round(x2 / w, 4), round(y2 / h, 4),
                    ],
                })

        detections.sort(key=lambda d: d["confidence"], reverse=True)

        # Trigger Alerts
        current_time = time.time()
        classes_to_alert = []
        for det in detections:
            cls = det["class"]
            last_time = last_alert_time.get(cls, 0.0)
            if current_time - last_time > ALERT_COOLDOWN_SECONDS:
                classes_to_alert.append(cls)
                last_alert_time[cls] = current_time
        
        # Deduplicate classes to alert
        classes_to_alert = list(set(classes_to_alert))
        
        if classes_to_alert:
            background_tasks.add_task(send_sms_alert, classes_to_alert)

        annotated     = draw_boxes(img_bgr, detections)
        annotated_b64 = image_to_b64(annotated)

        return JSONResponse({
            "success"        : True,
            "inference_ms"   : inference_ms,
            "image_size"     : {"width": w, "height": h},
            "count"          : len(detections),
            "detections"     : detections,
            "annotated_image": annotated_b64,
        })

    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse(status_code=500, content={"success": False, "error": str(exc)})
