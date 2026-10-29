"use client";

// Демо-хранилище черновиков резюме: только localStorage браузера ("profile-demo"), без бэкенда.
import { useSyncExternalStore } from "react";
import type { Resume } from "@/lib/parser/schema";

export type Status = "draft" | "published" | "unpublished";
export type Pick = { id: number; name: string };
// Явный выбор в форме. undefined = ещё не решено (подставится автоподбор), null = пользователь очистил поле.
export type Picks = {
  position?: Pick | null;
  region?: Pick | null;
  specialization?: Pick | null;
  skills?: Pick[];
  disability?: boolean | null;
  noExperience?: boolean;
  negotiable?: boolean;
  salaryPeriod?: string | null; // code из справочника salaryPeriod: INC_DAY | INC_MONTH | INC_WEEK
};
export type Draft = {
  id: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  resume: Resume;
  picks: Picks;
  source: { filename: string };
};

export const KEY = "profile-demo";
const EMPTY: Draft[] = [];

// ---- чистая логика переходов (покрыта тестами) ----
const NEXT: Record<Status, Status[]> = { draft: ["published"], published: ["unpublished"], unpublished: ["published"] };
export const canMove = (from: Status, to: Status) => NEXT[from].includes(to);

export function applyStatus(list: Draft[], id: string, to: Status, now = Date.now()): Draft[] {
  return list.map((d) => (d.id === id && canMove(d.status, to) ? { ...d, status: to, updatedAt: now, publishedAt: to === "published" ? now : d.publishedAt } : d));
}

export function applyPatch(list: Draft[], id: string, patch: { resume?: Resume; picks?: Picks }, now = Date.now()): Draft[] {
  return list.map((d) => {
    if (d.id !== id) return d;
    const resume = patch.resume ?? d.resume;
    const picks = patch.picks ?? d.picks;
    // без реальных правок отметку времени не двигаем
    if (JSON.stringify(resume) === JSON.stringify(d.resume) && JSON.stringify(picks) === JSON.stringify(d.picks)) return d;
    return { ...d, resume, picks, updatedAt: now };
  });
}

// ---- хранилище ----
let memRaw: string | null = null; // запасной вариант, если localStorage недоступен
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Draft[] } = { raw: null, value: EMPTY };

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY) ?? memRaw;
  } catch {
    return memRaw;
  }
}

function parse(raw: string | null): Draft[] {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as { resumes?: unknown };
    if (!Array.isArray(v?.resumes)) return EMPTY;
    return v.resumes.filter((d): d is Draft => !!d && typeof d.id === "string" && typeof d.resume === "object" && d.resume !== null && ["draft", "published", "unpublished"].includes(d.status));
  } catch {
    return EMPTY;
  }
}

export function getDrafts(): Draft[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, value: parse(raw) };
  return cache.value;
}

function write(list: Draft[]) {
  const raw = JSON.stringify({ resumes: list });
  memRaw = raw;
  try {
    localStorage.setItem(KEY, raw);
  } catch {}
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  const on = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) f();
  };
  window.addEventListener("storage", on);
  return () => {
    listeners.delete(f);
    window.removeEventListener("storage", on);
  };
};

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function createDraft(resume: Resume, filename: string, picks: Picks = {}): string {
  const now = Date.now();
  const d: Draft = { id: newId(), status: "draft", createdAt: now, updatedAt: now, resume, picks, source: { filename } };
  write([d, ...getDrafts()]);
  return d.id;
}
export const updateDraft = (id: string, patch: { resume?: Resume; picks?: Picks }) => write(applyPatch(getDrafts(), id, patch));
export const setStatus = (id: string, to: Status) => write(applyStatus(getDrafts(), id, to));
export const removeDraft = (id: string) => write(getDrafts().filter((d) => d.id !== id));

/** Правки на экране разбора переезжают в черновик, пока его не трогали в анкете. */
export function syncFromParser(id: string, resume: Resume) {
  const d = getDrafts().find((x) => x.id === id);
  if (d && d.updatedAt === d.createdAt && JSON.stringify(d.resume) !== JSON.stringify(resume)) updateDraft(id, { resume });
}

const noop = () => () => {};
export function useDrafts(): { drafts: Draft[]; ready: boolean } {
  const drafts = useSyncExternalStore(subscribe, getDrafts, () => EMPTY);
  const ready = useSyncExternalStore(noop, () => true, () => false);
  return { drafts, ready };
}

/** Только для тестов */
export function resetStore() {
  memRaw = null;
  cache = { raw: null, value: EMPTY };
  try {
    localStorage.removeItem(KEY);
  } catch {}
  listeners.forEach((f) => f());
}

// ---- одноразовое сообщение между страницами ----
export function flash(msg: string) {
  try {
    sessionStorage.setItem("profile-demo-flash", msg);
  } catch {}
}
export function takeFlash(): string | null {
  try {
    const m = sessionStorage.getItem("profile-demo-flash");
    if (m) sessionStorage.removeItem("profile-demo-flash");
    return m;
  } catch {
    return null;
  }
}

// ---- форматирование ----
export function fmtDate(ts: number, now = new Date()): string {
  const d = new Date(ts);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) };
  return new Intl.DateTimeFormat("ru-RU", o).format(d).replace(/\s?г\.$/, "");
}
