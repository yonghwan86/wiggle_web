"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DrawDocument, DrawOp, emptyDocument, estimateDocumentBytes, estimateStrokeBytes, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_OPS, MAX_STROKE_POINTS, roundUnit, STROKE_WIDTHS, StrokeWidth, validateDrawDocument } from "@/lib/drawing-model";
import { renderDrawOperation, resetDrawingCanvas } from "@/lib/draw-renderer";
import { mirrorOp, undoGroupSize } from "@/lib/symmetry";
import { CanvasView, IDENTITY_VIEW, pinchView } from "@/lib/canvas-view";
import { lessonBySlug, Lesson } from "@/lib/lesson-content";
import { activeProfile, clearQueuedArtworkSaves, createSerialTaskQueue, deleteQueuedArtworkSave, flushSaves, queueSave, queuedArtworkDraft, queuedArtworkSaves, resolveArtworkDraftDisposition, studentFetch } from "@/lib/client-session";

import type { QueuedArtworkDraft } from "@/lib/client-session";
import { Logo } from "./Logo";
import { SpeakButton } from "./SpeakButton";
import { TimelapsePlayer } from "./TimelapsePlayer";
import { VoiceWhisperStatus } from "./VoiceWhisper";
import { useModalDialog } from "./useModalDialog";
import { LessonReference as LessonIllustration } from "./LessonReference";
import { StudentMessageCenter, StudentTeacherMessage } from "./StudentMessageCenter";

const PALETTE = ["#1B3A57", "#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA", "#8D6E63", "#F06292", "#4DD0E1", "#FFCC80", "#FFFFFF"];
// 기본 12색과 짝을 이루는 밝은 12색. 흰색 자리는 밝기 짝이 없어 회색을 준다.
const LIGHT_PALETTE = ["#5B7FA0", "#F8A9A4", "#FFC97E", "#FFF0A6", "#A5D6A7", "#90CAF9", "#CE93D8", "#C4A79F", "#F8BBD0", "#B2EBF2", "#FFE0B2", "#9AA7B1"];
const COLOR_NAMES: Record<string, string> = {
  "#1B3A57": "남색",
  "#E53935": "빨간색",
  "#FB8C00": "주황색",
  "#FDD835": "노란색",
  "#43A047": "초록색",
  "#1E88E5": "파란색",
  "#8E24AA": "보라색",
  "#8D6E63": "갈색",
  "#F06292": "분홍색",
  "#4DD0E1": "하늘색",
  "#FFCC80": "살구색",
  "#FFFFFF": "흰색",
  "#5B7FA0": "밝은 남색",
  "#F8A9A4": "밝은 빨간색",
  "#FFC97E": "밝은 주황색",
  "#FFF0A6": "밝은 노란색",
  "#A5D6A7": "밝은 초록색",
  "#90CAF9": "밝은 파란색",
  "#CE93D8": "밝은 보라색",
  "#C4A79F": "밝은 갈색",
  "#F8BBD0": "밝은 분홍색",
  "#B2EBF2": "밝은 하늘색",
  "#FFE0B2": "밝은 살구색",
  "#9AA7B1": "회색",
};
const STROKE_WIDTH_LABELS: Record<StrokeWidth, string> = { 3: "아주 얇게", 8: "얇게", 16: "보통", 30: "굵게", 48: "아주 굵게" };
const SHAPE_KINDS = [
  { kind: "line", icon: "─", label: "선" },
  { kind: "circle", icon: "○", label: "동그라미" },
  { kind: "triangle", icon: "△", label: "세모" },
  { kind: "rectangle", icon: "□", label: "네모" },
] as const;
const QUICK_DRAW_TOPICS = [
  { emoji: "🚀", label: "우주" },
  { emoji: "🐶", label: "강아지" },
  { emoji: "🌳", label: "마법 숲" },
  { emoji: "🚲", label: "자전거" },
];
const FAVORITE_PART_CHOICES = [
  { emoji: "🎨", label: "색", value: "내가 고른 색" },
  { emoji: "✨", label: "새로 더한 것", value: "내가 새로 더한 것" },
  { emoji: "😊", label: "표정", value: "그림 속 표정" },
  { emoji: "🖼️", label: "모두", value: "그림 전체" },
];
const FAVORITE_REASON_CHOICES = [
  { emoji: "😄", label: "재미있어", value: "그리면서 재미있어서" },
  { emoji: "🌈", label: "색이 좋아", value: "내가 고른 색이 마음에 들어서" },
  { emoji: "💡", label: "내 생각", value: "내 생각을 그림에 넣어서" },
  { emoji: "💪", label: "해냈어", value: "어려워도 끝까지 그려서" },
];
// "pencil"이 새 연필 획(필압 렌더 적용). "pen"은 이 UI가 더 만들지 않는 기존 획 값이다.
type BrushTool = "pencil" | "crayon" | "marker" | "watercolor";
type Tool = BrushTool | "eraser";
type StrokeMeta = { tool: Tool; color: string; width: StrokeWidth };
type StudioTool = Tool | "fill" | "shape";
type ShapeKind = "line" | "circle" | "triangle" | "rectangle";
type GuidePhase = "independent" | "demo" | "practice";
type TracePoint = { x: number; y: number };
type GuideTrace = TracePoint[];
type ArtworkPayload = { id: string; title: string; topic: string; learningMode: string; lessonSlug: string | null; intent: string; document: DrawDocument; currentStep: number; revision: number; status: string };
type CoachingChoice = { emoji: string; label: string; answer: string };
type StudentCoaching = { question: string; choices: CoachingChoice[]; nextAction: string; observedElements: string[]; uncertain: boolean; growthEvent: string };
type GuideStep = { instruction: string; openChoice: boolean; choices: string[]; guideShape: "none" | "line" | "circle" | "triangle" | "rectangle" };
type AiGuide = { topic: string; steps: GuideStep[] };
type SaveOptions = { complete?: boolean; reflection?: Record<string, string>; currentStep?: number };

function renderDocument(canvas: HTMLCanvasElement, document: DrawDocument, size = 1024) {
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d"); if (!context) return;
  resetDrawingCanvas(context, size);
  for (const op of document.ops) renderDrawOperation(context, op, size);
}

function renderLiveStroke(canvas: HTMLCanvasElement, tool: Tool, color: string, width: StrokeWidth, points: Array<{ x: number; y: number; pressure: number }>) {
  const context = canvas.getContext("2d"); if (!context || !points.length) return;
  renderDrawOperation(context, {
    opId: "preview_op",
    clientOpId: "preview_client",
    type: "stroke",
    at: "2000-01-01T00:00:00.000Z",
    tool,
    color: tool === "eraser" ? undefined : color,
    width,
    points,
  }, canvas.width);
}

function sampleLine(points: Array<[number, number]>) {
  const trace: GuideTrace = [];
  for (let index = 1; index < points.length; index += 1) {
    const [startX, startY] = points[index - 1]; const [endX, endY] = points[index];
    const distance = Math.hypot(endX - startX, endY - startY); const segments = Math.max(8, Math.ceil(distance * 90));
    for (let segment = index === 1 ? 0 : 1; segment <= segments; segment += 1) {
      const amount = segment / segments;
      trace.push({ x: (startX + (endX - startX) * amount) * 1024, y: (startY + (endY - startY) * amount) * 1024 });
    }
  }
  return trace;
}

function sampleEllipse(x: number, y: number, rx: number, ry: number) {
  const trace: GuideTrace = [];
  for (let segment = 0; segment <= 96; segment += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * segment) / 96;
    trace.push({ x: (x + Math.cos(angle) * rx) * 1024, y: (y + Math.sin(angle) * ry) * 1024 });
  }
  return trace;
}

function sampleCurve(points: [[number, number], [number, number], [number, number], [number, number]]) {
  const trace: GuideTrace = []; const [start, first, second, end] = points;
  for (let segment = 0; segment <= 96; segment += 1) {
    const amount = segment / 96; const remaining = 1 - amount;
    trace.push({
      x: (remaining ** 3 * start[0] + 3 * remaining ** 2 * amount * first[0] + 3 * remaining * amount ** 2 * second[0] + amount ** 3 * end[0]) * 1024,
      y: (remaining ** 3 * start[1] + 3 * remaining ** 2 * amount * first[1] + 3 * remaining * amount ** 2 * second[1] + amount ** 3 * end[1]) * 1024,
    });
  }
  return trace;
}

function guideTraces(lesson: Lesson | undefined, lessonStep = 0, aiShape: GuideStep["guideShape"] = "none") {
  const traces: GuideTrace[] = [];
  for (const mark of lesson?.guide.filter((item) => item.step === lessonStep + 1) ?? []) {
    if (mark.kind === "line") traces.push(sampleLine(mark.points));
    if (mark.kind === "ellipse") traces.push(sampleEllipse(mark.x, mark.y, mark.rx, mark.ry));
    if (mark.kind === "rect") traces.push(sampleLine([[mark.x, mark.y], [mark.x + mark.width, mark.y], [mark.x + mark.width, mark.y + mark.height], [mark.x, mark.y + mark.height], [mark.x, mark.y]]));
    if (mark.kind === "curve") traces.push(sampleCurve(mark.points));
  }
  if (!lesson && aiShape === "line") traces.push(sampleLine([[.25, .51], [.75, .51]]));
  if (!lesson && aiShape === "circle") traces.push(sampleEllipse(.5, .5, .225, .225));
  if (!lesson && aiShape === "triangle") traces.push(sampleLine([[.5, .24], [.26, .74], [.74, .74], [.5, .24]]));
  if (!lesson && aiShape === "rectangle") traces.push(sampleLine([[.28, .29], [.72, .29], [.72, .7], [.28, .7], [.28, .29]]));
  return traces.filter((trace) => trace.length > 1);
}

function traceLength(trace: GuideTrace) {
  let length = 0;
  for (let index = 1; index < trace.length; index += 1) length += Math.hypot(trace[index].x - trace[index - 1].x, trace[index].y - trace[index - 1].y);
  return length;
}

function drawTrace(context: CanvasRenderingContext2D, trace: GuideTrace, distance = Number.POSITIVE_INFINITY) {
  if (trace.length < 2) return { point: trace[0], previous: trace[0] };
  context.beginPath(); context.moveTo(trace[0].x, trace[0].y);
  let travelled = 0; let point = trace[0]; let previous = trace[0];
  for (let index = 1; index < trace.length; index += 1) {
    const start = trace[index - 1]; const end = trace[index]; const segment = Math.hypot(end.x - start.x, end.y - start.y);
    if (travelled + segment >= distance) {
      const amount = segment > 0 ? Math.max(0, Math.min(1, (distance - travelled) / segment)) : 0;
      point = { x: start.x + (end.x - start.x) * amount, y: start.y + (end.y - start.y) * amount };
      previous = start; context.lineTo(point.x, point.y); break;
    }
    context.lineTo(end.x, end.y); previous = start; point = end; travelled += segment;
  }
  context.stroke();
  return { point, previous };
}

