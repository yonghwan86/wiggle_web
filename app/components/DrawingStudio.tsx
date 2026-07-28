"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DrawDocument, DrawOp, emptyDocument, estimateDocumentBytes, estimateStrokeBytes, MAX_DOCUMENT_BYTES, MAX_DOCUMENT_OPS, MAX_STROKE_POINTS, roundUnit } from "@/lib/drawing-model";
import { renderDrawOperation, resetDrawingCanvas } from "@/lib/draw-renderer";
import { lessonBySlug, Lesson } from "@/lib/lesson-content";
import { activeProfile, clearQueuedArtworkSaves, createSerialTaskQueue, deleteQueuedArtworkSave, flushSaves, queueSave, queuedArtworkDraft, resolveArtworkDraftDisposition, studentFetch } from "@/lib/client-session";

import type { QueuedArtworkDraft } from "@/lib/client-session";
import { Logo } from "./Logo";
import { SpeakButton } from "./SpeakButton";
import { TimelapsePlayer } from "./TimelapsePlayer";
import { VoiceWhisperStatus } from "./VoiceWhisper";
import { useModalDialog } from "./useModalDialog";

const PALETTE = ["#1B3A57", "#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA", "#8D6E63", "#F06292", "#4DD0E1", "#FFCC80", "#FFFFFF"];
const COLOR_NAMES: Record<(typeof PALETTE)[number], string> = {
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
};
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
type Tool = "pen" | "crayon" | "eraser";
type StrokeWidth = 8 | 16 | 30;
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

// 서버 한도에 부딪히면 그 작품은 이후 모든 저장이 실패해 조용히 유실된다.
// 여유분을 두고 미리 멈춰서 아이가 완성으로 안내받게 한다.
const STROKE_POINT_SPLIT = MAX_STROKE_POINTS - 500;
const OPS_WARN_THRESHOLD = MAX_DOCUMENT_OPS - 200;
const DOCUMENT_BYTES_WARN = MAX_DOCUMENT_BYTES - 100_000;
const AUTOSAVE_DEBOUNCE_MS = 1500;
const AUTOSAVE_MAX_WAIT_MS = 6000;

function documentTooLarge(document: DrawDocument) {
  return document.ops.length >= OPS_WARN_THRESHOLD || estimateDocumentBytes(document) >= DOCUMENT_BYTES_WARN;
}

function mutationId() { return `mutation_${crypto.randomUUID().replaceAll("-", "")}`; }
function coachingRequestId() { return `coaching_${crypto.randomUUID().replaceAll("-", "")}`; }

