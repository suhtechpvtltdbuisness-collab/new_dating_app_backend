import base64
import binascii
import os
import re
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

MAX_IMAGE_BYTES = 5 * 1024 * 1024
DATA_URL = re.compile(r"^data:image/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$")
DETECTOR_MODEL = os.getenv("FACE_DETECTOR_MODEL", "/app/models/face_detection_yunet.onnx")
RECOGNIZER_MODEL = os.getenv("FACE_RECOGNIZER_MODEL", "/app/models/face_recognition_sface.onnx")
SERVICE_KEY = os.getenv("FACE_RECOGNITION_SERVICE_KEY", "")
DETECT_MAX_SIDE = int(os.getenv("FACE_DETECT_MAX_SIDE", "640"))

detector = None
recognizer = None


class ImageRequest(BaseModel):
    image: str


def api_error(status: int, message: str, code: str):
    raise HTTPException(status_code=status, detail={"message": message, "code": code})


def decode_image(data_url: str) -> np.ndarray:
    match = DATA_URL.fullmatch(data_url)
    if not match:
        api_error(400, "Image must be a base64 JPEG or PNG data URL", "INVALID_IMAGE")
    try:
        raw = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        api_error(400, "Image contains invalid base64 data", "INVALID_IMAGE")
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        api_error(413, "Image must be smaller than 5 MB", "IMAGE_TOO_LARGE")
    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        api_error(400, "Image could not be decoded", "INVALID_IMAGE")
    return image


def fit_for_detection(image: np.ndarray) -> np.ndarray:
    # YuNet misses or misplaces faces that fill a large photo (a close-up selfie at 1600px
    # often returns no face). Faces are cropped to 112x112 anyway, so shrinking loses nothing.
    height, width = image.shape[:2]
    scale = DETECT_MAX_SIDE / max(height, width)
    if scale >= 1:
        return image
    return cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)


def pick_face(faces) -> np.ndarray:
    if faces is None or len(faces) == 0:
        api_error(422, "No face found. Use a clear, well-lit photo of your face.", "NO_FACE")
    if len(faces) == 1:
        return faces[0]
    # Allow a small face in the background (a poster, someone far behind) when one face clearly dominates.
    by_area = sorted(faces, key=lambda f: f[2] * f[3], reverse=True)
    if by_area[0][2] * by_area[0][3] >= 2.5 * by_area[1][2] * by_area[1][3]:
        return by_area[0]
    api_error(422, "More than one face found. Make sure only you are in the photo.", "SINGLE_FACE_REQUIRED")


def create_embedding(image: np.ndarray) -> list[float]:
    image = fit_for_detection(image)
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    aligned = recognizer.alignCrop(image, pick_face(faces))
    feature = recognizer.feature(aligned).flatten().astype(np.float64)
    norm = np.linalg.norm(feature)
    if not np.isfinite(norm) or norm == 0:
        api_error(422, "A usable face embedding could not be created", "FACE_QUALITY_TOO_LOW")
    return (feature / norm).tolist()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global detector, recognizer
    detector = cv2.FaceDetectorYN_create(DETECTOR_MODEL, "", (320, 320), 0.9, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF_create(RECOGNIZER_MODEL, "")
    yield


app = FastAPI(
    title="Dating App OpenCV Face Service",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.get("/health")
def health():
    return {"status": "ok", "engine": "opencv_sface"}


@app.post("/v1/embeddings")
def embeddings(payload: ImageRequest, x_face_service_key: str | None = Header(default=None)):
    if SERVICE_KEY and x_face_service_key != SERVICE_KEY:
        api_error(401, "Invalid service key", "INVALID_SERVICE_KEY")
    return {"embedding": create_embedding(decode_image(payload.image)), "model": "opencv_sface"}
