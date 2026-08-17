import * as cookie from "cookie";
import * as jose from "jose";
import { Errors } from "@contracts/errors";
import { Session } from "@contracts/constants";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { findUserByUnionId } from "../queries/users";

const JWT_ALG = "HS256";

type SessionPayload = {
  unionId: string;
  clientId: typeof Session.clientId;
};

export async function signSessionToken(payload: { unionId: string }): Promise<string> {
  const secret = new TextEncoder().encode(env.sessionSecret);
  return new jose.SignJWT({ unionId: payload.unionId, clientId: Session.clientId })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuer("biomap-os")
    .setAudience("biomap-web")
    .setIssuedAt()
    .setExpirationTime("8 hours")
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const secret = new TextEncoder().encode(env.sessionSecret);
    const { payload } = await jose.jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
      issuer: "biomap-os",
      audience: "biomap-web",
    });
    const { unionId, clientId } = payload;
    if (typeof unionId !== "string" || clientId !== Session.clientId) return null;
    return { unionId, clientId: Session.clientId };
  } catch {
    return null;
  }
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const claim = await verifySessionToken(cookies[Session.cookieName] ?? "");
  if (!claim) throw Errors.forbidden("Invalid authentication token.");
  const user = await findUserByUnionId(claim.unionId);
  if (!user) throw Errors.forbidden("User not found. Please re-login.");
  return user;
}

export function createSessionCookie(headers: Headers, token: string): string {
  const options = getSessionCookieOptions(headers);
  return cookie.serialize(Session.cookieName, token, {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite?.toLowerCase() as "lax" | "none",
    secure: options.secure,
    maxAge: Session.maxAgeMs / 1000,
  });
}

export function createExpiredSessionCookie(headers: Headers): string {
  const options = getSessionCookieOptions(headers);
  return cookie.serialize(Session.cookieName, "", {
    httpOnly: options.httpOnly,
    path: options.path,
    sameSite: options.sameSite?.toLowerCase() as "lax" | "none",
    secure: options.secure,
    maxAge: 0,
  });
}
