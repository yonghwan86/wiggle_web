"use client";

import { useEffect, useRef, useState } from "react";
import { studentFetch } from "@/lib/client-session";

const WHISPER_MAX_DURATION_MS = 12_000;

export function VoiceWhisperButton({ classroomId, studentId }: { classroomId: string; studentId: string }) {
  const [enabled, setEnabled] = useState(false); const [recording, setRecording] = useState(false); const [status, setStatus] = useState("음성 릴레이 연결 전 · 텍스트를 기본으로 사용해 주세요.");
  const recorder = useRef<MediaRecorder | null>(null); const held = useRef(false); const startedAt = useRef(0); const timeout = useRef<number | null>(null);
  useEffect(() => { fetch("/api/voice", { cache: "no-store" }).then((response) => response.json()).then((value) => { const data = value as { enabled?: boolean }; setEnabled(Boolean(data.enabled)); if (data.enabled) setStatus("이어폰 연결을 확인한 뒤 누르고 말해 주세요."); }).catch(() => {}); }, []);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); recorder.current?.stream.getTracks().forEach((track) => track.stop()); }, []);

  async function begin(event: React.PointerEvent<HTMLButtonElement>) {
    if (!enabled || held.current) return; held.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!held.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mediaRecorder = new MediaRecorder(stream); const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (item) => { if (item.data.size) chunks.push(item.data); };
      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop()); recorder.current = null; setRecording(false);
        const duration = Math.min(WHISPER_MAX_DURATION_MS, Date.now() - startedAt.current); const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }); chunks.length = 0;
        if (!blob.size || duration < 100) { setStatus("누르고 있는 동안만 말할 수 있어요."); return; }
        setStatus("짧은 음성을 전달하는 중…");
        const response = await fetch("/api/voice", { method: "POST", headers: { "content-type": blob.type, "x-wiggle-student": studentId, "x-wiggle-classroom": classroomId, "x-wiggle-duration-ms": String(duration) }, body: blob, cache: "no-store" });
        setStatus(response.ok ? "음성을 바로 전달했어요. 녹음은 보관하지 않아요." : "음성을 보내지 못했어요. 텍스트로 전해 주세요.");
      };
      recorder.current = mediaRecorder; startedAt.current = Date.now(); mediaRecorder.start(200); setRecording(true); setStatus("선생님이 말하고 있어요. 손을 떼면 전송돼요.");
      timeout.current = window.setTimeout(() => finish(), WHISPER_MAX_DURATION_MS);
    } catch { held.current = false; setStatus("마이크 권한을 확인해 주세요. 텍스트 메시지는 계속 사용할 수 있어요."); }
  }

  function finish() {
    held.current = false; if (timeout.current) { clearTimeout(timeout.current); timeout.current = null; }
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return <div className="voice-whisper"><button className={recording ? "button whisper recording" : "button whisper"} disabled={!enabled} onPointerDown={begin} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>{recording ? "말하는 중… 손 떼기" : "🎧 누르고 음성 귓속말"}</button><small role="status">{status}</small></div>;
}

export function VoiceWhisperStatus() {
  const [enabled, setEnabled] = useState(false); const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    let timer: number | undefined; let objectUrl = "";
    studentFetch("/api/voice?role=student").then(async (response) => {
      const value = await response.json() as { enabled?: boolean }; if (!value.enabled) return; setEnabled(true);
      const receive = async () => {
        const audioResponse = await studentFetch("/api/voice?role=student&receive=1");
        if (audioResponse.status === 200) {
          const blob = await audioResponse.blob(); objectUrl = URL.createObjectURL(blob); const audio = new Audio(objectUrl); setSpeaking(true);
          audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(objectUrl); objectUrl = ""; }; await audio.play().catch(() => setSpeaking(false));
        }
      };
      void receive(); timer = window.setInterval(receive, 1500);
    }).catch(() => {});
    return () => { if (timer) clearInterval(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, []);
  if (!enabled || !speaking) return null;
  return <div className="voice-speaking" role="status">🎧 선생님이 지금 말하고 있어요. 이어폰을 확인해 주세요.</div>;
}
