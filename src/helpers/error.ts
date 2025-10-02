export function setResponseError(status?: number, message?: string): never {
  throw { status, message };
}
