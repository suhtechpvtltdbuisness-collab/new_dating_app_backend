import multer from "multer";

/// Kept under Vercel's 4.5MB serverless request body cap for mobile client uploads.
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const ADMIN_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 9 },
});

/// Accepts the field names the Flutter client uses for single and batch
/// uploads (`file`, `files`, `media`, `photo`, `photos`).
export const uploadAny = upload.any();

/// Admin upload middleware with higher limits for high-resolution blog covers
export const uploadAdminCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ADMIN_MAX_FILE_SIZE_BYTES, files: 1 },
}).any();