function drawStartMarker(context: CanvasRenderingContext2D, trace: GuideTrace) {
  const start = trace[0]; const next = trace[Math.min(4, trace.length - 1)];
  context.save(); context.setLineDash([]); context.globalAlpha = 1;
  context.fillStyle = "#43A047"; context.beginPath(); context.arc(start.x, start.y, 18, 0, Math.PI * 2); context.fill();
  const angle = Math.atan2(next.y - start.y, next.x - start.x);
  context.translate(start.x + Math.cos(angle) * 40, start.y + Math.sin(angle) * 40); context.rotate(angle);
  context.fillStyle = "#43A047"; context.beginPath(); context.moveTo(13, 0); context.lineTo(-9, -10); context.lineTo(-9, 10); context.closePath(); context.fill();
  context.restore();
}

function drawPencil(context: CanvasRenderingContext2D, point: TracePoint, previous: TracePoint) {
  const angle = Math.atan2(point.y - previous.y, point.x - previous.x);
  context.save(); context.translate(point.x, point.y); context.rotate(angle);
  context.shadowColor = "rgba(26,59,92,.24)"; context.shadowBlur = 12; context.shadowOffsetY = 6;
  context.fillStyle = "#FDD835"; context.strokeStyle = "#B88200"; context.lineWidth = 3; context.setLineDash([]);
  context.beginPath(); context.roundRect(-66, -17, 55, 34, 8); context.fill(); context.stroke();
  context.fillStyle = "#F2B8B5"; context.fillRect(-66, -17, 15, 34);
  context.fillStyle = "#F5D2A5"; context.beginPath(); context.moveTo(-11, -17); context.lineTo(4, 0); context.lineTo(-11, 17); context.closePath(); context.fill(); context.stroke();
  context.fillStyle = "#1B3A57"; context.beginPath(); context.moveTo(-1, -4); context.lineTo(7, 0); context.lineTo(-1, 4); context.closePath(); context.fill();
  context.restore();
}

function renderGuideFrame(canvas: HTMLCanvasElement, traces: GuideTrace[], phase: GuidePhase, progress = 0) {
  if (canvas.width !== 1024) canvas.width = 1024; if (canvas.height !== 1024) canvas.height = 1024;
  const context = canvas.getContext("2d"); if (!context) return;
  context.clearRect(0, 0, 1024, 1024); if (phase === "independent" || !traces.length) return;
  context.save(); context.strokeStyle = "#087EA8"; context.globalAlpha = 0.92; context.lineWidth = 9; context.setLineDash([20, 14]); context.lineCap = "round"; context.lineJoin = "round";
  if (phase === "demo") context.globalAlpha = .58;
  for (const trace of traces) { drawTrace(context, trace); drawStartMarker(context, trace); }
  if (phase === "demo") {
    const lengths = traces.map(traceLength); const target = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, progress));
    let remaining = target; let pencil = { point: traces[0][0], previous: traces[0][0] };
    context.strokeStyle = "#FDD835"; context.globalAlpha = .96; context.lineWidth = 16; context.setLineDash([]);
    for (let index = 0; index < traces.length; index += 1) {
      if (remaining <= 0) break;
      const distance = Math.min(lengths[index], remaining); pencil = drawTrace(context, traces[index], distance); remaining -= lengths[index];
    }
    drawPencil(context, pencil.point, pencil.previous);
  }
  context.restore();
}

function imageData(canvas: HTMLCanvasElement, size: 256 | 1024) {
  const output = document.createElement("canvas"); output.width = size; output.height = size;
  const context = output.getContext("2d"); if (!context) return "";
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size); context.drawImage(canvas, 0, 0, size, size);
  return output.toDataURL("image/png");
}

// 저장 이미지는 화면 픽셀이 아니라 저장하려는 문서에서 직접 렌더한다. 화면 캔버스에는
// 그리는 중 미리보기 같은 문서 밖 픽셀이 있을 수 있고, 그게 썸네일·완성 PNG에 섞이면 안 된다.
// (그리미에 보내는 이미지는 "아이가 지금 보는 화면"이어야 하므로 imageData를 그대로 쓴다.)
function documentImage(documentValue: DrawDocument, size: 256 | 1024) {
  const output = document.createElement("canvas");
  renderDocument(output, documentValue, size);
  return output.toDataURL("image/png");
}

// 서버 한도에 부딪히면 그 작품은 이후 모든 저장이 실패해 조용히 유실된다.
// 여유분을 두고 미리 멈춰서 아이가 완성으로 안내받게 한다.
const STROKE_POINT_SPLIT = MAX_STROKE_POINTS - 500;
const OPS_WARN_THRESHOLD = MAX_DOCUMENT_OPS - 200;
const DOCUMENT_BYTES_WARN = MAX_DOCUMENT_BYTES - 100_000;
const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_MAX_WAIT_MS = 6000;

function documentTooLarge(document: DrawDocument) {
  // 한 획도 더 담을 수 없으면 이미 가득 찬 것이다. 여유를 남기지 않으면 pointerDown이
  // 입력을 허용해 놓고 커밋이 거부돼, 문서에 없는 선이 화면과 썸네일에만 남는다.
  return document.ops.length >= OPS_WARN_THRESHOLD || estimateDocumentBytes(document) + estimateStrokeBytes(8) >= DOCUMENT_BYTES_WARN;
}

function mutationId() { return `mutation_${crypto.randomUUID().replaceAll("-", "")}`; }
function coachingRequestId() { return `coaching_${crypto.randomUUID().replaceAll("-", "")}`; }

