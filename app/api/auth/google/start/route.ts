import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, encodeOAuthCookie, googleOAuthConfig, pkcePair, safeRelativeReturnPath } from "@/lib/google-auth";
import { randomToken } from "@/lib/token-crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = googleOAuthConfig(url.origin);
  if (!config) {
    return NextResponse.json(
      { error: "구글 로그인이 아직 설정되지 않았어요. GOOGLE_CLIENT_ID와 GOOGLE_CLIENT_SECRET을 확인해 주세요." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const state = randomToken(24);
  const { verifier, challenge } = pkcePair();
  const returnTo = safeRelativeReturnPath(url.searchParams.get("return_to"));
  // 콜백은 구글에서 돌아오는 최상위 GET이라 sameSite lax여야 쿠키가 함께 온다.
  (await cookies()).set("wiggle_google_oauth", encodeOAuthCookie({ state, verifier, returnTo }), {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return NextResponse.redirect(buildGoogleAuthUrl(config, { state, challenge }));
}
