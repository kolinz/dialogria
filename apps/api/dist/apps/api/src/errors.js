export class AppError extends Error {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function requireThat(condition, status, code, message) {
    if (!condition)
        throw new AppError(status, code, message);
}
