import { bindings } from "@/db/runtime";
import { createFamilyHandoffInvite, familyCookieToken, familyJson } from "@/lib/family-sharing";
import { rateLimit, sameOrigin, sha256 } from "@/lib/security";

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return familyJson({ error: "요청을 확인할 수 없어요." }, { status: 403 });
  const sessionToken = familyCookieToken(request);
  const limiterKey = await sha256(`${clientAddress(request)}:${sessionToken.slice(0, 12)}`);
  if (!(await rateLimit(`family-handoff:${limiterKey}`, 8, 60))) return familyJson({ error: "잠시 뒤 다시 시도해 주세요." }, { status: 429 });
  const result = await createFamilyHandoffInvite(bindings().DB, sessionToken);
  if (!result.ok) return familyJson({ error: "새 가족 입장 링크를 만들 수 없어요." }, { status: 404 });
  return familyJson({ url: `${new URL(request.url).origin}/family/${result.inviteToken}`, expiresAt: result.expiresAt }, { status: 201 });
}
