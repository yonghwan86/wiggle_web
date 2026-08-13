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

test("regression: a one-pixel-thick diagonal dark barrier is not crossed via corner-cutting", () => {
  // 대각선으로 한 칸씩 이어진 진한 윤곽선(계단 모양)은 8방향 채우기라면 장벽 칸끼리
  // 대각선으로만 닿아 있는 "모서리"로 반대편에 새어 나갈 수 있다. 4방향 연결에서는
  // 장벽을 넘으려면 반드시 장벽 칸 자체를 밟아야 하므로 구조적으로 이 누수가 불가능하다.
  const size = 12;
  const pixels = makeImage(size, (x, y) => (x === y ? [10, 10, 10] : [255, 255, 255]));
  const target = sampleRgb(pixels, size, size - 1, 0); // 대각선 위쪽(x>y) 삼각형에서 시작
  const mask = computeFloodFillMask(pixels, size, size - 1, 0, target);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x > y) assert.equal(mask[y * size + x], 1, `대각선 위쪽 (${x},${y})는 채워져야 한다`);
      else if (x < y) assert.equal(mask[y * size + x], 0, `대각선 반대편 (${x},${y})은 채워지면 안 된다`);
      else assert.equal(mask[y * size + x], 0, `대각선 장벽 자체 (${x},${y})는 채우면 안 된다`);
    }
  }
});

test("regression: a uniform pale pastel outline (#F4C4D4) is not consumed by the weak antialias tolerance", () => {
  // 연분홍(244,196,212)은 흰색과의 색 차가 113으로 안티에일리어싱을 봐주는 약한
  // 문턱값(200) 안에 들어온다. 하지만 균일한 색이 여러 칸 이어지면(진짜 그라데이션이
  // 아니라 아이가 고른 파스텔 선이면) "대상 색에서 더 멀어짐" 조건을 만족하지 못해
  // 첫 한 칸만 옅게 물들고 멈춰야 한다 — 절대 반대편 흰 영역까지 뚫고 들어가면 안 된다.
  const size = 10;
  const pink = [244, 196, 212];
  const pixels = makeImage(size, (x) => {
    if (x <= 3) return [255, 255, 255];
    if (x <= 6) return pink;
    return [255, 255, 255];
  });
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(columnAllMasked(mask, size, 0, 0, size - 1), true);
  assert.equal(columnAllMasked(mask, size, 3, 0, size - 1), true);
  // 장벽에 맞닿은 첫 칸(x=4)은 약한 조건으로 옅게 물들 수 있다 — 허용된 가장자리 소프트닝.
  assert.equal(columnAllMasked(mask, size, 4, 0, size - 1), true, "파스텔 선에 맞닿은 첫 칸은 옅게 물들 수 있다");
  // 균일한 색이 이어지는 두 칸째부터는 "더 멀어짐" 조건이 깨져 막혀야 한다.
  assert.equal(columnNoneMasked(mask, size, 5, 0, size - 1), true, "균일한 파스텔 색은 두 칸째부터 막혀야 한다");
  assert.equal(columnNoneMasked(mask, size, 6, 0, size - 1), true);
  // 핵심 요구사항: 파스텔 선 반대편의 흰 영역까지 뚫고 들어가면 절대 안 된다.
  for (let x = 7; x <= 9; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `x=${x}는 파스텔 선 반대편이라 채우면 안 된다`);
});

test("regression: a single-pixel pale barrier does not bridge into the opposite strong region", () => {
  // 3px 장벽 테스트는 "약한→약한" 단조 조건만으로도 막혔지만, 장벽이 딱 1px면 약한
  // 다리를 한 칸만 건너도 바로 반대편의 (색만 보면 완전히 "강한") 흰 영역에 닿는다.
  // 이전 버전은 strongTolerance 안에 드는 이웃을 부모가 약해도 무조건 ring 0으로
  // 승격시켜, 이 한 칸짜리 다리로 반대편 전체가 뚫렸다. 지금은 약한 부모에서 발견한
  // 이웃은 색이 강해도 다시 "강한"으로 승격되지 않고 같은 단조 조건을 통과해야 한다.
  const size = 8;
  const pink = [244, 196, 212]; // 흰색과의 색 차 113 — 약한 문턱값(200) 안, 강한 문턱값(90) 밖.
  const pixels = makeImage(size, (x) => {
    if (x <= 2) return [255, 255, 255];
    if (x === 3) return pink;
    return [255, 255, 255];
  });
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(columnAllMasked(mask, size, 0, 0, size - 1), true);
  assert.equal(columnAllMasked(mask, size, 2, 0, size - 1), true);
  // 장벽 그 자체(x=3)는 약한 조건으로 한 칸 옅게 물들 수 있다 — 허용된 가장자리 소프트닝.
  assert.equal(columnAllMasked(mask, size, 3, 0, size - 1), true, "1px 장벽 자체는 옅게 물들 수 있다");
  // 핵심 요구사항: 장벽 바로 반대편(색만 보면 완전한 강한 흰색)이 뚫려서는 절대 안 된다.
  for (let x = 4; x <= 7; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `x=${x}는 1px 장벽 반대편이라 채우면 안 된다`);
});

