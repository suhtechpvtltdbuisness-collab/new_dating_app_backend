import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { MulterError } from "multer";
import { AuthError } from "../errors/AuthError";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof AuthError) {
    res.status(error.status).json({ message: error.message });
    return;
  }

  if (error instanceof MulterError) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ message: error.message });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({ message: `Invalid ${error.path}` });
    return;
  }

  const mongoError = error as {
    code?: number;
    keyPattern?: Record<string, unknown>;
  };
  if (mongoError.code === 11000) {
    const field = Object.keys(mongoError.keyPattern ?? {})[0];
    if (field === "email") {
      res.status(409).json({ message: "Email already exists" });
      return;
    }
    if (field === "phoneNumber") {
      res.status(409).json({ message: "Phone number already exists" });
      return;
    }
    if (field === "googleId") {
      res.status(409).json({ message: "Email already exists" });
      return;
    }
    res.status(409).json({ message: "Account already exists" });
    return;
  }

  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "production" ? undefined : error.message,
  });
}
