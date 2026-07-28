"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { studentFetch } from "@/lib/client-session";

const WHISPER_MAX_DURATION_MS = 12_000;

export function VoiceWhisperButton({ classroomId, studentId }: { classroomId: string; studentId: string }) {
  const [enabled, setEnabled] = useState(false); const [recording, setRecording] = useState(false); const [status, setStatus] = useState("음성 릴레이 연결 전 · 텍스트를 기본으로 사용해 주세요.");
  const recorder = useRef<MediaRecorder | null>(null); const held = useRef(false); const startedAt = useRef(0); const timeout = useRef<number | null>(null);
  // 마이크 권한 대기 중에 화면이 닫히면(다른 학생을 열면) 그 뒤 시작된 녹음이
  // 이전 학생에게 전송된다. 스트림과 취소 상태를 따로 들고 정리한다.
  const streamRef = useRef<MediaStream | null>(null); const cancelledRef = useRef(false);
  useEffect(() => { fetch("/api/voice", { cache: "no-store" }).then((response) => response.json()).then((value) => { const data = value as { enabled?: boolean }; setEnabled(Boolean(data.enabled)); if (data.enabled) setStatus("이어폰 연결을 확인한 뒤 누르고 말해 주세요."); }).catch(() => {}); }, []);
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true; held.current = false;
      if (timeout.current) { clearTimeout(timeout.current); timeout.current = null; }
      if (recorder.current?.state === "recording") { try { recorder.current.stop(); } catch { /* 이미 멈춘 레코더 */ } }
      recorder.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [studentId]);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function begin(event: React.PointerEvent<HTMLButtonElement>) {
    if (!enabled || held.current || cancelledRef.current) return; held.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // 권한 응답을 기다리는 사이 손을 뗐거나 화면이 닫혔으면 녹음을 시작하지 않는다.
      if (!held.current || cancelledRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream); const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (item) => { if (item.data.size) chunks.push(item.data); };
      mediaRecorder.onstop = async () => {
        releaseStream(); recorder.current = null; setRecording(false);
        const duration = Math.min(WHISPER_MAX_DURATION_MS, Date.now() - startedAt.current); const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }); chunks.length = 0;
        // 화면을 떠난 뒤 올리면 지금 보고 있지 않은 학생에게 음성이 간다.
        if (cancelledRef.current) return;
        if (!blob.size || duration < 100) { setStatus("누르고 있는 동안만 말할 수 있어요."); return; }
        setStatus("짧은 음성을 전달하는 중…");
        try {
          const response = await fetch("/api/voice", { method: "POST", headers: { "content-type": blob.type, "x-wiggle-student": studentId, "x-wiggle-classroom": classroomId, "x-wiggle-duration-ms": String(duration) }, body: blob, cache: "no-store" });
          if (cancelledRef.current) return;
          setStatus(response.ok ? "음성을 바로 전달했어요. 녹음은 보관하지 않아요." : "음성을 보내지 못했어요. 텍스트로 전해 주세요.");
        } catch { if (!cancelledRef.current) setStatus("음성을 보내지 못했어요. 텍스트로 전해 주세요."); }
      };
      recorder.current = mediaRecorder; startedAt.current = Date.now(); mediaRecorder.start(200); setRecording(true); setStatus("선생님이 말하고 있어요. 손을 떼면 전송돼요.");
      timeout.current = window.setTimeout(() => finish(), WHISPER_MAX_DURATION_MS);
    } catch {
      // MediaRecorder 생성·시작이 실패해도 스트림을 놓으면 마이크가 계속 켜져 있다.
      held.current = false; recorder.current = null;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!cancelledRef.current) setStatus("마이크 권한을 확인해 주세요. 텍스트 메시지는 계속 사용할 수 있어요.");
    }
  }

  function finish() {
    held.current = false; if (timeout.current) { clearTimeout(timeout.current); timeout.current = null; }
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  return <div className="voice-whisper"><button className={recording ? "button whisper recording" : "button whisper"} disabled={!enabled} onPointerDown={begin} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}>{recording ? "말하는 중… 손 떼기" : "🎧 누르고 음성 귓속말"}</button><small role="status">{status}</small></div>;
}

export function VoiceWhisperStatus() {
  const [enabled, setEnabled] = useState(false); const [speaking, setSpeaking] = useState(false);
  // 귓속말은 서버에서 1회만 받아 올 수 있다. 자동재생이 막혀 play()가 거부되면
  // 그냥 버리지 말고 들고 있다가 아이가 눌러서 들을 수 있게 한다.
  const [pending, setPending] = useState<{ url: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cancelledRef = useRef(false);

  const play = useCallback(async (url: string) => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = url;
    const done = () => { if (cancelledRef.current) return; setSpeaking(false); setPending(null); URL.revokeObjectURL(url); };
    audio.onended = done; audio.onerror = done;
    try {
      await audio.play();
      if (!cancelledRef.current) { setSpeaking(true); setPending(null); }
      return true;
    } catch {
      if (!cancelledRef.current) { setSpeaking(false); setPending({ url }); }
      return false;
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let timer: number | undefined; let busy = false; let heldUrl = "";
    studentFetch("/api/voice?role=student").then(async (response) => {
      const value = await response.json() as { enabled?: boolean }; if (!value.enabled || cancelledRef.current) return; setEnabled(true);
      const receive = async () => {
        // 재생 중이거나 아직 못 들은 귓속말이 남아 있으면 다음 것을 받지 않는다.
        if (busy || cancelledRef.current) return;
        busy = true;
        try {
          const audioResponse = await studentFetch("/api/voice?role=student&receive=1");
          if (audioResponse.status !== 200 || cancelledRef.current) { busy = false; return; }
          const blob = await audioResponse.blob();
          if (cancelledRef.current) { busy = false; return; }
          heldUrl = URL.createObjectURL(blob);
          const played = await play(heldUrl);
          // 재생에 성공하면 끝날 때까지, 실패하면 아이가 누를 때까지 다음 수신을 멈춘다.
          if (!played) return;
          const audio = audioRef.current;
          if (audio) audio.addEventListener("ended", () => { busy = false; }, { once: true });
          else busy = false;
        } catch { busy = false; }
      };
      void receive(); timer = window.setInterval(() => void receive(), 1500);
    }).catch(() => {});
    return () => {
      cancelledRef.current = true;
      if (timer) clearInterval(timer);
      const audio = audioRef.current;
      if (audio) { audio.pause(); audio.src = ""; }
      if (heldUrl) URL.revokeObjectURL(heldUrl);
    };
  }, [play]);

  if (!enabled) return null;
  if (pending) {
    return <button className="voice-speaking voice-speaking-retry" onClick={() => void play(pending.url)}>🎧 선생님 목소리가 왔어요. 눌러서 들어요.</button>;
  }
  if (!speaking) return null;
  return <div className="voice-speaking" role="status">🎧 선생님이 지금 말하고 있어요. 이어폰을 확인해 주세요.</div>;
}
