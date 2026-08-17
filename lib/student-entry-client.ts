export type StudentEntryResponse = {
  error?: string;
  code?: "PROFILE_EXISTS" | "PROFILE_CREDENTIALS_EXIST";
  classroomName?: string;
  hasProfiles?: boolean;
  student?: { id: string; nickname: string; animal: string; classroomName: string };
  deviceToken?: string;
  expiresAt?: string;
  personalQrToken?: string;
};

export class StudentEntryResponseError extends Error {}

export type EntryErrorKind = "code" | "password" | "general";

// 아이가 스스로 복구할 행동을 고르기 위한 실패 분류:
// code → 수업 코드 칸 강조 + 선생님 불러요, password → 그림 비밀번호 다시 골라요.
export function classifyEntryError(input: { status: number; action: "join" | "switchProfile" | "recover"; hasPersonalQrToken: boolean }): EntryErrorKind {
  if (input.status === 404 && input.action === "join") return "code";
  if (input.status === 401 && input.action !== "join" && !input.hasPersonalQrToken) return "password";
  return "general";
}

export async function readStudentEntryResponse(response: Response): Promise<StudentEntryResponse> {
  try {
    const value = JSON.parse(await response.text()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid response shape");
    return value as StudentEntryResponse;
  } catch {
    throw new StudentEntryResponseError(
      response.ok
        ? "입장 응답을 확인하지 못했어요. 잠시 뒤 다시 해 주세요."
        : "입장 서버가 잠시 응답하지 않아요. 잠시 뒤 다시 해 주세요.",
    );
  }
}
