"use client";

import { useEffect, useMemo, useState } from "react";
import { activeProfile, deviceProfiles, DeviceProfile, storeProfile } from "@/lib/client-session";
import { LEGACY_PICTURE_PASSWORD_LENGTH, NEW_PICTURE_PASSWORD_LENGTH } from "@/lib/picture-password";
import { readStudentEntryResponse, StudentEntryResponseError } from "@/lib/student-entry-client";
import { Logo } from "./Logo";
import { QrCode } from "./QrCode";

const ANIMALS = ["🐰", "🐻", "🦊", "🐯", "🐼", "🐶"];
const PICTURES = ["⭐", "🍎", "🚲", "🌈", "⚽", "🌙", "꽃", "집"];

type Mode = "profiles" | "unlock" | "join" | "recover" | "done";

export function JoinClient({ initialEntry = "", recoveryToken = "" }: { initialEntry?: string; recoveryToken?: string }) {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [mode, setMode] = useState<Mode>(recoveryToken ? "recover" : "join");
  const [entry, setEntry] = useState(initialEntry);
  const [nickname, setNickname] = useState("");
  const [animal, setAnimal] = useState("🐰");
  const [pictures, setPictures] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [personalQrToken, setPersonalQrToken] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<DeviceProfile | null>(null);
  const [legacyPassword, setLegacyPassword] = useState(false);

  useEffect(() => {
    const stored = deviceProfiles(); setProfiles(stored);
    if (!initialEntry && !recoveryToken && stored.length) setMode("profiles");
    if (activeProfile() && !initialEntry && !recoveryToken) setMode("profiles");
  }, [initialEntry, recoveryToken]);

  const recoveryUrl = useMemo(() => personalQrToken && typeof location !== "undefined" ? `${location.origin}/join/recover?token=${personalQrToken}` : "", [personalQrToken]);
  const targetLength = mode === "join" ? NEW_PICTURE_PASSWORD_LENGTH : legacyPassword ? LEGACY_PICTURE_PASSWORD_LENGTH : NEW_PICTURE_PASSWORD_LENGTH;

  function appendPicture(value: string) {
    setPictures((current) => current.length < targetLength ? [...current, value] : current);
  }

  function removeLastPicture() {
    setPictures((current) => current.slice(0, -1));
  }

  function changePasswordLength(useLegacy: boolean) {
    setLegacyPassword(useLegacy);
    setPictures([]);
    setError("");
  }

  function resetPassword(nextMode: Mode) {
    setPictures([]);
    setLegacyPassword(false);
    setError("");
    setMode(nextMode);
  }

  function picturePasswordPicker(allowLegacy: boolean) {
    return <fieldset><legend>그림 비밀번호 <small>{pictures.length}/{targetLength}</small></legend><p className="helper">같은 그림을 여러 번 골라도 돼요. 순서대로 {targetLength === 3 ? "세 개" : "네 개"}를 골라요.</p>{allowLegacy && <label className="legacy-password-toggle"><input type="checkbox" checked={legacyPassword} onChange={(event) => changePasswordLength(event.target.checked)} /><span>예전에 네 개로 만들었어요</span></label>}<div className="chip-row picture-row" role="group" aria-label={`그림 비밀번호 고르기. 현재 ${pictures.length}/${targetLength}개를 골랐어요. 같은 그림을 여러 번 고를 수 있어요.`}>{PICTURES.map((value) => <button type="button" className="picture-chip" disabled={pictures.length >= targetLength} aria-label={`${value} 그림 추가. 현재 ${pictures.length}/${targetLength}개 선택. 같은 그림도 다시 고를 수 있어요.`} key={value} onClick={() => appendPicture(value)}>{value}</button>)}</div><div className="password-actions"><button type="button" className="small-button" disabled={!pictures.length} aria-label={`마지막 그림 한 칸 지우기. 현재 ${pictures.length}개 선택.`} onClick={removeLastPicture}>한 칸 지우기</button></div>{pictures.length > 0 && <div className="password-preview" aria-live="polite" aria-label={`고른 그림 ${pictures.length}개: ${pictures.join(", ")}`}>{pictures.join(" → ")}</div>}</fieldset>;
  }

  async function submit() {
    setError(""); setBusy(true);
    try {
      const action = mode === "unlock" ? "switchProfile" : mode === "recover" ? "recover" : "join";
      const payload = action === "switchProfile" ? { action, studentId: selectedProfile?.studentId, picturePassword: pictures } : action === "join"
        ? { action, entry, nickname, animal, picturePassword: pictures }
        : recoveryToken ? { action, personalQrToken: recoveryToken } : { action, classCode: entry, nickname, animal, picturePassword: pictures };
      const response = await fetch("/api/student", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
      const data = await readStudentEntryResponse(response);
      if (!response.ok || !data.student || !data.deviceToken || !data.expiresAt) throw new StudentEntryResponseError(data.error ?? "입장할 수 없어요.");
      storeProfile({ studentId: data.student.id, nickname: data.student.nickname, animal: data.student.animal, classroomName: data.student.classroomName, deviceToken: data.deviceToken, expiresAt: data.expiresAt });
      setPersonalQrToken(data.personalQrToken ?? ""); setMode(data.personalQrToken ? "done" : "profiles");
      if (!data.personalQrToken) location.href = "/student";
    } catch (cause) { setError(cause instanceof StudentEntryResponseError ? cause.message : "입장 중 연결을 확인하지 못했어요. 잠시 뒤 다시 해 주세요."); }
    finally { setBusy(false); }
  }

  if (mode === "profiles") {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card wide"><p className="eyebrow">오늘 누가 그릴 거야?</p><h1>내 프로필을 골라요</h1><div className="profile-grid">{profiles.map((profile) => <button className="profile-button" key={profile.studentId} onClick={() => { setSelectedProfile(profile); resetPassword("unlock"); }}><span>{profile.animal}</span><b>{profile.nickname}</b><small>{profile.classroomName}</small></button>)}<button className="profile-button add" onClick={() => resetPassword("join")}><span>＋</span><b>처음 왔어요</b></button></div><button className="text-button" onClick={() => resetPassword("recover")}>다른 기기에서 하던 그림 찾기</button></section></main>;
  }

  if (mode === "unlock" && selectedProfile) {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card"><button className="small-button" onClick={() => resetPassword("profiles")}>← 학생 다시 고르기</button><div className="profile-unlock"><span>{selectedProfile.animal}</span><h1>{selectedProfile.nickname}</h1><p>{selectedProfile.classroomName}</p></div>{picturePasswordPicker(true)}{error && <p className="error-box" role="alert">{error}</p>}<button className="button primary full" disabled={busy || pictures.length !== targetLength} onClick={submit}>{busy ? "확인 중…" : "내 그림 열기"}</button></section></main>;
  }

  if (mode === "done") {
    return <main className="entry-shell"><div className="entry-top"><Logo /></div><section className="entry-card"><div className="success-mark">✓</div><h1>내 그림 카드가 생겼어요!</h1><p>다른 기기에서 이어 그릴 때 쓰는 비공개 QR이에요. 선생님과 함께 안전하게 보관해요.</p><div className="personal-card"><QrCode value={recoveryUrl} label={`${nickname} 개인 복구 QR`} /><span>{animal}</span><b>{nickname}</b><small>개인 복구 카드</small><code>{recoveryUrl.slice(-16)}</code></div><button className="button secondary full" onClick={() => navigator.clipboard?.writeText(recoveryUrl)}>복구 주소 복사</button><a className="button primary full" href="/student">그림 시작하기</a></section></main>;
  }

  return (
    <main className="entry-shell"><div className="entry-top"><Logo /><a href="/teacher">교사 입장</a></div><section className="entry-card"><p className="eyebrow">{mode === "join" ? "수업에 들어가요" : "내 그림을 찾아요"}</p><h1>{mode === "join" ? "반가워, 꼬마 화가!" : "다시 만나서 반가워!"}</h1>{recoveryToken ? <p className="helper">개인 카드로 안전하게 찾는 중이에요.</p> : <><label>수업 코드<input inputMode="numeric" maxLength={12} value={entry} onChange={(event) => setEntry(event.target.value.replace(/\s/g, ""))} placeholder="예: 2841" /></label><label>그림 별명<input maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 토끼 화가" /></label><fieldset><legend>내 동물</legend><div className="chip-row">{ANIMALS.map((value) => <button type="button" aria-pressed={animal === value} className={animal === value ? "emoji-chip selected" : "emoji-chip"} key={value} onClick={() => setAnimal(value)}>{value}</button>)}</div></fieldset>{picturePasswordPicker(mode === "recover")}</>}{error && <p className="error-box" role="alert">{error}</p>}<button className="button primary full" disabled={busy || (!recoveryToken && (!entry || !nickname || pictures.length !== targetLength))} onClick={submit}>{busy ? "찾는 중…" : mode === "join" ? "수업 들어가기" : "내 그림 찾기"}</button>{!recoveryToken && <button className="text-button" onClick={() => resetPassword(mode === "join" ? "recover" : "join")}>{mode === "join" ? "전에 그리던 그림이 있어요" : "처음 왔어요"}</button>}</section></main>
  );
}
