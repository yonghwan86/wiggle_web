import { bindings } from "@/db/runtime";
import { cleanText, jsonError, studentFromRequest } from "@/lib/security";

type ArtworkImage = {
  thumbnailKey: string | null;
  finalImageKey: string | null;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const student = await studentFromRequest(request);
  if (!student) return jsonError("학생 로그인이 필요해요.", 401);

  const artworkId = cleanText((await context.params).id, 80);
  const artwork = await bindings().DB.prepare(`
    SELECT thumbnail_key AS thumbnailKey, final_image_key AS finalImageKey
    FROM artworks
    WHERE id = ? AND student_id = ?
  `).bind(artworkId, student.id).first<ArtworkImage>();

  if (!artwork) return jsonError("내 그림을 찾을 수 없어요.", 404);
  // 목록 화면은 작은 썸네일을 우선한다. 완성 작품 상세만 명시적으로 원본을 요청해
  // iPad 보관함에서 수십 장의 대용량 PNG를 한꺼번에 내려받지 않게 한다.
  const variant = new URL(request.url).searchParams.get("variant");
  const imageKey = variant === "final"
    ? artwork.finalImageKey ?? artwork.thumbnailKey
    : artwork.thumbnailKey ?? artwork.finalImageKey;
  if (!imageKey) return jsonError("아직 그림 미리보기가 없어요.", 404);

  const object = await bindings().ARTWORKS.get(imageKey);
  if (!object) return jsonError("저장된 그림 파일을 찾을 수 없어요.", 404);

  return new Response(await object.arrayBuffer(), {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "image/png",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
