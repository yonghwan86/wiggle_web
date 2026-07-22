"use client";

import { useEffect, useRef, useState } from "react";
import { DrawDocument, DrawOp } from "@/lib/drawing-model";
import { renderDrawOperation, resetDrawingCanvas } from "@/lib/draw-renderer";

export function TimelapsePlayer({ document, onClose }: { document: DrawDocument; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const [frame, setFrame] = useState(document.ops.length); const [playing, setPlaying] = useState(false);
  const renderedFrame = useRef(-1); const renderedOps = useRef<DrawOp[] | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const size = 640;
    if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; renderedFrame.current = -1; renderedOps.current = null; }
    const context = canvas.getContext("2d"); if (!context) return;
    const canAdvanceOne = renderedOps.current === document.ops && renderedFrame.current + 1 === frame;
    if (canAdvanceOne) renderDrawOperation(context, document.ops[frame - 1], size);
    else if (renderedOps.current !== document.ops || renderedFrame.current !== frame) {
      resetDrawingCanvas(context, size);
      for (let index = 0; index < frame; index += 1) renderDrawOperation(context, document.ops[index], size);
    }
    renderedOps.current = document.ops; renderedFrame.current = frame;
  }, [document, frame]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((value) => {
      if (value >= document.ops.length) { setPlaying(false); return value; }
      return value + 1;
    }), 160);
    return () => window.clearInterval(timer);
  }, [document.ops.length, playing]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="timelapse-title"><section className="timelapse-modal"><button className="modal-close" onClick={onClose} aria-label="닫기">×</button><h2 id="timelapse-title">내 그림이 자란 과정</h2><p>원본 선은 바뀌지 않아요.</p><canvas ref={canvasRef} aria-label={`${frame}번째 그리기 동작까지 재생`} /><input aria-label="타임랩스 위치" type="range" min="0" max={Math.max(0, document.ops.length)} value={frame} onChange={(event) => { setPlaying(false); setFrame(Number(event.target.value)); }} /><div className="timelapse-controls"><button className="button secondary" onClick={() => { setFrame(0); setPlaying(true); }} disabled={!document.ops.length}>처음부터</button><button className="button primary" onClick={() => setPlaying((value) => !value)} disabled={!document.ops.length}>{playing ? "일시정지" : "재생"}</button><span>{frame}/{document.ops.length}</span></div></section></div>;
}
