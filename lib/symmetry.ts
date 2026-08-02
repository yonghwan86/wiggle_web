// 확장자 포함 상대 임포트: node --test가 lib을 직접 로드하므로 "@/lib" 별칭이나 무확장 경로는 죽는다.
// 타입은 type 전용으로 가져와야 node의 타입 스트리핑에서 존재하지 않는 export를 찾지 않는다.
import { roundUnit } from "./drawing-model.ts";
import type { DrawOp } from "./drawing-model.ts";

// 좌우 대칭은 스키마 확장 없이 "미러 스트로크를 별도 op으로 함께 append"로 구현한다.
// 미러 op은 원본 clientOpId 뒤에 "m"을 붙인다. 원본 id는 UUID hex(0-9a-f)로 끝나므로
// "m"으로 끝나는 clientOpId는 미러 op뿐이고, 저장·재로딩 뒤에도 쌍을 복원할 수 있다.
export const MIRROR_SUFFIX = "m";

export function mirrorOp(op: DrawOp): DrawOp {
  return {
    ...op,
    opId: `${op.opId}${MIRROR_SUFFIX}`,
    clientOpId: `${op.clientOpId}${MIRROR_SUFFIX}`,
    points: op.points?.map((point) => ({ ...point, x: roundUnit(1 - point.x) })),
  };
}

export function isMirrorOf(base: DrawOp | undefined, candidate: DrawOp | undefined) {
  return Boolean(base && candidate && candidate.clientOpId === `${base.clientOpId}${MIRROR_SUFFIX}`);
}

// 되돌리기 한 번이 지워야 할 op 수. 마지막 op이 직전 op의 미러면 쌍(2)을 함께 지운다.
// 미러 op 하나만 지우면 화면에 반쪽 획이 남아 아이가 이해할 수 없는 상태가 된다.
export function undoGroupSize(ops: readonly DrawOp[]) {
  if (!ops.length) return 0;
  return isMirrorOf(ops.at(-2), ops.at(-1)) ? 2 : 1;
}
