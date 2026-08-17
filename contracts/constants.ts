export const Session = {
  cookieName: "biomap_sid",
  clientId: "biomap-web",
  maxAgeMs: 8 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;
