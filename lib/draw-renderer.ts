import type { DrawOp } from "@/lib/drawing-model";

const STICKER_EMOJI: Record<NonNullable<DrawOp["sticker"]>, string> = {
  star: "⭐", heart: "❤️", leaf: "🍃", cloud: "☁️", sparkle: "✨",
};

function rgb(hex = "#1B3A57") {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)] as const;
}

function floodFill(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  const seed = op.points?.[0]; if (!seed || !op.color) return;
  const image = context.getImageData(0, 0, size, size); const pixels = image.data;
  const sx = Math.max(0, Math.min(size - 1, Math.round(seed.x * (size - 1))));
  const sy = Math.max(0, Math.min(size - 1, Math.round(seed.y * (size - 1))));
  const start = sy * size + sx; const startOffset = start * 4;
  const target = [pixels[startOffset], pixels[startOffset + 1], pixels[startOffset + 2]] as const;
  const fill = rgb(op.color); if (fill.every((channel, index) => channel === target[index])) return;
  const mask = new Uint8Array(size * size); const stack = [start]; mask[start] = 1;
  while (stack.length) {
    const point = stack.pop()!; const x = point % size; const y = Math.floor(point / size);
    const neighbors = [x > 0 ? point - 1 : -1, x < size - 1 ? point + 1 : -1, y > 0 ? point - size : -1, y < size - 1 ? point + size : -1];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || mask[neighbor]) continue; const offset = neighbor * 4;
      const distance = Math.abs(pixels[offset] - target[0]) + Math.abs(pixels[offset + 1] - target[1]) + Math.abs(pixels[offset + 2] - target[2]);
      if (distance <= 90) { mask[neighbor] = 1; stack.push(neighbor); }
    }
  }
  const grown = new Uint8Array(mask);
  for (let point = 0; point < mask.length; point += 1) {
    if (mask[point]) continue; const x = point % size; const y = Math.floor(point / size);
    if ((x > 0 && mask[point - 1]) || (x < size - 1 && mask[point + 1]) || (y > 0 && mask[point - size]) || (y < size - 1 && mask[point + size])) grown[point] = 1;
  }
  for (let point = 0; point < grown.length; point += 1) {
    if (!grown[point]) continue; const offset = point * 4;
    pixels[offset] = fill[0]; pixels[offset + 1] = fill[1]; pixels[offset + 2] = fill[2]; pixels[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function drawShape(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  const start = op.points?.[0]; const end = op.points?.[1]; if (!start || !end || !op.shape) return;
  const left = Math.min(start.x, end.x) * size; const top = Math.min(start.y, end.y) * size;
  const width = Math.abs(end.x - start.x) * size; const height = Math.abs(end.y - start.y) * size;
  context.save(); context.strokeStyle = op.color ?? "#1B3A57"; context.lineWidth = (op.width ?? 8) * size / 1024; context.lineCap = "round"; context.lineJoin = "round"; context.beginPath();
  if (op.shape === "line") { context.moveTo(start.x * size, start.y * size); context.lineTo(end.x * size, end.y * size); }
  if (op.shape === "rectangle") context.rect(left, top, width, height);
  if (op.shape === "circle") context.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  if (op.shape === "triangle") { context.moveTo(left + width / 2, top); context.lineTo(left, top + height); context.lineTo(left + width, top + height); context.closePath(); }
  context.stroke(); context.restore();
}

export function renderDrawOperation(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  if (op.type === "fill") { floodFill(context, op, size); return; }
  if (op.type === "shape") { drawShape(context, op, size); return; }
  if (op.type === "sticker") {
    const center = op.points?.[0]; if (!center || !op.sticker) return;
    context.save(); context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.textAlign = "center"; context.textBaseline = "middle"; context.font = `${Math.round(140 * size / 1024)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.fillText(STICKER_EMOJI[op.sticker], center.x * size, center.y * size); context.restore(); return;
  }
  if (!op.points?.length) return;
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = op.tool === "eraser" ? "#000000" : (op.color ?? "#1B3A57");
  // 도구별 질감: 크레용은 반투명(기존 렌더 보존을 위해 값 불변), 수채붓은 아주 옅고 넓게 +
  // 바깥 번짐 패스(겹칠수록 물감처럼 진해짐), 마커는 가장 넓고 완전 불투명.
  context.globalAlpha = op.tool === "crayon" ? 0.62 : op.tool === "watercolor" ? 0.3 : 1;
  const baseWidth = (op.width ?? 8) * (op.tool === "marker" ? 1.6 : op.tool === "watercolor" ? 2 : 1) * size / 1024;
  context.lineWidth = baseWidth;
  // 새 연필(pencil)만 필압으로 굵기가 변한다. 기존 "pen" 획에는 실필압이 이미 기록돼 있어
  // 배율을 적용하면 저장 당시 이미지와 재생이 어긋나므로, pen은 예전과 동일한 균일 굵기로 남긴다.
  if (op.tool === "pencil" && op.points.length > 1) {
    for (let index = 1; index < op.points.length; index += 1) {
      const start = op.points[index - 1]; const end = op.points[index];
      const pressure = ((start.pressure ?? 0.5) + (end.pressure ?? 0.5)) / 2;
      context.lineWidth = baseWidth * Math.max(0.35, Math.min(1.5, 0.5 + pressure));
      context.beginPath(); context.moveTo(start.x * size, start.y * size); context.lineTo(end.x * size, end.y * size); context.stroke();
    }
    context.restore(); return;
  }
  if (op.tool === "pencil") context.lineWidth = baseWidth * Math.max(0.35, Math.min(1.5, 0.5 + (op.points[0].pressure ?? 0.5)));
  context.beginPath(); context.moveTo(op.points[0].x * size, op.points[0].y * size);
  for (const point of op.points.slice(1)) context.lineTo(point.x * size, point.y * size);
  if (op.points.length === 1) context.lineTo(op.points[0].x * size + 0.1, op.points[0].y * size + 0.1);
  if (op.tool === "watercolor") {
    // 같은 경로를 넓고 옅게 한 번 더 그어 가장자리 번짐을 만든다. (결정적 — 재생·타임랩스 동일)
    context.globalAlpha = 0.12; context.lineWidth = baseWidth * 1.35; context.stroke();
    context.globalAlpha = 0.3; context.lineWidth = baseWidth;
  }
  context.stroke(); context.restore();
}

export function resetDrawingCanvas(context: CanvasRenderingContext2D, size: number) {
  context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.clearRect(0, 0, size, size); context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size);
}
