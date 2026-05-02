export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "APP_ERROR"
  ) {
    super(message);
  }
}

export const forbidden = () => new AppError(403, "Acesso não permitido.", "FORBIDDEN");
export const unauthorized = () => new AppError(401, "Faça login para continuar.", "UNAUTHORIZED");
export const notFound = () => new AppError(404, "Registro não encontrado.", "NOT_FOUND");
