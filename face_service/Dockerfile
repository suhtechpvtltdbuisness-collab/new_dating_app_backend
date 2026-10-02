FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/models \
    && curl -fL "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" -o /app/models/face_detection_yunet.onnx \
    && curl -fL "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" -o /app/models/face_recognition_sface.onnx

COPY app.py .
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
