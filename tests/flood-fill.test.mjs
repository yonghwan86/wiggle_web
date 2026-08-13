import assert from "node:assert/strict";
import test from "node:test";
import { computeFloodFillMask, paintFloodFillMask, sampleRgb } from "../lib/flood-fill.ts";

function makeImage(size, painter) {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = painter(x, y);
      const offset = (y * size + x) * 4;
      pixels[offset] = r; pixels[offset + 1] = g; pixels[offset + 2] = b; pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function countMasked(mask) {
  let count = 0;
  for (const value of mask) if (value) count += 1;
  return count;
}

function columnAllMasked(mask, size, x, yFrom, yTo) {
  for (let y = yFrom; y <= yTo; y += 1) if (!mask[y * size + x]) return false;
  return true;
}

function columnNoneMasked(mask, size, x, yFrom, yTo) {
  for (let y = yFrom; y <= yTo; y += 1) if (mask[y * size + x]) return false;
  return true;
}

// 수정 전 draw-renderer.ts의 floodFill이 쓰던 그대로의 로직(강한 문턱값 90 + 무조건
// 1겹 팽창)을 여기에만 남겨 회귀를 증명한다. 실제 코드에는 더 이상 존재하지 않는다.
function legacyFloodFillMask(pixels, size, seedX, seedY, target) {
  const start = seedY * size + seedX;
  const mask = new Uint8Array(size * size);
  const stack = [start];
  mask[start] = 1;
  while (stack.length) {
    const point = stack.pop();
    const x = point % size; const y = Math.floor(point / size);
    const neighbors = [x > 0 ? point - 1 : -1, x < size - 1 ? point + 1 : -1, y > 0 ? point - size : -1, y < size - 1 ? point + size : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || mask[neighbor]) continue;
      const offset = neighbor * 4;
      const distance = Math.abs(pixels[offset] - target[0]) + Math.abs(pixels[offset + 1] - target[1]) + Math.abs(pixels[offset + 2] - target[2]);
      if (distance <= 90) { mask[neighbor] = 1; stack.push(neighbor); }
    }
  }
  const grown = new Uint8Array(mask);
  for (let point = 0; point < mask.length; point += 1) {
    if (mask[point]) continue;
    const x = point % size; const y = Math.floor(point / size);
    if ((x > 0 && mask[point - 1]) || (x < size - 1 && mask[point + 1]) || (y > 0 && mask[point - size]) || (y < size - 1 && mask[point + size])) grown[point] = 1;
  }
  return grown;
}

test("flat region fills completely with no gaps", () => {
  const size = 6;
  const pixels = makeImage(size, () => [255, 255, 255]);
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(countMasked(mask), size * size);
});

test("regression: multi-pixel anti-aliased/textured edge no longer leaves white slivers", () => {
  // x=0..5 배경(대상색), x=6..8은 안티에일리어싱·수채 번짐처럼 점점 옅어지는 전이대,
  // x=9..11은 진한 획 본체(대상과 확실히 다른 색이라 절대 채워지면 안 된다).
  const size = 12;
  const gray = [255, 255, 255, 255, 255, 255, 210, 195, 189, 100, 100, 100];
  const pixels = makeImage(size, (x) => { const v = gray[x]; return [v, v, v]; });
  const target = sampleRgb(pixels, size, 0, 0);

  const legacy = legacyFloodFillMask(pixels, size, 0, 0, target);
  // 옛 알고리즘: 강한 영역(x<=5) + 무조건 1겹(x=6)까지만 칠해지고, x=7,8은 흰 슬리버로 남는다.
  assert.equal(columnAllMasked(legacy, size, 6, 0, size - 1), true);
  assert.equal(columnNoneMasked(legacy, size, 7, 0, size - 1), true, "옛 알고리즘은 x=7 전이 픽셀을 못 채워야 회귀가 증명된다");
  assert.equal(columnNoneMasked(legacy, size, 8, 0, size - 1), true);

  const fixed = computeFloodFillMask(pixels, size, 0, 0, target);
  for (let x = 0; x <= 8; x += 1) assert.equal(columnAllMasked(fixed, size, x, 0, size - 1), true, `x=${x}는 전이대까지 포함해 완전히 채워져야 한다`);
  for (let x = 9; x <= 11; x += 1) assert.equal(columnNoneMasked(fixed, size, x, 0, size - 1), true, `x=${x}는 진한 획 본체라 채우면 안 된다`);
});

