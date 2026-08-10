export function isTrustedOrigin(
  request: Request,
  configuredPublicBaseUrl: string,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const expectedOrigin = configuredPublicBaseUrl
      ? new URL(configuredPublicBaseUrl).origin
      : new URL(request.url).origin;
    return new URL(origin).origin === expectedOrigin;
  } catch {
    return false;
  }
}
