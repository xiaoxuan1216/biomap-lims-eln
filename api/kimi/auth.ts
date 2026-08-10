import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import * as jose from "jose";
import * as cookie from "cookie";
import { createHash, randomBytes } from "node:crypto";
import { env } from "../lib/env";
import { getSessionCookieOptions } from "../lib/cookies";
import { Paths, Session } from "@contracts/constants";
import { Errors } from "@contracts/errors";
import { signSessionToken, verifySessionToken } from "./session";
import { users as kimiUsers } from "./platform";
import { findUserByUnionId, upsertUser } from "../queries/users";
import type { TokenResponse } from "./types";

const OAUTH_COOKIE_NAME = "biomap_oauth";
const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const textEncoder = new TextEncoder();

type OAuthStatePayload = {
  state: string;
  verifier: string;
  redirectUri: string;
};

function publicBaseUrl(c: Context): string {
  return env.publicBaseUrl || new URL(c.req.url).origin;
}

function toBase64Url(value: Buffer): string {
  return value.toString("base64url");
}

async function signOAuthState(payload: OAuthStatePayload): Promise<string> {
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("biomap-os")
    .setAudience("biomap-oauth")
    .setIssuedAt()
    .setExpirationTime(`${OAUTH_STATE_TTL_SECONDS} seconds`)
    .sign(textEncoder.encode(env.sessionSecret));
}

async function verifyOAuthState(token: string): Promise<OAuthStatePayload> {
  const { payload } = await jose.jwtVerify(
    token,
    textEncoder.encode(env.sessionSecret),
    {
      algorithms: ["HS256"],
      issuer: "biomap-os",
      audience: "biomap-oauth",
    },
  );
  const { state, verifier, redirectUri } = payload;
  if (
    typeof state !== "string" ||
    typeof verifier !== "string" ||
    typeof redirectUri !== "string"
  ) {
    throw new Error("Invalid OAuth state payload");
  }
  return { state, verifier, redirectUri };
}

async function exchangeAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: env.appId,
    redirect_uri: redirectUri,
    client_secret: env.appSecret,
  });
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const resp = await fetch(`${env.kimiAuthUrl}/api/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<TokenResponse>;
}

const jwks = jose.createRemoteJWKSet(
  new URL(`${env.kimiAuthUrl}/api/.well-known/jwks.json`),
);

async function verifyAccessToken(
  accessToken: string,
): Promise<{ userId: string; clientId: string }> {
  const { payload } = await jose.jwtVerify(accessToken, jwks);
  const userId = payload.user_id as string;
  const clientId = payload.client_id as string;
  if (!userId) {
    throw new Error("user_id missing from access token");
  }
  if (clientId !== env.appId) {
    throw new Error("access token was issued to a different client");
  }
  return { userId, clientId };
}

export async function authenticateRequest(headers: Headers) {
  const cookies = cookie.parse(headers.get("cookie") || "");
  const token = cookies[Session.cookieName];
  if (!token) {
    console.warn("[auth] No session cookie found in request.");
    throw Errors.forbidden("Invalid authentication token.");
  }
  const claim = await verifySessionToken(token);
  if (!claim) {
    throw Errors.forbidden("Invalid authentication token.");
  }
  const user = await findUserByUnionId(claim.unionId);
  if (!user) {
    throw Errors.forbidden("User not found. Please re-login.");
  }
  return user;
}

export function createOAuthLoginHandler() {
  return async (c: Context) => {
    const redirectUri = `${publicBaseUrl(c)}${Paths.oauthCallback}`;
    const state = toBase64Url(randomBytes(32));
    const verifier = toBase64Url(randomBytes(48));
    const challenge = toBase64Url(
      createHash("sha256").update(verifier).digest(),
    );
    const stateToken = await signOAuthState({ state, verifier, redirectUri });

    setCookie(c, OAUTH_COOKIE_NAME, stateToken, {
      ...getSessionCookieOptions(c.req.raw.headers),
      maxAge: OAUTH_STATE_TTL_SECONDS,
    });

    const authorizeUrl = new URL(`${env.kimiAuthUrl}/api/oauth/authorize`);
    authorizeUrl.searchParams.set("client_id", env.appId);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", challenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");

    return c.redirect(authorizeUrl.toString(), 302);
  };
}

export function createOAuthCallbackHandler() {
  return async (c: Context) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");
    const errorDescription = c.req.query("error_description");

    if (error) {
      deleteCookie(c, OAUTH_COOKIE_NAME, { path: "/" });
      if (error === "access_denied") {
        return c.redirect("/", 302);
      }
      return c.json(
        { error, error_description: errorDescription },
        400,
      );
    }

    if (!code || !state) {
      return c.json({ error: "code and state are required" }, 400);
    }

    try {
      const cookies = cookie.parse(c.req.header("cookie") || "");
      const stateToken = cookies[OAUTH_COOKIE_NAME];
      if (!stateToken) {
        return c.json({ error: "OAuth state cookie is missing" }, 400);
      }

      const oauthState = await verifyOAuthState(stateToken);
      const expectedRedirectUri = `${publicBaseUrl(c)}${Paths.oauthCallback}`;
      if (
        oauthState.state !== state ||
        oauthState.redirectUri !== expectedRedirectUri
      ) {
        return c.json({ error: "OAuth state validation failed" }, 400);
      }

      const tokenResp = await exchangeAuthCode(
        code,
        oauthState.redirectUri,
        oauthState.verifier,
      );
      const { userId } = await verifyAccessToken(tokenResp.access_token);
      const userProfile = await kimiUsers.getProfile(tokenResp.access_token);
      if (!userProfile) {
        throw new Error("Failed to fetch user profile from Kimi Open");
      }

      await upsertUser({
        unionId: userId,
        name: userProfile.name,
        avatar: userProfile.avatar_url,
        lastSignInAt: new Date(),
      });

      const token = await signSessionToken({
        unionId: userId,
        clientId: env.appId,
      });

      const cookieOpts = getSessionCookieOptions(c.req.raw.headers);
      setCookie(c, Session.cookieName, token, {
        ...cookieOpts,
        maxAge: Session.maxAgeMs / 1000,
      });
      deleteCookie(c, OAUTH_COOKIE_NAME, { path: "/" });

      return c.redirect("/", 302);
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      deleteCookie(c, OAUTH_COOKIE_NAME, { path: "/" });
      return c.json({ error: "OAuth callback failed" }, 400);
    }
  };
}

export { exchangeAuthCode, verifyAccessToken };
