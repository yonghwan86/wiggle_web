"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { DrawDocument, DrawOp, emptyDocument } from "@/lib/drawing-model";
import { lessonBySlug, Lesson } from "@/lib/lesson-content";
import { activeProfile, flushSaves, queueSave, studentFetch } from "@/lib/client-session";
import { Logo } from "./Logo";

const PALETTE = ["#1B3A57", "#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#8E24AA", "#8D6E63", "#F06292", "#4DD0E1", "#FFCC80", "#FFFFFF"];
type Tool = "pen" | "crayon" | "eraser";
type ArtworkPayload = { id: string; title: string; topic: string; learningMode: string; intent: string; document: DrawDocument; currentStep: number; revision: number; status: string };

function drawOperation(context: CanvasRenderingContext2D, op: DrawOp, pixelSize: number) {
  if (op.type !== "stroke" || !op.points?.length) return;
  context.save(); context.lineCap = "round"; context.lineJoin = "round";
  context.globalCompositeOperation = op.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = op.tool === "eraser" ? "rgba(0,0,0,1)" : (op.color ?? "#1B3A57");
  context.globalAlpha = op.tool === "crayon" ? 0.62 : 1;
  context.lineWidth = (op.width ?? 8) * pixelSize / 1024;
  context.beginPath(); context.moveTo(op.points[0].x * pixelSize, op.points[0].y * pixelSize);
  for (let index = 1; index < op.points.length; index += 1) { const point = op.points[index]; context.lineTo(point.x * pixelSize, point.y * pixelSize); }
  if (op.points.length === 1) context.lineTo(op.points[0].x * pixelSize + 0.1, op.points[0].y * pixelSize + 0.1);
  context.stroke(); context.restore();
}

function renderDocument(canvas: HTMLCanvasElement, document: DrawDocument, size = 1024) {
  canvas.width = size; canvas.height = size;
  const context = canvas.getContext("2d"); if (!context) return;
  context.clearRect(0, 0, size, size);
  for (const op of document.ops) drawOperation(context, op, size);
}

function renderGuide(canvas: HTMLCanvasElement, lesson: Lesson | undefined) {
  canvas.width = 1024; canvas.height = 1024;
  const context = canvas.getContext("2d"); if (!context || !lesson) return;
  context.clearRect(0, 0, 1024, 1024); context.save(); context.strokeStyle = "#1AB8E8"; context.fillStyle = "#1AB8E8"; context.globalAlpha = 0.42; context.lineWidth = 7; context.setLineDash([18, 18]); context.lineCap = "round";
  const circle = (x: number, y: number, radius: number) => { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke(); };
  const line = (...points: number[]) => { context.beginPath(); context.moveTo(points[0], points[1]); for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]); context.stroke(); };
  if (lesson.guide === "lines") { line(210, 220, 210, 780); line(360, 260, 800, 260); context.beginPath(); context.moveTo(330, 520); context.bezierCurveTo(450, 350, 570, 700, 780, 500); context.stroke(); }
  if (lesson.guide === "shapes") { circle(300, 360, 130); line(520, 480, 660, 220, 800, 480, 520, 480); context.strokeRect(420, 600, 280, 210); }
  if (lesson.guide === "dog") { circle(510, 410, 220); line(350, 270, 265, 145, 420, 210); line(670, 270, 755, 145, 600, 210); circle(430, 390, 18); circle(590, 390, 18); }
  if (lesson.guide === "bike") { circle(300, 650, 180); circle(730, 650, 180); line(300, 650, 480, 390, 600, 650, 300, 650, 520, 650, 730, 650); }
  if (lesson.guide === "hanok") { line(170, 390, 510, 180, 850, 390); line(230, 420, 790, 420); line(300, 420, 300, 800); line(720, 420, 720, 800); }
  context.restore();
}

function imageData(canvas: HTMLCanvasElement, size: 256 | 1024) {
  const output = document.createElement("canvas"); output.width = size; output.height = size;
  const context = output.getContext("2d"); if (!context) return "";
  context.fillStyle = "#ffffff"; context.fillRect(0, 0, size, size); context.drawImage(canvas, 0, 0, size, size);
  return output.toDataURL("image/png");
}

function mutationId() { return `mutation_${crypto.randomUUID().replaceAll("-", "")}`; }

