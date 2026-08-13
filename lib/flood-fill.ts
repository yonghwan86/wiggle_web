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
// 안티에일리어싱·수채 질감처럼 색이 점점 옅어지는 가장자리를 끌어들이는 "약한" 문턱값.
// 어두운 윤곽선(보통 채도 낮은 남색·검정 계열)까지의 거리는 이보다 훨씬 커서 선을 넘지 않는다.
export const FLOOD_FILL_WEAK_TOLERANCE = 200;
// 약한 일치가 강한 영역에서 몇 픽셀까지 번질 수 있는지 상한. 안티에일리어싱·수채 번짐
// 폭을 넉넉히 덮으면서, 넓은 옅은 색 영역 전체로 새어 나가지 않게 막는다.
export const FLOOD_FILL_MAX_WEAK_RING = 6;

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
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
 * 끌어들인다("약한" 쪽). 진한 윤곽선이나 의도적으로 분리된 영역(눈, 말풍선)은 약한
 * 문턱값보다 색 차가 훨씬 커서 경계를 넘지 않는다. ring 값은 BFS 발견 순서 기준의
 * 근사 홉 거리이며, 완벽한 최단 경로가 아니어도 maxWeakRing 상한을 지키는 데는 충분하다.
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
  const start = seedY * size + seedX;
  mask[start] = 1;
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const point = queue[head];
    head += 1;
    const x = point % size;
    const y = (point - x) / size;
    const pointRing = ring[point];
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
        queue.push(neighbor);
      } else if (distance <= weakTolerance && pointRing < maxWeakRing) {
        mask[neighbor] = 1;
        ring[neighbor] = pointRing + 1;
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
