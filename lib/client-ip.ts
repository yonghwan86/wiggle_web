/**
 * 속도 제한 버킷을 가르는 클라이언트 주소.
 *
 * 여기서 신뢰할 수 있는 헤더는 "플랫폼이 직접 덮어써서 클라이언트가 위조할 수 없는 것"뿐이다.
 * Vercel은 x-vercel-forwarded-for / x-real-ip / x-forwarded-for를 자기가 채운다.
 * cf-connecting-ip는 Cloudflare가 앞단에 있을 때만 신뢰할 수 있었고, 지금 배포에는
 * Cloudflare가 없어 요청자가 값을 마음대로 넣을 수 있다 — 그대로 신뢰하면 IP 단위 상한
 * (그림 비밀번호 추측 방어 포함)을 요청마다 새 IP를 지어내는 것만으로 통째로 우회한다.
 * 되살리지 말 것.
 *
 * 이 모듈은 의존성이 없어 node --test가 단독으로 로드한다(tests/security-regressions.test.mjs).
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