test("small enclosed target-colored island stays unfilled when disconnected", () => {
  // 왼쪽 큰 배경(x0..4)은 씨앗과 이어져 있다. 오른쪽 섬(x9..11,y5..7)은 같은 흰색이지만
  // 회색 장벽(x5..8)에 막혀 연결되지 않으므로 채워지면 안 된다.
  const size = 14;
  const pixels = makeImage(size, (x, y) => {
    if (x <= 4) return [255, 255, 255];
    if (x >= 9 && x <= 11 && y >= 5 && y <= 7) return [255, 255, 255];
    return [150, 150, 150];
  });
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  for (let y = 0; y < size; y += 1) for (let x = 0; x <= 4; x += 1) assert.equal(mask[y * size + x], 1, `배경 (${x},${y})는 채워져야 한다`);
  for (let y = 5; y <= 7; y += 1) for (let x = 9; x <= 11; x += 1) assert.equal(mask[y * size + x], 0, `분리된 섬 (${x},${y})은 채우면 안 된다`);
});

test("thick dark outline barrier blocks the fill", () => {
  const size = 10;
  const pixels = makeImage(size, (x) => {
    if (x <= 3) return [255, 255, 255];
    if (x <= 6) return [0, 0, 0];
    return [255, 255, 255];
  });
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(columnAllMasked(mask, size, 0, 0, size - 1), true);
  assert.equal(columnAllMasked(mask, size, 3, 0, size - 1), true);
  for (let x = 4; x <= 6; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `윤곽선 x=${x}는 절대 채우면 안 된다`);
  for (let x = 7; x <= 9; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `장벽 건너 반대쪽 x=${x}는 새어 들어가면 안 된다`);
});

test("intentional larger closed region (eye) is not bled into from the background", () => {
  const size = 20;
  const centerX = 13; const centerY = 10;
  const pixels = makeImage(size, (x, y) => {
    const distance = Math.hypot(x - centerX, y - centerY);
    if (distance <= 2) return [255, 255, 255]; // 눈 안쪽 (배경과 같은 흰색이지만 분리되어야 함)
    if (distance <= 4) return [20, 20, 20]; // 눈 윤곽선
    return [255, 255, 255]; // 배경
  });
  const target = sampleRgb(pixels, size, 1, 1);
  const mask = computeFloodFillMask(pixels, size, 1, 1, target);
  assert.equal(mask[1 * size + 1], 1, "씨앗 지점은 채워져야 한다");
  assert.equal(mask[0 * size + 0], 1, "배경 모서리도 채워져야 한다");
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - centerX, y - centerY);
      if (distance <= 4) assert.equal(mask[y * size + x], 0, `눈 안쪽/윤곽선 (${x},${y})은 배경 채우기가 새어 들어가면 안 된다`);
    }
  }
});

test("same-color refill is a no-op the caller can detect", () => {
  const size = 6;
  const pixels = makeImage(size, () => [255, 255, 255]);
  const target = sampleRgb(pixels, size, 0, 0);
  assert.deepEqual(target, [255, 255, 255]);
});

test("paintFloodFillMask writes the fill color only to masked pixels and forces full alpha", () => {
  const size = 4;
  const pixels = makeImage(size, () => [255, 255, 255]);
  pixels[3] = 0; // 대상 픽셀(0,0)의 알파를 일부러 낮춰 강제 불투명화를 확인한다.
  const mask = new Uint8Array(size * size);
  mask[0] = 1; // (0,0)만 채운다.
  paintFloodFillMask(pixels, mask, [10, 20, 30]);
  assert.deepEqual([pixels[0], pixels[1], pixels[2], pixels[3]], [10, 20, 30, 255]);
  assert.deepEqual([pixels[4], pixels[5], pixels[6], pixels[7]], [255, 255, 255, 255]);
});

test("stays within bounded memory and time on a 1024x1024 canvas", () => {
  const size = 1024;
  const pixels = makeImage(size, () => [255, 255, 255]);
  const target = sampleRgb(pixels, size, 0, 0);
  const started = performance.now();
  const mask = computeFloodFillMask(pixels, size, 512, 512, target);
  const elapsedMs = performance.now() - started;
  assert.equal(countMasked(mask), size * size);
  assert.ok(elapsedMs < 5000, `1024x1024 채우기가 너무 오래 걸림: ${elapsedMs}ms`);
});