export function DrawingStudio() {
  const params = useParams<{ id: string }>(); const search = useSearchParams();
  const requestedLesson = useMemo(() => lessonBySlug(search.get("lesson") ?? ""), [search]);
  const [artwork, setArtwork] = useState<ArtworkPayload | null>(null); const [documentState, setDocumentState] = useState<DrawDocument>(emptyDocument());
  const lesson = useMemo(() => params.id === "new" ? requestedLesson : lessonBySlug(artwork?.lessonSlug), [artwork?.lessonSlug, params.id, requestedLesson]);
  const [tool, setTool] = useState<Tool>("pen"); const [color, setColor] = useState(PALETTE[0]); const [width, setWidth] = useState<StrokeWidth>(16);
  const [redo, setRedo] = useState<DrawOp[]>([]); const [guidePhase, setGuidePhase] = useState<GuidePhase>("independent"); const [guideDemoRun, setGuideDemoRun] = useState(0); const [guidePracticeTried, setGuidePracticeTried] = useState(false); const [saveState, setSaveState] = useState("불러오는 중"); const [editVersion, setEditVersion] = useState(0);
  const [reflectionOpen, setReflectionOpen] = useState(false); const [favoritePart, setFavoritePart] = useState(""); const [favoriteReason, setFavoriteReason] = useState(""); const [message, setMessage] = useState("");
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
  const canvasRef = useRef<HTMLCanvasElement>(null); const guideRef = useRef<HTMLCanvasElement>(null); const guideAnimationRef = useRef<number | null>(null); const activePoints = useRef(new Map<number, Array<{ x: number; y: number; pressure: number }>>()); const revisionRef = useRef(0); const initialized = useRef(false); const saveTimer = useRef<number | undefined>(undefined); const conflictDraftRef = useRef<QueuedArtworkDraft | null>(null); const completingRef = useRef(false); const documentStateRef = useRef(documentState); const currentStepRef = useRef(0); const loadingKeyRef = useRef<string | null>(null); const hydratedKeyRef = useRef<string | null>(null); const pendingSinceRef = useRef(0); const unsavedRef = useRef(false); const editSeqRef = useRef(0); const artworkRef = useRef<ArtworkPayload | null>(null);

  const createOrLoad = useCallback(async () => {
    const loadKey = params.id === "new" ? `new:${search.toString()}` : params.id;
    if (loadingKeyRef.current === loadKey || hydratedKeyRef.current === loadKey) return;
    loadingKeyRef.current = loadKey;
    try {
      const profile = activeProfile(); if (!profile) { location.href = "/join"; return; }
      const artworkUrl = params.id === "new" ? undefined : `/api/artworks/${params.id}`;
      // 오프라인 큐는 부가 기능이다. IndexedDB를 못 열어도 그리기 화면은 온라인 모드로 열려야 한다.
      const flushed = await flushSaves(profile.studentId, artworkUrl).catch(() => ({ flushed: 0, remaining: [], completedUrls: [] as string[], latestRevisions: {} as Record<string, number> }));
      const flushedDisposition = artworkUrl ? resolveArtworkDraftDisposition(flushed.remaining, artworkUrl, flushed.completedUrls.includes(artworkUrl)) : { action: "load" as const };
      if (flushedDisposition.action === "archive") { hydratedKeyRef.current = loadKey; location.replace("/student/archive"); return; }
      const restoredDraft = flushedDisposition.action === "recover" ? flushedDisposition.draft : null;
      if (params.id === "new") {
        const mode = lesson?.mode ?? (search.get("mode") === "free" ? "free" : "free");
        const title = lesson?.title ?? "내 마음 그림"; const topic = lesson?.topic ?? "자유 창작";
        const clientArtworkId = `artwork_${crypto.randomUUID().replaceAll("-", "")}`;
        const response = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({ clientArtworkId, learningMode: mode, lessonSlug: lesson?.slug ?? null, title, topic, intent: lesson ? `${topic}을 보고 내 생각을 더한다.` : "내 마음대로 그리고 싶다." }) });
        const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error);
        hydratedKeyRef.current = loadKey; location.replace(`/student/draw/${data.artwork.id}`); return;
      }
      const response = await studentFetch(`/api/artworks/${encodeURIComponent(params.id)}`); const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error);
      const loadDisposition = artworkUrl ? resolveArtworkDraftDisposition(flushed.remaining, artworkUrl, data.artwork.status === "complete") : { action: "load" as const };
      if (loadDisposition.action === "archive") { hydratedKeyRef.current = loadKey; location.replace("/student/archive"); return; }
      const loadDraft = loadDisposition.action === "recover" ? loadDisposition.draft : restoredDraft;
      const loadedStep = loadDraft?.currentStep ?? data.artwork.currentStep; const loadedDocument = loadDraft?.document ?? data.artwork.document;
      currentStepRef.current = loadedStep; documentStateRef.current = loadedDocument;
      setArtwork({ ...data.artwork, currentStep: loadedStep });
      setDocumentState(loadedDocument); setRedo([]); setEditVersion(0);
      conflictDraftRef.current = loadDraft; setConflictDraft(loadDraft); setConflictRevision(loadDraft?.save.conflictRevision ?? null);
      revisionRef.current = data.artwork.revision; initialized.current = true; hydratedKeyRef.current = loadKey;
      setSaveState(loadDraft ? (loadDraft.save.conflict ? "저장 충돌 초안을 복구했어요" : "전송을 기다리는 기기 초안을 복구했어요") : "저장됨");
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
  useEffect(() => { const poll = async () => { try { const response = await studentFetch("/api/student"); const data = await response.json() as { messages?: Array<{ body: string }>; teacherViewing?: boolean }; setMessage(data.messages?.at(-1)?.body ?? ""); setTeacherViewing(Boolean(data.teacherViewing)); } catch {} }; void poll(); const timer = window.setInterval(poll, 5000); return () => clearInterval(timer); }, []);

  const performSave = useCallback(async (nextDocument: DrawDocument, options?: SaveOptions) => {
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
        const upgradedBody = JSON.stringify({ ...(JSON.parse(existingDraft.save.body) as Record<string, unknown>), requestId, document: documentStateRef.current, currentStep: currentStepRef.current, thumbnailDataUrl: imageData(canvasRef.current, 256), complete: true, finalDataUrl: imageData(canvasRef.current, 1024), reflection: options.reflection });
        await preserveDraft({ requestId, studentId: profile.studentId, url: existingDraft.save.url, body: upgradedBody, createdAt, branchId: saveBranchId, conflict: true, conflictRevision: existingDraft.save.conflictRevision }, "완성한 그림과 소감을 기기에 안전하게 보관했어요");
      } else {
        setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요");
      }
      return false;
    }
    const requestId = mutationId(); const url = `/api/artworks/${artwork.id}`; const createdAt = new Date().toISOString();
    // 이 저장이 담아 가는 편집 세대. 저장이 오가는 동안 아이가 더 그리면 세대가 올라가고,
    // 늦게 끝난 저장이 "저장됨"으로 덮어써 새 선을 미저장 목록에서 지워 버리는 일을 막는다.
    const savingEdit = editSeqRef.current;
    const body = JSON.stringify({ requestId, expectedRevision: revisionRef.current, document: nextDocument, currentStep: options?.currentStep ?? artwork.currentStep, thumbnailDataUrl: imageData(canvasRef.current, 256), complete: options?.complete ?? false, finalDataUrl: options?.complete ? imageData(canvasRef.current, 1024) : undefined, reflection: options?.reflection });
    setSaveState(navigator.onLine ? "저장 중…" : "기기에 보관 중");
    try {
      const response = await studentFetch(url, { method: "PUT", body }); const data = await response.json() as { error?: string; serverRevision?: number; revision?: number };
      if (response.status === 409) {
        const serverRevision = typeof data.serverRevision === "number" ? data.serverRevision : revisionRef.current;
        const conflictBody = JSON.stringify({ ...(JSON.parse(body) as Record<string, unknown>), document: documentStateRef.current, currentStep: currentStepRef.current, thumbnailDataUrl: imageData(canvasRef.current, 256), finalDataUrl: options?.complete ? imageData(canvasRef.current, 1024) : undefined });
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
      if (editSeqRef.current === savingEdit) unsavedRef.current = false;
      setSaveState(options?.complete ? "완성했어요" : "저장됨");
      try { await clearQueuedArtworkSaves(profile.studentId, url, "pending", { createdAt, requestId }, saveBranchId); }
      catch { /* 큐 정리는 다음 flush에서 다시 시도한다 */ }
      return true;
    } catch {
      const queued = { requestId, studentId: profile.studentId, url, body, createdAt, branchId: saveBranchId };
      if (options?.complete) await preserveDraft(queued, "완성한 그림을 기기에 안전하게 보관했어요");
      else { await queueSave(queued); setSaveState("기기에 안전하게 보관됨"); }
      return false;
    }
  }, [artwork, saveBranchId]);
  const save = useCallback((nextDocument: DrawDocument, options?: SaveOptions) => runSerial(() => performSave(nextDocument, options)), [performSave, runSerial]);

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
  function chooseTool(nextTool: Tool) {
    setTool(nextTool);
    setWidth(nextTool === "eraser" ? 30 : 16);
  }
  // 한 스트로크만으로도 서버 한도(직렬화 1.25MB, ops 5000)를 넘길 수 있다.
  // 넘길 만큼 길면 들어갈 수 있는 데까지만 남기고 그리기를 멈춘다.
  function fitStrokePoints(points: Array<{ x: number; y: number; pressure: number }>) {
    const budget = DOCUMENT_BYTES_WARN - estimateDocumentBytes(documentStateRef.current);
    if (budget <= 0 || estimateStrokeBytes(0) >= budget) return [];
    if (estimateStrokeBytes(points.length) <= budget) return points;
    const allowed = Math.floor((budget - estimateStrokeBytes(0)) / (estimateStrokeBytes(1) - estimateStrokeBytes(0)));
    return points.slice(0, Math.max(0, allowed));
  }
  function commitStroke(points: Array<{ x: number; y: number; pressure: number }>) {
    if (documentStateRef.current.ops.length >= OPS_WARN_THRESHOLD) return false;
    const fitted = fitStrokePoints(points);
    if (!fitted.length) return false;
    const operationId = crypto.randomUUID().replaceAll("-", "");
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "stroke", at: new Date().toISOString(), tool, color: tool === "eraser" ? undefined : color, width, points: fitted };
    markEdited();
    documentStateRef.current = { ...documentStateRef.current, ops: [...documentStateRef.current.ops, op] };
    setDocumentState(documentStateRef.current); setRedo([]); setEditVersion((value) => value + 1);
    return fitted.length === points.length;
  }
  function endStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    activePoints.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    renderDocument(event.currentTarget, documentStateRef.current);
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (conflictDraftRef.current) { setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
    if (canvasFull) { setSaveState("종이가 가득 찼어요. ‘다 그렸어요’를 눌러 완성해요"); return; }
    // 한 번에 한 포인터만 그린다. 그렇지 않으면 태블릿에 얹은 손바닥 접촉이 각각 별도의 선이 된다.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (activePoints.current.size > 0 && !activePoints.current.has(event.pointerId)) return;
    if (guidePhase === "demo") stopGuideDemoForPractice();
    event.preventDefault();
    const first = canvasPoint(event);
    event.currentTarget.setPointerCapture(event.pointerId); activePoints.current.set(event.pointerId, [first]);
    renderLiveStroke(event.currentTarget, tool, color, width, [first]);
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const points = activePoints.current.get(event.pointerId); if (!points) return;
    const next = canvasPoint(event); const last = points.at(-1);
    if (last && Math.hypot((next.x - last.x) * 1024, (next.y - last.y) * 1024) >= 2.5) {
      event.preventDefault(); points.push(next);
      renderLiveStroke(event.currentTarget, tool, color, width, [last, next]);
      // 손을 떼지 않고 계속 문지르면 한 스트로크가 서버 한도를 넘는다. 화면은 그대로 두고
      // 안쪽에서만 끊어 이어 붙인다. 한도에 닿으면 그 자리에서 입력을 끝낸다.
      if (points.length >= STROKE_POINT_SPLIT) {
        const wholeStrokeFit = commitStroke(points.slice());
        if (!wholeStrokeFit) { endStroke(event); return; }
        activePoints.current.set(event.pointerId, [next]);
      }
    }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const points = activePoints.current.get(event.pointerId);
    if (conflictDraftRef.current) {
      activePoints.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      // 미리보기로 그려 둔 픽셀을 지우지 않으면 문서에 없는 선이 썸네일에 섞인다.
      renderDocument(event.currentTarget, documentStateRef.current);
      setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return;
    }
    if (!points?.length) return; event.preventDefault();
    activePoints.current.delete(event.pointerId);
    commitStroke(points);
    if ((guidePhase === "practice" || guidePhase === "demo") && lessonGuideAvailable && tool !== "eraser") setGuidePracticeTried(true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function undo() {
    if (conflictDraftRef.current) return;
    const op = documentStateRef.current.ops.at(-1); if (!op) return;
    markEdited();
    setDocumentState((current) => ({ ...current, ops: current.ops.slice(0, -1) }));
    setRedo((items) => [...items, op]); setEditVersion((value) => value + 1);
  }
  function redoLast() {
    if (conflictDraftRef.current) return;
    const op = redo.at(-1); if (!op) return;
    markEdited();
    setDocumentState((current) => ({ ...current, ops: [...current.ops, op] }));
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
    const response = await studentFetch(`/api/artworks/${createdData.artwork.id}`, { method: "PUT", body: JSON.stringify({ requestId: copyRequestId, expectedRevision: 0, document: draft.document, currentStep: draft.currentStep, thumbnailDataUrl: imageData(canvasRef.current, 256), complete: draft.complete, finalDataUrl: draft.finalDataUrl, reflection: draft.reflection }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setSaveState(data.error ?? "사본을 저장하지 못했어요"); return; }
    await deleteQueuedArtworkSave(profile.studentId, draft.save.url, draft.save.requestId);
    conflictDraftRef.current = null; setConflictDraft(null); setConflictRevision(null);
    location.replace(draft.complete ? "/student/archive" : `/student/draw/${createdData.artwork.id}`);
  }

  async function askGrimi() {
    if (!artwork || !canvasRef.current || grimiLoading) return;
    setGrimiOpen(true); setGrimiCollapsed(false); setGrimiLoading(true); setGrimiError(""); setCoaching(null); setAnswer(""); setAnswerLabel(""); setAnswerSaved(false); setAiGuide(null); setGuidePhase("independent");
    window.clearTimeout(saveTimer.current);
    const saved = await save(documentState); if (!saved) { setGrimiLoading(false); setGrimiError("그림을 먼저 저장한 뒤 다시 불러 줘."); return; }
    try {
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "ask", requestId: coachingRequestId(), artworkId: artwork.id, expectedRevision: revisionRef.current, document: documentState, imageDataUrl: imageData(canvasRef.current, 1024), childChoice }) });
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
    const saved = await save(documentState); if (!saved) { setGrimiLoading(false); setGrimiError("그림을 먼저 저장한 뒤 다시 해 줘."); return; }
    try {
      const response = await studentFetch("/api/ai/coaching", { method: "POST", body: JSON.stringify({ action: "guide", requestId: coachingRequestId(), artworkId: artwork.id, expectedRevision: revisionRef.current, document: documentState, imageDataUrl: imageData(canvasRef.current, 1024), requestedTopic: guideTopic, childChoice }) });
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
      setAnswerSaved(true); setChildChoice(answer); void save(documentState);
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
      closeGrimiState(); void save(documentState);
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
  const nextStepLabel = lesson ? step === lesson.steps.length - 1 ? "그림 다 그렸어요" : "다음" : "다음";
  return <main className="studio"><header className="studio-header"><a className="icon-button" href="/student" aria-label="그림 나가기">←</a><Logo compact /><div className="artwork-name"><b>{artwork.title}</b><small>{saveState}</small></div>{lesson && !aiGuide && <span className="step-count">{step + 1}/{lesson.steps.length}</span>}<button className="button ghost compact" onClick={() => setTimelapseOpen(true)}>과정 보기</button><button className="button grimi-button compact" disabled={grimiLoading || Boolean(conflictDraft)} onClick={askGrimi}>✨ 그리미 부르기</button><button className="button primary compact" disabled={Boolean(conflictDraft)} onClick={() => setReflectionOpen(true)}>다 그렸어요</button></header>
    {conflictDraft && <div className="save-conflict" role="alert"><b>{conflictDraft.save.conflict ? "다른 기기 저장과 겹쳤어요." : "아직 서버에 보내지 못한 그림이 있어요."}</b><span>{conflictDraft.save.conflict ? "이 작품의 충돌 초안을 복구했어요." : "인터넷이 연결되면 다시 저장해요."} 지금은 편집을 멈추고 새 사본으로도 보관할 수 있어요.{conflictRevision !== null ? ` (서버 버전 ${conflictRevision})` : ""}</span>{!conflictDraft.save.conflict && <button onClick={flushCurrentArtwork}>다시 저장</button>}<button onClick={saveAsCopy}>새 사본으로 저장</button></div>}
    {teacherViewing && <div className="teacher-viewing" role="status">선생님이 지금 내 그림을 보고 있어요.</div>}
    <VoiceWhisperStatus />
    {message && <div className="canvas-message"><b>👩‍🏫 선생님</b> {message}<SpeakButton text={`선생님이 말했어요. ${message}`} compact /></div>}
    <div className={`studio-body ${grimiOpen || lesson ? "" : "without-step-panel"}${grimiOpen ? " grimi-open" : ""}${grimiOpen && grimiCollapsed ? " grimi-collapsed" : ""}`}>{grimiOpen ? <aside className={`grimi-panel${grimiCollapsed ? " collapsed" : ""}`} aria-live="polite"><div className="grimi-head"><div><span>✨</span><b>그리미</b></div>{coaching && !grimiLoading && <button className="grimi-collapse" onClick={() => setGrimiCollapsed((value) => !value)}>{grimiCollapsed ? "✨ 그리미 다시 보기" : "✏️ 그리러 가기"}</button>}<button onClick={dismissGrimi} aria-label="그리미 닫기">×</button></div>{grimiCollapsed && coaching ? <div className="grimi-peek"><small>이제 그려 볼 일</small><div className="spoken-prompt"><b>{coaching.nextAction}</b><SpeakButton text={coaching.nextAction} compact /></div><button className="button primary full child-primary-action" disabled={grimiLoading || answerSaved || !answer} onClick={recordCoachingAnswer}><span aria-hidden="true">✅</span>{answerSaved ? "과정에 남겼어요" : "그렸어요"}</button></div> : <div className="grimi-scroll">
        {grimiLoading && <div className="grimi-thinking"><span>●</span><span>●</span><span>●</span><p>그림을 보고 있어요…</p></div>}
        {grimiError && <p className="error-box">{grimiError}</p>}
        {coaching && !grimiLoading && <div className="grimi-coaching"><p className="eyebrow">그리미가 궁금해요</p><div className="spoken-prompt"><h2>{coaching.question}</h2><SpeakButton text={`${coaching.question} 고를 수 있어요. ${coaching.choices.map((choice) => choice.label).join(", ")}`} compact /></div><div className="grimi-chips">{coaching.choices.map((choice) => <button aria-pressed={answer === choice.answer} onClick={() => { setAnswer(choice.answer); setAnswerLabel(choice.label); setAnswerSaved(false); }} key={choice.label}><span>{choice.emoji}</span>{choice.label}</button>)}</div><label className="direct-answer">직접 말하기<input maxLength={80} value={answerLabel ? "" : answer} onChange={(event) => { setAnswer(event.target.value); setAnswerLabel(""); setAnswerSaved(false); }} placeholder="내 생각을 짧게 적어도 돼요" /></label>{answer && <div className="next-action"><small>이제 그려 볼 일</small><div className="spoken-prompt"><b>{coaching.nextAction}</b><SpeakButton text={coaching.nextAction} compact /></div><button className="button primary full child-primary-action" disabled={grimiLoading || answerSaved} onClick={recordCoachingAnswer}><span aria-hidden="true">✅</span>{answerSaved ? "과정에 남겼어요" : "그린 뒤 ‘했어요’"}</button></div>}</div>}
        {aiGuide && !grimiLoading && <div className="ai-guide"><p className="eyebrow">{aiGuide.topic} · {aiGuideStep + 1}/{aiGuide.steps.length}</p><div className="spoken-prompt"><h2>{aiGuide.steps[aiGuideStep].instruction}</h2><SpeakButton text={`${aiGuide.steps[aiGuideStep].instruction}${aiGuide.steps[aiGuideStep].choices.length ? ` 고를 수 있어요. ${aiGuide.steps[aiGuideStep].choices.join(", ")}` : ""}`} compact /></div>{aiGuide.steps[aiGuideStep].openChoice && <div className="grimi-chips">{aiGuide.steps[aiGuideStep].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => setChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || aiGuideStep === 0} onClick={() => chooseGuideStep(aiGuideStep - 1)}>⬅️ 이전</button><button disabled={Boolean(conflictDraft)} onClick={() => aiGuideStep === aiGuide.steps.length - 1 ? void finishGuide("completed") : chooseGuideStep(aiGuideStep + 1)}>{aiGuideStep === aiGuide.steps.length - 1 ? "🎨 이제 내 마음대로" : "➡️ 다음"}</button></div></div>}
        {!aiGuide && !grimiLoading && <div className="guide-request"><label>그리고 싶은 게 있어?<div className="quick-topic-row">{QUICK_DRAW_TOPICS.map((topic) => <button type="button" aria-pressed={guideTopic === topic.label} onClick={() => setGuideTopic(topic.label)} key={topic.label}><span>{topic.emoji}</span>{topic.label}</button>)}</div><input maxLength={60} value={guideTopic} onChange={(event) => setGuideTopic(event.target.value)} placeholder="예: 우주 자전거" /></label><button className="button secondary full child-primary-action" disabled={guideTopic.trim().length < 2} onClick={requestAiGuide}><span aria-hidden="true">🪄</span>단계 가이드 만들기</button></div>}
        </div>}{!grimiCollapsed && <button className="text-button free-exit" onClick={dismissGrimi}>그냥 내 마음대로 그릴래</button>}
      </aside> : lesson && <aside className="step-panel"><div className="reference-tile"><span>{lesson.emoji}</span><small>{lesson.topic} {lesson.mode === "observe" ? "관찰하기" : "그려 보기"}</small></div><p className="eyebrow">지금 할 일</p><div className="spoken-prompt lesson-spoken-prompt"><h2>{lesson.steps[step].instruction}</h2><SpeakButton text={`${lesson.steps[step].instruction}${lesson.steps[step].choices?.length ? ` 고를 수 있어요. ${lesson.steps[step].choices.join(", ")}` : ""}`} compact /></div>{lesson.steps[step].choices?.length && <div className="choice-chips">{lesson.steps[step].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => setChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || step === 0} onClick={() => changeLessonStep(-1)}>⬅️ 이전</button><button disabled={Boolean(conflictDraft)} onClick={() => { if (step === lesson.steps.length - 1) { setReflectionOpen(true); return; } changeLessonStep(1); }}><span aria-hidden="true">{step === lesson.steps.length - 1 ? "⭐" : "➡️"}</span>{nextStepLabel}</button></div><button className="text-button" onClick={chooseIndependentDrawing}>🎨 그냥 그릴래</button></aside>}
      <section className="canvas-zone"><div className="canvas-wrap">{guideNotice && <div className="guide-notice" role="status" aria-live="polite">{guidePhase === "demo" ? "✏️" : "🟢"} {guideNotice}</div>}{!lesson && !aiGuide && !documentState.ops.length && <div className="canvas-start-hint" role="status">✏️ 연필로 하얀 종이에 그어 봐!</div>}{canvasFull && <div className="canvas-full-hint" role="alert"><span aria-hidden="true">🌟</span> 종이가 가득 찼어! ‘다 그렸어요’를 눌러 완성하자.<SpeakButton text="종이가 가득 찼어요. 위에 있는 다 그렸어요를 눌러 작품을 완성해요." compact /></div>}<canvas ref={guideRef} className={guidePhase !== "independent" && lessonGuideAvailable ? "guide-canvas" : "guide-canvas hidden"} aria-hidden="true" /><canvas ref={canvasRef} className="draw-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-disabled={Boolean(conflictDraft)} aria-label="그림 그리는 도화지" /></div></section>
      <aside className="tool-panel" aria-label="그리기 도구 모음"><p className="tool-section-label tools-label">무엇으로 그릴까?</p><div className="tool-group" role="group" aria-label="그리기 도구"><button type="button" aria-pressed={tool === "pen"} onClick={() => chooseTool("pen")}><span className="tool-icon" aria-hidden="true">✏️</span>연필</button><button type="button" aria-pressed={tool === "crayon"} onClick={() => chooseTool("crayon")}><span className="tool-icon" aria-hidden="true">🖍️</span>크레용</button><button type="button" aria-pressed={tool === "eraser"} onClick={() => chooseTool("eraser")}><span className="tool-icon eraser-icon" aria-hidden="true"><i /><i /></span>지우개</button></div><p className="tool-section-label width-label">얼마나 굵게?</p><div className="width-row" role="group" aria-label="선 굵기">{([8, 16, 30] as const).map((value) => { const label = value === 8 ? "얇게" : value === 16 ? "보통" : "굵게"; return <button type="button" aria-label={label} aria-pressed={width === value} onClick={() => setWidth(value)} key={value}><i aria-hidden="true" style={{ width: Math.max(8, value * .72), height: Math.max(8, value * .72) }} /><small>{label}</small></button>; })}</div><p className="tool-section-label color-label">무슨 색?</p><div className="palette" role="group" aria-label="색 고르기">{PALETTE.map((value) => <button type="button" aria-label={COLOR_NAMES[value]} title={COLOR_NAMES[value]} aria-pressed={color === value} onClick={() => { setColor(value); if (tool === "eraser") chooseTool("pen"); }} key={value} style={{ background: value }} />)}</div><div className="history-row" role="group" aria-label="그리기 기록"><button type="button" onClick={undo} disabled={Boolean(conflictDraft) || !documentState.ops.length}>↶ 되돌리기</button><button type="button" onClick={redoLast} disabled={Boolean(conflictDraft) || !redo.length}>↷ 다시하기</button></div></aside></div>
    {timelapseOpen && <TimelapsePlayer document={documentState} onClose={() => setTimelapseOpen(false)} />}
    {reflectionOpen && <div className="modal-backdrop" ref={reflectionDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reflection-title"><section className="reflection-modal"><button className="modal-close" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button><span className="modal-emoji">🌟</span><div className="reflection-title-row"><h2 id="reflection-title">내 그림을 소개해 줘!</h2><SpeakButton text="제일 마음에 드는 곳과 그 이유를 그림으로 골라요." /></div><div className="reflection-question"><p>마음에 드는 곳은?</p><div className="reflection-choice-grid">{FAVORITE_PART_CHOICES.map((choice) => <button type="button" aria-pressed={favoritePart === choice.value} onClick={() => setFavoritePart(choice.value)} key={choice.value}><span>{choice.emoji}</span>{choice.label}</button>)}</div></div><div className="reflection-question"><p>왜 마음에 들어?</p><div className="reflection-choice-grid">{FAVORITE_REASON_CHOICES.map((choice) => <button type="button" aria-pressed={favoriteReason === choice.value} onClick={() => setFavoriteReason(choice.value)} key={choice.value}><span>{choice.emoji}</span>{choice.label}</button>)}</div></div><details className="reflection-write-more"><summary>⌨️ 직접 글로 쓰고 싶어요</summary><label htmlFor="favorite-part">마음에 드는 곳<input id="favorite-part" maxLength={80} value={favoritePart} onChange={(event) => setFavoritePart(event.target.value)} placeholder="예: 무지개 꼬리" /></label><label htmlFor="favorite-reason">마음에 드는 이유<textarea id="favorite-reason" maxLength={180} value={favoriteReason} onChange={(event) => setFavoriteReason(event.target.value)} placeholder="예: 내가 고른 색이 좋아서" /></label></details><div className="modal-actions"><button className="button secondary" onClick={() => setReflectionOpen(false)}>🎨 더 그릴래</button><button className="button primary child-primary-action" disabled={!favoritePart || !favoriteReason} onClick={complete}><span aria-hidden="true">⭐</span>작품 완성</button></div></section></div>}
  </main>;
}