export function DrawingStudio() {
  const params = useParams<{ id: string }>(); const search = useSearchParams();
  const lesson = useMemo(() => lessonBySlug(search.get("lesson") ?? ""), [search]);
  const [artwork, setArtwork] = useState<ArtworkPayload | null>(null); const [documentState, setDocumentState] = useState<DrawDocument>(emptyDocument());
  const [tool, setTool] = useState<Tool>("pen"); const [color, setColor] = useState(PALETTE[0]); const [width, setWidth] = useState<8 | 16 | 30>(16);
  const [redo, setRedo] = useState<DrawOp[]>([]); const [guideVisible, setGuideVisible] = useState(true); const [saveState, setSaveState] = useState("불러오는 중");
  const [reflectionOpen, setReflectionOpen] = useState(false); const [favoritePart, setFavoritePart] = useState(""); const [favoriteReason, setFavoriteReason] = useState(""); const [message, setMessage] = useState("");
  const [teacherViewing, setTeacherViewing] = useState(false); const [conflictRevision, setConflictRevision] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); const guideRef = useRef<HTMLCanvasElement>(null); const activePoints = useRef(new Map<number, Array<{ x: number; y: number; pressure: number }>>()); const revisionRef = useRef(0); const initialized = useRef(false); const saveTimer = useRef<number | undefined>(undefined);

  const createOrLoad = useCallback(async () => {
    const profile = activeProfile(); if (!profile) { location.href = "/join"; return; }
    const flushed = await flushSaves(profile.studentId); if (flushed.conflicts.length) { setConflictRevision(flushed.conflicts[0].conflictRevision ?? 0); setSaveState("저장 충돌을 확인해 주세요"); }
    if (params.id === "new") {
      const mode = lesson?.mode ?? (search.get("mode") === "free" ? "free" : "free");
      const title = lesson?.title ?? "내 마음 그림"; const topic = lesson?.topic ?? "자유 창작";
      const clientArtworkId = `artwork_${crypto.randomUUID().replaceAll("-", "")}`;
      const response = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({ clientArtworkId, learningMode: mode, title, topic, intent: lesson ? `${topic}을 보고 내 생각을 더한다.` : "내 마음대로 그리고 싶다." }) });
      const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error); location.replace(`/student/draw/${data.artwork.id}${lesson ? `?lesson=${lesson.slug}` : ""}`); return;
    }
    const response = await studentFetch(`/api/artworks/${encodeURIComponent(params.id)}`); const data = await response.json() as { error?: string; artwork: ArtworkPayload }; if (!response.ok) throw new Error(data.error);
    setArtwork(data.artwork); setDocumentState(data.artwork.document); revisionRef.current = data.artwork.revision; initialized.current = true; setSaveState("저장됨");
  }, [lesson, params.id, search]);

  useEffect(() => { createOrLoad().catch((cause) => setSaveState(cause instanceof Error ? cause.message : "불러오지 못했어요")); }, [createOrLoad]);
  useEffect(() => { if (canvasRef.current) renderDocument(canvasRef.current, documentState); }, [documentState]);
  useEffect(() => { if (guideRef.current) renderGuide(guideRef.current, lesson); }, [lesson]);
  useEffect(() => { const poll = async () => { try { const response = await studentFetch("/api/student"); const data = await response.json() as { messages?: Array<{ body: string }>; teacherViewing?: boolean }; setMessage(data.messages?.at(-1)?.body ?? ""); setTeacherViewing(Boolean(data.teacherViewing)); } catch {} }; void poll(); const timer = window.setInterval(poll, 5000); return () => clearInterval(timer); }, []);

  const save = useCallback(async (nextDocument: DrawDocument, options?: { complete?: boolean; reflection?: Record<string, string> }) => {
    if (!artwork || !canvasRef.current) return false; const profile = activeProfile(); if (!profile) return false;
    const requestId = mutationId(); const body = JSON.stringify({ requestId, expectedRevision: revisionRef.current, document: nextDocument, currentStep: artwork.currentStep, thumbnailDataUrl: imageData(canvasRef.current, 256), complete: options?.complete ?? false, finalDataUrl: options?.complete ? imageData(canvasRef.current, 1024) : undefined, reflection: options?.reflection });
    setSaveState(navigator.onLine ? "저장 중…" : "기기에 보관 중");
    try {
      const response = await studentFetch(`/api/artworks/${artwork.id}`, { method: "PUT", body }); const data = await response.json() as { error?: string; serverRevision?: number; revision?: number };
      if (response.status === 409) { const serverRevision = typeof data.serverRevision === "number" ? data.serverRevision : revisionRef.current; await queueSave({ requestId, studentId: profile.studentId, url: `/api/artworks/${artwork.id}`, body, createdAt: new Date().toISOString(), conflict: true, conflictRevision: serverRevision }); setConflictRevision(serverRevision); setSaveState("다른 저장과 겹쳤어요"); return false; }
      if (response.status >= 400 && response.status < 500) { setSaveState(data.error ?? "저장할 수 없어요"); return false; }
      if (!response.ok) throw new Error(data.error); revisionRef.current = data.revision ?? revisionRef.current; setSaveState(options?.complete ? "완성했어요" : "저장됨"); return true;
    } catch {
      await queueSave({ requestId, studentId: profile.studentId, url: `/api/artworks/${artwork.id}`, body, createdAt: new Date().toISOString() }); setSaveState("기기에 안전하게 보관됨"); return false;
    }
  }, [artwork]);

  useEffect(() => {
    if (!initialized.current || !artwork) return; window.clearTimeout(saveTimer.current); setSaveState("그리는 중…");
    saveTimer.current = window.setTimeout(() => void save(documentState), 1500); return () => window.clearTimeout(saveTimer.current);
  }, [artwork, documentState, save]);

  function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>) { const rect = event.currentTarget.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), pressure: event.pressure || 0.5 }; }
  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) { event.currentTarget.setPointerCapture(event.pointerId); activePoints.current.set(event.pointerId, [canvasPoint(event)]); }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const points = activePoints.current.get(event.pointerId); if (!points) return; const next = canvasPoint(event); const last = points.at(-1); if (!last || Math.hypot((next.x - last.x) * 1024, (next.y - last.y) * 1024) >= 2.5) points.push(next); }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const points = activePoints.current.get(event.pointerId); if (!points?.length) return; const operationId = crypto.randomUUID().replaceAll("-", "");
    const op: DrawOp = { opId: `op_${operationId}`, clientOpId: `client_${operationId}`, type: "stroke", at: new Date().toISOString(), tool, color: tool === "eraser" ? undefined : color, width, points };
    activePoints.current.delete(event.pointerId); setDocumentState((current) => ({ ...current, ops: [...current.ops, op] })); setRedo([]); event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function undo() { setDocumentState((current) => { const op = current.ops.at(-1); if (!op) return current; setRedo((items) => [...items, op]); return { ...current, ops: current.ops.slice(0, -1) }; }); }
  function redoLast() { setRedo((items) => { const op = items.at(-1); if (!op) return items; setDocumentState((current) => ({ ...current, ops: [...current.ops, op] })); return items.slice(0, -1); }); }
  async function complete() { const ok = await save(documentState, { complete: true, reflection: { favoritePart, favoriteReason, spokenDescription: `${favoritePart}을(를) 그렸어요.`, storyText: "" } }); if (ok) location.href = "/student/archive"; }

  async function saveAsCopy() {
    if (!artwork || !canvasRef.current) return; setSaveState("새 사본을 만드는 중…");
    const clientArtworkId = `artwork_${crypto.randomUUID().replaceAll("-", "")}`;
    const created = await studentFetch("/api/artworks", { method: "POST", body: JSON.stringify({ clientArtworkId, learningMode: artwork.learningMode, title: `${artwork.title} 사본`, topic: artwork.topic, intent: artwork.intent }) });
    const createdData = await created.json() as { error?: string; artwork?: { id: string } }; if (!created.ok || !createdData.artwork) { setSaveState(createdData.error ?? "사본을 만들지 못했어요"); return; }
    const response = await studentFetch(`/api/artworks/${createdData.artwork.id}`, { method: "PUT", body: JSON.stringify({ requestId: mutationId(), expectedRevision: 0, document: documentState, currentStep: artwork.currentStep, thumbnailDataUrl: imageData(canvasRef.current, 256), complete: false }) });
    if (!response.ok) { const data = await response.json() as { error?: string }; setSaveState(data.error ?? "사본을 저장하지 못했어요"); return; }
    location.replace(`/student/draw/${createdData.artwork.id}`);
  }

  if (!artwork) return <main className="drawing-loading">{saveState}</main>;
  const step = lesson ? Math.min(artwork.currentStep, lesson.steps.length - 1) : 0;
  return <main className="studio"><header className="studio-header"><a className="icon-button" href="/student" aria-label="그림 나가기">←</a><Logo compact /><div className="artwork-name"><b>{artwork.title}</b><small>{saveState}</small></div>{lesson && <span className="step-count">{step + 1}/{lesson.steps.length}</span>}<button className="button primary compact" onClick={() => setReflectionOpen(true)}>다 그렸어요</button></header>
    {conflictRevision !== null && <div className="save-conflict" role="alert"><b>다른 기기 저장과 겹쳤어요.</b><span>그림을 덮어쓰지 않고 보관했어요.</span><button onClick={saveAsCopy}>새 사본으로 저장</button></div>}
    {teacherViewing && <div className="teacher-viewing" role="status">선생님이 지금 내 그림을 보고 있어요.</div>}
    {message && <div className="canvas-message"><b>선생님</b> {message}</div>}
    <div className="studio-body">{lesson && <aside className="step-panel"><div className="reference-tile"><span>{lesson.emoji}</span><small>{lesson.topic} 관찰하기</small></div><p className="eyebrow">지금 할 일</p><h2>{lesson.steps[step]}</h2>{lesson.openSteps.includes(step + 1) && <div className="choice-chips"><button>둥글게</button><button>뾰족하게</button></div>}<button className="guide-toggle" aria-pressed={guideVisible} onClick={() => setGuideVisible((value) => !value)}>{guideVisible ? "점선 숨기기" : "점선 보여줘"}</button><div className="step-actions"><button disabled={step === 0} onClick={() => setArtwork((value) => value && ({ ...value, currentStep: Math.max(0, value.currentStep - 1) }))}>이전</button><button onClick={() => setArtwork((value) => value && ({ ...value, currentStep: Math.min(lesson.steps.length - 1, value.currentStep + 1) }))}>{step === lesson.steps.length - 1 ? "이대로 그릴래" : "다음"}</button></div><button className="text-button" onClick={() => setGuideVisible(false)}>그냥 그릴래</button></aside>}
      <section className="canvas-zone"><div className="canvas-wrap"><canvas ref={guideRef} className={guideVisible && lesson ? "guide-canvas" : "guide-canvas hidden"} aria-hidden="true" /><canvas ref={canvasRef} className="draw-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="그림 그리는 도화지" /></div></section>
      <aside className="tool-panel"><div className="tool-group" aria-label="그리기 도구"><button aria-pressed={tool === "pen"} onClick={() => setTool("pen")}><span>✒️</span>펜</button><button aria-pressed={tool === "crayon"} onClick={() => setTool("crayon")}><span>🖍️</span>크레용</button><button aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")}><span>▱</span>지우개</button></div><div className="width-row" aria-label="선 굵기">{([8, 16, 30] as const).map((value) => <button aria-label={`${value} 굵기`} aria-pressed={width === value} onClick={() => setWidth(value)} key={value}><i style={{ width: Math.max(8, value * .72), height: Math.max(8, value * .72) }} /></button>)}</div><div className="palette" aria-label="색 고르기">{PALETTE.map((value) => <button aria-label={`${value} 색`} aria-pressed={color === value} onClick={() => { setColor(value); if (tool === "eraser") setTool("pen"); }} key={value} style={{ background: value }} />)}</div><div className="history-row"><button onClick={undo} disabled={!documentState.ops.length}>↶ 되돌리기</button><button onClick={redoLast} disabled={!redo.length}>↷ 다시하기</button></div></aside></div>
    {reflectionOpen && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="reflection-title"><section className="reflection-modal"><button className="modal-close" onClick={() => setReflectionOpen(false)} aria-label="닫기">×</button><span className="modal-emoji">🌟</span><h2 id="reflection-title">내 그림을 소개해 줘!</h2><label>가장 마음에 드는 곳은?<input maxLength={80} value={favoritePart} onChange={(event) => setFavoritePart(event.target.value)} placeholder="예: 무지개 꼬리" /></label><label>왜 마음에 들어?<textarea maxLength={180} value={favoriteReason} onChange={(event) => setFavoriteReason(event.target.value)} placeholder="내가 고른 색이 예뻐서" /></label><div className="modal-actions"><button className="button secondary" onClick={() => setReflectionOpen(false)}>조금 더 그릴래</button><button className="button primary" disabled={!favoritePart || !favoriteReason} onClick={complete}>작품 완성</button></div></section></div>}
  </main>;
}
