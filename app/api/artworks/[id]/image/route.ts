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
  const imageKey = artwork.thumbnailKey ?? artwork.finalImageKey;
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
