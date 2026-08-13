"use client";

import { useEffect, useRef, useState } from "react";
import { DrawDocument, DrawOp } from "@/lib/drawing-model";
import { renderDrawDocument, renderDrawOperation, resetDrawingCanvas } from "@/lib/draw-renderer";
import { advancePlaybackFrame, resolvePlayToggle } from "@/lib/timelapse-playback";
import { useModalDialog } from "./useModalDialog";

export function TimelapsePlayer({ document, onClose }: { document: DrawDocument; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, onClose);
  const canvasRef = useRef<HTMLCanvasElement>(null); const [frame, setFrame] = useState(document.ops.length); const [playing, setPlaying] = useState(false);
  const renderedFrame = useRef(-1); const renderedOps = useRef<DrawOp[] | null>(null);
  useEffect(() => {
    // 재생 래스터는 스튜디오와 같은 1024로 맞춘다. 640이면 픽셀 기반 채우기(floodFill)의
    // 경계 판정이 스튜디오와 달라져, 얇은 굵기 + 밝은 색 조합에서 채우기가 선을 새어 나갈 수 있다.
    // 표시 크기는 CSS가 줄인다.
    const canvas = canvasRef.current; if (!canvas) return; const size = 1024;
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; renderedFrame.current = -1; renderedOps.current = null; }
    const context = canvas.getContext("2d"); if (!context) return;
    const canAdvanceOne = renderedOps.current === document.ops && renderedFrame.current + 1 === frame;
    if (canAdvanceOne && document.ops[frame - 1]?.type !== "text") renderDrawOperation(context, document.ops[frame - 1], size);
    else if (renderedOps.current !== document.ops || renderedFrame.current !== frame) {
      resetDrawingCanvas(context, size);
      renderDrawDocument(context, document.ops, size, frame);
    }
    renderedOps.current = document.ops; renderedFrame.current = frame;
  }, [document, frame]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((value) => {
      const next = advancePlaybackFrame(value, document.ops.length);
      if (next.stop) setPlaying(false);
      return next.frame;
    }), 160);
    return () => window.clearInterval(timer);
  }, [document.ops.length, playing]);
  // 멈춤(끝까지 봤든, 중간에 일시정지했든, 슬라이더로 옮겼든)에서 재생으로 바뀔 때는
  // 항상 0프레임부터 다시 튼다. 이미 재생 중이면 그 자리에서 멈춘다.
  function togglePlay() {
    const next = resolvePlayToggle(playing, frame);
    if (next.frame !== frame) setFrame(next.frame);
    setPlaying(next.playing);
  }
  return <div className="modal-backdrop" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="timelapse-title"><section className="timelapse-modal"><button className="modal-close" onClick={onClose} aria-label="닫기">×</button><h2 id="timelapse-title">내 그림이 자란 과정</h2><p>원본 선은 바뀌지 않아요.</p><canvas ref={canvasRef} aria-label={`${frame}번째 그리기 동작까지 재생`} /><input aria-label="타임랩스 위치" type="range" min="0" max={Math.max(0, document.ops.length)} value={frame} onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)); }} /><div className="timelapse-controls"><button className="button secondary" onClick={() => { setFrame(0); setPlaying(true); }} disabled={!document.ops.length}>처음부터</button><button className="button primary" onClick={togglePlay} disabled={!document.ops.length}>{playing ? "일시정지" : "재생"}</button><span>{frame}/{document.ops.length}</span></div></section></div>;
}
