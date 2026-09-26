// 핀치 확대·이동의 순수 계산. 화면 표시는 CSS transform으로만 바꾸고
// 문서 좌표는 getBoundingClientRect 기반이라 별도 역변환이 필요 없다.
// (회전 없는 scale+translate에서는 변환된 사각형 안의 비율이 곧 정규화 좌표다.)
//
// 틀(frame)은 화면에서 도화지가 보이는 자리, 종이(paper)는 1배일 때 도화지 크기다.
// 2026-09-15부터 도화지는 틀을 꽉 채운다 — 이미 그린 그림이 틀보다 옆으로 좁은 비율이면 종이가 틀 폭에 맞춰
// 세로로 넘치고, 1배에서도 위아래로 옮겨 본다. 종이와 틀이 같으면 예전 계산과 같다.

export type CanvasView = { scale: number; x: number; y: number };
export const IDENTITY_VIEW: CanvasView = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/* 넓은 도화지(2026-09-20)는 100%가 곧 "도화지 전체"가 아니다 — 도화지 전체가 틀에 맞는 배율이 1/span이다.
 * 거기서 한 칸(단추 한 번 = 1.5배) 더 줄일 수 있다: 종이 끝과 그 바깥 바탕이 보인다
 * (2026-09-23 사용자 요청 "막 축소를 많이 하면 도화지가 아닌 부분도 보이게"). 옛 작품(span 1)도 같은 규칙이다.
 * 그래서 아래 계산들은 배율 한계를 인자로 받는다. 넘기지 않으면 예전처럼 1~4배다. */
export const OVERVIEW_STEP = 1.5;
/** 그 도화지에서 더 줄일 수 없는 배율. 도화지 전체가 보이는 배율보다 한 칸 아래다. */
export const minScaleFor = (span: number) => 1 / span / OVERVIEW_STEP;
export type ScaleLimits = { min?: number; max?: number };
const limitScale = (scale: number, limits?: ScaleLimits) =>
  Math.max(limits?.min ?? MIN_SCALE, Math.min(limits?.max ?? MAX_SCALE, scale));

type Touch = { x: number; y: number };

/* 한 축의 이동량. 종이가 틀보다 크면 가장자리가 틀 안으로 끌려 들어오지 않게 가두고,
 * 작으면 가운데에 놓는다 — 끝까지 축소해 종이 바깥까지 보는 상태다(2026-09-23).
 * 종전에는 작을 때 0으로 붙여 종이가 왼쪽 위에 치우쳤다. */
const clampAxis = (offset: number, frame: number, paper: number) =>
  paper <= frame ? (frame - paper) / 2 : Math.max(frame - paper, Math.min(0, offset));

// 확대 배율과 이동량을 틀에 맞춘다.
export function clampView(view: CanvasView, frameWidth: number, frameHeight = frameWidth, paperWidth = frameWidth, paperHeight = frameHeight, limits?: ScaleLimits): CanvasView {
  const scale = limitScale(view.scale, limits);
  return {
    scale,
    x: clampAxis(view.x, frameWidth, paperWidth * scale),
    y: clampAxis(view.y, frameHeight, paperHeight * scale),
  };
}

// 한 점(단추로 누르면 틀 가운데, 트랙패드면 커서 자리)을 붙잡은 채 배율만 바꾼다.
export function zoomView(view: CanvasView, nextScale: number, center: Touch, frameWidth: number, frameHeight: number, paperWidth = frameWidth, paperHeight = frameHeight, limits?: ScaleLimits): CanvasView {
  const scale = limitScale(nextScale, limits);
  const applied = scale / view.scale;
  return clampView({ scale, x: center.x - (center.x - view.x) * applied, y: center.y - (center.y - view.y) * applied }, frameWidth, frameHeight, paperWidth, paperHeight, limits);
}

// 두 손가락의 이전/현재 위치로 다음 뷰를 만든다. 두 손가락 중점이 가리키던
// 문서 지점이 손가락을 따라오도록 scale과 translate를 함께 푼다.
export function pinchView(view: CanvasView, before: [Touch, Touch], after: [Touch, Touch], frameWidth: number, frameHeight = frameWidth, paperWidth = frameWidth, paperHeight = frameHeight, limits?: ScaleLimits): CanvasView {
  const spanBefore = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
  const spanAfter = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
  const ratio = spanBefore > 0 ? spanAfter / spanBefore : 1;
  const scale = limitScale(view.scale * ratio, limits);
  const applied = scale / view.scale;
  const centerBefore = { x: (before[0].x + before[1].x) / 2, y: (before[0].y + before[1].y) / 2 };
  const centerAfter = { x: (after[0].x + after[1].x) / 2, y: (after[0].y + after[1].y) / 2 };
  return clampView({
    scale,
    x: centerAfter.x - (centerBefore.x - view.x) * applied,
    y: centerAfter.y - (centerBefore.y - view.y) * applied,
  }, frameWidth, frameHeight, paperWidth, paperHeight, limits);
}

/** 틀을 빈틈 없이 덮는 1배 종이 크기(가로 1024 기준 문서 세로 docHeight). */
export function coverPaper(frameWidth: number, frameHeight: number, docHeight: number) {
  if (!(frameWidth > 0) || !(frameHeight > 0)) return { width: frameWidth, height: frameHeight };
  return frameWidth / frameHeight >= 1024 / docHeight
    ? { width: frameWidth, height: frameWidth * docHeight / 1024 }
    : { width: frameHeight * 1024 / docHeight, height: frameHeight };
}
