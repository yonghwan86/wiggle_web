"use client";

import { useEffect, useRef, useState } from "react";
import { storeProfile } from "@/lib/client-session";
import { PICTURE_PASSWORD_LENGTH } from "@/lib/picture-password";
import { classifyEntryError, EntryErrorKind, readStudentEntryResponse, StudentEntryResponseError } from "@/lib/student-entry-client";
import { Logo } from "./Logo";
import { SpeakButton } from "./SpeakButton";

const ANIMALS = ["🐰", "🐻", "🦊", "🐯", "🐼", "🐶", "🐱", "🐨", "🦁", "🐸"];
const ANIMAL_NAMES: Record<string, string> = { "🐰": "토끼", "🐻": "곰", "🦊": "여우", "🐯": "호랑이", "🐼": "판다", "🐶": "강아지", "🐱": "고양이", "🐨": "코알라", "🦁": "사자", "🐸": "개구리" };
const PICTURES = [
  { value: "⭐", picture: "⭐", name: "별" },
  { value: "🍎", picture: "🍎", name: "사과" },
  { value: "🚲", picture: "🚲", name: "자전거" },
  { value: "🌈", picture: "🌈", name: "무지개" },
  { value: "⚽", picture: "⚽", name: "축구공" },
  { value: "🌙", picture: "🌙", name: "달" },
  { value: "꽃", picture: "🌸", name: "꽃" },
  { value: "집", picture: "🏠", name: "집" },
  { value: "로켓", picture: "🚀", name: "로켓" },
  { value: "풍선", picture: "🎈", name: "풍선" },
] as const;
const NICKNAME_IDEAS: Record<string, string[]> = {
  "🐰": ["토끼 화가", "깡총 별"],
  "🐻": ["곰돌 화가", "꿀별"],
  "🦊": ["여우별", "주황 화가"],
  "🐯": ["씩씩 호랑이", "줄무늬 별"],
  "🐼": ["판다 화가", "대나무 별"],
  "🐶": ["멍멍 화가", "꼬리별"],
  "🐱": ["고양이 화가", "수염별"],
  "🐨": ["코알라 화가", "나무별"],
  "🦁": ["사자 화가", "햇살별"],
  "🐸": ["개굴 화가", "연못별"],
};

type Mode = "checking" | "choice" | "join" | "recover" | "legacyRecover";
type MobileStep = 1 | 2 | 3;

