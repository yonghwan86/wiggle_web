import { drawingTextGraphemes, visibleDrawOperations, type DrawOp } from "@/lib/drawing-model";

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
  const centerX = left + width / 2; const centerY = top + height / 2;
  context.save(); context.strokeStyle = op.color ?? "#1B3A57"; context.fillStyle = op.color ?? "#1B3A57"; context.lineWidth = (op.width ?? 8) * size / 1024; context.lineCap = "round"; context.lineJoin = "round"; context.beginPath();
  if (op.shape === "line") { context.moveTo(start.x * size, start.y * size); context.lineTo(end.x * size, end.y * size); }
  if (op.shape === "rectangle") context.rect(left, top, width, height);
  if (op.shape === "rounded-rectangle") context.roundRect(left, top, width, height, Math.min(width, height) * .2);
  if (op.shape === "circle") context.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);
  if (op.shape === "triangle") { context.moveTo(left + width / 2, top); context.lineTo(left, top + height); context.lineTo(left + width, top + height); context.closePath(); }
  if (op.shape === "star") {
    const outer = Math.min(width, height) / 2; const inner = outer * .46;
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 === 0 ? outer : inner; const angle = -Math.PI / 2 + point * Math.PI / 5;
      const x = centerX + Math.cos(angle) * radius; const y = centerY + Math.sin(angle) * radius;
      if (point === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
  }
  if (op.shape === "heart") {
    context.moveTo(centerX, top + height);
    context.bezierCurveTo(left - width * .08, top + height * .58, left + width * .03, top + height * .12, centerX, top + height * .36);
    context.bezierCurveTo(left + width * .97, top + height * .12, left + width * 1.08, top + height * .58, centerX, top + height);
    context.closePath();
  }
  if (op.shape === "arrow") {
    const direction = end.x >= start.x ? 1 : -1; const baseX = direction > 0 ? left : left + width; const tipX = direction > 0 ? left + width : left;
    const neckX = baseX + direction * width * .58; const topStem = centerY - height * .16; const bottomStem = centerY + height * .16;
    context.moveTo(baseX, topStem); context.lineTo(neckX, topStem); context.lineTo(neckX, top); context.lineTo(tipX, centerY); context.lineTo(neckX, top + height); context.lineTo(neckX, bottomStem); context.lineTo(baseX, bottomStem); context.closePath();
  }
  if (op.shape === "curve") {
    context.moveTo(start.x * size, start.y * size);
    context.bezierCurveTo(start.x * size + (end.x - start.x) * size * .28, start.y * size - (end.y - start.y) * size * .55, start.x * size + (end.x - start.x) * size * .72, end.y * size + (end.y - start.y) * size * .55, end.x * size, end.y * size);
  }
  if (op.shape === "cloud") {
    context.moveTo(left + width * .18, top + height * .78);
    context.bezierCurveTo(left - width * .02, top + height * .75, left - width * .02, top + height * .42, left + width * .22, top + height * .42);
    context.bezierCurveTo(left + width * .24, top + height * .14, left + width * .55, top + height * .04, left + width * .68, top + height * .29);
    context.bezierCurveTo(left + width * .98, top + height * .22, left + width * 1.08, top + height * .62, left + width * .84, top + height * .76);
    context.bezierCurveTo(left + width * .66, top + height * .91, left + width * .34, top + height * .88, left + width * .18, top + height * .78); context.closePath();
  }
  if (op.filled && op.shape !== "line" && op.shape !== "curve") context.fill();
  context.stroke(); context.restore();
}

function smoothedPoints(points: NonNullable<DrawOp["points"]>) {
  if (points.length < 3) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1]; const next = points[index + 1];
    return { ...point, x: (previous.x + point.x * 2 + next.x) / 4, y: (previous.y + point.y * 2 + next.y) / 4 };
  });
}

