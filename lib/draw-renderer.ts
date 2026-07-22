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
  context.strokeStyle = op.tool === "eraser" ? "#000000" : (op.color ?? "#1B3A57"); context.globalAlpha = op.tool === "crayon" ? 0.62 : 1; context.lineWidth = (op.width ?? 8) * size / 1024;
  context.beginPath(); context.moveTo(op.points[0].x * size, op.points[0].y * size);
  for (const point of op.points.slice(1)) context.lineTo(point.x * size, point.y * size);
  if (op.points.length === 1) context.lineTo(op.points[0].x * size + 0.1, op.points[0].y * size + 0.1);
  context.stroke(); context.restore();
}

export function resetDrawingCanvas(context: CanvasRenderingContext2D, size: number) {
  context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.clearRect(0, 0, size, size); context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size);
}