export function DrawingStudio() {
  const params = useParams<{ id: string }>(); const search = useSearchParams();
  const requestedLesson = useMemo(() => lessonBySlug(search.get("lesson") ?? ""), [search]);
  const [artwork, setArtwork] = useState<ArtworkPayload | null>(null); const [documentState, setDocumentState] = useState<DrawDocument>(emptyDocument());
  const lesson = useMemo(() => params.id === "new" ? requestedLesson : lessonBySlug(artwork?.lessonSlug), [artwork?.lessonSlug, params.id, requestedLesson]);
  const [studioTool, setStudioTool] = useState<StudioTool>("pencil"); const [color, setColor] = useState(PALETTE[0]);
  // 그리기 굵기와 지우개 굵기를 따로 기억한다. 하나로 합치면 지우개를 한 번 쓸 때마다
  // 아이가 고른 그리기 굵기가 말없이 리셋된다.
  const [drawWidth, setDrawWidth] = useState<StrokeWidth>(16); const [eraserWidth, setEraserWidth] = useState<StrokeWidth>(48);
  const [paletteShade, setPaletteShade] = useState<"base" | "light">("base");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("line"); const [shapeStartPoint, setShapeStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [mirror, setMirror] = useState(false);
  const [view, setView] = useState<CanvasView>(IDENTITY_VIEW);
  const [penMode, setPenMode] = useState(false);
  const [redo, setRedo] = useState<DrawOp[][]>([]); const [guidePhase, setGuidePhase] = useState<GuidePhase>("independent"); const [guideDemoRun, setGuideDemoRun] = useState(0); const [guidePracticeTried, setGuidePracticeTried] = useState(false); const [saveState, setSaveState] = useState("불러오는 중"); const [editVersion, setEditVersion] = useState(0);
  const [reflectionOpen, setReflectionOpen] = useState(false); const [favoritePart, setFavoritePart] = useState(""); const [favoriteReason, setFavoriteReason] = useState("");
  // 선생님 말씀 배너는 고정 오버레이라 닫을 수 없으면 밑의 버튼을 영영 가린다.
  // 닫은 메시지 id를 기억하고, 새 메시지가 오면 다시 보여 준다.
  const [teacherMessages, setTeacherMessages] = useState<StudentTeacherMessage[]>([]);
  const [teacherViewing, setTeacherViewing] = useState(false); const [conflictRevision, setConflictRevision] = useState<number | null>(null); const [conflictDraft, setConflictDraft] = useState<QueuedArtworkDraft | null>(null);
  const [grimiOpen, setGrimiOpen] = useState(false); const [grimiLoading, setGrimiLoading] = useState(false); const [grimiError, setGrimiError] = useState("");
  // 그리미가 "선을 하나 더 그어 보자"고 하면 아이는 그려야 한다. 시트를 닫으면 코칭이 사라지므로,
  // 코칭을 유지한 채 도화지를 여는 접기 상태를 따로 둔다.
  const [grimiCollapsed, setGrimiCollapsed] = useState(false);
  const [coaching, setCoaching] = useState<(StudentCoaching & { eventId: string }) | null>(null); const [answer, setAnswer] = useState(""); const [answerLabel, setAnswerLabel] = useState(""); const [answerSaved, setAnswerSaved] = useState(false);
  const [guideTopic, setGuideTopic] = useState(""); const [aiGuide, setAiGuide] = useState<(AiGuide & { eventId: string }) | null>(null); const [aiGuideStep, setAiGuideStep] = useState(0); const [childChoice, setChildChoice] = useState("");
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [runSerial] = useState(createSerialTaskQueue);
  const [saveBranchId] = useState(() => `branch_${crypto.randomUUID().replaceAll("-", "")}`);
  const canvasRef = useRef<HTMLCanvasElement>(null); const guideRef = useRef<HTMLCanvasElement>(null); const guideAnimationRef = useRef<number | null>(null); const activePoints = useRef(new Map<number, Array<{ x: number; y: number; pressure: number }>>());
  const wrapRef = useRef<HTMLDivElement>(null); const viewRef = useRef<CanvasView>(IDENTITY_VIEW); const penModeRef = useRef(false); const lastBrushRef = useRef<BrushTool>("pencil");
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null); const shapeDragRef = useRef<{ pointerId: number; origin: { x: number; y: number }; moved: boolean } | null>(null); const shapeSnapshotRef = useRef<ImageData | null>(null);
  const gestureTouches = useRef(new Map<number, { x: number; y: number }>()); const gestureStartRef = useRef<{ at: number; moved: boolean } | null>(null); const lastTwoFingerTapRef = useRef(0);
  // 그리기에 참여 중인 포인터의 마지막 화면 좌표. 두 번째 손가락이 오면 첫 손가락을
  // 이 좌표로 핀치 제스처에 승격시켜야 자연스러운 두 손가락 확대가 성립한다.
  const lastClientRef = useRef(new Map<number, { x: number; y: number }>());
  // 획 시작 시점의 도구·색·굵기. 획 도중 다른 손이 도구 버튼을 눌러도 커밋은 시작 시점 기준이다.
  const strokeMetaRef = useRef(new Map<number, StrokeMeta>());
  // 채우기는 눌렀을 때가 아니라 뗐을 때 커밋한다. 손바닥 다접촉이 각각 fill이 되는 사고 방지.
  const pendingFillRef = useRef<{ pointerId: number; point: { x: number; y: number } } | null>(null);
  // 반투명 브러시(크레용·수채)의 라이브 미리보기용 스냅숏. 세그먼트를 겹쳐 그리면
  // 이음마다 알파가 중첩돼 커밋 결과보다 훨씬 진해 보이므로, 매 이동마다 복원 후 전체를 한 번에 그린다.
  const strokeSnapshotRef = useRef<ImageData | null>(null); const revisionRef = useRef(0); const initialized = useRef(false); const saveTimer = useRef<number | undefined>(undefined); const conflictDraftRef = useRef<QueuedArtworkDraft | null>(null); const completingRef = useRef(false); const documentStateRef = useRef(documentState); const currentStepRef = useRef(0); const loadingKeyRef = useRef<string | null>(null); const hydratedKeyRef = useRef<string | null>(null); const pendingSinceRef = useRef(0); const unsavedRef = useRef(false); const editSeqRef = useRef(0); const artworkRef = useRef<ArtworkPayload | null>(null);

  const createOrLoad = useCallback(async () => {
    const loadKey = params.id === "new" ? `new:${search.toString()}` : params.id;
    if (loadingKeyRef.current === loadKey || hydratedKeyRef.current === loadKey) return;
    loadingKeyRef.current = loadKey;
    try {
      const profile = activeProfile(); if (!profile) { location.replace("/join"); return; }
      const artworkUrl = params.id === "new" ? undefined : `/api/artworks/${params.id}`;
      // 느린 서버 저장을 기다린 뒤 화면을 여는 대신, IndexedDB 초안을 먼저 읽어 즉시 복구하고
      // 네트워크 전송은 화면이 열린 뒤 별도로 수행한다. 초안이 있으면 자동 전송 중 편집이 섞이지
      // 않도록 기존 충돌/사본 흐름을 그대로 보여 준다.
      const localSaves = artworkUrl ? await queuedArtworkSaves(profile.studentId, artworkUrl).catch(() => []) : [];
      const localDisposition = artworkUrl ? resolveArtworkDraftDisposition(localSaves, artworkUrl, false) : { action: "load" as const };
      const restoredDraft = localDisposition.action === "recover" ? localDisposition.draft : null;
      if (params.id === "new") {
        const mode = lesson?.mode ?? (search.get("mode") === "free" ? "free" : "free");
        const title = lesson?.title ?? "내 마음 그림"; const topic = lesson?.topic ?? "자유 창작";
        const clientArtworkId = `artwork_${crypto.randomUUID().replaceAll("-", "")}`;
        const response = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({ clientArtworkId, learningMode: mode, lessonSlug: lesson?.slug ?? null, title, topic, intent: lesson ? `${topic}을 보고 내 생각을 더한다.` : "내 마음대로 그리고 싶다." }) });
        const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error);
        hydratedKeyRef.current = loadKey; location.replace(`/student/draw/${data.artwork.id}`); return;
      }
      const response = await studentFetch(`/api/artworks/${encodeURIComponent(params.id)}`); const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error);
      const loadDisposition = artworkUrl ? resolveArtworkDraftDisposition(localSaves, artworkUrl, data.artwork.status === "complete") : { action: "load" as const };
      if (loadDisposition.action === "archive") { hydratedKeyRef.current = loadKey; location.replace("/student/archive"); return; }
      const loadDraft = loadDisposition.action === "recover" ? loadDisposition.draft : restoredDraft;
      const loadedStep = loadDraft?.currentStep ?? data.artwork.currentStep;
      // 서버가 돌려준 문서를 정규화해 크기 추정이 상한으로 유지되게 한다.
      const loadedDocument = loadDraft?.document ?? validateDrawDocument(data.artwork.document);
      if (!loadedDocument) {
        // 검증에 실패한 문서를 편집 상태로 올리면 렌더가 깨지거나, 아이가 그린 뒤
        // 저장이 계속 거부된다. 빈 문서로 열면 자동 저장이 서버 원본을 덮어쓴다.
        // 그래서 아예 열지 않고 원본을 서버에 그대로 둔 채 도움을 요청하게 한다.
        hydratedKeyRef.current = loadKey;
        setSaveState("이 그림을 열지 못했어요. 선생님을 불러 주세요.");
        return;
      }
      currentStepRef.current = loadedStep; documentStateRef.current = loadedDocument;
      setArtwork({ ...data.artwork, currentStep: loadedStep });
      setDocumentState(loadedDocument); setRedo([]); setEditVersion(0);
      conflictDraftRef.current = loadDraft; setConflictDraft(loadDraft); setConflictRevision(loadDraft?.save.conflictRevision ?? null);
      revisionRef.current = data.artwork.revision; initialized.current = true; hydratedKeyRef.current = loadKey;
      setSaveState(loadDraft ? (loadDraft.save.conflict ? "저장 충돌 초안을 복구했어요" : "전송을 기다리는 기기 초안을 복구했어요") : "저장됨");
      if (artworkUrl && !loadDraft) void flushSaves(profile.studentId, artworkUrl).catch(() => undefined);
    } finally {
      if (loadingKeyRef.current === loadKey) loadingKeyRef.current = null;
    }
  }, [lesson, params.id, search]);

  useEffect(() => { createOrLoad().catch((cause) => setSaveState(cause instanceof Error ? cause.message : "불러오지 못했어요")); }, [createOrLoad]);
  useEffect(() => { documentStateRef.current = documentState; if (canvasRef.current) renderDocument(canvasRef.current, documentState); }, [documentState]);
  useEffect(() => { currentStepRef.current = artwork?.currentStep ?? 0; artworkRef.current = artwork; }, [artwork]);
  // 편집 표시는 effect가 아니라 편집이 일어나는 즉시(markEdited) 동기로 올린다.
  // effect는 저장 응답보다 늦게 돌 수 있어 미저장 표시를 놓친다.
  const markEdited = useCallback(() => { editSeqRef.current += 1; unsavedRef.current = true; }, []);
  const aiGuideShape = aiGuide?.steps[aiGuideStep]?.guideShape ?? "none";
  const currentGuideTraces = useMemo(() => guideTraces(aiGuide ? undefined : lesson, artwork?.currentStep ?? 0, aiGuideShape), [aiGuide, aiGuideShape, artwork?.currentStep, lesson]);
  const lessonGuideAvailable = currentGuideTraces.length > 0;
  const guideSourceKey = aiGuide ? `ai:${aiGuide.eventId}:${aiGuideStep}` : lesson ? `lesson:${lesson.slug}:${artwork?.currentStep ?? 0}` : "none";
  const markCurrentGuideSeen = useCallback(() => {
    if (lesson?.stage !== 1 || aiGuide || guideSourceKey === "none") return;
    const profile = activeProfile(); if (!profile) return;
    try { localStorage.setItem(`wiggle:guide-demo:v1:${profile.studentId}:${guideSourceKey}`, "seen"); } catch {}
  }, [aiGuide, guideSourceKey, lesson?.stage]);
  const startGuideDemo = useCallback(() => {
    if (!lessonGuideAvailable) return;
    setGuidePracticeTried(false); setGuidePhase("demo"); setGuideDemoRun((value) => value + 1);
  }, [lessonGuideAvailable]);
  const chooseIndependentDrawing = useCallback(() => {
    markCurrentGuideSeen(); setGuidePhase("independent");
  }, [markCurrentGuideSeen]);
  const stopGuideDemoForPractice = useCallback(() => {
    markCurrentGuideSeen(); setGuidePhase("practice");
  }, [markCurrentGuideSeen]);

  useEffect(() => {
    setGuidePracticeTried(false);
    if (!lessonGuideAvailable) { setGuidePhase("independent"); return; }
    if (lesson?.stage === 1 && !aiGuide) {
      const profile = activeProfile(); let seen = true;
      try { seen = !profile || localStorage.getItem(`wiggle:guide-demo:v1:${profile.studentId}:${guideSourceKey}`) === "seen"; } catch {}
      if (!seen) { setGuidePhase("demo"); setGuideDemoRun((value) => value + 1); return; }
    }
    setGuidePhase("independent");
  }, [aiGuide, guideSourceKey, lesson?.stage, lessonGuideAvailable]);

  useEffect(() => {
    if (guideAnimationRef.current !== null) cancelAnimationFrame(guideAnimationRef.current);
    const canvas = guideRef.current; if (!canvas) return;
    if (guidePhase !== "demo") { renderGuideFrame(canvas, currentGuideTraces, guidePhase); return; }
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionPreference.matches) {
      renderGuideFrame(canvas, currentGuideTraces, "practice");
      markCurrentGuideSeen(); setGuidePhase("practice"); return;
    }
    const duration = Math.min(3200, 1700 + currentGuideTraces.length * 450); const startedAt = performance.now();
    const stopForReducedMotion = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      if (guideAnimationRef.current !== null) cancelAnimationFrame(guideAnimationRef.current);
      guideAnimationRef.current = null; renderGuideFrame(canvas, currentGuideTraces, "practice");
      markCurrentGuideSeen(); setGuidePhase("practice");
    };
    motionPreference.addEventListener("change", stopForReducedMotion);
    const animate = (now: number) => {
      const linear = Math.min(1, (now - startedAt) / duration); const eased = 1 - (1 - linear) ** 3;
      renderGuideFrame(canvas, currentGuideTraces, "demo", eased);
      if (linear < 1) { guideAnimationRef.current = requestAnimationFrame(animate); return; }
      guideAnimationRef.current = null; markCurrentGuideSeen(); setGuidePhase("practice");
    };
    guideAnimationRef.current = requestAnimationFrame(animate);
    return () => {
      motionPreference.removeEventListener("change", stopForReducedMotion);
      if (guideAnimationRef.current !== null) cancelAnimationFrame(guideAnimationRef.current);
      guideAnimationRef.current = null;
    };
  }, [currentGuideTraces, guideDemoRun, guidePhase, markCurrentGuideSeen]);
  useEffect(() => {
    let polling = false;
    const poll = async () => {
      if (polling || document.visibilityState === "hidden") return;
      polling = true;
      try {
        const response = await studentFetch("/api/student");
        const data = await response.json() as { messages?: StudentTeacherMessage[]; teacherViewing?: boolean };
        setTeacherMessages(data.messages ?? []);
        setTeacherViewing(Boolean(data.teacherViewing));
      } catch { /* 다음 주기에 다시 확인한다 */ }
      finally { polling = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 8000);
    const visible = () => { if (document.visibilityState === "visible") void poll(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, []);
  // 이 기기에서 펜을 한 번이라도 쓰면 펜 모드를 기억한다. 수업 중 첫 터치부터 손바닥이 안전해진다.
  useEffect(() => { try { if (localStorage.getItem("wiggle:pen-mode") === "1") { penModeRef.current = true; setPenMode(true); } } catch {} }, []);

  useEffect(() => {
    if (!artwork) return;
    const key = `wiggle:lesson-choice:v1:${artwork.id}:${artwork.currentStep}`;
    try { setChildChoice(localStorage.getItem(key) ?? ""); }
    catch { setChildChoice(""); }
  }, [artwork]);

  function chooseChildChoice(choice: string) {
    setChildChoice(choice);
    if (!artwork) return;
    try { localStorage.setItem(`wiggle:lesson-choice:v1:${artwork.id}:${artwork.currentStep}`, choice); } catch {}
  }

  // savingEdit은 save() 호출 시점에 캡처해 넘긴다. 직렬 큐에서 실제 실행될 때 읽으면
  // 대기 중에 생긴 새 편집의 세대를 잡아, 그 편집까지 저장된 것으로 오인한다.
  const performSave = useCallback(async (nextDocument: DrawDocument, savingEdit: number, options?: SaveOptions) => {
    if (!artwork || !canvasRef.current) return false; const profile = activeProfile(); if (!profile) return false;
    const preserveDraft = async (queued: Parameters<typeof queueSave>[0], message: string) => {
      const restored = queuedArtworkDraft(queued);
      if (restored) {
        conflictDraftRef.current = restored; setConflictDraft(restored); setConflictRevision(queued.conflictRevision ?? null); setEditVersion(0);
      }
      try { await queueSave(queued); }
      catch { setSaveState(`${message} 이 탭에서 계속 보관하고 있어요`); return; }
      setSaveState(message);
    };
    const existingDraft = conflictDraftRef.current;
    if (existingDraft) {
      if (options?.complete) {
        const requestId = mutationId(); const previousTime = Date.parse(existingDraft.save.createdAt); const createdAt = new Date(Math.max(Date.now(), Number.isFinite(previousTime) ? previousTime + 1 : 0)).toISOString();
        const upgradedBody = JSON.stringify({ ...(JSON.parse(existingDraft.save.body) as Record<string, unknown>), requestId, document: documentStateRef.current, currentStep: currentStepRef.current, thumbnailDataUrl: documentImage(documentStateRef.current, 256), complete: true, finalDataUrl: documentImage(documentStateRef.current, 1024), reflection: options.reflection });
        await preserveDraft({ requestId, studentId: profile.studentId, url: existingDraft.save.url, body: upgradedBody, createdAt, branchId: saveBranchId, conflict: true, conflictRevision: existingDraft.save.conflictRevision }, "완성한 그림과 소감을 기기에 안전하게 보관했어요");
      } else {
        setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요");
      }
      return false;
    }
    const requestId = mutationId(); const url = `/api/artworks/${artwork.id}`; const createdAt = new Date().toISOString();
    const body = JSON.stringify({ requestId, expectedRevision: revisionRef.current, document: nextDocument, currentStep: options?.currentStep ?? artwork.currentStep, thumbnailDataUrl: documentImage(nextDocument, 256), complete: options?.complete ?? false, finalDataUrl: options?.complete ? documentImage(nextDocument, 1024) : undefined, reflection: options?.reflection });
    setSaveState(navigator.onLine ? "저장 중…" : "기기에 보관 중");
    try {
      const response = await studentFetch(url, { method: "PUT", body }); const data = await response.json() as { error?: string; serverRevision?: number; revision?: number };
      if (response.status === 409) {
        const serverRevision = typeof data.serverRevision === "number" ? data.serverRevision : revisionRef.current;
        const conflictBody = JSON.stringify({ ...(JSON.parse(body) as Record<string, unknown>), document: documentStateRef.current, currentStep: currentStepRef.current, thumbnailDataUrl: documentImage(documentStateRef.current, 256), finalDataUrl: options?.complete ? documentImage(documentStateRef.current, 1024) : undefined });
        await preserveDraft({ requestId, studentId: profile.studentId, url, body: conflictBody, createdAt, branchId: saveBranchId, conflict: true, conflictRevision: serverRevision }, "다른 저장과 겹쳤어요"); return false;
      }
      if (response.status >= 400 && response.status < 500) {
        const queued = { requestId, studentId: profile.studentId, url, body, createdAt, branchId: saveBranchId };
        if (options?.complete) await preserveDraft(queued, data.error ?? "완성한 그림을 기기에 안전하게 보관했어요");
        else { await queueSave(queued); setSaveState(data.error ?? "저장할 수 없어 기기에 보관했어요"); }
        return false;
      }
      if (!response.ok) throw new Error(data.error);
      // 서버가 이미 반영했으므로 revision부터 확정한다. IndexedDB 정리는 부가 작업이라
      // 실패해도 커밋된 저장을 실패로 되돌리거나 낡은 revision을 남기면 안 된다.
      revisionRef.current = data.revision ?? revisionRef.current;
      // 이 저장이 담아 간 편집 세대가 그대로일 때만 "저장됨"이라고 말한다. 그 사이 더 그렸다면
      // 미저장 표시를 유지해야 이탈 시 기기 보관이 그 선을 지켜 준다.
      const stillCurrent = editSeqRef.current === savingEdit;
      if (stillCurrent) unsavedRef.current = false;
      if (stillCurrent || options?.complete) setSaveState(options?.complete ? "완성했어요" : "저장됨");
      try { await clearQueuedArtworkSaves(profile.studentId, url, "pending", { createdAt, requestId }, saveBranchId); }
      catch { /* 큐 정리는 다음 flush에서 다시 시도한다 */ }
      return true;
    } catch {
      const queued = { requestId, studentId: profile.studentId, url, body, createdAt, branchId: saveBranchId };
      if (options?.complete) await preserveDraft(queued, "완성한 그림을 기기에 안전하게 보관했어요");
      // IndexedDB를 못 열면 queueSave도 던진다. 그 예외가 밖으로 나가면 호출부의
      // 로딩 상태가 영구히 잠긴다(그리미 호출이 다시 안 됨).
      else {
        try { await queueSave(queued); setSaveState("기기에 안전하게 보관됨"); }
        catch { setSaveState("지금은 저장할 수 없어요. 인터넷을 확인해 주세요"); }
      }
      return false;
    }
  }, [artwork, saveBranchId]);
  // 문서와 편집 세대를 같은 동기 구간에서 함께 캡처한다. 인자를 생략하면 항상 최신 화면 문서를 쓴다.
  // 서버 응답을 기다린 뒤 렌더 시점의 documentState를 넘기면 그사이 그린 선이 되돌려진다.
  const save = useCallback((nextDocument?: DrawDocument, options?: SaveOptions) => {
    const savingEdit = editSeqRef.current;
    return runSerial(() => performSave(nextDocument ?? documentStateRef.current, savingEdit, options));
  }, [performSave, runSerial]);

  useEffect(() => {
    if (!initialized.current || !artwork || editVersion === 0 || conflictDraft || completingRef.current) { pendingSinceRef.current = 0; return; }
    window.clearTimeout(saveTimer.current); setSaveState("그리는 중…");
    // 선을 1.5초보다 촘촘히 이어 그리면 디바운스가 계속 미뤄져 저장이 한 번도 일어나지 않는다.
    // 최초 미저장 편집 시각부터 최대 대기 시간을 두어 상한을 강제한다.
    if (!pendingSinceRef.current) pendingSinceRef.current = Date.now();
    const waited = Date.now() - pendingSinceRef.current;
    const delay = Math.max(0, Math.min(AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS - waited));
    saveTimer.current = window.setTimeout(() => { pendingSinceRef.current = 0; void save(documentState, { currentStep: artwork.currentStep }); }, delay);
    return () => window.clearTimeout(saveTimer.current);
  }, [artwork, conflictDraft, documentState, editVersion, save]);

  // 아이가 나가기를 누르거나 탭이 숨겨질 때, 아직 서버에 못 보낸 그림을 기기에 보관한다.
  // 이 경로가 없으면 마지막 저장 이후의 선이 서버에도 IndexedDB에도 남지 않는다.
  const preserveUnsavedOnExit = useCallback(() => {
    if (!artworkRef.current || !unsavedRef.current || conflictDraftRef.current || completingRef.current) return;
    const profile = activeProfile(); if (!profile) return;
    const url = `/api/artworks/${artworkRef.current.id}`;
    const requestId = mutationId();
    const body = JSON.stringify({ requestId, expectedRevision: revisionRef.current, document: documentStateRef.current, currentStep: currentStepRef.current, complete: false });
    void queueSave({ requestId, studentId: profile.studentId, url, body, createdAt: new Date().toISOString(), branchId: saveBranchId }).catch(() => undefined);
  }, [saveBranchId]);
  useEffect(() => {
    const onHide = () => preserveUnsavedOnExit();
    const onVisibility = () => { if (document.visibilityState === "hidden") preserveUnsavedOnExit(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("visibilitychange", onVisibility); };
  }, [preserveUnsavedOnExit]);

  const canvasFull = useMemo(() => documentTooLarge(documentState), [documentState]);
  const reflectionDialogRef = useRef<HTMLDivElement>(null);
  const closeReflection = useCallback(() => setReflectionOpen(false), []);
  useModalDialog(reflectionDialogRef, closeReflection, reflectionOpen);
  const artworkId = artwork?.id;
  const flushCurrentArtwork = useCallback(() => {
    if (!artworkId) return;
    const url = `/api/artworks/${artworkId}`;
    void runSerial(async () => {
      const profile = activeProfile(); if (!profile) return;
      try {
        const flushed = await flushSaves(profile.studentId, url);
        const disposition = resolveArtworkDraftDisposition(flushed.remaining, url, flushed.completedUrls.includes(url));
        if (disposition.action === "archive") {
          conflictDraftRef.current = null; setConflictDraft(null); setConflictRevision(null);
          location.replace("/student/archive"); return;
        }
        const latestRevision = flushed.latestRevisions[url];
        if (typeof latestRevision === "number") revisionRef.current = latestRevision;
        const restored = disposition.action === "recover" ? disposition.draft : null;
        if (restored) {
          // 큐에 들어가기 전에 그린 선이 화면에 남아 있으면, 복구 초안으로 덮으면 그 선이 사라진다.
          // 화면의 최신 문서를 그대로 두고 그 내용을 충돌 초안 본문에 반영해 보관한다.
          const keepLocalEdits = unsavedRef.current;
          const draft: QueuedArtworkDraft = keepLocalEdits
            ? { ...restored, document: documentStateRef.current, currentStep: currentStepRef.current, save: { ...restored.save, body: JSON.stringify({ ...(JSON.parse(restored.save.body) as Record<string, unknown>), document: documentStateRef.current, currentStep: currentStepRef.current }) } }
            : restored;
          if (keepLocalEdits) await queueSave(draft.save).catch(() => undefined);
          conflictDraftRef.current = draft; setConflictDraft(draft); setConflictRevision(draft.save.conflictRevision ?? null);
          if (!keepLocalEdits) {
            documentStateRef.current = draft.document; currentStepRef.current = draft.currentStep;
            setDocumentState(draft.document); setRedo([]); setEditVersion(0); setGuidePhase("independent");
            setArtwork((current) => current ? { ...current, currentStep: draft.currentStep } : current);
          }
          setSaveState(draft.save.conflict ? "저장 충돌 초안을 복구했어요" : "기기 초안의 전송을 기다리고 있어요");
        } else if (flushed.flushed > 0) {
          conflictDraftRef.current = null; setConflictDraft(null); setConflictRevision(null);
          setSaveState("저장됨");
        }
      } catch {
        setSaveState("기기에 안전하게 보관 중");
      }
    });
  }, [artworkId, runSerial]);
  useEffect(() => {
    if (!artworkId) return;
    window.addEventListener("online", flushCurrentArtwork);
    return () => window.removeEventListener("online", flushCurrentArtwork);
  }, [artworkId, flushCurrentArtwork]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: roundUnit(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))), y: roundUnit(Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))), pressure: roundUnit(event.pressure || 0.5) }; }
  const width = studioTool === "eraser" ? eraserWidth : drawWidth;
  function clearShapeStart() { shapeStartRef.current = null; setShapeStartPoint(null); }
  function chooseStudioTool(next: StudioTool) {
    setStudioTool(next);
    if (next === "pencil" || next === "crayon" || next === "marker" || next === "watercolor") lastBrushRef.current = next;
    if (next !== "shape") clearShapeStart();
  }
  function chooseWidth(value: StrokeWidth) { if (studioTool === "eraser") setEraserWidth(value); else setDrawWidth(value); }
  function enablePenMode() {
    if (penModeRef.current) return;
    penModeRef.current = true; setPenMode(true);
    try { localStorage.setItem("wiggle:pen-mode", "1"); } catch {}
  }
  // 공유 기기에서 펜을 잃어버려도 손가락으로 그릴 수 있어야 한다. 펜이 다시 닿으면
  // pointerDown에서 자동으로 재활성화되므로 해제해도 손바닥 안전은 유지된다.
  function disablePenMode() {
    penModeRef.current = false; setPenMode(false);
    try { localStorage.removeItem("wiggle:pen-mode"); } catch {}
  }
  function resetViewToFit() { viewRef.current = IDENTITY_VIEW; setView(IDENTITY_VIEW); }
  function newOperationId() { return crypto.randomUUID().replaceAll("-", ""); }
  // 한 스트로크만으로도 서버 한도(직렬화 1.25MB, ops 5000)를 넘길 수 있다.
  // 넘길 만큼 길면 들어갈 수 있는 데까지만 남기고 그리기를 멈춘다.
  // 대칭이 켜져 있으면 같은 획이 두 벌 저장되므로 예산을 벌 수로 나눈다.
  function fitStrokePoints(points: Array<{ x: number; y: number; pressure: number }>, copies: number) {
    const budget = Math.floor((DOCUMENT_BYTES_WARN - estimateDocumentBytes(documentStateRef.current)) / copies);
    if (budget <= 0 || estimateStrokeBytes(0) >= budget) return [];
    if (estimateStrokeBytes(points.length) <= budget) return points;
    const allowed = Math.floor((budget - estimateStrokeBytes(0)) / (estimateStrokeBytes(1) - estimateStrokeBytes(0)));
    return points.slice(0, Math.max(0, allowed));
  }
  // 함께 커밋된 묶음(대칭 쌍)은 한 번의 편집이다. 되돌리기도 lib/symmetry의 쌍 규칙으로 함께 지워진다.
  function commitOps(ops: DrawOp[]) {
    if (documentStateRef.current.ops.length + ops.length > OPS_WARN_THRESHOLD) return false;
    markEdited();
    documentStateRef.current = { ...documentStateRef.current, ops: [...documentStateRef.current.ops, ...ops] };
    setDocumentState(documentStateRef.current); setRedo([]); setEditVersion((value) => value + 1);
    return true;
  }
  // meta는 획이 시작된 시점의 도구·색·굵기다. 커밋 시점의 state를 읽으면
  // 획 도중 다른 손이 도구 버튼을 눌렀을 때 획이 통째로 폐기되거나 잘못된 도구로 커밋된다.
  function commitStroke(points: Array<{ x: number; y: number; pressure: number }>, meta: StrokeMeta) {
    const fitted = fitStrokePoints(points, mirror ? 2 : 1);
    if (!fitted.length) return false;
    const operationId = newOperationId();
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "stroke", at: new Date().toISOString(), tool: meta.tool, color: meta.tool === "eraser" ? undefined : meta.color, width: meta.width, points: fitted };
    if (!commitOps(mirror ? [op, mirrorOp(op)] : [op])) return false;
    return fitted.length === points.length;
  }
  function commitFill(point: { x: number; y: number }) {
    const operationId = newOperationId();
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "fill", at: new Date().toISOString(), color, points: [{ x: point.x, y: point.y }] };
    commitOps(mirror ? [op, mirrorOp(op)] : [op]);
  }
  function commitShape(start: { x: number; y: number }, end: { x: number; y: number }) {
    // 점 하나 크기의 도형은 실수 탭이다. 커밋하지 않아야 2탭 흐름에서 시작점을 다시 찍을 수 있다.
    if (Math.hypot(end.x - start.x, end.y - start.y) < 0.012) return false;
    const operationId = newOperationId();
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "shape", at: new Date().toISOString(), shape: shapeKind, color, width: drawWidth, points: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }] };
    return commitOps(mirror ? [op, mirrorOp(op)] : [op]);
  }
  function previewShape(canvas: HTMLCanvasElement, start: { x: number; y: number }, end: { x: number; y: number }) {
    const context = canvas.getContext("2d"); if (!context) return;
    if (shapeSnapshotRef.current) context.putImageData(shapeSnapshotRef.current, 0, 0);
    const preview: DrawOp = { opId: "preview_op", clientOpId: "preview_client", type: "shape", at: "2000-01-01T00:00:00.000Z", shape: shapeKind, color, width: drawWidth, points: [start, end] };
    renderDrawOperation(context, preview, canvas.width);
    if (mirror) renderDrawOperation(context, mirrorOp(preview), canvas.width);
  }
  function startGestureTouch(event: ReactPointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gestureTouches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gestureTouches.current.size === 2) gestureStartRef.current = { at: performance.now(), moved: false };
  }
  // 그리기 참여 중인 포인터가 있는가 (스트로크·도형 드래그·채우기 대기).
  function engagedByOther(pointerId: number) {
    if (activePoints.current.size > 0 && !activePoints.current.has(pointerId)) return true;
    if (shapeDragRef.current && shapeDragRef.current.pointerId !== pointerId) return true;
    if (pendingFillRef.current && pendingFillRef.current.pointerId !== pointerId) return true;
    return false;
  }
  // 두 번째 손가락이 오면 진행 중이던 그리기를 폐기하고, 기존 손가락을 마지막 좌표로
  // 핀치 제스처에 승격시킨다. 승격 없이 버리면 gestureTouches가 1개뿐이라 핀치가 영영 시작되지 않는다.
  function promoteEngagedToGesture(canvas: HTMLCanvasElement) {
    const engaged = new Set<number>([...activePoints.current.keys()]);
    if (shapeDragRef.current) engaged.add(shapeDragRef.current.pointerId);
    if (pendingFillRef.current) engaged.add(pendingFillRef.current.pointerId);
    for (const pointerId of engaged) {
      const last = lastClientRef.current.get(pointerId);
      if (last) gestureTouches.current.set(pointerId, last);
      else if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    }
    activePoints.current.clear(); strokeMetaRef.current.clear(); strokeSnapshotRef.current = null;
    shapeDragRef.current = null; shapeSnapshotRef.current = null; pendingFillRef.current = null;
    renderDocument(canvas, documentStateRef.current);
  }
  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    activePoints.current.delete(event.pointerId);
    strokeMetaRef.current.delete(event.pointerId); lastClientRef.current.delete(event.pointerId); strokeSnapshotRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    renderDocument(event.currentTarget, documentStateRef.current);
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerType === "pen") enablePenMode();
    // 펜 모드: 손 터치는 절대 그리지 않는다(손바닥 안전). 손가락은 확대·이동 제스처 전용이다.
    // 펜이 없는 기기: 첫 손가락은 그리고, 그리는 중 두 번째 손가락이 오면
    // 진행 중이던 그리기를 폐기하고 두 손가락 모두 핀치 제스처로 전환한다.
    if (event.pointerType === "touch") {
      if (penModeRef.current) { startGestureTouch(event); return; }
      if (engagedByOther(event.pointerId)) {
        promoteEngagedToGesture(event.currentTarget); startGestureTouch(event); return;
      }
      if (gestureTouches.current.size > 0) { startGestureTouch(event); return; }
    }
    if (conflictDraftRef.current) { setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
    if (canvasFull) { setSaveState("종이가 가득 찼어요. ‘완성’을 눌러 완성해요"); return; }
    // 한 번에 한 포인터만 그린다. 그렇지 않으면 태블릿에 얹은 손바닥 접촉이 각각 별도의 선이 된다.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (engagedByOther(event.pointerId)) return;
    if (guidePhase === "demo") stopGuideDemoForPractice();
    event.preventDefault();
    const first = canvasPoint(event);
    lastClientRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (studioTool === "fill") {
      // 커밋은 뗐을 때. 눌렀을 때 커밋하면 손바닥의 접촉 하나하나가 fill이 된다.
      event.currentTarget.setPointerCapture(event.pointerId);
      pendingFillRef.current = { pointerId: event.pointerId, point: { x: first.x, y: first.y } };
      return;
    }
    if (studioTool === "shape") {
      event.currentTarget.setPointerCapture(event.pointerId);
      shapeDragRef.current = { pointerId: event.pointerId, origin: first, moved: false };
      const context = event.currentTarget.getContext("2d");
      shapeSnapshotRef.current = context ? context.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height) : null;
      if (shapeStartRef.current) previewShape(event.currentTarget, shapeStartRef.current, first);
      return;
    }
    const meta: StrokeMeta = { tool: studioTool, color, width };
    strokeMetaRef.current.set(event.pointerId, meta);
    event.currentTarget.setPointerCapture(event.pointerId); activePoints.current.set(event.pointerId, [first]);
    // 반투명 브러시는 미리보기를 스냅숏 복원 방식으로 그린다 (세그먼트 알파 중첩 방지).
    if (meta.tool === "crayon" || meta.tool === "watercolor") {
      const context = event.currentTarget.getContext("2d");
      strokeSnapshotRef.current = context ? context.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height) : null;
    } else strokeSnapshotRef.current = null;
    renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, [first]);
    if (mirror) renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, [{ ...first, x: 1 - first.x }]);
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (gestureTouches.current.has(event.pointerId)) {
      const previous = gestureTouches.current.get(event.pointerId)!;
      const current = { x: event.clientX, y: event.clientY };
      if (gestureTouches.current.size >= 2) {
        const other = [...gestureTouches.current.entries()].find(([id]) => id !== event.pointerId);
        const wrap = wrapRef.current;
        if (other && wrap) {
          const rect = wrap.getBoundingClientRect();
          const local = (touch: { x: number; y: number }) => ({ x: touch.x - rect.left, y: touch.y - rect.top });
          const next = pinchView(viewRef.current, [local(previous), local(other[1])], [local(current), local(other[1])], rect.width);
          viewRef.current = next; setView(next);
        }
        if (gestureStartRef.current && Math.hypot(current.x - previous.x, current.y - previous.y) > 6) gestureStartRef.current.moved = true;
      }
      gestureTouches.current.set(event.pointerId, current);
      event.preventDefault(); return;
    }
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    lastClientRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pendingFillRef.current?.pointerId === event.pointerId) { event.preventDefault(); return; }
    const drag = shapeDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      const next = canvasPoint(event);
      if (!drag.moved && Math.hypot((next.x - drag.origin.x) * 1024, (next.y - drag.origin.y) * 1024) >= 10) drag.moved = true;
      const origin = shapeStartRef.current ?? drag.origin;
      if (drag.moved || shapeStartRef.current) previewShape(event.currentTarget, origin, next);
      return;
    }
    const points = activePoints.current.get(event.pointerId); if (!points) return;
    const meta = strokeMetaRef.current.get(event.pointerId); if (!meta) return;
    const next = canvasPoint(event); const last = points.at(-1);
    if (last && Math.hypot((next.x - last.x) * 1024, (next.y - last.y) * 1024) >= 2.5) {
      event.preventDefault(); points.push(next);
      if (strokeSnapshotRef.current) {
        // 반투명 브러시: 스냅숏 복원 후 누적 획 전체를 한 번에 그려 커밋 결과와 같은 알파로 보인다.
        const context = event.currentTarget.getContext("2d");
        if (context) context.putImageData(strokeSnapshotRef.current, 0, 0);
        renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, points);
        if (mirror) renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, points.map((point) => ({ ...point, x: 1 - point.x })));
      } else {
        renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, [last, next]);
        if (mirror) renderLiveStroke(event.currentTarget, meta.tool, meta.color, meta.width, [{ ...last, x: 1 - last.x }, { ...next, x: 1 - next.x }]);
      }
      // 손을 떼지 않고 계속 문지르면 한 스트로크가 서버 한도를 넘는다. 화면은 그대로 두고
      // 안쪽에서만 끊어 이어 붙인다. 한도에 닿으면 그 자리에서 입력을 끝낸다.
      if (points.length >= STROKE_POINT_SPLIT) {
        // 획 도중 저장 충돌이 세워졌으면 문서를 더 편집하지 않는다 (충돌 초안 편집 금지 불변).
        if (conflictDraftRef.current) { endStroke(event); setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
        const wholeStrokeFit = commitStroke(points.slice(), meta);
        if (!wholeStrokeFit) { endStroke(event); setSaveState("종이가 가득 찼어요. ‘완성’을 눌러 완성해요"); return; }
        activePoints.current.set(event.pointerId, [next]);
        if (strokeSnapshotRef.current) {
          // 분할 커밋 뒤에는 방금 커밋된 획이 포함된 문서로 스냅숏을 새로 뜬다.
          renderDocument(event.currentTarget, documentStateRef.current);
          const context = event.currentTarget.getContext("2d");
          strokeSnapshotRef.current = context ? context.getImageData(0, 0, event.currentTarget.width, event.currentTarget.height) : null;
        }
      }
    }
  }
  function releaseGesturePointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    gestureTouches.current.delete(event.pointerId); lastClientRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (gestureTouches.current.has(event.pointerId)) {
      gestureTouches.current.delete(event.pointerId);
      const started = gestureStartRef.current;
      if (started && gestureTouches.current.size <= 1) {
        // 두 손가락 짧은 탭 두 번 = 화면 맞춤. (스케치북 강좌와 같은 제스처)
        if (!started.moved && performance.now() - started.at < 320) {
          const now = performance.now();
          if (now - lastTwoFingerTapRef.current < 500) { resetViewToFit(); lastTwoFingerTapRef.current = 0; }
          else lastTwoFingerTapRef.current = now;
        }
        gestureStartRef.current = null;
      }
      lastClientRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const pendingFill = pendingFillRef.current;
    if (pendingFill && pendingFill.pointerId === event.pointerId) {
      pendingFillRef.current = null; lastClientRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (conflictDraftRef.current) { setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
      event.preventDefault();
      commitFill(pendingFill.point);
      return;
    }
    const drag = shapeDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      shapeDragRef.current = null; shapeSnapshotRef.current = null; lastClientRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (conflictDraftRef.current) { renderDocument(event.currentTarget, documentStateRef.current); setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
      event.preventDefault();
      const end = canvasPoint(event);
      const pending = shapeStartRef.current;
      if (pending) {
        // 2탭 경로의 두 번째 탭. 실패(너무 작음·한도)면 미리보기만 걷어낸다.
        clearShapeStart();
        if (!commitShape(pending, end)) renderDocument(event.currentTarget, documentStateRef.current);
      } else if (drag.moved) {
        if (!commitShape(drag.origin, end)) renderDocument(event.currentTarget, documentStateRef.current);
      } else {
        // 움직이지 않은 탭 = 2탭 경로의 시작점 찍기. 표식은 캔버스 픽셀이 아니라 DOM 점으로 —
        // 픽셀에 그리면 문서에 없는 초록 점이 썸네일·완성 PNG·AI 전송 이미지에 섞인다.
        shapeStartRef.current = drag.origin; setShapeStartPoint(drag.origin);
      }
      return;
    }
    const points = activePoints.current.get(event.pointerId);
    const meta = strokeMetaRef.current.get(event.pointerId);
    if (conflictDraftRef.current) {
      // 미리보기로 그려 둔 픽셀을 지우지 않으면 문서에 없는 선이 썸네일에 섞인다.
      endStroke(event);
      setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return;
    }
    if (!points?.length || !meta) return; event.preventDefault();
    activePoints.current.delete(event.pointerId); strokeMetaRef.current.delete(event.pointerId); strokeSnapshotRef.current = null; lastClientRef.current.delete(event.pointerId);
    // 한도에 막혀 커밋되지 않으면 미리보기 픽셀을 문서 상태로 되돌린다.
    if (!commitStroke(points, meta)) {
      endStroke(event);
      setSaveState("종이가 가득 찼어요. ‘완성’을 눌러 완성해요");
      return;
    }
    if ((guidePhase === "practice" || guidePhase === "demo") && lessonGuideAvailable && meta.tool !== "eraser") setGuidePracticeTried(true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  // 취소는 폐기다. pointerUp으로 흘리면 취소 이벤트의 (0,0) 좌표로 도형이 커밋되는 사고가 난다.
  // 단 스트로크는 이벤트 좌표가 아니라 누적 점으로 커밋하므로, 그려 둔 만큼 살리는 기존 동작을 유지한다.
  function pointerCancel(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (gestureTouches.current.has(event.pointerId)) { gestureStartRef.current = null; releaseGesturePointer(event); return; }
    if (pendingFillRef.current?.pointerId === event.pointerId) {
      pendingFillRef.current = null; lastClientRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (shapeDragRef.current?.pointerId === event.pointerId) {
      shapeDragRef.current = null; shapeSnapshotRef.current = null; lastClientRef.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      renderDocument(event.currentTarget, documentStateRef.current);
      return;
    }
    pointerUp(event);
  }
  function undo() {
    if (conflictDraftRef.current) return;
    // 대기 중인 도형 시작점은 지운다. 문서가 바뀐 뒤 보이지 않는 옛 시작점에서 도형이 커밋되는 사고 방지.
    clearShapeStart();
    // 대칭 쌍은 한 번의 되돌리기로 함께 지워진다. 반쪽만 지우면 아이가 이해할 수 없는 상태가 된다.
    const groupSize = undoGroupSize(documentStateRef.current.ops); if (!groupSize) return;
    const group = documentStateRef.current.ops.slice(-groupSize);
    markEdited();
    setDocumentState((current) => ({ ...current, ops: current.ops.slice(0, -groupSize) }));
    setRedo((items) => [...items, group]); setEditVersion((value) => value + 1);
  }
  function redoLast() {
    if (conflictDraftRef.current) return;
    clearShapeStart();
    const group = redo.at(-1); if (!group) return;
    markEdited();
    setDocumentState((current) => ({ ...current, ops: [...current.ops, ...group] }));
    setRedo((items) => items.slice(0, -1)); setEditVersion((value) => value + 1);
  }
  async function complete() {
    if (completingRef.current) return;
    completingRef.current = true; window.clearTimeout(saveTimer.current);
    const ok = await save(documentState, { complete: true, reflection: { favoritePart, favoriteReason, spokenDescription: `${favoritePart}을(를) 그렸어요.`, storyText: "" } });
    if (ok) { location.href = "/student/archive"; return; }
    completingRef.current = false;
  }

  async function saveAsCopy() {
    try { await performSaveAsCopy(); }
    catch { setSaveState("사본을 만들지 못했어요. 인터넷을 확인하고 다시 눌러 주세요"); }
  }

  async function performSaveAsCopy() {
    const draft = conflictDraftRef.current; const profile = activeProfile();
    if (!artwork || !canvasRef.current || !draft || !profile) return; setSaveState("새 사본을 만드는 중…");
    const stableKey = draft.save.requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
    const clientArtworkId = stableKey.length >= 8 ? `artwork_copy_${stableKey}` : `artwork_${crypto.randomUUID().replaceAll("-", "")}`;
    const copyRequestId = stableKey.length >= 8 ? `copy_${stableKey}` : mutationId();
    const created = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({ clientArtworkId, learningMode: artwork.learningMode, lessonSlug: artwork.lessonSlug, title: `${artwork.title} 사본`, topic: artwork.topic, intent: artwork.intent }) });
    const createdData = await created.json() as { error?: string; artwork?: { id: string } }; if (!created.ok || !createdData.artwork) { setSaveState(createdData.error ?? "사본을 만들지 못했어요"); return; }
    const response = await studentFetch(`/api/artworks/${createdData.artwork.id}`, { method: "PUT", body: JSON.stringify({ requestId: copyRequestId, expectedRevision: 0, document: draft.document, currentStep: draft.currentStep, thumbnailDataUrl: documentImage(draft.document, 256), complete: draft.complete, finalDataUrl: draft.finalDataUrl, reflection: draft.reflection }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setSaveState(data.error ?? "사본을 저장하지 못했어요"); return; }
    // 충돌 상태는 화면을 떠날 때까지 유지한다. 여기서 먼저 풀면 이동이 끝나기 전에
    // 도화지가 다시 편집 가능해지고, 그 자동 저장이 복구된 충돌 문서를 원본 작품에
    // 현재 revision으로 써 넣어 충돌을 일으킨 서버 쪽 그림을 덮어쓴다.
    let removed = false;
    for (let attempt = 0; attempt < 3 && !removed; attempt += 1) {
      try { await deleteQueuedArtworkSave(profile.studentId, draft.save.url, draft.save.requestId); removed = true; }
      catch { removed = false; }
    }
    if (!removed) {
      // flushSaves는 충돌 항목을 건너뛰므로 남겨 두면 다음에도 같은 초안이 되살아난다.
      setSaveState("사본은 저장했어요. 정리가 끝나지 않았으니 한 번 더 눌러 주세요");
      return;
    }
    location.replace(draft.complete ? "/student/archive" : `/student/draw/${createdData.artwork.id}`);
  }

  async function askGrimi() {
    if (!artwork || !canvasRef.current || grimiLoading) return;
    setGrimiOpen(true); setGrimiCollapsed(false); setGrimiLoading(true); setGrimiError(""); setCoaching(null); setAnswer(""); setAnswerLabel(""); setAnswerSaved(false); setAiGuide(null); setGuidePhase("independent");
    window.clearTimeout(saveTimer.current);
    // 선행 저장은 반드시 try 안에서 기다린다. 밖에서 던지면 grimiLoading이 영구히 잠긴다.
    try {
      const saved = await save(); if (!saved) { setGrimiError("그림을 먼저 저장한 뒤 다시 불러 줘."); return; }
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "ask", requestId: coachingRequestId(), artworkId: artwork.id, expectedRevision: revisionRef.current, document: documentStateRef.current, imageDataUrl: imageData(canvasRef.current, 1024), childChoice }) });
      const data = await response.json() as { error?: string; eventId?: string; coaching?: StudentCoaching };
      if (!response.ok || !data.eventId || !data.coaching) throw new Error(data.error ?? "그리미의 답을 받지 못했어요.");
      setCoaching({ ...data.coaching, eventId: data.eventId });
    } catch (cause) { setGrimiError(cause instanceof Error ? cause.message : "그리미를 부르지 못했어요."); }
    finally { setGrimiLoading(false); }
  }

  async function requestAiGuide() {
    if (!artwork || !canvasRef.current || guideTopic.trim().length < 2 || grimiLoading) return;
    setGrimiLoading(true); setGrimiError(""); setCoaching(null); setAnswer(""); setGuidePhase("independent");
    window.clearTimeout(saveTimer.current);
    try {
      const saved = await save(); if (!saved) { setGrimiError("그림을 먼저 저장한 뒤 다시 해 줘."); return; }
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "guide", requestId: coachingRequestId(), artworkId: artwork.id, expectedRevision: revisionRef.current, document: documentStateRef.current, imageDataUrl: imageData(canvasRef.current, 1024), requestedTopic: guideTopic, childChoice }) });
      const data = await response.json() as { error?: string; eventId?: string; guide?: AiGuide };
      if (!response.ok || !data.eventId || !data.guide) throw new Error(data.error ?? "가이드를 만들지 못했어요.");
      setAiGuide({ ...data.guide, eventId: data.eventId }); setAiGuideStep(0); setGuidePhase("independent");
    } catch (cause) { setGrimiError(cause instanceof Error ? cause.message : "가이드를 만들지 못했어요."); }
    finally { setGrimiLoading(false); }
  }

  async function recordCoachingAnswer() {
    if (!artwork || !canvasRef.current || !coaching || !answer.trim() || conflictDraftRef.current) return;
    setGrimiLoading(true); setGrimiError("");
    try {
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "answer", artworkId: artwork.id, eventId: coaching.eventId, answer, newElements: [answerLabel || answer].filter(Boolean), currentStep: artwork.currentStep, document: documentState, imageDataUrl: imageData(canvasRef.current, 1024) }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "과정을 남기지 못했어요.");
      // 서버 응답을 기다리는 동안 아이가 더 그렸을 수 있다. 렌더 시점 문서를 넘기면 그 선이 사라진다.
      setAnswerSaved(true); setChildChoice(answer); void save(undefined, { currentStep: currentStepRef.current });
    } catch (cause) { setGrimiError(cause instanceof Error ? cause.message : "과정을 남기지 못했어요."); }
    finally { setGrimiLoading(false); }
  }

  function chooseGuideStep(next: number) {
    if (!aiGuide || conflictDraftRef.current) { if (conflictDraftRef.current) setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
    const bounded = Math.max(0, Math.min(aiGuide.steps.length - 1, next)); setAiGuideStep(bounded); setGuidePhase("independent");
    if (artwork?.currentStep !== bounded) { currentStepRef.current = bounded; markEdited(); setEditVersion((value) => value + 1); }
    setArtwork((value) => value && ({ ...value, currentStep: bounded }));
  }

  function changeLessonStep(delta: -1 | 1) {
    if (!artwork || !lesson || conflictDraftRef.current) { if (conflictDraftRef.current) setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
    const next = Math.max(0, Math.min(lesson.steps.length - 1, artwork.currentStep + delta));
    if (next === artwork.currentStep) return;
    currentStepRef.current = next; setGuidePhase("independent"); markEdited(); setEditVersion((value) => value + 1); setArtwork({ ...artwork, currentStep: next });
  }

  function closeGrimiState() {
    setGrimiOpen(false); setGrimiCollapsed(false); setCoaching(null); setAiGuide(null); setGuidePhase("independent"); setGrimiError("");
  }

  async function finishGuide(outcome: "completed" | "free_exit") {
    if (!aiGuide || !artwork || !canvasRef.current || grimiLoading || conflictDraftRef.current) return;
    setGrimiLoading(true); setGrimiError("");
    try {
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({
        action: "finishGuide", outcome, artworkId: artwork.id, eventId: aiGuide.eventId,
        currentStep: aiGuideStep, document: documentState, imageDataUrl: imageData(canvasRef.current, 1024),
      }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "가이드 과정을 남기지 못했어요.");
      closeGrimiState(); void save(undefined, { currentStep: currentStepRef.current });
    } catch (cause) { setGrimiError(cause instanceof Error ? cause.message : "가이드 과정을 남기지 못했어요."); }
    finally { setGrimiLoading(false); }
  }

  function dismissGrimi() {
    if (aiGuide) { void finishGuide("free_exit"); return; }
    if (coaching?.eventId && artwork) void studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "dismiss", artworkId: artwork.id, eventId: coaching.eventId }) }).catch(() => undefined);
    closeGrimiState();
  }

  function guideControls() {
    if (!lessonGuideAvailable) return null;
    if (lesson?.mode === "observe" && !aiGuide) {
      return <div className="guide-actions observation-guide-actions" aria-label="관찰 그리기 점선 힌트">
        <button className="guide-toggle" type="button" aria-pressed={guidePhase === "practice"} disabled={Boolean(conflictDraft)} onClick={() => setGuidePhase((phase) => phase === "practice" ? "independent" : "practice")}>
          {guidePhase === "practice" ? "점선 힌트 숨기기" : "🔎 점선 힌트 보기"}
        </button>
      </div>;
    }
    return <div className="guide-actions" aria-label="그리기 시범과 점선">
      <button className="guide-demo-button" type="button" aria-pressed={guidePhase === "demo"} disabled={Boolean(conflictDraft)} onClick={() => guidePhase === "demo" ? stopGuideDemoForPractice() : startGuideDemo()}>
        {guidePhase === "demo" ? "시범 멈추기" : guidePhase === "practice" ? "✏️ 다시 보기" : "✏️ 먼저 보여줘"}
      </button>
      {guidePhase === "practice"
        ? <button className="guide-toggle" type="button" disabled={Boolean(conflictDraft)} onClick={chooseIndependentDrawing}>{guidePracticeTried ? "이제 혼자 해볼래" : "점선 숨기기"}</button>
        : guidePhase === "independent" && <button className="guide-toggle" type="button" disabled={Boolean(conflictDraft)} onClick={() => setGuidePhase("practice")}>점선만 보기</button>}
    </div>;
  }

  if (!artwork) return <main className="drawing-loading">{saveState}</main>;
  const step = lesson ? Math.min(artwork.currentStep, lesson.steps.length - 1) : 0;
  const guideNotice = guidePhase === "demo"
    ? "연필이 먼저 보여줄게!"
    : guidePhase === "practice"
      ? guidePracticeTried ? "한 번 따라 했어! 이제 점선 없이도 해볼까?" : "이제 네 차례야. 초록 점에서 시작해 봐."
      : "";
  const nextStepLabel = lesson ? step === lesson.steps.length - 1 ? "완성하기" : "다음" : "다음";
  return <main className="studio"><header className="studio-header"><a className="icon-button" href="/student" aria-label="그림 나가기">←</a><Logo compact /><div className="artwork-name"><b>{artwork.title}</b><small>{saveState}</small></div>{lesson && !aiGuide && <span className="step-count">{step + 1}/{lesson.steps.length}</span>}<button className="button ghost compact" onClick={() => setTimelapseOpen(true)}>과정 보기</button><button className="button grimi-button compact" disabled={grimiLoading || Boolean(conflictDraft)} onClick={askGrimi}>✨ 그리미 부르기</button><StudentMessageCenter messages={teacherMessages} floating compact /><button className="button primary compact" disabled={Boolean(conflictDraft)} onClick={() => setReflectionOpen(true)}>완성</button></header>
    {conflictDraft && <div className="save-conflict" role="alert"><b>{conflictDraft.save.conflict ? "다른 기기 저장과 겹쳤어요." : "아직 서버에 보내지 못한 그림이 있어요."}</b><span>{conflictDraft.save.conflict ? "이 작품의 충돌 초안을 복구했어요." : "인터넷이 연결되면 다시 저장해요."} 지금은 편집을 멈추고 새 사본으로도 보관할 수 있어요.{conflictRevision !== null ? ` (서버 버전 ${conflictRevision})` : ""}</span>{!conflictDraft.save.conflict && <button onClick={flushCurrentArtwork}>다시 저장</button>}<button onClick={saveAsCopy}>새 사본으로 저장</button></div>}
    {teacherViewing && <div className="teacher-viewing" role="status">선생님이 지금 내 그림을 보고 있어요.</div>}
    <VoiceWhisperStatus />
    <div className={`studio-body ${grimiOpen || lesson ? "" : "without-step-panel"}${grimiOpen ? " grimi-open" : ""}${grimiOpen && grimiCollapsed ? " grimi-collapsed" : ""}`}>{grimiOpen ? <aside className={`grimi-panel${grimiCollapsed ? " collapsed" : ""}`} aria-live="polite"><div className="grimi-head"><div><span>✨</span><b>그리미</b></div>{coaching && !grimiLoading && <button className="grimi-collapse" onClick={() => setGrimiCollapsed((value) => !value)}>{grimiCollapsed ? "✨ 그리미 다시 보기" : "✏️ 그리러 가기"}</button>}<button onClick={dismissGrimi} aria-label="그리미 닫기">×</button></div>{grimiCollapsed && coaching ? <div className="grimi-peek"><small>이제 그려 볼 일</small><div className="spoken-prompt"><b>{coaching.nextAction}</b><SpeakButton text={coaching.nextAction} compact /></div><button className="button primary full child-primary-action" disabled={grimiLoading || answerSaved || !answer} onClick={recordCoachingAnswer}><span aria-hidden="true">✅</span>{answerSaved ? "과정에 남겼어요" : "그렸어요"}</button></div> : <div className="grimi-scroll">
        {grimiLoading && <div className="grimi-thinking"><span>●</span><span>●</span><span>●</span><p>그림을 보고 있어요…</p></div>}
        {grimiError && <p className="error-box">{grimiError}</p>}
        {coaching && !grimiLoading && <div className="grimi-coaching"><p className="eyebrow">그리미가 궁금해요</p><div className="spoken-prompt"><h2>{coaching.question}</h2><SpeakButton text={`${coaching.question} 고를 수 있어요. ${coaching.choices.map((choice) => choice.label).join(", ")}`} compact /></div><div className="grimi-chips">{coaching.choices.map((choice) => <button aria-pressed={answer === choice.answer} onClick={() => { setAnswer(choice.answer); setAnswerLabel(choice.label); setAnswerSaved(false); }} key={choice.label}><span>{choice.emoji}</span>{choice.label}</button>)}</div><label className="direct-answer">직접 말하기<input maxLength={80} value={answerLabel ? "" : answer} onChange={(event) => { setAnswer(event.target.value); setAnswerLabel(""); setAnswerSaved(false); }} placeholder="내 생각을 짧게 적어도 돼요" /></label>{answer && <div className="next-action"><small>이제 그려 볼 일</small><div className="spoken-prompt"><b>{coaching.nextAction}</b><SpeakButton text={coaching.nextAction} compact /></div><button className="button primary full child-primary-action" disabled={grimiLoading || answerSaved} onClick={recordCoachingAnswer}><span aria-hidden="true">✅</span>{answerSaved ? "과정에 남겼어요" : "그린 뒤 ‘했어요’"}</button></div>}</div>}
        {aiGuide && !grimiLoading && <div className="ai-guide"><p className="eyebrow">{aiGuide.topic} · {aiGuideStep + 1}/{aiGuide.steps.length}</p><div className="spoken-prompt"><h2>{aiGuide.steps[aiGuideStep].instruction}</h2><SpeakButton text={`${aiGuide.steps[aiGuideStep].instruction}${aiGuide.steps[aiGuideStep].choices.length ? ` 고를 수 있어요. ${aiGuide.steps[aiGuideStep].choices.join(", ")}` : ""}`} compact /></div>{aiGuide.steps[aiGuideStep].openChoice && <div className="grimi-chips">{aiGuide.steps[aiGuideStep].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => chooseChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || aiGuideStep === 0} onClick={() => chooseGuideStep(aiGuideStep - 1)}>⬅️ 이전</button><button disabled={Boolean(conflictDraft)} onClick={() => aiGuideStep === aiGuide.steps.length - 1 ? void finishGuide("completed") : chooseGuideStep(aiGuideStep + 1)}>{aiGuideStep === aiGuide.steps.length - 1 ? "🎨 이제 내 마음대로" : "➡️ 다음"}</button></div></div>}
        {!aiGuide && !grimiLoading && <div className="guide-request"><label>그리고 싶은 게 있어?<div className="quick-topic-row">{QUICK_DRAW_TOPICS.map((topic) => <button type="button" aria-pressed={guideTopic === topic.label} onClick={() => setGuideTopic(topic.label)} key={topic.label}><span>{topic.emoji}</span>{topic.label}</button>)}</div><input maxLength={60} value={guideTopic} onChange={(event) => setGuideTopic(event.target.value)} placeholder="예: 우주 자전거" /></label><button className="button secondary full child-primary-action" disabled={guideTopic.trim().length < 2} onClick={requestAiGuide}><span aria-hidden="true">🪄</span>단계 가이드 만들기</button></div>}
        </div>}{!grimiCollapsed && <button className="text-button free-exit" onClick={dismissGrimi}>그냥 내 마음대로 그릴래</button>}
      </aside> : lesson && <aside className="step-panel"><div className="reference-tile"><LessonIllustration lesson={lesson} currentStep={step} /><small>{lesson.topic} {lesson.mode === "observe" ? "관찰하기" : "그려 보기"}</small></div><p className="eyebrow">지금 할 일</p><div className="spoken-prompt lesson-spoken-prompt"><h2>{lesson.steps[step].instruction}</h2><SpeakButton text={`${lesson.steps[step].instruction}${lesson.steps[step].choices?.length ? ` 고를 수 있어요. ${lesson.steps[step].choices.join(", ")}` : ""}`} compact /></div>{lesson.steps[step].choices?.length && <div className="choice-chips">{lesson.steps[step].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => chooseChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || step === 0} onClick={() => changeLessonStep(-1)}>⬅️ 이전</button><button disabled={Boolean(conflictDraft)} onClick={() => { if (step === lesson.steps.length - 1) { setReflectionOpen(true); return; } changeLessonStep(1); }}><span aria-hidden="true">{step === lesson.steps.length - 1 ? "⭐" : "➡️"}</span>{nextStepLabel}</button></div><button className="text-button" onClick={chooseIndependentDrawing}>🎨 그냥 그릴래</button></aside>}
      <section className="canvas-zone"><div className="canvas-wrap" ref={wrapRef}>{guideNotice && <div className="guide-notice" role="status" aria-live="polite">{guidePhase === "demo" ? "✏️" : "🟢"} {guideNotice}</div>}{!lesson && !aiGuide && !documentState.ops.length && !shapeStartPoint && <div className="canvas-start-hint" role="status">✏️ 하얀 종이에 그어 봐!</div>}{shapeStartPoint && <div className="canvas-start-hint" role="status">🟢 끝나는 곳을 콕 눌러 줘!</div>}{canvasFull && <div className="canvas-full-hint" role="alert"><span aria-hidden="true">🌟</span> 종이가 가득 찼어! ‘완성’을 눌러 완성하자.<SpeakButton text="종이가 가득 찼어요. 위에 있는 완성을 눌러 작품을 완성해요." compact /></div>}<div className="canvas-stack" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}><canvas ref={guideRef} className={guidePhase !== "independent" && lessonGuideAvailable ? "guide-canvas" : "guide-canvas hidden"} aria-hidden="true" />{mirror && <div className="mirror-axis" aria-hidden="true" />}{shapeStartPoint && <div className="shape-start-dot" aria-hidden="true" style={{ left: `${shapeStartPoint.x * 100}%`, top: `${shapeStartPoint.y * 100}%` }} />}<canvas ref={canvasRef} className="draw-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerCancel} aria-disabled={Boolean(conflictDraft)} aria-label="그림 그리는 도화지" /></div>{view.scale > 1.01 && <button type="button" className="zoom-reset" onClick={resetViewToFit}>🔍 {Math.round(view.scale * 100)}% · 화면 맞춤</button>}</div></section>
      <aside className="tool-panel" aria-label="그리기 도구 모음"><p className="tool-section-label tools-label">도구</p><div className="tool-group brush-group" role="group" aria-label="브러시"><button type="button" aria-pressed={studioTool === "pencil"} onClick={() => chooseStudioTool("pencil")}><span className="tool-icon" aria-hidden="true">✏️</span>연필</button><button type="button" aria-pressed={studioTool === "crayon"} onClick={() => chooseStudioTool("crayon")}><span className="tool-icon" aria-hidden="true">🖍️</span>크레용</button><button type="button" aria-pressed={studioTool === "marker"} onClick={() => chooseStudioTool("marker")}><span className="tool-icon" aria-hidden="true">🖊️</span>마커</button><button type="button" aria-pressed={studioTool === "watercolor"} onClick={() => chooseStudioTool("watercolor")}><span className="tool-icon" aria-hidden="true">🖌️</span>수채붓</button></div><div className="tool-group make-group" role="group" aria-label="채우기와 도형"><button type="button" aria-pressed={studioTool === "fill"} onClick={() => chooseStudioTool("fill")}><span className="tool-icon" aria-hidden="true">🪣</span>채우기</button><button type="button" aria-pressed={studioTool === "shape"} onClick={() => chooseStudioTool("shape")}><span className="tool-icon" aria-hidden="true">⬠</span>도형</button></div>{studioTool === "shape" && <div className="shape-kind-row" role="group" aria-label="도형 고르기">{SHAPE_KINDS.map((item) => <button type="button" aria-label={item.label} title={item.label} aria-pressed={shapeKind === item.kind} onClick={() => { setShapeKind(item.kind); clearShapeStart(); }} key={item.kind}>{item.icon}</button>)}</div>}<div className="tool-group edit-group" role="group" aria-label="고치기"><button type="button" aria-pressed={studioTool === "eraser"} onClick={() => chooseStudioTool("eraser")}><span className="tool-icon eraser-icon" aria-hidden="true"><i /><i /></span>지우개</button><button type="button" aria-pressed={mirror} onClick={() => setMirror((value) => !value)}><span className="tool-icon" aria-hidden="true">🦋</span>대칭</button></div><p className="tool-section-label width-label">굵기</p><div className="width-row" role="group" aria-label="선 굵기">{STROKE_WIDTHS.map((value) => <button type="button" aria-label={STROKE_WIDTH_LABELS[value]} title={STROKE_WIDTH_LABELS[value]} aria-pressed={width === value} onClick={() => chooseWidth(value)} key={value}><i aria-hidden="true" style={{ width: Math.max(6, Math.min(34, value * .72)), height: Math.max(6, Math.min(34, value * .72)) }} /><small>{STROKE_WIDTH_LABELS[value]}</small></button>)}</div><p className="tool-section-label color-label">색</p><div className="palette-shade" role="group" aria-label="색 밝기"><button type="button" aria-pressed={paletteShade === "base"} onClick={() => setPaletteShade("base")}>기본</button><button type="button" aria-pressed={paletteShade === "light"} onClick={() => setPaletteShade("light")}>밝게</button></div><div className="palette" role="group" aria-label="색 고르기">{(paletteShade === "base" ? PALETTE : LIGHT_PALETTE).map((value) => <button type="button" aria-label={COLOR_NAMES[value]} title={COLOR_NAMES[value]} aria-pressed={color === value} onClick={() => { setColor(value); if (studioTool === "eraser") chooseStudioTool(lastBrushRef.current); }} key={value} style={{ background: value }} />)}</div>{penMode && <button type="button" className="pen-mode-note" onClick={disablePenMode}>✍️ 펜으로 그려요 · 손가락으로 그리려면 눌러요</button>}<div className="history-row" role="group" aria-label="그리기 기록"><button type="button" onClick={undo} disabled={Boolean(conflictDraft) || !documentState.ops.length}>↶ 되돌리기</button><button type="button" onClick={redoLast} disabled={Boolean(conflictDraft) || !redo.length}>↷ 다시하기</button></div></aside></div>
    {timelapseOpen && <TimelapsePlayer document={documentState} onClose={() => setTimelapseOpen(false)} />}
    {reflectionOpen && <div className="modal-backdrop" ref={reflectionDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reflection-title"><section className="reflection-modal"><button className="modal-close" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button><span className="modal-emoji">🌟</span><div className="reflection-title-row"><h2 id="reflection-title">내 그림을 소개해 줘!</h2><SpeakButton text="제일 마음에 드는 곳과 그 이유를 그림으로 골라요." /></div><div className="reflection-question"><p>마음에 드는 곳은?</p><div className="reflection-choice-grid">{FAVORITE_PART_CHOICES.map((choice) => <button type="button" aria-pressed={favoritePart === choice.value} onClick={() => setFavoritePart(choice.value)} key={choice.value}><span>{choice.emoji}</span>{choice.label}</button>)}</div></div><div className="reflection-question"><p>왜 마음에 들어?</p><div className="reflection-choice-grid">{FAVORITE_REASON_CHOICES.map((choice) => <button type="button" aria-pressed={favoriteReason === choice.value} onClick={() => setFavoriteReason(choice.value)} key={choice.value}><span>{choice.emoji}</span>{choice.label}</button>)}</div></div><details className="reflection-write-more"><summary>⌨️ 직접 글로 쓰고 싶어요</summary><label htmlFor="favorite-part">마음에 드는 곳<input id="favorite-part" maxLength={80} value={favoritePart} onChange={(event) => setFavoritePart(event.target.value)} placeholder="예: 무지개 꼬리" /></label><label htmlFor="favorite-reason">마음에 드는 이유<textarea id="favorite-reason" maxLength={180} value={favoriteReason} onChange={(event) => setFavoriteReason(event.target.value)} placeholder="예: 내가 고른 색이 좋아서" /></label></details><div className="modal-actions"><button className="button secondary" onClick={() => setReflectionOpen(false)}>🎨 더 그릴래</button><button className="button primary child-primary-action" disabled={!favoritePart || !favoriteReason} onClick={complete}><span aria-hidden="true">⭐</span>작품 완성</button></div></section></div>}
  </main>;
}
