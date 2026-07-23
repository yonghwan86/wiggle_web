"use client";

import { DrawDocument, validateDrawDocument } from "./drawing-model";

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
export type QueuedSave = { requestId: string; studentId: string; url: string; body: string; createdAt: string; branchId?: string; conflict?: boolean; conflictRevision?: number };
export type QueuedArtworkReflection = { favoritePart: string; favoriteReason: string; spokenDescription: string; storyText: string };
export type QueuedArtworkDraft = { save: QueuedSave; document: DrawDocument; currentStep: number; complete: boolean; reflection?: QueuedArtworkReflection; finalDataUrl?: string };
export type FlushResult = { flushed: number; conflicts: QueuedSave[]; remaining: QueuedSave[]; preserved: number; pending: number; latestRevisions: Record<string, number>; completedUrls: string[] };

const PROFILES_KEY = "wiggle.deviceProfiles.v2";
const LEGACY_PROFILES_KEY = "wiggle.deviceProfiles.v1";
const ACTIVE_SESSION_KEY = "wiggle.activeSession.v2";

function saveOrder(save: QueuedSave) { return `${save.createdAt}\u0000${save.requestId}`; }
function saveBranchKey(save: QueuedSave) { return save.branchId ? `branch:${save.branchId}` : `legacy:${save.requestId}`; }
function saveGroupKey(save: QueuedSave) { return `${save.studentId}\u0000${save.url}\u0000${saveBranchKey(save)}\u0000${save.conflict ? "conflict" : "pending"}`; }

export function coalesceQueuedArtworkSaves(saves: QueuedSave[]) {
  const newestCreatedAt = new Map<string, string>();
  for (const save of saves) {
    const key = saveGroupKey(save); const current = newestCreatedAt.get(key);
    if (!current || save.createdAt > current) newestCreatedAt.set(key, save.createdAt);
  }
  const kept = saves.filter((save) => save.createdAt === newestCreatedAt.get(saveGroupKey(save))).sort((left, right) => saveOrder(left).localeCompare(saveOrder(right)));
  const keptIds = new Set(kept.map((save) => save.requestId));
  return { kept, discarded: saves.filter((save) => !keptIds.has(save.requestId)) };
}

export function selectFlushCandidates(saves: QueuedSave[]) {
  const groups = new Map<string, QueuedSave[]>();
  for (const save of saves) {
    const values = groups.get(saveGroupKey(save)) ?? []; values.push(save); groups.set(saveGroupKey(save), values);
  }
  return [...groups.values()].map((values) => {
    const newestFirst = values.sort((left, right) => saveOrder(right).localeCompare(saveOrder(left)));
    return newestFirst.find((save) => queuedArtworkDraft(save)) ?? newestFirst[0];
  }).sort((left, right) => saveOrder(left).localeCompare(saveOrder(right)));
}

export function shouldDeleteSiblingAfterFlush(candidate: QueuedSave, sibling: QueuedSave) {
  return sibling.requestId !== candidate.requestId
    && saveGroupKey(sibling) === saveGroupKey(candidate)
    && (sibling.createdAt < candidate.createdAt || !queuedArtworkDraft(sibling));
}

export function queuedArtworkDraft(save: QueuedSave): QueuedArtworkDraft | null {
  try {
    const payload = JSON.parse(save.body) as Record<string, unknown>;
    const document = validateDrawDocument(payload.document); const currentStep = Number(payload.currentStep);
    if (!document || !Number.isInteger(currentStep) || currentStep < 0 || currentStep > 30) return null;
    const complete = payload.complete === true;
    const rawReflection = payload.reflection && typeof payload.reflection === "object" ? payload.reflection as Record<string, unknown> : {};
    const reflection = {
      favoritePart: typeof rawReflection.favoritePart === "string" ? rawReflection.favoritePart.slice(0, 80) : "",
      favoriteReason: typeof rawReflection.favoriteReason === "string" ? rawReflection.favoriteReason.slice(0, 180) : "",
      spokenDescription: typeof rawReflection.spokenDescription === "string" ? rawReflection.spokenDescription.slice(0, 300) : "",
      storyText: typeof rawReflection.storyText === "string" ? rawReflection.storyText.slice(0, 600) : "",
    };
    const finalDataUrl = typeof payload.finalDataUrl === "string" && payload.finalDataUrl.startsWith("data:image/png;base64,") && payload.finalDataUrl.length <= 5_000_000 ? payload.finalDataUrl : undefined;
    if (complete && (!reflection.favoritePart.trim() || !reflection.favoriteReason.trim() || !finalDataUrl)) return null;
    return { save, document, currentStep, complete, reflection: complete ? reflection : undefined, finalDataUrl };
  } catch { return null; }
}

export function latestQueuedArtworkDraft(saves: QueuedSave[], url: string) {
  const candidates = saves.filter((save) => save.url === url)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || Number(Boolean(right.conflict)) - Number(Boolean(left.conflict)) || right.requestId.localeCompare(left.requestId));
  for (const candidate of candidates) {
    const draft = queuedArtworkDraft(candidate);
    if (draft) return draft;
  }
  return null;
}

export function latestQueuedArtworkConflict(saves: QueuedSave[], url: string) {
  return latestQueuedArtworkDraft(saves.filter((save) => save.conflict), url);
}

