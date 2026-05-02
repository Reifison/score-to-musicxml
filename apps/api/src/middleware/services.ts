import type { NextFunction, Request, Response } from "express";
import type { AppServices } from "../container.js";

export function attachServices(services: AppServices) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.services = services;
    next();
  };
}
