"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeProfile, studentFetch } from "@/lib/client-session";
import { DEFAULT_STORYBOOK_FORMAT } from "@/lib/storybook-model";
import { Logo } from "./Logo";
import { BookOpen } from "lucide-react";

type LibraryBook = { id: string; title: string; pageCount: number; status: "draft" | "complete"; updatedAt: string };

export function StorybookLibrary() {
  const [books, setBooks] = useState<LibraryBook[] | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const create = useCallback(async () => {
    if (creatingRef.current) return;
    if (!activeProfile()) {
      const next = "/student/books?create=1";
      location.href = `/join?next=${encodeURIComponent(next)}`;
      return;
    }
    creatingRef.current = true;
    setCreating(true); setError("");
    try {
      const response = await studentFetch("/api/storybooks", { method: "POST", body: JSON.stringify({ format: DEFAULT_STORYBOOK_FORMAT }) });
      const data = await response.json() as { storybook?: { id: string }; error?: string };
      if (!response.ok || !data.storybook) throw new Error(data.error ?? "그림책을 만들지 못했어요.");
      location.href = `/student/books/${data.storybook.id}`;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "그림책을 만들지 못했어요.");
      setCreating(false); creatingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!activeProfile()) {
      setBooks([]);
      setError("먼저 내 프로필을 열어 주세요. 새 그림책 만들기를 누르면 입장 화면으로 이동해요.");
      return;
    }
    void studentFetch("/api/storybooks").then(async (response) => {
      const data = await response.json() as { storybooks?: LibraryBook[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "그림책을 불러오지 못했어요.");
      setBooks(data.storybooks ?? []);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "그림책을 불러오지 못했어요."));
    const requestedFormat = new URLSearchParams(location.search).get("create");
    if (requestedFormat) {
      history.replaceState(history.state, "", "/student/books");
      void create();
    }
  }, [create]);

  return <main className="app-shell storybook-library">
    <header className="app-header"><Logo /><a className="small-button" href="/student">← 내 그림 자리</a></header>
    <section className="storybook-library-hero"><div><p className="eyebrow">내가 직접 꾸미는 작업실</p><h1>나만의 그림책 만들기</h1><p>위쪽에는 이야기 한 편을 쓰고 그 아래에는 내 그림을 놓아 봐요.</p></div><BookOpen aria-hidden="true" /></section>
    {error && <p className="error-box" role="alert">{error}</p>}
    <section className="storybook-new-book"><h2>새 그림책</h2><div className="storybook-format-options storybook-fixed-format">
<button type="button" disabled={creating} onClick={() => void create()}><i className="format-squarebook-hc" /><b>새 그림책 만들기</b><small>하드커버 · 243 × 248mm</small></button>
    </div>{creating && <p role="status">새 도화지를 준비하는 중…</p>}</section>
    <section className="storybook-my-books"><h2>내 그림책</h2>{books === null ? <div className="loading-card">그림책을 펼치는 중…</div> : books.length ? <div className="storybook-book-grid">{books.map((book) => <a href={`/student/books/${book.id}`} key={book.id}><BookOpen aria-hidden="true" /><div><small>{book.pageCount}쪽 · {book.status === "complete" ? "완성" : "편집 중"}</small><h3>{book.title || "제목을 지어 주세요"}</h3><time dateTime={book.updatedAt}>{new Date(book.updatedAt).toLocaleDateString("ko-KR")}</time></div><b>열기 →</b></a>)}</div> : <div className="empty-state">아직 그림책이 없어요. 위에서 첫 그림책을 만들어 봐요.</div>}</section>
  </main>;
}
