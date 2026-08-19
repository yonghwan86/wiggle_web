/**
 * 완성 저장의 전송 분리 (Vercel 4.5MB 본문 한도 대응).
 *
 * 오프라인 큐에는 지금처럼 완성 PNG(base64)가 든 본문을 그대로 보관하고,
 * 전송 시점에만 이미지를 raw 바이너리 별도 요청으로 떼어낸다 — 큐 스키마
 * 마이그레이션 없이 온라인 저장과 오프라인 재전송이 같은 경로를 쓴다.
 * 이 모듈은 의존성이 없어 node --test가 단독 로드한다(tests/save-split.test.mjs).
 */

const FINAL_DATA_URL_PREFIX = "data:image/png;base64,";

export type CompletionSplit = { imageBase64: string; bodyWithKey(key: string): string };

// 완성(complete)이고 finalDataUrl을 실은 본문만 분리 대상이다. 나머지(중간 저장,
// 이미 키를 참조하는 본문, 손상된 본문)는 null을 돌려 원문 그대로 보내게 한다.
export function splitCompletionBody(body: string): CompletionSplit | null {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || payload.complete !== true) return null;
  const dataUrl = payload.finalDataUrl;
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(FINAL_DATA_URL_PREFIX)) return null;
  const { finalDataUrl: _dropped, ...rest } = payload;
  void _dropped;
  return {
    imageBase64: dataUrl.slice(FINAL_DATA_URL_PREFIX.length),
    bodyWithKey: (key: string) => JSON.stringify({ ...rest, finalImageKey: key }),
  };
}

export function base64ToBytes(value: string): Uint8Array | null {
  if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function finalImageUploadUrl(saveUrl: string, requestId: string): string {
  return `${saveUrl}/image?kind=final&requestId=${encodeURIComponent(requestId)}`;
}
