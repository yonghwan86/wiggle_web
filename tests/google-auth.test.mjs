import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  buildGoogleAuthUrl,
  decodeOAuthCookie,
  encodeOAuthCookie,
  exchangeGoogleCode,
  fetchGoogleUser,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  pkcePair,
  safeRelativeReturnPath,
  timingSafeEqualText,
  validateGoogleTeacher,
} from "../lib/google-auth.ts";

const config = { clientId: "client-1", clientSecret: "secret-1", redirectUri: "https://wiggle.example/api/auth/google/callback" };

test("pkcePair produces an RFC 7636 verifier and its S256 challenge", () => {
  const { verifier, challenge } = pkcePair();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, `verifier length ${verifier.length}`);
  assert.match(verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(challenge, createHash("sha256").update(verifier, "ascii").digest("base64url"));
  assert.notEqual(pkcePair().verifier, verifier, "매 로그인 시도마다 새 verifier");
});

test("auth url carries code flow, PKCE S256, state and openid email scope", () => {
  const url = new URL(buildGoogleAuthUrl(config, { state: "state-123", challenge: "challenge-abc" }));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("client_id"), "client-1");
  assert.equal(url.searchParams.get("redirect_uri"), config.redirectUri);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-abc");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const scope = url.searchParams.get("scope") ?? "";
  assert.ok(scope.includes("openid") && scope.includes("email"));
});

test("return path only accepts in-app relative paths and never the oauth routes", () => {
  assert.equal(safeRelativeReturnPath("/teacher"), "/teacher");
  assert.equal(safeRelativeReturnPath("/teacher/class/c_1?tab=live"), "/teacher/class/c_1?tab=live");
  assert.equal(safeRelativeReturnPath("https://evil.example/teacher"), "/teacher");
  assert.equal(safeRelativeReturnPath("//evil.example"), "/teacher");
  assert.equal(safeRelativeReturnPath("javascript:alert(1)"), "/teacher");
  assert.equal(safeRelativeReturnPath("/api/auth/google/callback"), "/teacher");
  assert.equal(safeRelativeReturnPath(""), "/teacher");
  assert.equal(safeRelativeReturnPath(null), "/teacher");
});

test("code exchange posts the verifier (PKCE) and fails closed on non-OK", async () => {
  const calls = [];
  const fakeFetch = async (input, init) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ access_token: "token-9" }), { status: 200 });
  };
  const token = await exchangeGoogleCode(config, { code: "code-7", verifier: "verifier-7" }, fakeFetch);
  assert.deepEqual(token, { accessToken: "token-9" });
  assert.equal(calls[0].input, GOOGLE_TOKEN_ENDPOINT);
  const body = new URLSearchParams(calls[0].init.body);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "code-7");
  assert.equal(body.get("code_verifier"), "verifier-7");
  assert.equal(body.get("client_secret"), "secret-1");

  const denied = await exchangeGoogleCode(config, { code: "bad", verifier: "v" }, async () => new Response("nope", { status: 400 }));
  assert.equal(denied, null);
  const network = await exchangeGoogleCode(config, { code: "bad", verifier: "v" }, async () => { throw new Error("offline"); });
  assert.equal(network, null);
});

test("userinfo requires a verified email before it can become a teacher", async () => {
  const respond = (payload) => async (input, init) => {
    assert.equal(input, GOOGLE_USERINFO_ENDPOINT);
    assert.equal(init.headers.authorization, "Bearer token-9");
    return new Response(JSON.stringify(payload), { status: 200 });
  };
  const verified = await fetchGoogleUser("token-9", respond({ email: " Teacher@School.KR ", email_verified: true, name: "김선생" }));
  assert.deepEqual(validateGoogleTeacher(verified), { email: "teacher@school.kr", displayName: "김선생" });

  const unverified = await fetchGoogleUser("token-9", respond({ email: "teacher@school.kr", email_verified: false }));
  assert.equal(validateGoogleTeacher(unverified), null, "미검증 이메일은 계정 선점 통로가 된다");

  const stringVerified = await fetchGoogleUser("token-9", respond({ email: "teacher@school.kr", email_verified: "true" }));
  assert.equal(validateGoogleTeacher(stringVerified), null, "불리언 true만 인정");

  assert.equal(validateGoogleTeacher(null), null);
  assert.equal(validateGoogleTeacher({ email: "not-an-email", emailVerified: true, name: null }), null);
  const longName = await fetchGoogleUser("token-9", respond({ email: "t@s.kr", email_verified: true, name: "가".repeat(120) }));
  assert.equal(validateGoogleTeacher(longName).displayName.length, 80);
});

test("oauth cookie round-trips and rejects garbage or tampered payloads", () => {
  const raw = encodeOAuthCookie({ state: "s1", verifier: "v1", returnTo: "/teacher/class/c9" });
  assert.deepEqual(decodeOAuthCookie(raw), { state: "s1", verifier: "v1", returnTo: "/teacher/class/c9" });
  const hostile = encodeOAuthCookie({ state: "s1", verifier: "v1", returnTo: "https://evil.example" });
  assert.equal(decodeOAuthCookie(hostile).returnTo, "/teacher", "쿠키가 조작돼도 리다이렉트는 앱 안으로");
  assert.equal(decodeOAuthCookie("not-base64-json"), null);
  assert.equal(decodeOAuthCookie(encodeOAuthCookie({ state: "", verifier: "v", returnTo: "/" })), null);
});

test("state comparison is length-guarded and constant-time in shape", () => {
  assert.equal(timingSafeEqualText("abc", "abc"), true);
  assert.equal(timingSafeEqualText("abc", "abd"), false);
  assert.equal(timingSafeEqualText("abc", "ab"), false);
  assert.equal(timingSafeEqualText("", ""), false, "빈 state는 항상 거부");
});
