"use client";

import { useEffect, useMemo, useState } from "react";
import { activeProfile, deviceProfiles, DeviceProfile, storeProfile } from "@/lib/client-session";
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

  useEffect(() => {
    const stored = deviceProfiles(); setProfiles(stored);
    if (!initialEntry && !recoveryToken && stored.length) setMode("profiles");
    if (activeProfile() && !initialEntry && !recoveryToken) setMode("profiles");
  }, [initialEntry, recoveryToken]);

  const recoveryUrl = useMemo(() => personalQrToken && typeof location !== "undefined" ? `${location.origin}/join/recover?token=${personalQrToken}` : "", [personalQrToken]);

  function togglePicture(value: string) {
    setPictures((current) => current.includes(value) ? current.filter((item) => item !== value) : current.length < 4 ? [...current, value] : current);
  }

  async function submit() {
    setError(""); setBusy(true);
    try {
      const action = mode === "unlock" ? "switchProfile" : mode === "recover" ? "recover" : "join";
      const payload = action === "switchProfile" ? { action, studentId: selectedProfile?.studentId, picturePassword: pictures } : action === "join"
        ? { action, entry, nickname, animal, picturePassword: pictures }
        : recoveryToken ? { action, personalQrToken: recoveryToken } : { action, classCode: entry, nickname, animal, picturePassword: pictures };
      const response = await fetch("/api/student", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as { error?: string; student?: { id: string; nickname: string; animal: string; classroomName: string }; deviceToken?: string; expiresAt?: string; personalQrToken?: string };
      if (!response.ok || !data.student || !data.deviceToken || !data.expiresAt) throw new Error(data.error ?? "입장할 수 없어요.");
      storeProfile({ studentId: data.student.id, nickname: data.student.nickname, animal: data.student.animal, classroomName: data.student.classroomName, deviceToken: data.deviceToken, expiresAt: data.expiresAt });
      setPersonalQrToken(data.personalQrToken ?? ""); setMode(data.personalQrToken ? "done" : "profiles");
      if (!data.personalQrToken) location.href = "/student";
    } catch (cause) { setError(cause instanceof Error ? cause.message : "다시 해 주세요."); }
    finally { setBusy(false); }
  }

  if (mode === "profiles") {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card wide"><p className="eyebrow">오늘 누가 그릴 거야?</p><h1>내 프로필을 골라요</h1><div className="profile-grid">{profiles.map((profile) => <button className="profile-button" key={profile.studentId} onClick={() => { setSelectedProfile(profile); setPictures([]); setError(""); setMode("unlock"); }}><span>{profile.animal}</span><b>{profile.nickname}</b><small>{profile.classroomName}</small></button>)}<button className="profile-button add" onClick={() => setMode("join")}><span>＋</span><b>처음 왔어요</b></button></div><button className="text-button" onClick={() => setMode("recover")}>다른 기기에서 하던 그림 찾기</button></section></main>;
  }

  if (mode === "unlock" && selectedProfile) {
    return <main className="entry-shell"><div className="entry-top"><Logo /><span>공유 태블릿</span></div><section className="entry-card"><button className="small-button" onClick={() => setMode("profiles")}>← 학생 다시 고르기</button><div className="profile-unlock"><span>{selectedProfile.animal}</span><h1>{selectedProfile.nickname}</h1><p>{selectedProfile.classroomName}</p></div><fieldset><legend>내 그림 비밀번호 <small>{pictures.length}/4</small></legend><p className="helper">순서대로 네 개를 골라야 열려요.</p><div className="chip-row picture-row">{PICTURES.map((value) => <button type="button" aria-pressed={pictures.includes(value)} className={pictures.includes(value) ? "picture-chip selected" : "picture-chip"} key={value} onClick={() => togglePicture(value)}>{value}</button>)}</div>{pictures.length > 0 && <div className="password-preview">{pictures.join(" → ")}</div>}</fieldset>{error && <p className="error-box" role="alert">{error}</p>}<button className="button primary full" disabled={busy || pictures.length !== 4} onClick={submit}>{busy ? "확인 중…" : "내 그림 열기"}</button></section></main>;
  }

  if (mode === "done") {
    return <main className="entry-shell"><div className="entry-top"><Logo /></div><section className="entry-card"><div className="success-mark">✓</div><h1>내 그림 카드가 생겼어요!</h1><p>다른 기기에서 이어 그릴 때 쓰는 비공개 QR이에요. 선생님과 함께 안전하게 보관해요.</p><div className="personal-card"><QrCode value={recoveryUrl} label={`${nickname} 개인 복구 QR`} /><span>{animal}</span><b>{nickname}</b><small>개인 복구 카드</small><code>{recoveryUrl.slice(-16)}</code></div><button className="button secondary full" onClick={() => navigator.clipboard?.writeText(recoveryUrl)}>복구 주소 복사</button><a className="button primary full" href="/student">그림 시작하기</a></section></main>;
  }

  return (
    <main className="entry-shell"><div className="entry-top"><Logo /><a href="/teacher">교사 입장</a></div><section className="entry-card"><p className="eyebrow">{mode === "join" ? "수업에 들어가요" : "내 그림을 찾아요"}</p><h1>{mode === "join" ? "반가워, 꼬마 화가!" : "다시 만나서 반가워!"}</h1>{recoveryToken ? <p className="helper">개인 카드로 안전하게 찾는 중이에요.</p> : <><label>수업 코드<input inputMode="numeric" maxLength={12} value={entry} onChange={(event) => setEntry(event.target.value.replace(/\s/g, ""))} placeholder="예: 2841" /></label><label>그림 별명<input maxLength={16} value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="예: 토끼 화가" /></label><fieldset><legend>내 동물</legend><div className="chip-row">{ANIMALS.map((value) => <button type="button" aria-pressed={animal === value} className={animal === value ? "emoji-chip selected" : "emoji-chip"} key={value} onClick={() => setAnimal(value)}>{value}</button>)}</div></fieldset><fieldset><legend>그림 비밀번호 <small>{pictures.length}/4</small></legend><p className="helper">순서대로 네 개를 골라요.</p><div className="chip-row picture-row">{PICTURES.map((value) => <button type="button" aria-pressed={pictures.includes(value)} className={pictures.includes(value) ? "picture-chip selected" : "picture-chip"} key={value} onClick={() => togglePicture(value)}>{value}</button>)}</div>{pictures.length > 0 && <div className="password-preview">{pictures.join(" → ")}</div>}</fieldset></>}{error && <p className="error-box" role="alert">{error}</p>}<button className="button primary full" disabled={busy || (!recoveryToken && (!entry || !nickname || pictures.length !== 4))} onClick={submit}>{busy ? "찾는 중…" : mode === "join" ? "수업 들어가기" : "내 그림 찾기"}</button>{!recoveryToken && <button className="text-button" onClick={() => { setError(""); setMode(mode === "join" ? "recover" : "join"); }}>{mode === "join" ? "전에 그리던 그림이 있어요" : "처음 왔어요"}</button>}</section></main>
  );
}
