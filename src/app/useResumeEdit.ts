"use client";

import { useEffect, useRef, useState } from "react";
import { Resume } from "@/lib/parser/schema";

export type ArrKey = "experience" | "education" | "skills" | "languages" | "links";
const KEYS: ArrKey[] = ["experience", "education", "skills", "languages", "links"];
type Ids = Record<ArrKey, string[]>;
type State = { base: Resume; resume: Resume; ids: Ids; seq: number };

export const arrOf = (r: Resume, k: ArrKey): unknown[] => (k === "links" ? r.contacts.links : r[k]);

const initIds = (r: Resume): Ids =>
  Object.fromEntries(KEYS.map((k) => [k, arrOf(r, k).map((_, i) => `o${i}`)])) as Ids;
const init = (base: Resume): State => ({ base, resume: base, ids: initIds(base), seq: 0 });

export type Removed = { key: ArrKey; index: number; id: string; value: unknown; label: string };

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// Правка резюме в состоянии страницы: стабильные id записей, подсчёт изменений, откат
export function useResumeEdit(orig: Resume | null) {
  const [st, setSt] = useState<State | null>(orig ? init(orig) : null);
  // новый разбор / «Новый разбор» → состояние пересоздаётся от нового оригинала
  let cur = st;
  if ((orig ?? null) !== (cur?.base ?? null)) {
    cur = orig ? init(orig) : null;
    setSt(cur);
  }

  // актуальное состояние для синхронных обработчиков (несколько правок в одном тике)
  const ref = useRef<State | null>(cur);
  useEffect(() => {
    ref.current = cur;
  });
  const put = (s: State) => {
    ref.current = s;
    setSt(s);
  };

  // Синхронная проверка zod-схемой (для inline-подсказки до сохранения)
  const check = (mut: (d: Resume) => void): string | null => {
    const s = ref.current;
    if (!s) return null;
    const draft = structuredClone(s.resume);
    mut(draft);
    return Resume.safeParse(draft).success ? null : "Некорректное значение";
  };

  // Применяет мутацию к копии, валидирует; возвращает текст ошибки или null
  const commit = (mut: (d: Resume) => void): string | null => {
    const s = ref.current;
    if (!s) return null;
    const draft = structuredClone(s.resume);
    mut(draft);
    const ok = Resume.safeParse(draft);
    if (!ok.success) return "Некорректное значение";
    put({ ...s, resume: ok.data });
    return null;
  };

  const add = (key: ArrKey, value: unknown): string => {
    const s = ref.current!;
    const id = `n${s.seq}`;
    const draft = structuredClone(s.resume);
    arrOf(draft, key).push(value);
    put({ ...s, resume: draft, seq: s.seq + 1, ids: { ...s.ids, [key]: [...s.ids[key], id] } });
    return id;
  };

  const remove = (key: ArrKey, id: string, label: string): Removed | null => {
    const s = ref.current;
    const index = s ? s.ids[key].indexOf(id) : -1;
    if (!s || index < 0) return null;
    const value = arrOf(s.resume, key)[index];
    const draft = structuredClone(s.resume);
    arrOf(draft, key).splice(index, 1);
    put({ ...s, resume: draft, ids: { ...s.ids, [key]: s.ids[key].filter((x) => x !== id) } });
    return { key, index, id, value, label };
  };

  const restore = (r: Removed) => {
    const s = ref.current;
    if (!s || s.ids[r.key].includes(r.id)) return;
    const draft = structuredClone(s.resume);
    const i = Math.min(r.index, arrOf(draft, r.key).length);
    arrOf(draft, r.key).splice(i, 0, structuredClone(r.value));
    const ids = [...s.ids[r.key]];
    ids.splice(i, 0, r.id);
    put({ ...s, resume: draft, ids: { ...s.ids, [r.key]: ids } });
  };

  const reset = () => {
    const s = ref.current;
    if (s) put(init(s.base));
  };
  // снимок для «Отменить» после сброса
  const snapshot = (): State | null => ref.current;
  const revert = (s: State | null) => {
    if (s) put(s);
  };

  if (!cur) return null;
  const { base, resume, ids } = cur;

  // исходная запись по id (undefined для добавленных вручную)
  const origEntry = (key: ArrKey, id: string): unknown => {
    const m = /^o(\d+)$/.exec(id);
    return m ? arrOf(base, key)[+m[1]] : undefined;
  };

  let count = 0;
  const scalars: [unknown, unknown][] = [
    [resume.fullName, base.fullName], [resume.desiredPosition, base.desiredPosition], [resume.summary, base.summary],
    [resume.contacts.phone, base.contacts.phone], [resume.contacts.email, base.contacts.email], [resume.contacts.city, base.contacts.city],
    [resume.driverLicense, base.driverLicense], [resume.birthDate, base.birthDate], [resume.salary, base.salary],
    [resume.employment, base.employment], [resume.schedule, base.schedule], [resume.relocation, base.relocation],
    [resume.businessTrips, base.businessTrips], [resume.timeToWork, base.timeToWork], [resume.specialization, base.specialization],
  ];
  for (const [a, b] of scalars) if (!eq(a, b)) count++;
  for (const k of KEYS) {
    const list = arrOf(resume, k);
    ids[k].forEach((id, i) => {
      const o = origEntry(k, id);
      if (o === undefined) return void count++;
      const c = list[i];
      if (c && typeof c === "object") {
        for (const f of Object.keys(c as object)) if (!eq((c as Record<string, unknown>)[f], (o as Record<string, unknown>)[f])) count++;
      } else if (!eq(c, o)) count++;
    });
    count += arrOf(base, k).filter((_, i) => !ids[k].includes(`o${i}`)).length;
  }

  return { orig: base, resume, ids, count, origEntry, commit, check, add, remove, restore, reset, snapshot, revert };
}

export type ResumeEdit = NonNullable<ReturnType<typeof useResumeEdit>>;
