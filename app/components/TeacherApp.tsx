"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./Logo";
import { QrCode } from "./QrCode";
import { VoiceWhisperButton } from "./VoiceWhisper";
import { useModalDialog } from "./useModalDialog";
import { CURRICULUM_STAGES, FREE_ACTIVITY_KEY, lessonsForStage } from "@/lib/lesson-content";

type Classroom = { id: string; displayName: string; classCode: string; joinToken: string; admissionOpen: number; currentActivity: string; currentActivityKey: string; currentActivityLabel: string; studentCount: number };
type Student = { id: string; nickname: string; animal: string; lastActivityAt: string; artworkId: string | null; completedArtworkId: string | null; artworkTitle: string | null; status: string | null; currentStep: number | null; revision: number | null; thumbnail: string | null; artworkUpdatedAt: string | null };
type ArchivedStudent = { id: string; nickname: string; animal: string; lastActivityAt: string; archivedAt: string; artworkCount: number };
type FamilyLink = { id: string; studentId: string; scope: "artwork" | "bundle"; expiresAt: string; revokedAt: string | null; createdAt: string; artworkCount: number };
type ClassroomData = { classroom: Classroom; students: Student[]; archivedStudents: ArchivedStudent[]; messages: Array<{ id: string; studentId: string | null; body: string; createdAt: string; nickname?: string; seenCount?: number }>; familyLinks: FamilyLink[]; teacher: { displayName: string; source?: "siwc" | "local" } };
type TeacherPayload = Partial<ClassroomData> & { error?: string; localDemo?: boolean; teacher?: { displayName: string; source?: "siwc" | "local" }; classrooms?: Classroom[] };

function ClassroomCard({ item, deleting, onDelete }: { item: Classroom; deleting: boolean; onDelete: (item: Classroom) => void }) {
  return <article className="class-card">
    <a className="class-card-link" href={`/teacher/class/${item.id}`} aria-label={`${item.displayName} 학급 자세히 보기`}>
      <div className="class-card-top"><span>{item.admissionOpen ? "입장 열림" : "입장 닫힘"}</span><b>{item.studentCount}명</b></div>
      <h2>{item.displayName}</h2><p>{item.currentActivity}</p>
      <div className="class-code"><small>수업 코드</small><strong>{item.classCode}</strong></div>
      <span className="class-card-detail">학급 자세히 보기 →</span>
    </a>
    <div className="class-card-actions"><button type="button" className="class-delete-button" aria-label={`${item.displayName} 학급 삭제`} disabled={deleting} onClick={() => onDelete(item)}>{deleting ? "삭제 처리 중…" : "학급 삭제"}</button></div>
  </article>;
}

async function teacherPost<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> { const response = await fetch("/api/teacher", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" }); const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error ?? "요청을 처리하지 못했어요."); return data; }
async function teacherAiPost<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> { const response = await fetch("/api/ai/teacher-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" }); const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error ?? "AI 코칭 초안을 처리하지 못했어요."); return data; }

function TeacherActivitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>
    {CURRICULUM_STAGES.filter((stage) => stage.stage <= 3).map((stage) => <optgroup label={`${stage.stage}단계 · ${stage.title}`} key={stage.stage}>
      {lessonsForStage(stage.stage as 1 | 2 | 3).map((lesson) => <option value={`lesson:${lesson.slug}`} key={lesson.slug}>{lesson.order}. {lesson.title}</option>)}
    </optgroup>)}
    <optgroup label="4단계 · 자유 창작"><option value={FREE_ACTIVITY_KEY}>AI 가이드 자유 창작</option></optgroup>
  </select>;
}

