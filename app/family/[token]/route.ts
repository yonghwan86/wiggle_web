import { bindings } from "@/db/runtime";
import { exchangeFamilyInvite, familySecurityHeaders, familySessionCookieHeader, peekFamilyInvite } from "@/lib/family-sharing";
import { rateLimit, sameOrigin, sha256 } from "@/lib/security";

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function unavailable() {
  return new Response("가족 공유 초대가 만료되었거나 이미 사용되었습니다.", {
    status: 404,
    headers: familySecurityHeaders(new Headers({ "content-type": "text/plain; charset=utf-8" })),
  });
}

async function allowed(request: Request, token: string) {
  const limiterKey = await sha256(`${clientAddress(request)}:${token.slice(0, 12)}`);
  return rateLimit(`family-exchange:${limiterKey}`, 12, 60);
}

function tooMany() {
  return new Response("잠시 뒤 다시 시도해 주세요.", { status: 429, headers: familySecurityHeaders() });
}

// 확인 화면에서만 같은 주소로 POST 하므로 이 응답에 한해 form-action을 self로 연다.
function landingHeaders() {
  const headers = familySecurityHeaders(new Headers({ "content-type": "text/html; charset=utf-8" }));
  headers.set("content-security-policy", "default-src 'self'; img-src 'self' data:; connect-src 'none'; script-src 'none'; style-src 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return headers;
}

function landingPage() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>가족 공유 열기</title><style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:#eef8fb; color:#12384f; font-family:system-ui,-apple-system,"Malgun Gothic",sans-serif; }
  main { width:min(460px,100%); background:#fff; border:1px solid #cfe3ea; border-radius:24px; padding:32px; box-shadow:0 20px 55px rgba(26,59,92,.12); text-align:center; }
  h1 { margin:12px 0 8px; font-size:26px; }
  p { margin:0 0 8px; color:#4a6f80; line-height:1.6; }
  small { display:block; margin-top:14px; color:#7d97a3; }
  button { width:100%; min-height:56px; margin-top:22px; border:0; border-radius:16px; background:#0687B8; color:#fff; font-size:18px; font-weight:800; cursor:pointer; }
  </style></head><body><main><div style="font-size:44px" aria-hidden="true">🎨</div><h1>아이의 그림을 볼 준비가 됐어요</h1><p>이 링크는 한 번만 열 수 있어요. 보호자 본인이 직접 열어 주세요.</p><form method="post"><button type="submit">그림 보러 가기</button></form><small>학교에서 안내한 보호자만 열람할 수 있습니다.</small></main></body></html>`;
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = (await context.params).token;
  if (!(await allowed(request, token))) return tooMany();
  const invite = await peekFamilyInvite(bindings().DB, token);
  if (!invite.ok) return unavailable();
  return new Response(landingPage(), { status: 200, headers: landingHeaders() });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = (await context.params).token;
  if (!sameOrigin(request)) return unavailable();
  if (!(await allowed(request, token))) return tooMany();
  const exchanged = await exchangeFamilyInvite(bindings().DB, token);
  if (!exchanged.ok) return unavailable();

  const destination = new URL("/family/view", request.url);
  const headers = familySecurityHeaders(new Headers({ location: destination.toString() }));
  headers.append("set-cookie", familySessionCookieHeader(exchanged.sessionToken, exchanged.expiresAt));
  return new Response(null, { status: 303, headers });
}
