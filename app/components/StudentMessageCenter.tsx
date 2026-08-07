"use client";

import { useMemo, useRef, useState } from "react";
import { studentFetch } from "@/lib/client-session";
import { SpeakButton } from "./SpeakButton";
import { useModalDialog } from "./useModalDialog";

export type StudentTeacherMessage = {
  id: string;
  body: string;
  audience: "all" | "student" | string;
  createdAt: string;
  seenAt?: string | null;
};

export function StudentMessageCenter({ messages, floating = false, compact = false }: { messages: StudentTeacherMessage[]; floating?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [locallySeen, setLocallySeen] = useState(() => new Set<string>());
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDialog(dialogRef, () => setOpen(false), open);
  const unread = useMemo(() => messages.filter((message) => !message.seenAt && !locallySeen.has(message.id)), [locallySeen, messages]);
  const latestUnread = unread.at(-1);

  async function acknowledge(messageIds: string[]) {
    if (!messageIds.length) return;
    setLocallySeen((current) => {
      const next = new Set(current);
      for (const messageId of messageIds) next.add(messageId);
      return next;
    });
    await studentFetch("/api/student", { method: "POST", body: JSON.stringify({ action: "ackTeacherMessages", messageIds }) }).catch(() => undefined);
  }

  function dismissUnread() {
    void acknowledge(unread.map((message) => message.id));
  }

  function openHistory() {
    setOpen(true);
    dismissUnread();
  }

  return <>
    {latestUnread && <aside className={floating ? "canvas-message" : "teacher-message"} role="status">
      <b>👩‍🏫 선생님</b><p>{latestUnread.body}</p><SpeakButton text={`선생님이 말했어요. ${latestUnread.body}`} compact />
      <button type="button" className="canvas-message-close" onClick={dismissUnread} aria-label="새 선생님 말씀 모두 닫기">×</button>
    </aside>}
    <button type="button" className={`student-message-button${floating ? " floating" : ""}${compact ? " compact" : ""}`} onClick={openHistory} aria-label={`선생님 말씀 ${unread.length ? `${unread.length}개 새로 옴` : "이력 보기"}`}>
      <span className="teacher-message-icon" aria-hidden="true">👩‍🏫</span>{compact ? <span className="sr-only">선생님 말씀</span> : " 선생님 말씀"}{unread.length > 0 && <b>{unread.length}</b>}
    </button>
    {open && <div className="modal-backdrop" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="student-message-title">
      <section className="student-message-history">
        <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="선생님 말씀 이력 닫기">×</button>
        <h2 id="student-message-title">👩‍🏫 선생님 말씀</h2>
        <p>닫아도 여기에서 다시 볼 수 있어요.</p>
        <div>{[...messages].reverse().map((message) => <article key={message.id}>
          <div><b>👩‍🏫 선생님</b><small>{message.audience === "all" ? "우리 반 모두" : "나에게"}</small></div>
          <p>{message.body}</p>
          <SpeakButton text={`선생님이 말했어요. ${message.body}`} compact />
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
        </article>)}</div>
        {!messages.length && <div className="empty-state">아직 선생님 말씀이 없어요.</div>}
      </section>
    </div>}
  </>;
}
