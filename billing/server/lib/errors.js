export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
export const badRequest = (m, d) => new AppError(400, m, d);
export const forbidden = (m = 'Forbidden', d) => new AppError(403, m, d);
export const notFound = (m = 'Not found') => new AppError(404, m);
export const conflict = (m, d) => new AppError(409, m, d);
