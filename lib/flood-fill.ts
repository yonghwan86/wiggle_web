// 채우기(페인트 통) 알고리즘의 순수 픽셀 연산부. 캔버스에 의존하지 않아 합성 RGBA
// 픽셀로 바로 테스트할 수 있다.
export type RGB = readonly [number, number, number];

export type FloodFillMaskOptions = {
  strongTolerance?: number;
  weakTolerance?: number;
  maxWeakRing?: number;
};

// 대상 색과 사실상 같은 "강한" 일치. 기존 알고리즘의 문턱값을 그대로 물려받는다.
export const FLOOD_FILL_STRONG_TOLERANCE = 90;
// 안티에일리어싱·수채 질감처럼 색이 점점 옅어지는 가장자리를 끌어들이는 "약한" 문턱값의 상한.
// 실제로 어디까지 끌어들일지는 아래 "단조 증가" 조건이 함께 정한다 — 이 값만으로는
// 파스텔처럼 채도가 낮지만 균일한 색(예: 연분홍 윤곽선)까지 걸러내지 못한다.
export const FLOOD_FILL_WEAK_TOLERANCE = 200;
// 약한 일치가 강한 영역에서 몇 픽셀까지 번질 수 있는지 상한. 안티에일리어싱·수채 번짐
// 폭을 넉넉히 덮으면서, 아주 완만한 그라데이션 배경 전체로 새어 나가지 않게 막는다.
export const FLOOD_FILL_MAX_WEAK_RING = 8;

// 4방향(상하좌우)만 연결한다. 대각선을 섞으면(8방향) 대각선으로 한 칸씩 그은 1px 두께
// 윤곽선의 "모서리"를 타고 반대편으로 새어 나갈 수 있다 — 4방향은 이 누수가 구조적으로
// 불가능하다(대각선 장벽을 넘으려면 반드시 장벽 칸 자체를 밟아야 한다).
const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [-1, 0], [1, 0], [0, 1],
];

export function sampleRgb(pixels: Uint8ClampedArray | Uint8Array, size: number, x: number, y: number): RGB {
  const offset = (y * size + x) * 4;
  return [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
}

function colorDistance(pixels: Uint8ClampedArray | Uint8Array, offset: number, target: RGB) {
  return Math.abs(pixels[offset] - target[0]) + Math.abs(pixels[offset + 1] - target[1]) + Math.abs(pixels[offset + 2] - target[2]);
}

/**
 * 대상 색과 강하게 일치하는 영역을 먼저 채우고(히스테리시스의 "강한" 쪽), 그 경계에서
 * 몇 픽셀 안쪽까지는 더 느슨한 문턱값으로 옅은 가장자리(안티에일리어싱, 수채 번짐)도
 * 끌어들인다("약한" 쪽). 다만 약한 픽셀은 그것을 발견한 픽셀보다 대상 색에서 "더 멀어질
 * 때"만 인정한다 — 실제 알파 블렌딩 가장자리는 강한 영역에서 멀어질수록 대상 색과의
 * 거리가 점점 커지는 진짜 그라데이션이지만, 아이가 그은 균일한 파스텔 윤곽선은 몇 픽셀이
 * 이어져도 거리 값이 그대로다. 이 "단조 증가" 조건 덕분에 균일한 연한 색 선(예: 연분홍)은
 * 첫 한 칸만 살짝 물들고 그 다음 칸부터 막혀, 약한 다리를 타고 반대편의 새 강한 영역까지
 * 이어지지 않는다. 진한 윤곽선이나 의도적으로 분리된 영역(눈, 말풍선)은 약한 문턱값보다
 * 색 차가 훨씬 커서 애초에 약한 조건도 통과하지 못한다.
 */
export function computeFloodFillMask(
  pixels: Uint8ClampedArray | Uint8Array,
  size: number,
  seedX: number,
  seedY: number,
  target: RGB,
  options: FloodFillMaskOptions = {},
): Uint8Array {
  const strongTolerance = options.strongTolerance ?? FLOOD_FILL_STRONG_TOLERANCE;
  const weakTolerance = options.weakTolerance ?? FLOOD_FILL_WEAK_TOLERANCE;
  const maxWeakRing = options.maxWeakRing ?? FLOOD_FILL_MAX_WEAK_RING;
  const mask = new Uint8Array(size * size);
  if (seedX < 0 || seedX >= size || seedY < 0 || seedY >= size) return mask;
  const ring = new Uint8Array(size * size);
  // 각 픽셀 본인의 대상 색과의 거리. 다음 픽셀이 "더 멀어졌는지" 비교하는 기준이 된다.
  const distanceAt = new Uint16Array(size * size);
  const start = seedY * size + seedX;
  mask[start] = 1;
  distanceAt[start] = colorDistance(pixels, start * 4, target);
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head += 1;
    const x = point % size;
    const y = (point - x) / size;
    const pointRing = ring[point];
    const pointDistance = distanceAt[point];
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= size || ny < 0 || ny >= size) continue;
      const neighbor = ny * size + nx;
      if (mask[neighbor]) continue;
      const distance = colorDistance(pixels, neighbor * 4, target);
      if (distance <= strongTolerance) {
        mask[neighbor] = 1;
        ring[neighbor] = 0;
        distanceAt[neighbor] = distance;
        queue.push(neighbor);
      } else if (distance <= weakTolerance && pointRing < maxWeakRing && distance > pointDistance) {
        mask[neighbor] = 1;
        ring[neighbor] = pointRing + 1;
        distanceAt[neighbor] = distance;
        queue.push(neighbor);
      }
    }
  }
  return mask;
}

export function paintFloodFillMask(pixels: Uint8ClampedArray, mask: Uint8Array, fill: RGB): void {
  for (let point = 0; point < mask.length; point += 1) {
    if (!mask[point]) continue;
    const offset = point * 4;
    pixels[offset] = fill[0];
    pixels[offset + 1] = fill[1];
    pixels[offset + 2] = fill[2];
    pixels[offset + 3] = 255;
  }
}