function eraseWithSquareFootprint(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  if (!op.points?.length) return;
  const footprint = Math.max(1, (op.width ?? 8) * size / 1024); const half = footprint / 2;
  context.save(); context.globalCompositeOperation = "destination-out"; context.globalAlpha = 1; context.fillStyle = "#000";
  const stamp = (x: number, y: number) => context.fillRect(x * size - half, y * size - half, footprint, footprint);
  stamp(op.points[0].x, op.points[0].y);
  for (let index = 1; index < op.points.length; index += 1) {
    const start = op.points[index - 1]; const end = op.points[index]; const distance = Math.hypot((end.x - start.x) * size, (end.y - start.y) * size);
    const steps = Math.max(1, Math.ceil(distance / Math.max(1, footprint * .22)));
    for (let step = 1; step <= steps; step += 1) {
      const amount = step / steps; stamp(start.x + (end.x - start.x) * amount, start.y + (end.y - start.y) * amount);
    }
  }
  context.restore();
}

function roundedPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const characters = drawingTextGraphemes(text);
  const lines: string[] = [];
  let line = "";
  for (const character of characters) {
    const candidate = `${line}${character}`;
    if (line && context.measureText(candidate).width > maxWidth && lines.length < maxLines - 1) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

function drawText(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  const center = op.points?.[0];
  if (!center || !op.text || !op.textKind || !op.fontSize || op.deleted) return;
  const scale = size / 1024;
  const fontSize = op.fontSize * scale;
  const x = center.x * size;
  const y = center.y * size;
  const isTitle = op.textKind === "title";
  const isSpeech = op.textKind === "speech";
  const maxWidth = size * (isTitle ? 0.82 : isSpeech ? 0.58 : 0.55);
  const lineHeight = fontSize * 1.28;
  const [red, green, blue] = rgb(op.color);
  const lightInk = red * 0.299 + green * 0.587 + blue * 0.114 > 185;
  const outlineColor = lightInk ? "rgba(27,58,87,.96)" : "rgba(255,255,255,.96)";
  context.save();
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${isTitle ? 800 : 700} ${Math.round(fontSize)}px "Arial Rounded MT Bold", "Noto Sans KR", "Apple SD Gothic Neo", sans-serif`;
  const lines = isSpeech ? wrapText(context, op.text, maxWidth, 2) : [op.text];
  const measuredWidth = Math.min(maxWidth, Math.max(...lines.map((line) => context.measureText(line).width)));
  const paddingX = 22 * scale;
  const paddingY = 16 * scale;
  if (!isTitle) {
    const bubbleWidth = measuredWidth + paddingX * 2;
    const bubbleHeight = Math.max(lineHeight, lines.length * lineHeight) + paddingY * 2;
    const left = x - bubbleWidth / 2;
    const top = y - bubbleHeight / 2;
    context.fillStyle = "rgba(255,255,255,.94)";
    context.strokeStyle = lightInk ? "#5B7FA0" : op.color ?? "#1B3A57";
    context.lineWidth = Math.max(2, 3 * scale);
    roundedPath(context, left, top, bubbleWidth, bubbleHeight, 18 * scale);
    context.fill();
    context.stroke();
    if (isSpeech) {
      context.beginPath();
      context.moveTo(x + bubbleWidth * 0.18, top + bubbleHeight - 2 * scale);
      context.lineTo(x + bubbleWidth * 0.30, top + bubbleHeight + 24 * scale);
      context.lineTo(x + bubbleWidth * 0.34, top + bubbleHeight - 2 * scale);
      context.closePath();
      context.fill();
      context.stroke();
    }
  }
  context.fillStyle = op.color ?? "#1B3A57";
  if (isTitle) {
    context.strokeStyle = outlineColor;
    context.lineWidth = Math.max(3, 8 * scale);
    context.lineJoin = "round";
    context.strokeText(op.text, x, y, maxWidth);
    context.fillText(op.text, x, y, maxWidth);
  } else {
    const topLineY = y - ((lines.length - 1) * lineHeight) / 2;
    context.strokeStyle = outlineColor;
    context.lineWidth = Math.max(1.5, 3 * scale);
    context.lineJoin = "round";
    lines.forEach((line, index) => {
      context.strokeText(line, x, topLineY + index * lineHeight, maxWidth);
      context.fillText(line, x, topLineY + index * lineHeight, maxWidth);
    });
  }
  context.restore();
}

export function renderDrawOperation(context: CanvasRenderingContext2D, op: DrawOp, size: number) {
  if (op.type === "fill") { floodFill(context, op, size); return; }
  if (op.type === "shape") { drawShape(context, op, size); return; }
  if (op.type === "text") { drawText(context, op, size); return; }
  if (op.type === "sticker") {
    const center = op.points?.[0]; if (!center || !op.sticker) return;
    context.save(); context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.textAlign = "center"; context.textBaseline = "middle"; context.font = `${Math.round(140 * size / 1024)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    context.fillText(STICKER_EMOJI[op.sticker], center.x * size, center.y * size); context.restore(); return;
  }
  if (!op.points?.length) return;
  if (op.tool === "eraser" && op.squareEraser) { eraseWithSquareFootprint(context, op, size); return; }
  const points = op.smoothed ? smoothedPoints(op.points) : op.points;
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = op.color ?? "#1B3A57";
  // 도구별 질감: 크레용은 반투명(기존 렌더 보존을 위해 값 불변), 수채붓은 아주 옅고 넓게 +
  // 바깥 번짐 패스(겹칠수록 물감처럼 진해짐), 마커는 가장 넓고 완전 불투명.
  context.globalAlpha = op.tool === "crayon" ? 0.62 : op.tool === "watercolor" ? 0.3 : 1;
  const baseWidth = (op.width ?? 8) * (op.tool === "marker" ? 1.6 : op.tool === "watercolor" ? 2 : 1) * size / 1024;
  context.lineWidth = baseWidth;
  // 새 연필(pencil)만 필압으로 굵기가 변한다. 기존 "pen" 획에는 실필압이 이미 기록돼 있어
  // 배율을 적용하면 저장 당시 이미지와 재생이 어긋나므로, pen은 예전과 동일한 균일 굵기로 남긴다.
  if (op.tool === "pencil" && points.length > 1) {
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]; const end = points[index];
      const pressure = ((start.pressure ?? 0.5) + (end.pressure ?? 0.5)) / 2;
      context.lineWidth = baseWidth * Math.max(0.35, Math.min(1.5, 0.5 + pressure));
      context.beginPath(); context.moveTo(start.x * size, start.y * size); context.lineTo(end.x * size, end.y * size); context.stroke();
    }
    context.restore(); return;
  }
  if (op.tool === "pencil") context.lineWidth = baseWidth * Math.max(0.35, Math.min(1.5, 0.5 + (points[0].pressure ?? 0.5)));
  context.beginPath(); context.moveTo(points[0].x * size, points[0].y * size);
  for (const point of points.slice(1)) context.lineTo(point.x * size, point.y * size);
  if (points.length === 1) context.lineTo(points[0].x * size + 0.1, points[0].y * size + 0.1);
  if (op.tool === "watercolor") {
    // 같은 경로를 넓고 옅게 한 번 더 그어 가장자리 번짐을 만든다. (결정적 — 재생·타임랩스 동일)
    context.globalAlpha = 0.12; context.lineWidth = baseWidth * 1.35; context.stroke();
    context.globalAlpha = 0.3; context.lineWidth = baseWidth;
  }
  context.stroke(); context.restore();
}

export function renderDrawDocument(context: CanvasRenderingContext2D, ops: readonly DrawOp[], size: number, limit = ops.length) {
  for (const op of visibleDrawOperations(ops, limit)) renderDrawOperation(context, op, size);
}

export function resetDrawingCanvas(context: CanvasRenderingContext2D, size: number) {
  context.globalCompositeOperation = "source-over"; context.globalAlpha = 1; context.clearRect(0, 0, size, size); context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size);
}
