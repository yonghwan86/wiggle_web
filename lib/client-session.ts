"use client";

export type DeviceProfile = {
  studentId: string;
  nickname: string;
  animal: string;
  classroomName: string;
};

export type ActiveDeviceProfile = DeviceProfile & {
  deviceToken: string;
  expiresAt: string;
};

type ActiveSession = { studentId: string; deviceToken: string; expiresAt: string };
export type QueuedSave = { requestId: string; studentId: string; url: string; body: string; createdAt: string; conflict?: boolean; conflictRevision?: number };
export type FlushResult = { flushed: number; conflicts: QueuedSave[]; discarded: number; pending: number };

const PROFILES_KEY = "wiggle.deviceProfiles.v2";
const LEGACY_PROFILES_KEY = "wiggle.deviceProfiles.v1";
const ACTIVE_SESSION_KEY = "wiggle.activeSession.v2";

export function deviceProfiles(): DeviceProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY) ?? localStorage.getItem(LEGACY_PROFILES_KEY) ?? "[]";
    const values = JSON.parse(raw) as Array<Record<string, unknown>>;
    const safe = Array.isArray(values) ? values.filter((item) => item?.studentId).map((item) => ({
      studentId: String(item.studentId), nickname: String(item.nickname ?? ""), animal: String(item.animal ?? ""), classroomName: String(item.classroomName ?? ""),
    })) : [];
    if (localStorage.getItem(LEGACY_PROFILES_KEY)) {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(safe));
      localStorage.removeItem(LEGACY_PROFILES_KEY);
      localStorage.removeItem("wiggle.activeStudent.v1");
    }
    return safe;
  } catch { return []; }
}

export function activeProfile(): ActiveDeviceProfile | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(ACTIVE_SESSION_KEY) ?? "null") as ActiveSession | null;
    if (!session || new Date(session.expiresAt) <= new Date()) { sessionStorage.removeItem(ACTIVE_SESSION_KEY); return null; }
    const profile = deviceProfiles().find((item) => item.studentId === session.studentId);
    return profile ? { ...profile, deviceToken: session.deviceToken, expiresAt: session.expiresAt } : null;
  } catch { sessionStorage.removeItem(ACTIVE_SESSION_KEY); return null; }
}

export function storeProfile(profile: ActiveDeviceProfile) {
  const profiles = deviceProfiles().filter((item) => item.studentId !== profile.studentId);
  profiles.push({ studentId: profile.studentId, nickname: profile.nickname, animal: profile.animal, classroomName: profile.classroomName });
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ studentId: profile.studentId, deviceToken: profile.deviceToken, expiresAt: profile.expiresAt } satisfies ActiveSession));
}

export function setActiveSession(studentId: string, deviceToken: string, expiresAt: string) {
  if (!deviceProfiles().some((profile) => profile.studentId === studentId)) throw new Error("저장된 학생 프로필이 아니에요.");
  sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ studentId, deviceToken, expiresAt } satisfies ActiveSession));
}

export function leaveActiveProfile() { sessionStorage.removeItem(ACTIVE_SESSION_KEY); }

export async function deactivateProfile() {
  const profile = activeProfile();
  if (profile) {
    try { await studentFetch("/api/student", { method: "POST", body: JSON.stringify({ action: "logout" }) }, profile); } catch { /* Session still expires server-side. */ }
  }
  leaveActiveProfile();
}

export async function studentFetch(path: string, init: RequestInit = {}, profile = activeProfile()) {
  if (!profile) throw new Error("그림 비밀번호로 내 프로필을 열어 주세요.");
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${profile.deviceToken}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers, cache: "no-store" });
}

function queueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("wiggle-offline-v1", 2);
    request.onupgradeneeded = (event) => {
      const store = request.result.objectStoreNames.contains("saves")
        ? request.transaction!.objectStore("saves")
        : request.result.createObjectStore("saves", { keyPath: "requestId" });
      if ((event as IDBVersionChangeEvent).oldVersion < 2) {
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value as QueuedSave & { token?: string };
          if ("token" in value) { delete value.token; cursor.update(value); }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}

async function allSaves(db: IDBDatabase) {
  return new Promise<QueuedSave[]>((resolve, reject) => { const request = db.transaction("saves", "readonly").objectStore("saves").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function deleteSave(db: IDBDatabase, requestId: string) {
  await new Promise<void>((resolve, reject) => { const request = db.transaction("saves", "readwrite").objectStore("saves").delete(requestId); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

async function updateSave(db: IDBDatabase, save: QueuedSave) {
  await new Promise<void>((resolve, reject) => { const request = db.transaction("saves", "readwrite").objectStore("saves").put(save); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
}

export async function queueSave(save: QueuedSave) {
  const db = await queueDb(); const existing = await allSaves(db);
  const transaction = db.transaction("saves", "readwrite"); const store = transaction.objectStore("saves");
  for (const item of existing) if (item.studentId === save.studentId && item.url === save.url && item.requestId !== save.requestId && !item.conflict) store.delete(item.requestId);
  store.put(save);
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
  db.close();
}

export async function flushSaves(studentId?: string): Promise<FlushResult> {
  const profile = activeProfile();
  const scopedStudentId = studentId ?? profile?.studentId;
  const db = await queueDb(); const saves = (await allSaves(db)).filter((item) => !scopedStudentId || item.studentId === scopedStudentId);
  let flushed = 0; let discarded = 0; const conflicts: QueuedSave[] = [];
  for (const save of saves) {
    if (save.conflict) { conflicts.push(save); continue; }
    if (!profile || profile.studentId !== save.studentId) continue;
    try {
      const response = await fetch(save.url, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${profile.deviceToken}` }, body: save.body, cache: "no-store" });
      if (response.status === 409) {
        const data = await response.json().catch(() => ({})) as { serverRevision?: number };
        const conflicted = { ...save, conflict: true, conflictRevision: data.serverRevision };
        await updateSave(db, conflicted); conflicts.push(conflicted); continue;
      }
      if (response.ok) { await deleteSave(db, save.requestId); flushed += 1; continue; }
      if (response.status >= 400 && response.status < 500) { await deleteSave(db, save.requestId); discarded += 1; }
    } catch { break; }
  }
  const pending = (await allSaves(db)).filter((item) => !scopedStudentId || item.studentId === scopedStudentId).length;
  db.close(); return { flushed, conflicts, discarded, pending };
}
