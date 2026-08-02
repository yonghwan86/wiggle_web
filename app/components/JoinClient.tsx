"use client";

import { useEffect, useMemo, useState } from "react";
import { activeProfile, deviceProfiles, DeviceProfile, storeProfile } from "@/lib/client-session";
import { LEGACY_PICTURE_PASSWORD_LENGTH, NEW_PICTURE_PASSWORD_LENGTH, shouldOfferLegacyPicturePassword } from "@/lib/picture-password";
import { classifyEntryError, EntryErrorKind, readStudentEntryResponse, StudentEntryResponseError } from "@/lib/student-entry-client";
import { Logo } from "./Logo";
import { QrCode } from "./QrCode";
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

type Mode = "profiles" | "unlock" | "join" | "recover" | "done";

export function JoinClient({ initialEntry = "", recoveryToken = "" }: { initialEntry?: string; recoveryToken?: string }) {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [mode, setMode] = useState<Mode>(recoveryToken ? "recover" : "join");
  const [entry, setEntry] = useState(initialEntry);
  const [nickname, setNickname] = useState("");
  const [animal, setAnimal] = useState("🐰");
  const [pictures, setPictures] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [errorKind, setErrorKind] = useState<EntryErrorKind | "">("");
  const [teacherCallOpen, setTeacherCallOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [personalQrToken, setPersonalQrToken] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<DeviceProfile | null>(null);
  const [legacyPassword, setLegacyPassword] = useState(false);
  const [legacyOffer, setLegacyOffer] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const qrFlow = Boolean(initialEntry) && !recoveryToken;
  // QR로 들어왔으면 수업 코드는 QR이 대신하므로 코드 칸을 숨기고 번호를 별명부터 매긴다.
  const hideCodeField = qrFlow && mode === "join";

  useEffect(() => {
    setPictures([]); setLegacyPassword(false); setLegacyOffer(false); setDuplicateWarning(false); setError(""); setErrorKind(""); setTeacherCallOpen(false);
    const stored = deviceProfiles(); setProfiles(stored);
    if (!initialEntry && !recoveryToken && stored.length) setMode("profiles");
    if (activeProfile() && !initialEntry && !recoveryToken) setMode("profiles");
  }, [initialEntry, recoveryToken]);

  // 개인 복구 QR은 비밀번호 없이 계정을 여는 자격이다. 뒤로가기가 bfcache에서
  // 완료 화면을 상태째 되살리면 다음 아이에게 그대로 노출되므로 즉시 지운다.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setPersonalQrToken("");
      setPictures([]);
      setMode(deviceProfiles().length ? "profiles" : "join");
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    if (!initialEntry || recoveryToken) return;
    setNickname((current) => {
      if (current) return current;
      const ideas = Object.values(NICKNAME_IDEAS).flat();
      return ideas[Math.floor(Math.random() * ideas.length)] ?? "꼬마 화가";
    });
  }, [initialEntry, recoveryToken]);

  const recoveryUrl = useMemo(() => personalQrToken && typeof location !== "undefined" ? `${location.origin}/join/recover?token=${personalQrToken}` : "", [personalQrToken]);
  const targetLength = mode === "join" ? NEW_PICTURE_PASSWORD_LENGTH : legacyPassword ? LEGACY_PICTURE_PASSWORD_LENGTH : NEW_PICTURE_PASSWORD_LENGTH;

  function clearEntryError() {
    setError(""); setErrorKind(""); setTeacherCallOpen(false);
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

  function suggestNickname() {
    const ideas = qrFlow && mode === "join" ? Object.values(NICKNAME_IDEAS).flat() : NICKNAME_IDEAS[animal] ?? ["꼬마 화가"];
    const pool = ideas.filter((idea) => idea !== nickname);
    setNickname(pool[Math.floor(Math.random() * pool.length)] ?? "꼬마 화가");
    setDuplicateWarning(false);
    clearEntryError();
  }

  function changePasswordLength(useLegacy: boolean) {
    setLegacyPassword(useLegacy);
    setLegacyOffer(false);
    setDuplicateWarning(false);
    setPictures([]);
    clearEntryError();
  }

  function resetPassword(nextMode: Mode) {
    setPictures([]);
    setLegacyPassword(false);
    setLegacyOffer(false);
    setDuplicateWarning(false);
    clearEntryError();
    setMode(nextMode);
  }

  function picturePasswordPicker() {
    const creating = mode === "join";
    const countWord = targetLength === 3 ? "세 개" : "네 개";
    const instruction = creating
      ? `그림 비밀번호를 만들어요. 같은 그림을 여러 번 골라도 돼요. 순서대로 ${countWord}를 골라요.`
      : `내 그림 비밀번호를 눌러요. 만들 때 골랐던 그림 ${countWord}를 순서대로 눌러요.`;
    const chipsFull = pictures.length >= targetLength;
    return <fieldset className="picture-password-picker"><legend>{creating ? "그림 비밀번호 만들기" : "내 그림 비밀번호"} <small>{pictures.length}/{targetLength}</small></legend><div className="picture-password-help"><p className="helper">{creating ? `같은 그림도 괜찮아요. 순서대로 ${targetLength}개 골라요.` : "만들 때 고른 순서 그대로 눌러요."}</p><SpeakButton text={instruction} compact /></div><div className="password-slots" aria-label={`고른 그림 ${pictures.length}개`}>{Array.from({ length: targetLength }, (_, index) => <span className={pictures[index] ? "filled" : ""} key={index}>{pictures[index] ? pictureFor(pictures[index]) : "?"}</span>)}</div><div className="picture-choice-grid" role="group" aria-label={`그림 비밀번호 고르기. 현재 ${pictures.length}/${targetLength}개를 골랐어요. 같은 그림을 여러 번 고를 수 있어요.`}>{PICTURES.map((item) => <button type="button" className="picture-chip" aria-label={chipsFull ? `${item.name} 그림. 이미 ${targetLength}개를 다 골랐어요. 바꾸려면 다시 골라요를 눌러요.` : `${item.name} 그림 추가. 현재 ${pictures.length}/${targetLength}개 선택. 같은 그림도 다시 고를 수 있어요.`} key={item.value} onClick={() => appendPicture(item.value)}>{item.picture}</button>)}</div><div className="password-actions"><button type="button" className={`reset-pictures-button${errorKind === "password" ? " attention" : ""}`} disabled={!pictures.length} aria-label={`고른 그림 ${targetLength}칸 모두 지우고 다시 고르기`} onClick={resetPictures}><span aria-hidden="true">🔄</span> 다시 골라요</button><button type="button" className="small-button" disabled={!pictures.length} aria-label={`마지막 그림 한 칸 지우기. 현재 ${pictures.length}개 선택.`} onClick={removeLastPicture}>↩️ 한 칸 지우기</button></div></fieldset>;
  }

  function switchToRecover() {
    if (qrFlow) setEntry("");
    resetPassword("recover");
  }

  function duplicateWarningNotice() {
    if (!duplicateWarning) return null;
    return <div className="duplicate-profile-warning" role="alert"><b>전에 만든 프로필일 수 있어요</b><p>같은 별명과 동물이 이미 있어요. 내 그림을 찾거나, 정말 다른 학생일 때만 새로 만들어요.</p><div><button type="button" className="button secondary" onClick={switchToRecover}>🔎 내 그림 찾기</button><button type="button" className="button ghost" onClick={() => void submit(true)}>➕ 다른 학생으로 새로 만들기</button></div></div>;
  }

  function errorNotice() {
    if (!error) return null;
    return <div className="entry-error-block">
      <div className="error-box child-error" role="alert"><span className="child-error-icon" aria-hidden="true">⚠️</span><p>{error}</p><SpeakButton text={error} label="오류 들어 보기" compact /></div>
      {errorKind === "code" && !teacherCallOpen && <button type="button" className="button secondary full teacher-call-button" onClick={() => setTeacherCallOpen(true)}><span aria-hidden="true">🙋</span>선생님 불러요</button>}
      {errorKind === "code" && teacherCallOpen && <div className="teacher-call-note" role="status"><span className="teacher-call-emoji" aria-hidden="true">🙋</span><p>손을 들고 선생님을 불러요.<br />수업 코드를 다시 알려 주실 거예요.</p><SpeakButton text="손을 들고 선생님을 불러요. 수업 코드를 다시 알려 주실 거예요." compact /></div>}
    </div>;
  }

  function legacyPasswordAction() {
    if (recoveryToken || (mode !== "unlock" && mode !== "recover") || (!legacyOffer && !legacyPassword)) return null;
    return <button type="button" className="text-button legacy-password-action" onClick={() => changePasswordLength(!legacyPassword)}>{legacyPassword ? "비밀번호 세 개로 돌아가기" : "비밀번호가 네 개였나요?"}</button>;
  }

  async function submit(allowDuplicate = false) {
    clearEntryError(); setLegacyOffer(false); setDuplicateWarning(false); setBusy(true);
    let failureKind: EntryErrorKind = "general";
    try {

      const action = mode === "unlock" ? "switchProfile" : mode === "recover" ? "recover" : "join";
      const payload = action === "switchProfile" ? { action, studentId: selectedProfile?.studentId, picturePassword: pictures } : action === "join"
        ? { action, entry, nickname, animal, picturePassword: pictures, allowDuplicate }
        : recoveryToken ? { action, personalQrToken: recoveryToken } : { action, classCode: entry, nickname, animal, picturePassword: pictures };
      const response = await fetch("/api/student", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      failureKind = classifyEntryError({ status: response.status, action, hasPersonalQrToken: Boolean(recoveryToken) });
      setLegacyOffer(shouldOfferLegacyPicturePassword({ status: response.status, mode, hasPersonalQrToken: Boolean(recoveryToken), legacyMode: legacyPassword, submittedLength: pictures.length }));
      const data = await readStudentEntryResponse(response);
      if (response.status === 409 && data.code === "PROFILE_EXISTS" && action === "join") {
        setDuplicateWarning(true);
        return;
      }
      if (!response.ok || !data.student || !data.deviceToken || !data.expiresAt) {
        throw new StudentEntryResponseError(data.error ?? "입장할 수 없어요.");
      }
      storeProfile({ studentId: data.student.id, nickname: data.student.nickname, animal: data.student.animal, classroomName: data.student.classroomName, deviceToken: data.deviceToken, expiresAt: data.expiresAt });
      setPersonalQrToken(data.personalQrToken ?? ""); setMode(data.personalQrToken ? "done" : "profiles");
      if (!data.personalQrToken) location.href = "/student";
    } catch (cause) {
      setError(cause instanceof StudentEntryResponseError ? cause.message : "입장 중 연결을 확인하지 못했어요. 잠시 뒤 다시 해 주세요.");
      setErrorKind(failureKind);
    }
    finally { setBusy(false); }
  }

  if (mode === "profiles") {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card wide"><div className="entry-title-row"><div><p className="eyebrow">오늘 누가 그릴 거야?</p><h1>내 동물을 눌러요</h1></div><SpeakButton text="내 동물을 찾아서 눌러요. 처음 왔다면 더하기를 눌러요." /></div><div className="profile-grid">{profiles.map((profile) => <button className="profile-button" key={profile.studentId} onClick={() => { setSelectedProfile(profile); resetPassword("unlock"); }}><span>{profile.animal}</span><b>{profile.nickname}</b><small>{profile.classroomName}</small></button>)}<button className="profile-button add" onClick={() => resetPassword("join")}><span>＋</span><b>처음 왔어요</b></button></div><button className="text-button" onClick={() => resetPassword("recover")}>🔎 다른 기기에서 하던 그림 찾기</button></section></main>;
  }

  if (mode === "unlock" && selectedProfile) {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card"><button className="small-button" onClick={() => resetPassword("profiles")}>← 학생 다시 고르기</button><div className="profile-unlock"><span>{selectedProfile.animal}</span><h1>{selectedProfile.nickname}</h1><p>{selectedProfile.classroomName}</p></div>{picturePasswordPicker()}{errorNotice()}{legacyPasswordAction()}<button className="button primary full child-primary-action" disabled={busy || pictures.length !== targetLength} onClick={() => void submit()}><span aria-hidden="true">▶️</span>{busy ? "확인 중…" : "내 그림 열기"}</button></section></main>;
  }

  if (mode === "done") {
    return <main className="entry-shell"><div className="entry-top"><Logo /></div><section className="entry-card"><div className="success-mark">✓</div><h1>내 그림 카드가 생겼어요!</h1><p>다른 기기에서 이어 그릴 때 쓰는 비공개 QR이에요. 선생님과 함께 안전하게 보관해요.</p><div className="personal-card"><QrCode value={recoveryUrl} label={`${nickname} 개인 복구 QR`} /><span>{animal}</span><b>{nickname}</b><small>개인 복구 카드</small><code>{recoveryUrl.slice(-16)}</code></div><button className="button secondary full" onClick={() => navigator.clipboard?.writeText(recoveryUrl)}>복구 주소 복사</button><button className="button primary full" onClick={() => { setPersonalQrToken(""); location.replace("/student"); }}>그림 시작하기</button></section></main>;
  }

  return (
    <main className="entry-shell"><div className="entry-top"><Logo />{qrFlow ? <span>QR 입장</span> : <a href="/teacher">교사 입장</a>}</div><section className="entry-card"><div className="entry-title-row"><div><p className="eyebrow">{mode === "join" ? "수업에 들어가요" : "내 그림을 찾아요"}</p><h1>{mode === "join" ? "반가워, 꼬마 화가!" : "다시 만나서 반가워!"}</h1></div><SpeakButton text={mode === "join" ? (hideCodeField ? "반가워! 별명과 동물을 고르고, 그림 비밀번호를 순서대로 골라요." : "선생님과 함께 수업 코드, 동물, 그림 비밀번호를 골라요.") : "내 수업 코드, 동물, 그림 비밀번호를 골라서 그림을 찾아요."} /></div>{mode === "join" && profiles.length > 0 && <button className="saved-profile-notice" type="button" onClick={() => resetPassword("profiles")}>🐾 이 기기에 저장된 내 동물 고르기</button>}{recoveryToken ? <p className="helper">개인 카드로 안전하게 찾는 중이에요.</p> : <>{!hideCodeField && <label><span>1️⃣ 수업 코드</span><input className={errorKind === "code" ? "input-error" : ""} inputMode="numeric" maxLength={12} value={entry} onChange={(event) => { setEntry(event.target.value.replace(/\s/g, "")); setDuplicateWarning(false); clearEntryError(); }} placeholder="예: 2841" /></label>}<label><span>{hideCodeField ? "1️⃣" : "2️⃣"} 그림 별명</span><div className="nickname-row"><input maxLength={16} value={nickname} onChange={(event) => { setNickname(event.target.value); setDuplicateWarning(false); clearEntryError(); }} placeholder="예: 토끼 화가" /><button type="button" onClick={suggestNickname}>🎲 별명 골라줘</button></div></label><fieldset><legend>{hideCodeField ? "2️⃣" : "3️⃣"} 내 동물</legend><div className="animal-choice-grid">{ANIMALS.map((value) => <button type="button" aria-pressed={animal === value} aria-label={`${ANIMAL_NAMES[value]} 고르기`} className={animal === value ? "emoji-chip selected" : "emoji-chip"} key={value} onClick={() => { setAnimal(value); setDuplicateWarning(false); clearEntryError(); }}>{value}</button>)}</div></fieldset>{picturePasswordPicker()}</>}{duplicateWarningNotice()}{errorNotice()}{legacyPasswordAction()}<button className="button primary full child-primary-action" disabled={busy || duplicateWarning || (!recoveryToken && (!entry || !nickname || pictures.length !== targetLength))} onClick={() => void submit()}><span aria-hidden="true">▶️</span>{busy ? "찾는 중…" : mode === "join" ? "수업 들어가기" : "내 그림 찾기"}</button>{!recoveryToken && <button className="text-button" onClick={() => { if (qrFlow && mode !== "join") setEntry(initialEntry); if (mode === "join") { switchToRecover(); return; } resetPassword("join"); }}>{mode === "join" ? "🔎 전에 그리던 그림이 있어요" : "➕ 처음 왔어요"}</button>}</section></main>
  );
}
