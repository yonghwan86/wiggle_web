/**
 * 교사 로그인용 구글 OAuth 인가 코드 플로우(PKCE, confidential client).
 *
 * 인증 프레임워크 없이 기존 teacher_sessions 체계를 재사용한다. 토큰 교환은
 * 서버에서 client_secret과 함께 TLS로 직접 수행하고, 사용자 정보는 구글
 * userinfo 엔드포인트에서 받으므로 별도 JWT 서명 검증 없이 출처가 보장된다.
 * 이 모듈은 next/DB에 의존하지 않는다 — 라우트가 얇게 감싸고, 여기 로직은
 * node --test로 직접 검증한다(tests/google-auth.test.mjs).
 */
import { createHash, randomBytes } from "node:crypto";

// token-crypto.randomToken과 같은 base64url 토큰. 이 모듈은 node --test가
// 확장자 해석 없이 단독 로드할 수 있도록 상대 임포트를 두지 않는다.
function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export type GoogleOAuthConfig = { clientId: string; clientSecret: string; redirectUri: string };
export type GoogleUser = { email: string; emailVerified: boolean; name: string | null };

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

const DEFAULT_RETURN_PATH = "/teacher";
const RESERVED_PATH_PREFIX = "/api/auth/google";

export function googleOAuthConfig(origin: string): GoogleOAuthConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: `${origin}${RESERVED_PATH_PREFIX}/callback` };
}

// 로그인 뒤 돌아갈 곳은 우리 앱 안의 상대 경로만 허용한다 — 오픈 리다이렉트 차단.
export function safeRelativeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return DEFAULT_RETURN_PATH;
  let url: URL;
  try {
    url = new URL(value, "https://app.local");
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  if (url.origin !== "https://app.local") return DEFAULT_RETURN_PATH;
  if (url.pathname.startsWith(RESERVED_PATH_PREFIX)) return DEFAULT_RETURN_PATH;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function pkcePair(): { verifier: string; challenge: string } {
  // randomToken은 base64url 32바이트 → 43자: RFC 7636 verifier 규격(43~128자)을 만족한다.
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { verifier, challenge };
}

export function buildGoogleAuthUrl(config: GoogleOAuthConfig, input: { state: string; challenge: string }): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "online",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  input: { code: string; verifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string } | null> {
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code_verifier: input.verifier,
    }).toString(),
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as { access_token?: unknown } | null;
  return typeof payload?.access_token === "string" && payload.access_token ? { accessToken: payload.access_token } : null;
}

export async function fetchGoogleUser(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<GoogleUser | null> {
  const response = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}` } }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as { email?: unknown; email_verified?: unknown; name?: unknown } | null;
  if (!payload || typeof payload.email !== "string") return null;
  return {
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

// 미검증 이메일을 교사 계정으로 받으면 남의 주소를 선점해 계정을 가로챌 수 있다.
export function validateGoogleTeacher(user: GoogleUser | null): { email: string; displayName: string } | null {
  if (!user || user.emailVerified !== true) return null;
  const email = user.email.trim().toLowerCase().slice(0, 160);
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;
  const displayName = (user.name ?? email).trim().slice(0, 80) || email;
  return { email, displayName };
}

export function timingSafeEqualText(left: string, right: string): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  let value = 0;
  for (let index = 0; index < left.length; index += 1) value |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return value === 0;
}

export type OAuthCookiePayload = { state: string; verifier: string; returnTo: string };

export function encodeOAuthCookie(payload: OAuthCookiePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOAuthCookie(raw: string): OAuthCookiePayload | null {
  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OAuthCookiePayload>;
    if (typeof payload.state !== "string" || !payload.state) return null;
    if (typeof payload.verifier !== "string" || !payload.verifier) return null;
    if (typeof payload.returnTo !== "string") return null;
    return { state: payload.state, verifier: payload.verifier, returnTo: safeRelativeReturnPath(payload.returnTo) };
  } catch {
    return null;
  }
}
