// 핀치 확대·이동의 순수 계산. 화면 표시는 CSS transform으로만 바꾸고
// 문서 좌표는 getBoundingClientRect 기반이라 별도 역변환이 필요 없다.
// (회전 없는 scale+translate에서는 변환된 사각형 안의 비율이 곧 정규화 좌표다.)

export type CanvasView = { scale: number; x: number; y: number };
export const IDENTITY_VIEW: CanvasView = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;

type Touch = { x: number; y: number };

// 확대 배율과 이동량을 화면(래퍼) 크기 안에 가둔다. 캔버스 가장자리가
// 래퍼 안쪽으로 끌려 들어와 빈 회색이 보이는 상태를 만들지 않는다.
export function clampView(view: CanvasView, wrapSize: number): CanvasView {
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale));
  const minOffset = wrapSize * (1 - scale);
  return {
    scale,
    x: Math.max(minOffset, Math.min(0, view.x)),
    y: Math.max(minOffset, Math.min(0, view.y)),
  };
}

// 두 손가락의 이전/현재 위치로 다음 뷰를 만든다. 두 손가락 중점이 가리키던
// 문서 지점이 손가락을 따라오도록 scale과 translate를 함께 푼다.
export function pinchView(view: CanvasView, before: [Touch, Touch], after: [Touch, Touch], wrapSize: number): CanvasView {
  const spanBefore = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
  const spanAfter = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
  const ratio = spanBefore > 0 ? spanAfter / spanBefore : 1;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, view.scale * ratio));
  const applied = scale / view.scale;
  const centerBefore = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
  const centerAfter = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
  return clampView({
    scale,
    x: centerAfter.x - (centerBefore.x - view.x) * applied,
    y: centerAfter.y - (centerBefore.y - view.y) * applied,
  }, wrapSize);
}
