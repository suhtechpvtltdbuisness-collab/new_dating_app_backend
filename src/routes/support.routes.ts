import { Router } from "express";
import multer from "multer";
import { createSupportTicketHandler } from "../controller/support.controller";
import { authenticateAccessToken } from "../middlewares/authenticate";
import {
  SUPPORT_MAX_FILE_BYTES,
  SUPPORT_MAX_FILES,
} from "../services/support.service";

const supportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: SUPPORT_MAX_FILE_BYTES,
    files: SUPPORT_MAX_FILES,
    fields: 20,
  },
});

const supportRouter = Router();

supportRouter.use(authenticateAccessToken);

// multipart/form-data: name, email, issueType, subject, description,
// kind ("contact" | "problem"), details (JSON object), attachments[] (files).
supportRouter.post("/tickets", supportUpload.any(), createSupportTicketHandler);

export default supportRouter;