export function resolveArtworkDraftDisposition(saves: QueuedSave[], url: string, completed: boolean) {
  const draft = latestQueuedArtworkDraft(saves, url);
  if (draft) return { action: "recover" as const, draft };
  if (completed) return { action: "archive" as const };
  return { action: "load" as const };
}

export function scopeQueuedArtworkSaves(saves: QueuedSave[], studentId?: string, url?: string) {
  return saves.filter((save) => (!studentId || save.studentId === studentId) && (!url || save.url === url));
}

export function shouldClearQueuedArtworkSave(
  save: QueuedSave,
  studentId: string,
  url: string,
  kind: "pending" | "conflict" | "all",
  through?: Pick<QueuedSave, "createdAt" | "requestId">,
  branchId?: string,
) {
  if (save.studentId !== studentId || save.url !== url) return false;
  if (branchId && save.branchId !== branchId) return false;
  if (kind === "pending" && save.conflict) return false;
  if (kind === "conflict" && !save.conflict) return false;
  return !through || save.createdAt < through.createdAt || (save.createdAt === through.createdAt && save.requestId === through.requestId);
}

export function flushResponseDisposition(status: number) {
  if (status === 409) return "conflict" as const;
  if (status >= 200 && status < 300) return "success" as const;
  if (status >= 400 && status < 500) return "preserve" as const;
  return "retry" as const;
}

export function createSerialTaskQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>) {
    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

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
  const db = await queueDb();
  const transaction = db.transaction("saves", "readwrite"); const store = transaction.objectStore("saves");
  const request = store.getAll();
  request.onsuccess = () => {
    const existing = request.result as QueuedSave[];
    const sameRequestConflict = existing.find((item) => item.requestId === save.requestId && item.conflict);
    const incoming = sameRequestConflict && !save.conflict ? { ...save, conflict: true, conflictRevision: sameRequestConflict.conflictRevision } : save;
    for (const item of existing) {
      if (item.studentId !== incoming.studentId || item.url !== incoming.url || item.requestId === incoming.requestId || !incoming.branchId || item.branchId !== incoming.branchId || item.createdAt >= incoming.createdAt) continue;
      if (incoming.conflict || !item.conflict) store.delete(item.requestId);
    }
    store.put(incoming);
  };
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
  db.close();
}

export async function deleteQueuedArtworkSave(studentId: string, url: string, requestId: string) {
  const db = await queueDb(); const transaction = db.transaction("saves", "readwrite"); const store = transaction.objectStore("saves");
  const request = store.get(requestId);
  request.onsuccess = () => {
    const save = request.result as QueuedSave | undefined;
    if (save?.studentId === studentId && save.url === url) store.delete(requestId);
  };
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
  db.close();
}

export async function clearQueuedArtworkSaves(
  studentId: string,
  url: string,
  kind: "pending" | "conflict" | "all",
  through?: Pick<QueuedSave, "createdAt" | "requestId">,
  branchId?: string,
) {
  const db = await queueDb(); const existing = await allSaves(db);
  const transaction = db.transaction("saves", "readwrite"); const store = transaction.objectStore("saves");
  for (const save of existing) {
    if (shouldClearQueuedArtworkSave(save, studentId, url, kind, through, branchId)) store.delete(save.requestId);
  }
  await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error); });
  db.close();
}

export async function flushSaves(studentId?: string, url?: string): Promise<FlushResult> {
  const profile = activeProfile();
  const scopedStudentId = studentId ?? profile?.studentId;
  const db = await queueDb(); const scoped = scopeQueuedArtworkSaves(await allSaves(db), scopedStudentId, url);
  const saves = selectFlushCandidates(scoped);
  let flushed = 0; let preserved = 0; const conflicts: QueuedSave[] = []; const latestRevisions: Record<string, number> = {}; const completedUrls = new Set<string>();
  for (const save of saves) {
    if (save.conflict) { conflicts.push(save); continue; }
    if (!profile || profile.studentId !== save.studentId) continue;
    try {
      const response = await fetch(save.url, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${profile.deviceToken}` }, body: save.body, cache: "no-store" });
      const disposition = flushResponseDisposition(response.status);
      if (disposition === "conflict") {
        const data = await response.json().catch(() => ({})) as { serverRevision?: number };
        const conflicted = { ...save, conflict: true, conflictRevision: data.serverRevision };
        await updateSave(db, conflicted);
        for (const stale of scoped) if (shouldDeleteSiblingAfterFlush(save, stale)) await deleteSave(db, stale.requestId);
        conflicts.push(conflicted); continue;
      }
      if (disposition === "success") {
        const data = await response.json().catch(() => ({})) as { revision?: number; status?: string };
        if (typeof data.revision === "number") latestRevisions[save.url] = data.revision;
        if (data.status === "complete" || queuedArtworkDraft(save)?.complete) completedUrls.add(save.url);
        await deleteSave(db, save.requestId);
        for (const stale of scoped) if (shouldDeleteSiblingAfterFlush(save, stale)) await deleteSave(db, stale.requestId);
        flushed += 1; continue;
      }
      if (disposition === "preserve") { preserved += 1; continue; }
    } catch { break; }
  }
  const remaining = scopeQueuedArtworkSaves(await allSaves(db), scopedStudentId, url);
  db.close(); return { flushed, conflicts, remaining, preserved, pending: remaining.length, latestRevisions, completedUrls: [...completedUrls] };
}
