import type { DrawOp } from "./drawing-model";

export type LessonStepActivity = "color" | "free" | undefined;

export type LessonStepBaseline = {
  opCount: number;
  lastClientOpId: string | null;
};

export type LessonStepProgress = {
  baseline: LessonStepBaseline;
  completed: boolean;
  skipped: boolean;
};

export function createLessonStepBaseline(ops: DrawOp[]): LessonStepBaseline {
  return {
    opCount: ops.length,
    lastClientOpId: ops.at(-1)?.clientOpId ?? null,
  };
}

export function isLessonStepProgress(value: unknown): value is LessonStepProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const progress = value as Partial<LessonStepProgress>;
  const baseline = progress.baseline as Partial<LessonStepBaseline> | undefined;
  return Boolean(
    baseline
      && Number.isInteger(baseline.opCount)
      && Number(baseline.opCount) >= 0
      && (baseline.lastClientOpId === null || typeof baseline.lastClientOpId === "string")
      && typeof progress.completed === "boolean"
      && typeof progress.skipped === "boolean",
  );
}

// 되돌리기 뒤 새로 그린 경우처럼 op 개수가 시작 때와 같아도 마지막 ID가 바뀌면
// 새 동작으로 본다. 반대로 새 선을 그렸다가 되돌린 경우에는 시작 상태와 같아져
// 완료 동작으로 남지 않는다.
export function lessonStepNewOps(ops: DrawOp[], baseline: LessonStepBaseline) {
  if (baseline.opCount === 0) return ops;
  if (ops.length < baseline.opCount) return [];

  const baselineIndex = baseline.lastClientOpId
    ? ops.findIndex((op) => op.clientOpId === baseline.lastClientOpId)
    : -1;
  if (baselineIndex >= 0) return ops.slice(baselineIndex + 1);

  if (ops.length >= baseline.opCount && ops.at(-1)?.clientOpId !== baseline.lastClientOpId) {
    return ops.slice(Math.max(0, baseline.opCount - 1));
  }
  return [];
}

export function isMeaningfulLessonOp(op: DrawOp, activity: LessonStepActivity) {
  if (op.type === "stroke" && op.tool === "eraser") return false;
  if (activity !== "color") return op.type === "stroke" || op.type === "fill" || op.type === "shape" || op.type === "sticker" || (op.type === "text" && !op.deleted);

  if (op.type === "fill") return true;
  if (op.type === "shape") return op.filled === true || (typeof op.color === "string" && op.color.toUpperCase() !== "#1B3A57");
  if (op.type === "stroke") {
    return op.tool === "crayon"
      || op.tool === "watercolor"
      || op.tool === "marker"
      || (typeof op.color === "string" && op.color.toUpperCase() !== "#1B3A57");
  }
  return false;
}

// 점선 수를 그대로 요구하면 한 번에 이어 그린 아이를 막는다. 큰 부분은 한 동작,
// 여러 특징이 있는 단계도 최대 세 동작까지만 확인해 부담을 낮춘다.
export function minimumLessonStepActions(guideTraceCount: number, activity: LessonStepActivity) {
  if (activity === "color" || activity === "free" || guideTraceCount <= 0) return 1;
  return Math.max(1, Math.min(3, Math.ceil(guideTraceCount / 3)));
}

export function lessonStepActionStatus(
  ops: DrawOp[],
  progress: LessonStepProgress | null,
  guideTraceCount: number,
  activity: LessonStepActivity,
) {
  const required = minimumLessonStepActions(guideTraceCount, activity);
  if (!progress) return { ready: false, actionCount: 0, required, remaining: required };
  if (progress.completed) return { ready: true, actionCount: required, required, remaining: 0 };

  const actionCount = lessonStepNewOps(ops, progress.baseline).filter((op) => isMeaningfulLessonOp(op, activity)).length;
  return {
    ready: actionCount >= required,
    actionCount,
    required,
    remaining: Math.max(0, required - actionCount),
  };
}
