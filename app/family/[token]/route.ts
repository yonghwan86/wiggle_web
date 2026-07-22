import { bindings } from "@/db/runtime";
import { exchangeFamilyInvite, familySecurityHeaders, familySessionCookieHeader } from "@/lib/family-sharing";
import { rateLimit, sha256 } from "@/lib/security";

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function unavailable() {
  return new Response("가족 공유 초대가 만료되었거나 이미 사용되었습니다.", {
    status: 404,
    headers: familySecurityHeaders(new Headers({ "content-type": "text/plain; charset=utf-8" })),
  });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = (await context.params).token;
  const limiterKey = await sha256(`${clientAddress(request)}:${token.slice(0, 12)}`);
  if (!(await rateLimit(`family-exchange:${limiterKey}`, 12, 60))) {
    return new Response("잠시 뒤 다시 시도해 주세요.", { status: 429, headers: familySecurityHeaders() });
  }
  const exchanged = await exchangeFamilyInvite(bindings().DB, token);
  if (!exchanged.ok) return unavailable();

  const destination = new URL("/family/view", request.url);
  const headers = familySecurityHeaders(new Headers({ location: destination.toString() }));
  headers.append("set-cookie", familySessionCookieHeader(exchanged.sessionToken, exchanged.expiresAt));
  return new Response(null, { status: 303, headers });
}