export function JoinClient({ initialEntry = "", recoveryToken = "" }: { initialEntry?: string; recoveryToken?: string }) {
  const [mode, setMode] = useState<Mode>(recoveryToken ? "legacyRecover" : "checking");
  const [classroomName, setClassroomName] = useState("");
  const [hasProfiles, setHasProfiles] = useState(false);
  const [nickname, setNickname] = useState(NICKNAME_IDEAS["🐰"][0]);
  const [animal, setAnimal] = useState("🐰");
  const [pictures, setPictures] = useState<string[]>([]);
  const [mobileStep, setMobileStep] = useState<MobileStep>(1);
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<EntryErrorKind | "">("");
  const [teacherCallOpen, setTeacherCallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [credentialExists, setCredentialExists] = useState(false);
  const [nicknameAuto, setNicknameAuto] = useState(true);
  const animalButtonRef = useRef<HTMLButtonElement>(null);
  const nicknameInputRef = useRef<HTMLInputElement>(null);
  const pictureButtonRef = useRef<HTMLButtonElement>(null);
  const entry = initialEntry;
  const targetLength = PICTURE_PASSWORD_LENGTH;

  useEffect(() => {
    setPictures([]); setDuplicateWarning(false); setCredentialExists(false); setError(""); setErrorKind(""); setTeacherCallOpen(false); setMobileStep(1);
    if (recoveryToken) { setMode("legacyRecover"); return; }
    if (!initialEntry) { location.replace("/"); return; }
    void checkEntry();
  // checkEntry only reads the two stable entry props. Keeping it outside this dependency list
  // prevents a status response from retriggering itself through mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEntry, recoveryToken]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || recoveryToken || !initialEntry) return;
      setPictures([]); setMobileStep(1); setMode("checking"); void checkEntry();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEntry, recoveryToken]);

  async function checkEntry() {
    setBusy(true); setError(""); setErrorKind(""); setTeacherCallOpen(false);
    try {
      const response = await fetch("/api/student", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "entryStatus", entry }), cache: "no-store" });
      const data = await readStudentEntryResponse(response);
      if (!response.ok) {
        setErrorKind(response.status === 404 ? "code" : "general");
        throw new StudentEntryResponseError(data.error ?? "수업을 확인하지 못했어요.");
      }
      setClassroomName(data.classroomName ?? "우리 반");
      setHasProfiles(Boolean(data.hasProfiles));
      setMode(data.hasProfiles ? "choice" : "join");
    } catch (cause) {
      setError(cause instanceof StudentEntryResponseError ? cause.message : "수업을 확인하는 중 연결이 끊겼어요. 다시 시도해 주세요.");
    } finally { setBusy(false); }
  }

  function clearEntryError() {
    setError(""); setErrorKind(""); setTeacherCallOpen(false); setCredentialExists(false);
  }

  function startMode(nextMode: "join" | "recover") {
    setPictures([]); setDuplicateWarning(false); clearEntryError(); setMobileStep(1); setMode(nextMode);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function returnToChoice() {
    clearEntryError(); setDuplicateWarning(false); setMode("choice");
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function goToStep(nextStep: MobileStep) {
    setMobileStep(nextStep);
    requestAnimationFrame(() => {
      if (nextStep === 1) animalButtonRef.current?.focus();
      else if (nextStep === 2) nicknameInputRef.current?.focus();
      else pictureButtonRef.current?.focus();
    });
  }

  function appendPicture(value: string) {
    clearEntryError();
    setPictures((current) => current.length < targetLength ? [...current, value] : current);
  }

  function removeLastPicture() {
    clearEntryError();
    setPictures((current) => current.slice(0, -1));
  }

  function resetPictures() {
    clearEntryError();
    setPictures([]);
  }

  function pictureFor(value: string) {
    return PICTURES.find((item) => item.value === value)?.picture ?? value;
  }

  function pictureNameFor(value: string) {
    return PICTURES.find((item) => item.value === value)?.name ?? value;
  }

  function suggestNickname() {
    const ideas = NICKNAME_IDEAS[animal] ?? ["꼬마 화가"];
    const pool = ideas.filter((idea) => idea !== nickname);
    setNickname(pool[Math.floor(Math.random() * pool.length)] ?? "꼬마 화가");
    setNicknameAuto(true);
    setDuplicateWarning(false);
    clearEntryError();
  }

  function picturePasswordPicker({ numbered = false, showSlots = true }: { numbered?: boolean; showSlots?: boolean } = {}) {
    const creating = mode === "join";
    const chipsFull = pictures.length >= targetLength;
    const legendLabel = numbered ? "3️⃣ 그림 비밀번호" : creating ? "그림 비밀번호 만들기" : "내 그림 비밀번호";
    return <fieldset className="picture-password-picker"><legend>{legendLabel} <small>{pictures.length}/{targetLength}</small></legend><div className="picture-password-help"><p className="helper">{creating ? `같은 그림도 괜찮아요. 순서대로 ${targetLength}개 골라요.` : "만들 때 고른 순서 그대로 눌러요."}</p></div>{showSlots && <div className="password-slots" aria-label={`고른 그림 ${pictures.length}개`}>{Array.from({ length: targetLength }, (_, index) => <span className={pictures[index] ? "filled" : ""} key={index}>{pictures[index] ? pictureFor(pictures[index]) : "?"}</span>)}</div>}<div className="picture-choice-grid" role="group" aria-label={`그림 비밀번호 고르기. 현재 ${pictures.length}/${targetLength}개를 골랐어요. 같은 그림을 여러 번 고를 수 있어요.`}>{PICTURES.map((item, index) => <button ref={index === 0 ? pictureButtonRef : undefined} type="button" className="picture-chip" aria-label={chipsFull ? `${item.name} 그림. 이미 ${targetLength}개를 다 골랐어요. 바꾸려면 다시 골라요를 눌러요.` : `${item.name} 그림 추가. 현재 ${pictures.length}/${targetLength}개 선택. 같은 그림도 다시 고를 수 있어요.`} key={item.value} onClick={() => appendPicture(item.value)}><span aria-hidden="true">{item.picture}</span><small aria-hidden="true">{item.name}</small></button>)}</div><div className="password-actions"><button type="button" className={`reset-pictures-button${errorKind === "password" ? " attention" : ""}`} disabled={!pictures.length} aria-label={`고른 그림 ${targetLength}칸 모두 지우고 다시 고르기`} onClick={resetPictures}><span aria-hidden="true">🔄</span> 다시 골라요</button><button type="button" className="small-button" disabled={!pictures.length} aria-label={`마지막 그림 한 칸 지우기. 현재 ${pictures.length}개 선택.`} onClick={removeLastPicture}>↩️ 한 칸 지우기</button></div></fieldset>;
  }

  function duplicateWarningNotice() {
    if (!duplicateWarning) return null;
    return <div className="duplicate-profile-warning" role="alert"><b>같은 동물과 별명이 이미 있어요</b><p>내가 전에 만든 프로필이면 이어서 들어가요. 다른 학생이 맞다면 서로 다른 그림 비밀번호로 새 프로필을 만들 수 있어요.</p><div><button type="button" className="button secondary" onClick={() => startMode("recover")}>🖼️ 내 그림 이어가기</button><button type="button" className="button ghost" onClick={() => void submit(true)}>➕ 새 프로필 만들기</button></div></div>;
  }

  function errorNotice() {
    if (!error) return null;
    return <div className="entry-error-block">
      <div className="error-box child-error" role="alert"><span className="child-error-icon" aria-hidden="true">⚠️</span><p>{error}</p></div>
      {credentialExists && <button type="button" className="button secondary full" onClick={() => startMode("recover")}>내 그림 이어가기</button>}
      {errorKind === "code" && !teacherCallOpen && <button type="button" className="button secondary full teacher-call-button" onClick={() => setTeacherCallOpen(true)}><span aria-hidden="true">🙋</span>선생님 불러요</button>}
      {errorKind === "code" && teacherCallOpen && <div className="teacher-call-note" role="status"><span className="teacher-call-emoji" aria-hidden="true">🙋</span><p>손을 들고 선생님을 불러요.<br />수업 코드를 다시 알려 주실 거예요.</p></div>}
    </div>;
  }

  async function submit(allowDuplicate = false) {
    clearEntryError(); setDuplicateWarning(false); setBusy(true);
    const action = mode === "join" ? "join" : "recover";
    let failureKind: EntryErrorKind = "general";
    try {
      const payload = action === "join"
        ? { action, entry, nickname, animal, picturePassword: pictures, allowDuplicate }
        : recoveryToken ? { action, personalQrToken: recoveryToken } : { action, entry, nickname, animal, picturePassword: pictures };
      const response = await fetch("/api/student", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      failureKind = classifyEntryError({ status: response.status, action, hasPersonalQrToken: Boolean(recoveryToken) });
      const data = await readStudentEntryResponse(response);
      if (response.status === 409 && data.code === "PROFILE_EXISTS" && action === "join") {
        setDuplicateWarning(true);
        return;
      }
      if (response.status === 409 && data.code === "PROFILE_CREDENTIALS_EXIST" && action === "join") {
        setError(`${data.error ?? "같은 프로필이 이미 있어요."} 새로 만들지 말고 내 그림을 이어서 열어 주세요.`);
        setCredentialExists(true);
        return;
      }
      if (!response.ok || !data.student || !data.deviceToken || !data.expiresAt) throw new StudentEntryResponseError(data.error ?? "입장할 수 없어요.");
      storeProfile({ studentId: data.student.id, nickname: data.student.nickname, animal: data.student.animal, classroomName: data.student.classroomName, deviceToken: data.deviceToken, expiresAt: data.expiresAt });
      location.replace("/student");
    } catch (cause) {
      setError(cause instanceof StudentEntryResponseError ? cause.message : "입장 중 연결을 확인하지 못했어요. 잠시 뒤 다시 해 주세요.");
      setErrorKind(failureKind);
    } finally { setBusy(false); }
  }

  if (mode === "checking") {
    return <main className="entry-shell"><div className="entry-top"><Logo /></div><section className="entry-card entry-check-card"><div className="entry-title-row"><div><p className="eyebrow">수업에 들어가요</p><h1>{error ? "수업을 찾지 못했어요" : "우리 반을 확인하고 있어요"}</h1></div>{error && <SpeakButton text="수업 코드를 확인하지 못했어요. 화면의 안내를 보고 다시 시도하거나 선생님을 불러요." />}</div>{error ? <>{errorNotice()}<button type="button" className="button primary full" disabled={busy} onClick={() => void checkEntry()}>{busy ? "확인 중…" : "다시 확인하기"}</button><a className="text-button" href="/">수업 코드 다시 입력하기</a></> : <div className="entry-loading" role="status"><span aria-hidden="true">🎨</span><b>잠깐만 기다려 주세요</b></div>}</section></main>;
  }

  if (mode === "choice") {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>{classroomName}</span></div><section className="entry-card entry-choice-card"><div className="entry-title-row"><div><p className="eyebrow">{classroomName}</p><h1>어떻게 들어갈까요?</h1><p>새 프로필을 만들거나, 전에 그리던 내 그림을 이어갈 수 있어요.</p></div><SpeakButton text="새로 시작하려면 새로 시작하기를 눌러요. 전에 그린 그림이 있다면 내 그림 이어가기를 눌러요." /></div><div className="entry-choice-grid"><button type="button" onClick={() => startMode("join")}><span aria-hidden="true">✨</span><b>새로 시작하기</b><small>나만의 꼬마 화가를 만들어요</small></button><button type="button" onClick={() => startMode("recover")}><span aria-hidden="true">🖼️</span><b>내 그림 이어가기</b><small>동물·별명·그림 비밀번호로 찾아요</small></button></div><p className="entry-choice-privacy">어느 태블릿에서도 같은 동물·별명·그림 비밀번호로 이어갈 수 있어요.</p></section></main>;
  }

  if (mode === "legacyRecover") {
    return <main className="entry-shell"><div className="entry-top"><Logo /></div><section className="entry-card"><div className="entry-title-row"><div><p className="eyebrow">내 그림을 찾아요</p><h1>다시 만나서 반가워!</h1></div><SpeakButton text="화면 아래의 내 그림 찾기 버튼을 눌러요." /></div><p className="helper">안전하게 내 그림을 찾고 있어요.</p>{errorNotice()}<button className="button primary full child-primary-action" disabled={busy} onClick={() => void submit()}><span aria-hidden="true">▶️</span>{busy ? "찾는 중…" : "내 그림 찾기"}</button></section></main>;
  }

  const creating = mode === "join";
  const pageInstruction = creating
    ? "내 동물을 고르고, 그림 별명을 정한 다음, 그림 비밀번호 세 개를 순서대로 골라요. 모두 고르면 이 모습으로 수업 들어가기를 눌러요."
    : "전에 고른 동물과 그림 별명을 선택하고, 그림 비밀번호 세 개를 같은 순서로 골라요. 모두 고르면 내 그림 이어가기를 눌러요.";

  return <main className="entry-shell entry-join-shell"><div className="entry-top entry-join-top"><Logo /></div><section className={`entry-card join-card ${creating ? "join-create" : "join-recover"}`} data-mobile-step={mobileStep}>
    <div className="entry-title-row"><div><p className="eyebrow">{creating ? "수업에 들어가요" : "내 그림을 찾아요"}</p><h1>{creating ? "나만의 꼬마 화가를 만들어요" : "내 꼬마 화가를 찾아요"}</h1><p className="join-subtitle">{creating ? "세 가지만 고르면 바로 그림 수업에 들어갈 수 있어요." : "전에 고른 세 가지를 입력하면 어느 태블릿에서나 이어갈 수 있어요."}</p></div><SpeakButton text={pageInstruction} /></div>
    {hasProfiles && <button type="button" className="entry-mode-back" onClick={returnToChoice}>← 입장 방법 다시 고르기</button>}
    <div className="mobile-entry-progress" aria-label={`입장 ${mobileStep}단계 / 3단계`}><span className={mobileStep >= 1 ? "active" : ""}>1 동물</span><span className={mobileStep >= 2 ? "active" : ""}>2 별명</span><span className={mobileStep >= 3 ? "active" : ""}>3 비밀번호</span></div>
    <div className="join-card-body">
      <div className="join-preview"><img src="/brand/student-entry-arch.png" alt="" aria-hidden="true" /><div className="join-preview-card" role="status" aria-live="polite" aria-label={`선택한 동물 ${ANIMAL_NAMES[animal]}, 별명 ${nickname || "꼬마 화가"}, 그림 비밀번호 ${pictures.length}/${targetLength}개: ${pictures.length ? pictures.map((value, index) => `${index + 1}번째 ${pictureNameFor(value)}`).join(", ") : "아직 없음"}`}><span className="join-preview-animal" data-animal-index={ANIMALS.indexOf(animal)} aria-hidden="true" /><b aria-hidden="true">{nickname || "꼬마 화가"}</b><span className="join-preview-password-title" aria-hidden="true">그림 비밀번호</span><div className="join-preview-slots" aria-hidden="true">{Array.from({ length: targetLength }, (_, index) => <span className={pictures[index] ? "filled" : ""} key={index}><i>{pictures[index] ? pictureFor(pictures[index]) : "?"}</i></span>)}</div></div></div>
      <div className="join-controls">
        <div className={`join-step join-step-1${mobileStep === 1 ? " active" : ""}`}><fieldset><legend>1️⃣ 내 동물</legend><div className="animal-choice-grid">{ANIMALS.map((value, index) => <button ref={index === 0 ? animalButtonRef : undefined} type="button" aria-pressed={animal === value} aria-label={`${ANIMAL_NAMES[value]} 고르기`} className={animal === value ? "emoji-chip selected" : "emoji-chip"} key={value} onClick={() => { if (nicknameAuto) setNickname(NICKNAME_IDEAS[value]?.[0] ?? "꼬마 화가"); setAnimal(value); setDuplicateWarning(false); clearEntryError(); }}><span className="animal-choice-portrait" data-animal-index={index} aria-hidden="true" /><small>{ANIMAL_NAMES[value]}</small></button>)}</div></fieldset><button type="button" className="button primary mobile-step-next" onClick={() => goToStep(2)}>별명 고르기 →</button></div>
        <div className={`join-step join-step-2${mobileStep === 2 ? " active" : ""}`}><label><span>2️⃣ 그림 별명</span><div className="nickname-row"><input ref={nicknameInputRef} maxLength={16} value={nickname} onChange={(event) => { setNickname(event.target.value); setNicknameAuto(false); setDuplicateWarning(false); clearEntryError(); }} placeholder="예: 토끼 화가" /><button type="button" onClick={suggestNickname}>🎲 다른 별명</button></div></label><div className="mobile-step-actions"><button type="button" className="button ghost" onClick={() => goToStep(1)}>← 동물</button><button type="button" className="button primary" disabled={nickname.trim().length < 2} onClick={() => goToStep(3)}>비밀번호 고르기 →</button></div></div>
        <div className={`join-step join-step-3${mobileStep === 3 ? " active" : ""}`}>{picturePasswordPicker({ numbered: true, showSlots: false })}<button type="button" className="button ghost mobile-step-back" onClick={() => goToStep(2)}>← 별명 다시 보기</button></div>
      </div>
    </div>
    {duplicateWarningNotice()}{errorNotice()}
    <button className="button primary full child-primary-action" disabled={busy || duplicateWarning || nickname.trim().length < 2 || pictures.length !== targetLength} onClick={() => void submit()}><span aria-hidden="true">▶️</span>{busy ? (creating ? "들어가는 중…" : "찾는 중…") : creating ? "이 모습으로 수업 들어가기" : "내 그림 이어가기"}</button>
    <p className="join-privacy-note">이름이나 학교 대신 동물과 그림 비밀번호로 안전하게 들어가요.</p>
  </section></main>;
}
