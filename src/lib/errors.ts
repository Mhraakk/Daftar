export class AppError extends Error {
  constructor(message: string, public code: string = "APP_ERROR", public status = 400, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "شما مجوز انجام این عملیات را ندارید.") { super(message, "FORBIDDEN", 403); }
}
export class NotFoundError extends AppError {
  constructor(message = "رکورد مورد نظر یافت نشد.") { super(message, "NOT_FOUND", 404); }
}
export class ConflictError extends AppError {
  constructor(message = "این رکورد هم‌زمان توسط کاربر دیگری تغییر کرده است. صفحه را تازه‌سازی و دوباره تلاش کنید.") {
    super(message, "CONFLICT", 409);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "نشست شما منقضی شده است. دوباره وارد شوید.") { super(message, "UNAUTHORIZED", 401); }
}