export function TeacherApp({ classroomId = "" }: { classroomId?: string }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null); const [localDemo, setLocalDemo] = useState(false); const [teacher, setTeacher] = useState<{ displayName: string; source?: "siwc" | "local" } | null>(null); const [classrooms, setClassrooms] = useState<Classroom[]>([]); const [classroomData, setClassroomData] = useState<ClassroomData | null>(null); const [error, setError] = useState("");
  const [email, setEmail] = useState(""); const [pin, setPin] = useState(""); const [newClass, setNewClass] = useState(""); const [messageBody, setMessageBody] = useState(""); const [targetStudent, setTargetStudent] = useState(""); const [viewingStudentId, setViewingStudentId] = useState("");
  const [recoveryUrl, setRecoveryUrl] = useState<{ nickname: string; url: string } | null>(null);
  const [deletingClassroom, setDeletingClassroom] = useState("");
  const [deletingStudent, setDeletingStudent] = useState("");
  const [draftId, setDraftId] = useState(""); const [draftBody, setDraftBody] = useState(""); const [draftLoading, setDraftLoading] = useState(false); const [draftSent, setDraftSent] = useState(false);
  // 초안이 어느 학생 것인지 함께 들고 다닌다. 늦게 도착한 응답이 다른 학생 화면에 붙어
  // 교사가 그대로 승인하면 엉뚱한 아이에게 메시지가 간다.
  const [draftStudentId, setDraftStudentId] = useState("");
  const [familyShareUrl, setFamilyShareUrl] = useState("");
  const [guardianConsentConfirmed, setGuardianConsentConfirmed] = useState(false);
  const [consentMethod, setConsentMethod] = useState("");
  const [qrExpanded, setQrExpanded] = useState(false);
  const qrOpenButtonRef = useRef<HTMLButtonElement>(null);
  const qrDialogRef = useRef<HTMLDialogElement>(null);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const viewingStudentIdRef = useRef("");
  const load = useCallback(async () => { try { const response = await fetch(`/api/teacher${classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ""}`, { cache: "no-store" }); const data = await response.json() as TeacherPayload; if (response.status === 401) { setLocalDemo(Boolean(data.localDemo)); setAuthorized(false); return; } if (!response.ok) throw new Error(data.error); setAuthorized(true); setTeacher(data.teacher ?? null); if (classroomId) setClassroomData(data as ClassroomData); else setClassrooms(data.classrooms ?? []); } catch (cause) { setError(cause instanceof Error ? cause.message : "불러오지 못했어요."); } }, [classroomId]);
  useEffect(() => { void load(); const timer = classroomId ? window.setInterval(load, 6000) : undefined; return () => { if (timer) clearInterval(timer); }; }, [classroomId, load]);
  // 미리보기는 id만 들고, 표시는 매 폴링의 최신 목록에서 찾는다.
  // 클릭 시점 사본을 들고 있으면 6초마다 갱신되는 썸네일·상태가 반영되지 않는다.
  const viewingStudent = useMemo(
    () => (viewingStudentId ? classroomData?.students.find((student) => student.id === viewingStudentId) ?? null : null),
    [classroomData, viewingStudentId],
  );
  useEffect(() => { viewingStudentIdRef.current = viewingStudentId; }, [viewingStudentId]);
  const closePreview = useCallback(() => { viewingStudentIdRef.current = ""; setViewingStudentId(""); setDraftId(""); setDraftBody(""); setDraftSent(false); setDraftStudentId(""); setGuardianConsentConfirmed(false); setConsentMethod(""); }, []);
  useEffect(() => {
    // 학생이 목록에서 사라지면(삭제·학급 변경) 미리보기를 통째로 닫는다. id만 비우면
    // 보호자 동의 확인값이 남아 다음 학생의 가족 링크 버튼이 미리 열린다.
    if (viewingStudentId && classroomData && !viewingStudent) closePreview();
  }, [classroomData, closePreview, viewingStudent, viewingStudentId]);
  useModalDialog(previewDialogRef, closePreview, Boolean(viewingStudent));
  const viewingClassroomId = classroomData?.classroom.id;
  useEffect(() => {
    if (!viewingStudentId || !viewingClassroomId) return;
    const ping = () => void teacherPost({ action: "viewStudent", classroomId: viewingClassroomId, studentId: viewingStudentId });
    ping(); const timer = window.setInterval(ping, 10_000); return () => clearInterval(timer);
  }, [viewingStudentId, viewingClassroomId]);
  useEffect(() => {
    if (!qrExpanded) return;
    const dialog = qrDialogRef.current;
    const opener = qrOpenButtonRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    const focusableSelector = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const focusableItems = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => !item.hidden);
    focusableItems()[0]?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setQrExpanded(false); return; }
      if (event.key !== "Tab") return;
      const items = focusableItems();
      const first = items[0]; const last = items.at(-1);
      if (!first || !last) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener("keydown", keepFocusInside);
    return () => {
      dialog.removeEventListener("keydown", keepFocusInside);
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [qrExpanded]);
  const classCode = classroomData?.classroom.classCode ?? "";
  const joinUrl = useMemo(() => classCode && typeof location !== "undefined" ? `${location.origin}/join/${classCode}` : "", [classCode]);

  async function login(event: FormEvent) { event.preventDefault(); setError(""); try { await teacherPost({ action: "login", email, pin }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "로그인할 수 없어요."); } }
  async function createClass(event: FormEvent) { event.preventDefault(); try { const data = await teacherPost<{ classroom: Classroom }>({ action: "createClassroom", displayName: newClass }); setNewClass(""); location.href = `/teacher/class/${data.classroom.id}`; } catch (cause) { setError(cause instanceof Error ? cause.message : "학급을 만들 수 없어요."); } }
  async function deleteClassroom(item: Classroom) {
  const confirmed = confirm(`${item.displayName} 학급(학생 ${item.studentCount}명)을 삭제할까요?\n\n목록에서 삭제되고 학생 입장과 기존 로그인, 가족 공유가 즉시 종료됩니다. 내부 데이터는 복구를 위해 안전하게 보관됩니다.`);
    if (!confirmed) return;
    setDeletingClassroom(item.id); setError("");
    try { await teacherPost({ action: "deleteClassroom", classroomId: item.id }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "학급을 삭제하지 못했어요."); }
    finally { setDeletingClassroom(""); }
  }
  async function classAction<T = Record<string, unknown>>(action: string, rest: Record<string, unknown> = {}) { if (!classroomData) return null; try { const result = await teacherPost<T>({ action, classroomId: classroomData.classroom.id, ...rest }); await load(); return result; } catch (cause) { setError(cause instanceof Error ? cause.message : "바꾸지 못했어요."); return null; } }
  async function sendMessage(event: FormEvent) { event.preventDefault(); if (!messageBody.trim()) return; const sent = await classAction("sendMessage", { body: messageBody, studentId: targetStudent || null }); if (sent) setMessageBody(""); }
  async function archiveStudent(student: Student) {
    const confirmed = confirm(`${student.nickname} 학생을 학급에서 삭제할까요?\n\n교사 화면에서 숨겨지고 모든 기기 입장이 종료됩니다. 작품과 성장 기록은 보관되며 필요하면 다시 복원할 수 있어요.`);
    if (!confirmed) return;
    setDeletingStudent(student.id); setError("");
    if (viewingStudentId === student.id) closePreview();
    await classAction("archiveStudent", { studentId: student.id });
    setDeletingStudent("");
  }
  async function restoreStudent(student: ArchivedStudent) {
    setDeletingStudent(student.id); setError("");
    await classAction("restoreStudent", { studentId: student.id });
    setDeletingStudent("");
  }
  function openPreview(student: Student) {
    // 미리보기 대상을 먼저 확정한다. 서버 왕복 뒤에 정하면 느린 네트워크에서
    // 다른 학생을 연 뒤 늦은 응답이 화면을 되돌려 놓는다.
    closePreview(); viewingStudentIdRef.current = student.id; setViewingStudentId(student.id);
  }
  async function requestTeacherDraft(student: Student) {
    if (!classroomData || !student.artworkId || draftLoading) return;
    openPreview(student); setDraftStudentId(student.id); setDraftLoading(true); setError("");
    try {
      const data = await teacherAiPost<{ draft: { id: string; body: string } }>({ action: "draft", classroomId: classroomData.classroom.id, studentId: student.id, artworkId: student.artworkId });
      // 응답이 오는 사이 교사가 다른 학생을 열었으면 그 화면에 붙이지 않는다.
      if (viewingStudentIdRef.current !== student.id) return;
      setDraftId(data.draft.id); setDraftBody(data.draft.body);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "AI 초안을 만들지 못했어요."); }
    finally { setDraftLoading(false); }
  }
  async function approveTeacherDraft() {
    if (!classroomData || !draftId || !draftBody.trim() || draftLoading) return;
    // 화면에 보이는 학생과 초안 주인이 다르면 승인하지 않는다.
    if (draftStudentId !== viewingStudentId) { setError("다른 학생의 초안이에요. 그 학생을 다시 열어 확인해 주세요."); return; }
    setDraftLoading(true); setError("");
    try { await teacherAiPost({ action: "approve", classroomId: classroomData.classroom.id, draftId, body: draftBody }); setDraftSent(true); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "초안을 보내지 못했어요."); }
    finally { setDraftLoading(false); }
  }
  async function issueFamilyShare(student: Student) {
    if (!classroomData || !student.completedArtworkId || !guardianConsentConfirmed || !consentMethod) return;
    // 동의 확인은 지금 화면에 열린 그 학생에 대한 것이어야 한다.
    if (viewingStudentId !== student.id) { setError("보호자 동의는 지금 열어 둔 학생에게만 적용돼요."); return; }
    const result = await classAction<{ share: { token: string } }>("createFamilyShare", {
      studentId: student.id,
      artworkIds: [student.completedArtworkId],
      expiresInDays: 7,
      guardianConsentConfirmed,
      consentMethod,
    });
    if (!result) return;
    const url = `${location.origin}/family/${result.share.token}`;
    setFamilyShareUrl(url); setGuardianConsentConfirmed(false); setConsentMethod("");
    await navigator.clipboard?.writeText(url);
  }

  if (authorized === null) return <main className="teacher-shell"><div className="loading-card">수업실을 준비하는 중…</div></main>;
  if (!authorized) return <main className="teacher-login"><section className="login-brand"><Logo /><div><p className="eyebrow">아이의 다음 선을 함께 찾아요</p><h1>교사 수업 진행실</h1><p>순위 없이 학생의 진행과 작품 변화를 한눈에 확인하고, 짧은 도움말을 보낼 수 있어요.</p></div><ul><li>학생 실명 없이 익명 프로필</li><li>낮은 빈도의 안전한 썸네일</li><li>전체 또는 한 학생에게 메시지</li></ul></section>{localDemo ? <form className="login-card" onSubmit={login}><h2>로컬 개발 로그인</h2><p className="helper">localhost에서만 열립니다. 처음 입력한 이메일과 8자 이상 PIN으로 개발 계정을 만들어요.</p><label>이메일<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label><label>접속 PIN<input type="password" minLength={8} autoComplete="current-password" value={pin} onChange={(event) => setPin(event.target.value)} /></label>{error && <p className="error-box">{error}</p>}<button className="button primary full" disabled={!email || pin.length < 8}>로컬 수업실 열기</button><a className="text-button" href="/">학생 화면으로 돌아가기</a></form> : <section className="login-card"><h2>로그인이 필요해요</h2><p>운영 교사 화면은 ChatGPT 인증으로만 열립니다.</p><a className="button primary full" href="/signin-with-chatgpt?return_to=%2Fteacher">ChatGPT로 로그인</a></section>}</main>;
  if (!classroomId) return <main className="teacher-shell"><header className="teacher-header"><Logo /><div><span>교사</span><b>{teacher?.displayName}</b></div><button className="small-button" onClick={async () => { const data = await teacherPost<{ signOut?: boolean }>({ action: "logout" }); location.href = data.signOut ? "/signout-with-chatgpt?return_to=%2F" : "/teacher"; }}>로그아웃</button></header><section className="teacher-welcome"><div><p className="eyebrow">오늘의 수업</p><h1>아이들의 생각이<br />자라는 교실</h1></div><form className="create-class" onSubmit={createClass}><label>새 학급 만들기<input value={newClass} maxLength={30} onChange={(event) => setNewClass(event.target.value)} placeholder="예: 별빛 1반" /></label><button className="button primary" disabled={newClass.length < 2}>학급 만들기</button></form></section>{error && <p className="error-box" role="alert">{error}</p>}<section><div className="section-title"><h2>내 학급</h2><span>{classrooms.length}개 학급</span></div><div className="class-grid">{classrooms.map((item) => <ClassroomCard item={item} deleting={deletingClassroom === item.id} onDelete={deleteClassroom} key={item.id} />)}</div></section></main>;
  if (!classroomData) return <main className="teacher-shell"><div className="loading-card">{error || "학급을 불러오는 중…"}</div></main>;
  const room = classroomData.classroom;
  return <main className="teacher-room"><header className="teacher-header"><Logo /><a className="small-button" href="/teacher">← 학급 목록</a><div className="room-heading"><b>{room.displayName}</b><span>{room.currentActivity}</span></div><button className="subscription-pill" disabled title="결제 제공자와 가격이 정해진 뒤 연결됩니다.">구독 연결 전</button><div className={room.admissionOpen ? "live-pill" : "closed-pill"}>{room.admissionOpen ? "● 입장 열림" : "입장 닫힘"}</div></header>
    <section className="room-controls"><div className="qr-panel"><QrCode value={joinUrl} label={`${room.displayName} 입장 QR`} variant="teacher" /><div><small>수업 코드</small><strong>{room.classCode}</strong><div className="qr-panel-actions"><button ref={qrOpenButtonRef} onClick={() => setQrExpanded(true)}>QR 크게 보기</button><button onClick={() => navigator.clipboard?.writeText(joinUrl)}>입장 주소 복사</button></div></div></div><div className="control-stack"><label>오늘의 활동<TeacherActivitySelect value={room.currentActivityKey} onChange={(activity) => void classAction("setActivity", { activity })} /></label><div><button className="button secondary" onClick={() => void classAction("toggleAdmission", { open: !room.admissionOpen })}>{room.admissionOpen ? "입장 닫기" : "입장 열기"}</button><button className="button ghost" onClick={() => confirm("기존 코드와 QR은 더 이상 쓸 수 없어요. 바꿀까요?") && void classAction("rotateCode")}>코드 바꾸기</button></div></div><form className="message-compose" onSubmit={sendMessage}><label>짧은 도움말<select value={targetStudent} onChange={(event) => setTargetStudent(event.target.value)}><option value="">우리 반 모두</option>{classroomData.students.map((student) => <option value={student.id} key={student.id}>{student.animal} {student.nickname}</option>)}</select></label><textarea maxLength={180} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="예: 다음에는 배경을 하나 더 그려볼까?" /><button className="button primary">보내기</button></form></section>
    {error && <p className="error-box room-error">{error}</p>}{recoveryUrl && <div className="family-link-ready" role="status"><b>{recoveryUrl.nickname} 학생의 새 복구 주소예요.</b><span>기존 QR과 기기 로그인은 이미 해지됐어요. 이 주소를 학생 카드에 보관해 주세요.</span><input readOnly value={recoveryUrl.url} aria-label={`${recoveryUrl.nickname} 새 개인 복구 주소`} onFocus={(event) => event.currentTarget.select()} /><button onClick={() => void navigator.clipboard?.writeText(recoveryUrl.url).catch(() => undefined)}>다시 복사</button><button onClick={() => setRecoveryUrl(null)}>닫기</button></div>}{familyShareUrl && <div className="family-link-ready" role="status"><b>보호자 동의 확인 기록과 함께 10분짜리 1회용 입장 링크를 만들었어요.</b><span>이 초대는 처음 열린 뒤 다시 쓸 수 없어요.</span><input readOnly value={familyShareUrl} aria-label="새 가족 공유 1회용 입장 링크" /><button onClick={() => navigator.clipboard?.writeText(familyShareUrl)}>다시 복사</button><button onClick={() => setFamilyShareUrl("")}>닫기</button></div>}<section className="student-monitor"><div className="section-title"><div><h1>학생 진행</h1><p>점수나 순위 없이 별명 순서로 보여요.</p></div><span>6초마다 새로 확인 · {classroomData.students.length}명</span></div><div className="student-grid">{classroomData.students.map((student) => <article className="student-tile" key={student.id}><button className="student-thumb" onClick={() => { openPreview(student); void classAction("viewStudent", { studentId: student.id }); }}>{student.thumbnail ? <img src={student.thumbnail} alt={`${student.nickname} 그림 썸네일`} /> : <span>{student.animal}</span>}<i>눌러서 자세히 보기</i></button><div className="student-info"><div><b>{student.animal} {student.nickname}</b><small>{student.artworkTitle ?? "아직 시작 전"}</small></div><span className={student.status === "complete" ? "status-complete" : "status-drawing"}>{student.status === "complete" ? "완성" : student.artworkId ? "그리는 중" : "대기"}</span></div><button onClick={() => { setTargetStudent(student.id); document.querySelector<HTMLTextAreaElement>(".message-compose textarea")?.focus(); }}>이 학생에게 메시지</button><button className="ai-draft-button" disabled={!student.artworkId || !student.thumbnail || draftLoading} onClick={() => requestTeacherDraft(student)}>✨ AI 코칭 초안</button><button disabled={!student.completedArtworkId} onClick={() => openPreview(student)}>🔒 가족 링크 준비</button><button onClick={async () => { if (!confirm(`${student.nickname}의 기존 기기 세션을 끊고 복구 카드를 새로 만들까요?`)) return; const result = await classAction<{ personalQrToken: string }>("resetStudentRecovery", { studentId: student.id }); if (!result) return; const url = `${location.origin}/join/recover?token=${result.personalQrToken}`; setRecoveryUrl({ nickname: `${student.animal} ${student.nickname}`, url }); try { await navigator.clipboard?.writeText(url); } catch { /* 화면에 표시한 주소가 원본이고 복사는 편의 기능이다 */ } }}>복구 카드 재발급</button><button className="student-delete-button" disabled={deletingStudent === student.id} onClick={() => void archiveStudent(student)}>{deletingStudent === student.id ? "삭제 중…" : "학생 삭제"}</button></article>)}</div>{!classroomData.students.length && <div className="empty-state">QR이나 수업 코드를 보여주면 학생이 여기에 나타나요.</div>}{classroomData.archivedStudents.length > 0 && <details className="archived-students"><summary>삭제한 학생 {classroomData.archivedStudents.length}명 보기</summary><p>작품과 성장 기록은 안전하게 보관돼요. 복원하면 개인 QR이나 그림 비밀번호로 다시 들어올 수 있어요.</p>{classroomData.archivedStudents.map((student) => <div className="archived-student-row" key={student.id}><span><b>{student.animal} {student.nickname}</b><small>작품 {student.artworkCount}개 · {new Date(student.archivedAt).toLocaleDateString("ko-KR")} 삭제</small></span><button className="button ghost" disabled={deletingStudent === student.id} onClick={() => void restoreStudent(student)}>{deletingStudent === student.id ? "복원 중…" : "다시 복원"}</button></div>)}</details>}</section>
    <aside className="message-history"><h2>보낸 도움말</h2>{classroomData.messages.map((item) => <p key={item.id}><b>{item.studentId ? item.nickname : "우리 반"}</b><span>{item.body}</span><small>{item.seenCount ? `${item.seenCount}명 확인` : "아직 확인 전"}</small></p>)}</aside><aside className="family-link-history"><h2>가족 제한 링크</h2>{classroomData.familyLinks.map((link) => <p key={link.id}><b>{classroomData.students.find((student) => student.id === link.studentId)?.animal ?? "🎨"} 작품 {link.artworkCount}개</b><span>{link.revokedAt ? "취소됨" : `${new Date(link.expiresAt).toLocaleDateString("ko-KR")} 만료`}</span>{!link.revokedAt && <button onClick={() => confirm("이 가족 링크를 바로 취소할까요?") && void classAction("revokeFamilyShare", { linkId: link.id })}>링크 취소</button>}</p>)}{!classroomData.familyLinks.length && <p>아직 발급한 링크가 없어요.</p>}</aside>{qrExpanded && <dialog ref={qrDialogRef} className="qr-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="large-qr-title" onCancel={(event) => { event.preventDefault(); setQrExpanded(false); }}><section className="large-qr-dialog"><button className="modal-close" aria-label="큰 입장 QR 닫기" autoFocus onClick={() => setQrExpanded(false)}>×</button><h2 id="large-qr-title">{room.displayName} 입장 QR</h2><p>카메라로 QR을 비추거나 아래 수업 코드를 입력해요.</p><QrCode value={joinUrl} label={`${room.displayName} 큰 입장 QR`} variant="large" /><div className="large-qr-code"><small>수업 코드</small><strong>{room.classCode}</strong></div><button className="button secondary full" onClick={() => navigator.clipboard?.writeText(joinUrl)}>입장 주소 복사</button></section></dialog>}{viewingStudent && <div className="modal-backdrop" ref={previewDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="student-preview-title"><section className="teacher-preview coaching-review"><button className="modal-close" aria-label="학생 그림 미리보기 닫기" onClick={closePreview}>×</button><h2 id="student-preview-title">{viewingStudent.animal} {viewingStudent.nickname}의 그림</h2>{viewingStudent.thumbnail ? <img src={viewingStudent.thumbnail} alt={`${viewingStudent.nickname} 그림`} /> : <div className="empty-state">아직 썸네일이 없어요.</div>}<p>이 창을 열어 둔 동안 학생 화면에 선생님이 보고 있다는 표시가 잠시 보여요.</p><VoiceWhisperButton classroomId={room.id} studentId={viewingStudent.id} />{viewingStudent.completedArtworkId && <div className="family-consent-panel"><h3>가족 공유 동의 기록</h3><p>교사가 대신 동의하는 절차가 아닙니다. 실제 보호자의 사전 동의를 확인한 경우에만 아래 기록을 남겨 주세요.</p><label><input type="checkbox" checked={guardianConsentConfirmed} onChange={(event) => setGuardianConsentConfirmed(event.target.checked)} /> 실제로 확인한 경우에만 선택: 보호자가 가족 공유에 사전 동의했고, 그 확인 기록을 남깁니다.</label><label>동의 확인 방법<select value={consentMethod} onChange={(event) => setConsentMethod(event.target.value)}><option value="">선택해 주세요</option><option value="paper">서면</option><option value="in_person">대면</option><option value="phone">전화</option><option value="school_portal">학교 포털</option></select></label><button className="button secondary full" disabled={!guardianConsentConfirmed || !consentMethod} onClick={() => issueFamilyShare(viewingStudent)}>1회용 가족 입장 링크 만들기</button></div>}{draftLoading && <div className="draft-loading">AI가 교사용 초안을 만드는 중…</div>}{!draftId && !draftLoading && viewingStudent.artworkId && viewingStudent.thumbnail && <button className="button secondary full" onClick={() => requestTeacherDraft(viewingStudent)}>✨ AI 코칭 초안 만들기</button>}{draftId && draftStudentId === viewingStudent.id && <div className="draft-review"><div><b>교사 검토가 필요해요</b><small>AI 초안은 아직 학생에게 보내지지 않았습니다.</small></div><textarea maxLength={180} value={draftBody} disabled={draftSent} onChange={(event) => setDraftBody(event.target.value)} /><button className="button primary full" disabled={draftLoading || draftSent || !draftBody.trim()} onClick={approveTeacherDraft}>{draftSent ? "교사가 승인해 보냈어요" : "수정한 뒤 승인해서 보내기"}</button></div>}</section></div>}</main>;
}
