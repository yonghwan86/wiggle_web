export type DrawingInputMode = "pen" | "finger";

export const INPUT_MODE_STORAGE_KEY = "wiggle:input-mode";
export const LEGACY_PEN_MODE_STORAGE_KEY = "wiggle:pen-mode";
export const INPUT_MODE_EVENT = "wiggle:input-mode-change";

export function savedInputMode(storage: Pick<Storage, "getItem"> | null | undefined): DrawingInputMode {
  // 공유 태블릿에서는 앞 학생의 손가락 모드를 다음 학생에게 넘기지 않는다.
  // 저장소 접근은 예전 키를 읽어도 예외가 나지 않는지만 확인하고 매 작품을 펜으로 시작한다.
  if (!storage) return "pen";
  try {
    storage.getItem(INPUT_MODE_STORAGE_KEY);
    storage.getItem(LEGACY_PEN_MODE_STORAGE_KEY);
  } catch {
    // 개인정보 보호 모드처럼 storage가 막힌 환경도 첫 접촉부터 손바닥 안전을 우선한다.
  }
  return "pen";
}

export function canvasPointerCanEdit(mode: DrawingInputMode, pointerType: string) {
  if (pointerType === "touch") return mode === "finger";
  return pointerType === "pen" || pointerType === "mouse";
}

export function isQuickStationaryTap(input: { elapsedMs: number; distancePx: number }) {
  return input.elapsedMs <= 320 && input.distancePx <= 10;
}
