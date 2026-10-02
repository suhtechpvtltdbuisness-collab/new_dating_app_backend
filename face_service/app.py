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


def create_embedding(image: np.ndarray) -> list[float]:
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    count = 0 if faces is None else len(faces)
    if count != 1:
        api_error(422, "Exactly one clearly visible face is required", "SINGLE_FACE_REQUIRED")
    aligned = recognizer.alignCrop(image, faces[0])
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
