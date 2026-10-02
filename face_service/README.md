# Dating App OpenCV face service

Private FastAPI service used by the dating backend for selfie verification.
It creates normalized face embeddings with OpenCV YuNet + SFace and does not
store source images.

## Railway deploy

Deploy this folder as a separate Railway service:

```text
new_dating_app_backend/face_service
```

Set this Railway variable:

```env
FACE_RECOGNITION_SERVICE_KEY=use-a-long-random-secret
```

Generate a public Railway domain, then configure the dating app backend
environment with:

```env
FACE_RECOGNITION_SERVICE_URL=https://your-face-service.up.railway.app
FACE_RECOGNITION_SERVICE_KEY=use-the-same-secret
FACE_MATCH_THRESHOLD=0.42
```

## Local run

```bash
docker build -t dating-face-service .
docker run --rm -p 8000:8000 \
  -e FACE_RECOGNITION_SERVICE_KEY=change-me \
  dating-face-service
```

Health check:

```bash
curl http://localhost:8000/health
```
