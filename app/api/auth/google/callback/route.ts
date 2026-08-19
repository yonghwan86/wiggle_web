import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { issueTeacherSession } from "@/lib/demo-seed";
import { decodeOAuthCookie, exchangeGoogleCode, fetchGoogleUser, googleOAuthConfig, timingSafeEqualText, validateGoogleTeacher } from "@/lib/google-auth";
import { upsertGoogleTeacher } from "@/lib/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const stored = decodeOAuthCookie(cookieStore.get("wiggle_google_oauth")?.value ?? "");
  cookieStore.delete("wiggle_google_oauth");
  // 실패는 전부 랜딩으로 보낸다 — /teacher로 보내면 다시 구글로 튕겨 루프가 된다.
  const fallback = () => NextResponse.redirect(new URL("/", url.origin));

  const config = googleOAuthConfig(url.origin);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!config || !stored || !code || !timingSafeEqualText(state, stored.state)) return fallback();

  const token = await exchangeGoogleCode(config, { code, verifier: stored.verifier });
  if (!token) return fallback();
  const profile = await fetchGoogleUser(token.accessToken);
  const validated = validateGoogleTeacher(profile);
  if (!validated) return fallback();

  const teacher = await upsertGoogleTeacher(validated.email, validated.displayName);
  if (!teacher) return fallback();
  const session = await issueTeacherSession(teacher.id);
  // lax여야 한다: 이 응답의 /teacher 리디렉션은 구글이 시작한 교차 사이트 내비게이션
  // 연쇄라 strict 쿠키가 실리지 않는다 — strict면 로그인 성공 직후 미인증으로 판정되어
  // 다시 구글로 튕기는 무한 루프가 된다 (2026-08-19 운영에서 실제 발생).
  cookieStore.set("wiggle_teacher", session.token, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    expires: session.expires,
  });
  return NextResponse.redirect(new URL(stored.returnTo, url.origin));
}