test("regression: a genuine increasing weak gradient still cannot bridge back into a new strong region", () => {
  // 진짜 그라데이션처럼 단조 증가하는 약한 사슬(100→140→180)이라도, 그 끝에서 다시
  // 대상 색(거리 0)으로 뚝 떨어지며 강한 영역이 시작되면 그 다리는 여전히 막혀야 한다 —
  // 단조 조건을 통과한 사슬이라고 해서 반대편 강한 영역으로 "리셋"되면 안 된다.
  const size = 12;
  // 회색조 v에서 흰색까지의 거리는 3*(255-v). x=3,4,5는 99→150→198로 단조 증가(모두
  // strongTolerance(90) 밖, weakTolerance(200) 안)하다가 x=6에서 다시 흰색(거리 0)으로 뚝 떨어진다.
  const gray = [255, 255, 255, 222, 205, 189, 255, 255, 255, 255, 255, 255];
  const pixels = makeImage(size, (x) => { const v = gray[x]; return [v, v, v]; });
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  for (let x = 0; x <= 5; x += 1) assert.equal(columnAllMasked(mask, size, x, 0, size - 1), true, `x=${x}는 단조 증가 사슬까지 포함해 채워져야 한다`);
  for (let x = 6; x <= 11; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `x=${x}는 사슬 반대편의 새로운 강한 영역이라 채우면 안 된다`);
});

test("works the same for a saturated non-white target (sky blue) bounded by a dark outline", () => {
  const size = 10;
  const skyBlue = [135, 206, 235];
  const pixels = makeImage(size, (x) => {
    if (x <= 3) return skyBlue;
    if (x <= 6) return [10, 10, 10];
    return skyBlue;
  });
  const target = sampleRgb(pixels, size, 0, 0);
  assert.deepEqual(target, skyBlue);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(columnAllMasked(mask, size, 0, 0, size - 1), true);
  assert.equal(columnAllMasked(mask, size, 3, 0, size - 1), true);
  for (let x = 4; x <= 9; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `x=${x}는 장벽이거나 그 반대편이라 채우면 안 된다`);
});

test("works for a dark target bounded by a bright barrier (a barrier need not be darker than the target)", () => {
  const size = 10;
  const navy = [27, 58, 87];
  const pixels = makeImage(size, (x) => {
    if (x <= 3) return navy;
    if (x <= 6) return [255, 255, 255];
    return navy;
  });
  const target = sampleRgb(pixels, size, 0, 0);
  assert.deepEqual(target, navy);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(columnAllMasked(mask, size, 0, 0, size - 1), true);
  assert.equal(columnAllMasked(mask, size, 3, 0, size - 1), true);
  for (let x = 4; x <= 9; x += 1) assert.equal(columnNoneMasked(mask, size, x, 0, size - 1), true, `x=${x}는 밝은 장벽이거나 그 반대편이라 채우면 안 된다`);
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

test("filling with the color the region already has is idempotent on the actual pixels", () => {
  // 이전 버전은 target 배열이 흰색과 같다고만 확인하고 실제 채우기 결과는 검증하지
  // 않는 공허한 테스트였다. 여기서는 mask 계산과 실제 픽셀 쓰기까지 모두 실행해,
  // 같은 색으로 다시 칠해도 픽셀 버퍼가 진짜로 변하지 않는지 확인한다.
  const size = 6;
  const color = [200, 120, 80];
  const pixels = makeImage(size, () => color);
  const original = Uint8ClampedArray.from(pixels);
  const target = sampleRgb(pixels, size, 0, 0);
  const mask = computeFloodFillMask(pixels, size, 0, 0, target);
  assert.equal(countMasked(mask), size * size, "대상 색과 완전히 같은 영역은 전부 채우기 대상으로 잡혀야 한다");
  paintFloodFillMask(pixels, mask, color);
  assert.deepEqual(Array.from(pixels), Array.from(original), "같은 색으로 다시 칠해도 픽셀 값은 그대로여야 한다");
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
