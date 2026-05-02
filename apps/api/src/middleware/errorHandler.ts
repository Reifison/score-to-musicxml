import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: "Dados inválidos.",
      code: "VALIDATION_ERROR",
      details: error.flatten()
    });
  }
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ error: error.message, code: error.code });
  }
  if (error instanceof Error && error.message.includes("File too large")) {
    return res.status(413).json({ error: "Arquivo acima do tamanho máximo permitido.", code: "FILE_TOO_LARGE" });
  }
  return res.status(500).json({ error: "Erro interno. Tente novamente mais tarde.", code: "INTERNAL_ERROR" });
}
