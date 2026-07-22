export type StudentEntryResponse = {
  error?: string;
  student?: { id: string; nickname: string; animal: string; classroomName: string };
  deviceToken?: string;
  expiresAt?: string;
  personalQrToken?: string;
};

export class StudentEntryResponseError extends Error {}

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
