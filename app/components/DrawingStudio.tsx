"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DrawDocument, DrawOp, emptyDocument } from "@/lib/drawing-model";
import { renderDrawOperation, resetDrawingCanvas } from "@/lib/draw-renderer";
import { lessonBySlug, Lesson } from "@/lib/lesson-content";
import { activeProfile, clearQueuedArtworkSaves, createSerialTaskQueue, deleteQueuedArtworkSave, flushSaves, queueSave, queuedArtworkDraft, resolveArtworkDraftDisposition, studentFetch } from "@/lib/client-session";
import type { QueuedArtworkDraft } from "@/lib/client-session";
import { Logo } from "./Logo";
import { TimelapsePlayer } from "./TimelapsePlayer";
import { VoiceWhisperStatus } from "./VoiceWhisper";

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
  const [coaching, setCoaching] = useState<(StudentCoaching & { eventId: string }) | null>(null); const [answer, setAnswer] = useState(""); const [answerLabel, setAnswerLabel] = useState(""); const [answerSaved, setAnswerSaved] = useState(false);
  const [guideTopic, setGuideTopic] = useState(""); const [aiGuide, setAiGuide] = useState<(AiGuide & { eventId: string }) | null>(null); const [aiGuideStep, setAiGuideStep] = useState(0); const [childChoice, setChildChoice] = useState("");
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [runSerial] = useState(createSerialTaskQueue);
  const [saveBranchId] = useState(() => `branch_${crypto.randomUUID().replaceAll("-", "")}`);
  const canvasRef = useRef<HTMLCanvasElement>(null); const guideRef = useRef<HTMLCanvasElement>(null); const guideAnimationRef = useRef<number | null>(null); const activePoints = useRef(new Map<number, Array<{ x: number; y: number; pressure: number }>>()); const revisionRef = useRef(0); const initialized = useRef(false); const saveTimer = useRef<number | undefined>(undefined); const conflictDraftRef = useRef<QueuedArtworkDraft | null>(null); const completingRef = useRef(false); const documentStateRef = useRef(documentState); const currentStepRef = useRef(0); const loadingKeyRef = useRef<string | null>(null); const hydratedKeyRef = useRef<string | null>(null);

  const createOrLoad = useCallback(async () => {
    const loadKey = params.id === "new" ? `new:${search.toString()}` : params.id;
    if (loadingKeyRef.current === loadKey || hydratedKeyRef.current === loadKey) return;
    loadingKeyRef.current = loadKey;
    try {
      const profile = activeProfile(); if (!profile) { location.href = "/join"; return; }
      const artworkUrl = params.id === "new" ? undefined : `/api/artworks/${params.id}`;
      const flushed = await flushSaves(profile.studentId, artworkUrl);
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
  useEffect(() => { currentStepRef.current = artwork?.currentStep ?? 0; }, [artwork?.currentStep]);
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
      await clearQueuedArtworkSaves(profile.studentId, url, "pending", { createdAt, requestId }, saveBranchId);
      revisionRef.current = data.revision ?? revisionRef.current; setSaveState(options?.complete ? "완성했어요" : "저장됨"); return true;
    } catch {
      const queued = { requestId, studentId: profile.studentId, url, body, createdAt, branchId: saveBranchId };
      if (options?.complete) await preserveDraft(queued, "완성한 그림을 기기에 안전하게 보관했어요");
      else { await queueSave(queued); setSaveState("기기에 안전하게 보관됨"); }
      return false;
    }
  }, [artwork, saveBranchId]);
  const save = useCallback((nextDocument: DrawDocument, options?: SaveOptions) => runSerial(() => performSave(nextDocument, options)), [performSave, runSerial]);

  useEffect(() => {
    if (!initialized.current || !artwork || editVersion === 0 || conflictDraft || completingRef.current) return; window.clearTimeout(saveTimer.current); setSaveState("그리는 중…");
    saveTimer.current = window.setTimeout(() => void save(documentState, { currentStep: artwork.currentStep }), 1500); return () => window.clearTimeout(saveTimer.current);
  }, [artwork, conflictDraft, documentState, editVersion, save]);

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
          conflictDraftRef.current = restored; setConflictDraft(restored); setConflictRevision(restored.save.conflictRevision ?? null);
          documentStateRef.current = restored.document; currentStepRef.current = restored.currentStep;
          setDocumentState(restored.document); setRedo([]); setEditVersion(0); setGuidePhase("independent");
          setArtwork((current) => current ? { ...current, currentStep: restored.currentStep } : current);
          setSaveState(restored.save.conflict ? "저장 충돌 초안을 복구했어요" : "기기 초안의 전송을 기다리고 있어요");
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

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), pressure: event.pressure || 0.5 }; }
  function chooseTool(nextTool: Tool) {
    setTool(nextTool);
    setWidth(nextTool === "eraser" ? 30 : 16);
  }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (conflictDraftRef.current) { setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
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
    }
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const points = activePoints.current.get(event.pointerId);
    if (conflictDraftRef.current) {
      activePoints.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return;
    }
    if (!points?.length) return; event.preventDefault(); const operationId = crypto.randomUUID().replaceAll("-", "");
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "stroke", at: new Date().toISOString(), tool, color: tool === "eraser" ? undefined : color, width, points };
    activePoints.current.delete(event.pointerId); setDocumentState((current) => ({ ...current, ops: [...current.ops, op] })); setRedo([]); setEditVersion((value) => value + 1);
    if ((guidePhase === "practice" || guidePhase === "demo") && lessonGuideAvailable && tool !== "eraser") setGuidePracticeTried(true);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function undo() { if (conflictDraftRef.current) return; setDocumentState((current) => { const op = current.ops.at(-1); if (!op) return current; setRedo((items) => [...items, op]); setEditVersion((value) => value + 1); return { ...current, ops: current.ops.slice(0, -1) }; }); }
  function redoLast() { if (conflictDraftRef.current) return; setRedo((items) => { const op = items.at(-1); if (!op) return items; setDocumentState((current) => ({ ...current, ops: [...current.ops, op] })); setEditVersion((value) => value + 1); return items.slice(0, -1); }); }
  async function complete() {
    if (completingRef.current) return;
    completingRef.current = true; window.clearTimeout(saveTimer.current);
    const ok = await save(documentState, { complete: true, reflection: { favoritePart, favoriteReason, spokenDescription: `${favoritePart}을(를) 그렸어요.`, storyText: "" } });
    if (ok) { location.href = "/student/archive"; return; }
    completingRef.current = false;
  }

  async function saveAsCopy() {
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
    setGrimiOpen(true); setGrimiLoading(true); setGrimiError(""); setCoaching(null); setAnswer(""); setAnswerLabel(""); setAnswerSaved(false); setAiGuide(null); setGuidePhase("independent");
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
    if (artwork?.currentStep !== bounded) { currentStepRef.current = bounded; setEditVersion((value) => value + 1); }
    setArtwork((value) => value && ({ ...value, currentStep: bounded }));
  }

  function changeLessonStep(delta: -1 | 1) {
    if (!artwork || !lesson || conflictDraftRef.current) { if (conflictDraftRef.current) setSaveState("먼저 보관한 그림을 새 사본으로 저장해 주세요"); return; }
    const next = Math.max(0, Math.min(lesson.steps.length - 1, artwork.currentStep + delta));
    if (next === artwork.currentStep) return;
    currentStepRef.current = next; setGuidePhase("independent"); setEditVersion((value) => value + 1); setArtwork({ ...artwork, currentStep: next });
  }

  function closeGrimiState() {
    setGrimiOpen(false); setCoaching(null); setAiGuide(null); setGuidePhase("independent"); setGrimiError("");
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
  return <main className="studio"><header className="studio-header"><a className="icon-button" href="/student" aria-label="그림 나가기">←</a><Logo compact /><div className="artwork-name"><b>{artwork.title}</b><small>{saveState}</small></div>{lesson && !aiGuide && <span className="step-count">{step + 1}/{lesson.steps.length}</span>}<button className="button ghost compact" onClick={() => setTimelapseOpen(true)}>과정 보기</button><button className="button grimi-button compact" disabled={grimiLoading || Boolean(conflictDraft)} onClick={askGrimi}>✨ 그리미 부르기</button><button className="button primary compact" disabled={Boolean(conflictDraft)} onClick={() => setReflectionOpen(true)}>다 그렸어요</button></header>
    {conflictDraft && <div className="save-conflict" role="alert"><b>{conflictDraft.save.conflict ? "다른 기기 저장과 겹쳤어요." : "아직 서버에 보내지 못한 그림이 있어요."}</b><span>{conflictDraft.save.conflict ? "이 작품의 충돌 초안을 복구했어요." : "인터넷이 연결되면 다시 저장해요."} 지금은 편집을 멈추고 새 사본으로도 보관할 수 있어요.{conflictRevision !== null ? ` (서버 버전 ${conflictRevision})` : ""}</span>{!conflictDraft.save.conflict && <button onClick={flushCurrentArtwork}>다시 저장</button>}<button onClick={saveAsCopy}>새 사본으로 저장</button></div>}
    {teacherViewing && <div className="teacher-viewing" role="status">선생님이 지금 내 그림을 보고 있어요.</div>}
    <VoiceWhisperStatus />
    {message && <div className="canvas-message"><b>선생님</b> {message}</div>}
    <div className={`studio-body ${grimiOpen || lesson ? "" : "without-step-panel"}`}>{grimiOpen ? <aside className="grimi-panel" aria-live="polite"><div className="grimi-head"><div><span>✨</span><b>그리미</b></div><button onClick={dismissGrimi} aria-label="그리미 닫기">×</button></div>
        {grimiLoading && <div className="grimi-thinking"><span>●</span><span>●</span><span>●</span><p>그림을 보고 있어요…</p></div>}
        {grimiError && <p className="error-box">{grimiError}</p>}
        {coaching && !grimiLoading && <div className="grimi-coaching"><p className="eyebrow">그리미가 궁금해요</p><h2>{coaching.question}</h2><div className="grimi-chips">{coaching.choices.map((choice) => <button aria-pressed={answer === choice.answer} onClick={() => { setAnswer(choice.answer); setAnswerLabel(choice.label); setAnswerSaved(false); }} key={choice.label}><span>{choice.emoji}</span>{choice.label}</button>)}</div><label className="direct-answer">직접 말하기<input maxLength={80} value={answerLabel ? "" : answer} onChange={(event) => { setAnswer(event.target.value); setAnswerLabel(""); setAnswerSaved(false); }} placeholder="내 생각을 짧게 적어도 돼요" /></label>{answer && <div className="next-action"><small>이제 그려 볼 일</small><b>{coaching.nextAction}</b><button className="button primary full" disabled={grimiLoading || answerSaved} onClick={recordCoachingAnswer}>{answerSaved ? "과정에 남겼어요" : "그린 뒤 ‘했어요’"}</button></div>}</div>}
        {aiGuide && !grimiLoading && <div className="ai-guide"><p className="eyebrow">{aiGuide.topic} · {aiGuideStep + 1}/{aiGuide.steps.length}</p><h2>{aiGuide.steps[aiGuideStep].instruction}</h2>{aiGuide.steps[aiGuideStep].openChoice && <div className="grimi-chips">{aiGuide.steps[aiGuideStep].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => setChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || aiGuideStep === 0} onClick={() => chooseGuideStep(aiGuideStep - 1)}>이전</button><button disabled={Boolean(conflictDraft)} onClick={() => aiGuideStep === aiGuide.steps.length - 1 ? void finishGuide("completed") : chooseGuideStep(aiGuideStep + 1)}>{aiGuideStep === aiGuide.steps.length - 1 ? "이제 내 마음대로" : "다음"}</button></div></div>}
        {!aiGuide && !grimiLoading && <div className="guide-request"><label>그리고 싶은 게 있어?<input maxLength={60} value={guideTopic} onChange={(event) => setGuideTopic(event.target.value)} placeholder="예: 우주 자전거" /></label><button className="button secondary full" disabled={guideTopic.trim().length < 2} onClick={requestAiGuide}>단계 가이드 만들기</button></div>}
        <button className="text-button free-exit" onClick={dismissGrimi}>그냥 내 마음대로 그릴래</button>
      </aside> : lesson && <aside className="step-panel"><div className="reference-tile"><span>{lesson.emoji}</span><small>{lesson.topic} {lesson.mode === "observe" ? "관찰하기" : "그려 보기"}</small></div><p className="eyebrow">지금 할 일</p><h2>{lesson.steps[step].instruction}</h2>{lesson.steps[step].choices?.length && <div className="choice-chips">{lesson.steps[step].choices.map((choice) => <button aria-pressed={childChoice === choice} onClick={() => setChildChoice(choice)} key={choice}>{choice}</button>)}</div>}{guideControls()}<div className="step-actions"><button disabled={Boolean(conflictDraft) || step === 0} onClick={() => changeLessonStep(-1)}>이전</button><button disabled={Boolean(conflictDraft)} onClick={() => { if (step === lesson.steps.length - 1) { setReflectionOpen(true); return; } changeLessonStep(1); }}>{step === lesson.steps.length - 1 ? "그림 다 그렸어요" : "다음"}</button></div><button className="text-button" onClick={chooseIndependentDrawing}>그냥 그릴래</button></aside>}
      <section className="canvas-zone"><div className="canvas-wrap">{guideNotice && <div className="guide-notice" role="status" aria-live="polite">{guidePhase === "demo" ? "✏️" : "🟢"} {guideNotice}</div>}{!lesson && !aiGuide && !documentState.ops.length && <div className="canvas-start-hint" role="status">✏️ 연필로 하얀 종이에 그어 봐!</div>}<canvas ref={guideRef} className={guidePhase !== "independent" && lessonGuideAvailable ? "guide-canvas" : "guide-canvas hidden"} aria-hidden="true" /><canvas ref={canvasRef} className="draw-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-disabled={Boolean(conflictDraft)} aria-label="그림 그리는 도화지" /></div></section>
      <aside className="tool-panel" aria-label="그리기 도구 모음"><p className="tool-section-label tools-label">무엇으로 그릴까?</p><div className="tool-group" role="group" aria-label="그리기 도구"><button type="button" aria-pressed={tool === "pen"} onClick={() => chooseTool("pen")}><span className="tool-icon" aria-hidden="true">✏️</span>연필</button><button type="button" aria-pressed={tool === "crayon"} onClick={() => chooseTool("crayon")}><span className="tool-icon" aria-hidden="true">🖍️</span>크레용</button><button type="button" aria-pressed={tool === "eraser"} onClick={() => chooseTool("eraser")}><span className="tool-icon eraser-icon" aria-hidden="true"><i /><i /></span>지우개</button></div><p className="tool-section-label width-label">얼마나 굵게?</p><div className="width-row" role="group" aria-label="선 굵기">{([8, 16, 30] as const).map((value) => { const label = value === 8 ? "얇게" : value === 16 ? "보통" : "굵게"; return <button type="button" aria-label={label} aria-pressed={width === value} onClick={() => setWidth(value)} key={value}><i aria-hidden="true" style={{ width: Math.max(8, value * .72), height: Math.max(8, value * .72) }} /><small>{label}</small></button>; })}</div><p className="tool-section-label color-label">무슨 색?</p><div className="palette" role="group" aria-label="색 고르기">{PALETTE.map((value) => <button type="button" aria-label={COLOR_NAMES[value]} title={COLOR_NAMES[value]} aria-pressed={color === value} onClick={() => { setColor(value); if (tool === "eraser") chooseTool("pen"); }} key={value} style={{ background: value }} />)}</div><div className="history-row" role="group" aria-label="그리기 기록"><button type="button" onClick={undo} disabled={Boolean(conflictDraft) || !documentState.ops.length}>↶ 되돌리기</button><button type="button" onClick={redoLast} disabled={Boolean(conflictDraft) || !redo.length}>↷ 다시하기</button></div></aside></div>
    {timelapseOpen && <TimelapsePlayer document={documentState} onClose={() => setTimelapseOpen(false)} />}
    {reflectionOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reflection-title"><section className="reflection-modal"><button className="modal-close" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button><span className="modal-emoji">🌟</span><h2 id="reflection-title">내 그림을 소개해 줘!</h2><label>가장 마음에 드는 곳은?<input maxLength={80} value={favoritePart} onChange={(event) => setFavoritePart(event.target.value)} placeholder="예: 무지개 꼬리" /></label><label>왜 마음에 들어?<textarea maxLength={180} value={favoriteReason} onChange={(event) => setFavoriteReason(event.target.value)} placeholder="내가 고른 색이 예뻐서" /></label><div className="modal-actions"><button className="button secondary" onClick={() => setReflectionOpen(false)}>조금 더 그릴래</button><button className="button primary" disabled={!favoritePart || !favoriteReason} onClick={complete}>작품 완성</button></div></section></div>}
  </main>;
}
