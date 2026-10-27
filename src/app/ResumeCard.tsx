"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Resume } from "@/lib/parser";
import SourceSheet, { type SourceReq } from "./SourceSheet";
import { EMPLOYMENT, LABEL, SCHEDULE, TIME_TO_WORK, TRIPS } from "@/lib/parser/terms";
import type { ArrKey, ResumeEdit } from "./useResumeEdit";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const ym = (d: string | null) => (d ? `${MONTHS[+d.slice(5, 7) - 1] ?? ""} ${d.slice(0, 4)}`.trim() : null);
const NO_SRC = "Для сканов и фото исходный текст недоступен";

function money(s: Resume["salary"]) {
  if (s.from == null && s.to == null) return null;
  const n = (v: number) => v.toLocaleString("ru-RU");
  const range = s.from != null && s.to != null ? `${n(s.from)} – ${n(s.to)}` : s.from != null ? `от ${n(s.from)}` : `до ${n(s.to!)}`;
  const per = { month: "в месяц", hour: "в час", year: "в год" }[s.period ?? "month"];
  return `${range} ${s.currency ?? ""} ${per}`.replace(/\s+/g, " ");
}

// ---------- контекст редактора ----------
type Ctx = {
  fine: boolean; // мышь/трекпад: клик = правка, иконка источника рядом; иначе тап = меню действий
  hasSource: boolean;
  unv: Set<string>; // значения, которых нет в тексте (распознаны с изображения)
  menu: string | null;
  setMenu: (id: string | null) => void;
  pending: string | null; // поле, которое надо сразу открыть на правку (после «+ Добавить»)
  clearPending: () => void;
  showSource: (r: SourceReq) => void;
};
const C = createContext<Ctx>(null!);

const mq = "(hover: hover) and (pointer: fine)";
const subFine = (cb: () => void) => {
  const m = window.matchMedia(mq);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useFine = () => useSyncExternalStore(subFine, () => window.matchMedia(mq).matches, () => false);

const DocIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h6" />
  </svg>
);
const Trash = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
  </svg>
);

// ---------- Tappable: оболочка значения (маркер «изменено», меню действий, иконка источника) ----------
function Tappable({
  id, label, display, empty, changed, sourceValue, editing, editor, onEdit, block,
}: {
  id: string; label: string; display: ReactNode; empty: boolean; changed: boolean; sourceValue: string | null;
  editing: boolean; editor: ReactNode; onEdit: () => void; block?: boolean;
}) {
  const c = useContext(C);
  const open = c.menu === id;
  const box = useRef<HTMLSpanElement>(null);
  const [flip, setFlip] = useState(false);
  const canSource = !!sourceValue && sourceValue.trim() !== "";
  const fromImage = !changed && canSource && c.unv.has(sourceValue!.trim());

  useLayoutEffect(() => {
    if (!open || !box.current) return;
    const m = box.current.querySelector<HTMLElement>("[role=menu]");
    if (!m) return;
    const r = m.getBoundingClientRect();
    setFlip(r.right > window.innerWidth - 8);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) c.setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      c.setMenu(null);
      box.current?.querySelector<HTMLElement>("[data-fld]")?.focus();
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, c]);

  if (editing) return <span className={block ? "block" : undefined}>{editor}</span>;

  const activate = () => {
    if (c.fine || empty) return onEdit();
    c.setMenu(open ? null : id);
  };
  const source = () => {
    c.setMenu(null);
    if (canSource && c.hasSource) c.showSource({ label, value: sourceValue!, edited: changed, image: fromImage });
  };

  return (
    <span ref={box} className={`fld-wrap relative ${block ? "block" : ""}`}>
      <span
        data-fld
        role="button"
        tabIndex={0}
        data-empty={empty}
        aria-haspopup={c.fine ? undefined : "menu"}
        aria-expanded={c.fine ? undefined : open}
        aria-label={`${label}: ${empty ? "не указано" : sourceValue ?? (typeof display === "string" ? display : "")}`}
        className="fld"
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") (e.preventDefault(), activate());
        }}
      >
        {display}
      </span>
      {fromImage && (
        <span className="ml-1.5 inline-block whitespace-nowrap rounded-full px-1.5 py-px align-middle text-[11px] font-semibold leading-snug tracking-normal text-warn" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)" }}>
          с изображения
        </span>
      )}
      {changed && <i className="edit-dot" role="img" aria-label="изменено" title="Изменено" />}
      {c.fine && canSource && (
        <button
          type="button"
          className="src-btn text-muted hover:text-accent"
          aria-label={`Показать в документе: ${label}`}
          title={c.hasSource ? "Показать в документе" : NO_SRC}
          aria-disabled={!c.hasSource}
          onClick={source}
        >
          <DocIcon />
        </button>
      )}
      {open && (
        <span role="menu" aria-label={label} className={`pop card absolute top-full z-30 mt-1.5 flex w-max min-w-[230px] max-w-[min(300px,80vw)] flex-col p-1.5 text-[16px] font-normal tracking-normal text-ink ${flip ? "right-0" : "left-0"}`} style={{ boxShadow: "var(--shadow), 0 12px 32px -8px rgba(0,0,0,.25)" }}>
          <button role="menuitem" type="button" className="flex min-h-[44px] items-center rounded-[10px] px-3 text-left font-medium active:bg-fill" onClick={() => (c.setMenu(null), onEdit())}>
            Изменить
          </button>
          <button role="menuitem" type="button" aria-disabled={!c.hasSource || !canSource} className={`flex min-h-[44px] items-center rounded-[10px] px-3 text-left font-medium ${c.hasSource && canSource ? "active:bg-fill" : "opacity-45"}`} onClick={source}>
            Показать в документе
          </button>
          {!c.hasSource && <span className="px-3 pb-2 pt-0.5 text-[13px] leading-snug text-muted">{NO_SRC}</span>}
        </span>
      )}
    </span>
  );
}

// ---------- Field: текст/дата/число с правкой на месте ----------
type Kind = "text" | "area" | "month" | "date" | "number";

function Field({
  id, label, value, placeholder, kind = "text", display, changed = false, sourceValue, onSave, removeWhenEmpty, onEmpty, block, hideEmptyHint,
}: {
  id: string; label: string; value: string | null; placeholder: string; kind?: Kind; display?: ReactNode; changed?: boolean;
  sourceValue?: string | null; onSave: (v: string | null) => string | null; removeWhenEmpty?: boolean; onEmpty?: () => void;
  block?: boolean; hideEmptyHint?: boolean;
}) {
  const c = useContext(C);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const cancelled = useRef(false);
  const el = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const empty = value == null || value === "";
  const multi = kind === "text" || kind === "area";

  const begin = () => {
    setDraft(value ?? "");
    setErr(null);
    cancelled.current = false;
    setEditing(true);
  };

  const { pending, clearPending } = c;
  useEffect(() => {
    if (pending !== id) return;
    clearPending();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, id]);

  useLayoutEffect(() => {
    const e = el.current;
    if (!editing || !e) return;
    if (multi) {
      e.style.height = "auto";
      e.style.height = `${e.scrollHeight}px`;
    }
  }, [editing, draft, multi]);

  useEffect(() => {
    const e = el.current;
    if (!editing || !e) return;
    e.focus({ preventScroll: false });
    if (multi) e.setSelectionRange(e.value.length, e.value.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const finish = () => {
    if (cancelled.current) return setEditing(false);
    const next = draft.trim() === "" ? null : draft.trim();
    if (next === null && removeWhenEmpty) {
      setEditing(false);
      return onEmpty?.();
    }
    if (next === (empty ? null : value)) return setEditing(false);
    const e = onSave(next);
    if (e) return setErr(e);
    setEditing(false);
  };

  const editor = (
    <>
      {multi ? (
        <textarea
          ref={el}
          rows={1}
          value={draft}
          data-err={!!err}
          aria-label={label}
          aria-invalid={!!err}
          className="fld-edit"
          placeholder={placeholder}
          onChange={(e) => (setDraft(e.target.value), setErr(null))}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancelled.current = true;
              setEditing(false);
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing && (kind === "text" ? !e.shiftKey : e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              finish();
            }
          }}
        />
      ) : (
        <input
          ref={el}
          type={kind}
          inputMode={kind === "number" ? "numeric" : undefined}
          value={draft}
          data-err={!!err}
          aria-label={label}
          aria-invalid={!!err}
          className="fld-edit"
          onChange={(e) => (setDraft(e.target.value), setErr(null))}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              cancelled.current = true;
              setEditing(false);
            } else if (e.key === "Enter") {
              e.preventDefault();
              finish();
            }
          }}
        />
      )}
      {err && (
        <span role="alert" className="mt-0.5 block text-[13px] font-normal leading-snug tracking-normal text-danger">
          {err}
        </span>
      )}
    </>
  );

  return (
    <Tappable
      id={id} label={label} empty={empty} changed={changed} block={block}
      sourceValue={sourceValue === undefined ? value : sourceValue}
      editing={editing} editor={editor} onEdit={begin}
      display={empty ? (hideEmptyHint ? "—" : placeholder) : (display ?? value)}
    />
  );
}

// ---------- мелкие части ----------
function Section({ title, i, children }: { title: string; i: number; children: ReactNode }) {
  return (
    <section className="rise border-t border-line pt-5" style={{ ["--i" as string]: i }}>
      <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">{title}</h3>
      {children}
    </section>
  );
}

const AddBtn = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={onClick}>
    + {children}
  </button>
);

const DelBtn = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="tap grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-danger active:text-danger" aria-label={label} title="Удалить" onClick={onClick}>
    <Trash />
  </button>
);

const Sep = ({ children = "·" }: { children?: string }) => <span aria-hidden className="mx-1.5 text-muted">{children}</span>;

type Toast = { text: string; undo: () => void };

export default function ResumeCard({ ed, sourceText, unverified = [] }: { ed: ResumeEdit; sourceText: string | null; unverified?: string[] }) {
  const r = ed.resume;
  const o = ed.orig;
  const fine = useFine();
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [src, setSrc] = useState<SourceReq | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);
  const notify = (t: Toast) => {
    clearTimeout(timer.current);
    setToast(t);
    timer.current = setTimeout(() => setToast(null), 5000);
  };
  const dismiss = () => (clearTimeout(timer.current), setToast(null));

  // «Раздел: значение» → множество значений
  const unv = useMemo(() => new Set(unverified.map((u) => u.slice(u.indexOf(": ") + 2).trim())), [unverified]);
  const ctx: Ctx = { fine, unv, hasSource: sourceText !== null, menu, setMenu, pending, clearPending: () => setPending(null), showSource: setSrc };

  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const set = (mut: (d: Resume) => void) => ed.commit(mut);
  const idx = (k: ArrKey, id: string) => ed.ids[k].indexOf(id);
  const orig = <T,>(k: ArrKey, id: string): T | undefined => ed.origEntry(k, id) as T | undefined;

  const del = (k: ArrKey, id: string, label: string, text: string, quiet = false) => {
    const removed = ed.remove(k, id, label);
    if (removed && !quiet) notify({ text: `Удалено: ${text}`, undo: () => (ed.restore(removed), dismiss()) });
  };
  const add = (k: ArrKey, value: unknown, field: string, prefix: string) => {
    const id = ed.add(k, value);
    setPending(`${prefix}:${id}:${field}`);
  };

  const resetAll = () => {
    const prev = ed.snapshot();
    ed.reset();
    notify({ text: "Все правки сброшены", undo: () => (ed.revert(prev), dismiss()) });
  };

  const salary = money(r.salary);
  const sal = r.salary;

  return (
    <C.Provider value={ctx}>
      {ed.count > 0 && (
        <div className="pop mb-3 flex items-center justify-between gap-3 rounded-[18px] bg-accent-soft py-2 pl-4 pr-2">
          <p className="text-[15px] font-medium" role="status">
            <i className="edit-dot !ml-0 mr-2" aria-hidden />
            Изменено полей: {ed.count}
          </p>
          <button type="button" className="btn btn-sm !bg-transparent text-accent" onClick={resetAll}>
            Сбросить
          </button>
        </div>
      )}

      <article className="card space-y-6 p-5 sm:p-8">
        <header className="rise">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.025em] break-words">
            <Field id="name" label="Имя" value={r.fullName} placeholder="Имя не указано" changed={r.fullName !== o.fullName}
              onSave={(v) => set((d) => void (d.fullName = v))} />
          </h2>
          <p className="mt-1 text-[19px] font-medium leading-snug tracking-[-0.01em] text-accent break-words">
            <Field id="pos" label="Желаемая должность" value={r.desiredPosition} placeholder="Желаемая должность" changed={r.desiredPosition !== o.desiredPosition}
              onSave={(v) => set((d) => void (d.desiredPosition = v))} />
          </p>
          <p className="mt-1 text-sm text-muted">
            <SalaryField ed={ed} text={salary} changed={!eq(sal, o.salary)} />
          </p>
          <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[15px]">
            <li className="break-all">
              <Field id="phone" label="Телефон" value={r.contacts.phone} placeholder="+ телефон" changed={r.contacts.phone !== o.contacts.phone}
                onSave={(v) => set((d) => void (d.contacts.phone = v))} />
            </li>
            <li className="break-all">
              <Field id="email" label="Email" value={r.contacts.email} placeholder="+ email" changed={r.contacts.email !== o.contacts.email}
                onSave={(v) => set((d) => void (d.contacts.email = v))} />
            </li>
            <li className="break-all">
              <Field id="city" label="Город" value={r.contacts.city} placeholder="+ город" changed={r.contacts.city !== o.contacts.city}
                onSave={(v) => set((d) => void (d.contacts.city = v))} />
            </li>
            {ed.ids.links.map((id, i) => (
              <li key={id} className="break-all">
                <Field id={`link:${id}`} label="Ссылка" value={r.contacts.links[i]} placeholder="ссылка"
                  changed={ed.origEntry("links", id) !== undefined && r.contacts.links[i] !== ed.origEntry("links", id)}
                  removeWhenEmpty onEmpty={() => del("links", id, "Ссылка", r.contacts.links[i] || "ссылка", !r.contacts.links[i])}
                  onSave={(v) => set((d) => void (d.contacts.links[idx("links", id)] = v ?? ""))} />
              </li>
            ))}
            <li>
              <button type="button" className="tap text-[15px] text-muted hover:text-accent" onClick={() => add("links", "", "", "link")}>
                + ссылка
              </button>
            </li>
          </ul>
          <p className="mt-2 text-sm text-muted">
            <Field id="birth" label="Дата рождения" kind="date" value={r.birthDate} placeholder="+ дата рождения" changed={r.birthDate !== o.birthDate}
              display={`Дата рождения: ${r.birthDate}`} sourceValue={r.birthDate}
              onSave={(v) => set((d) => void (d.birthDate = v))} />
            <Sep />
            <Field id="lic" label="Права" value={r.driverLicense} placeholder="+ права" changed={r.driverLicense !== o.driverLicense}
              display={`Права: ${r.driverLicense}`} sourceValue={r.driverLicense}
              onSave={(v) => set((d) => void (d.driverLicense = v))} />
          </p>
          <p className="mt-2 text-sm text-muted">
            <TermsField ed={ed} changed={TERMS.some((k) => !eq(r[k], o[k]))} />
          </p>
        </header>

        {r.summary && (
          <Section title="О себе" i={1}>
            <p className="text-[15px] leading-relaxed">
              <Field id="summary" label="О себе" kind="area" block value={r.summary} placeholder="О себе" changed={r.summary !== o.summary}
                display={<span className="whitespace-pre-line">{r.summary}</span>}
                onSave={(v) => set((d) => void (d.summary = v))} />
            </p>
          </Section>
        )}

        <Section title="Опыт работы" i={2}>
          <ol className="ml-1.5 space-y-5 border-l border-line pl-5">
            {ed.ids.experience.map((id, i) => {
              const e = r.experience[i];
              const oe = orig<Resume["experience"][number]>("experience", id);
              const isNew = !oe;
              const patch = (p: Partial<typeof e>) => set((d) => void Object.assign(d.experience[idx("experience", id)], p));
              const f = (k: keyof typeof e) => !!oe && e[k] !== oe[k];
              const title = [e.position, e.company].filter(Boolean).join(", ") || "запись об опыте";
              return (
                <li key={id} className="relative">
                  <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-accent-fill bg-surface" />
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium break-words">
                      <Field id={`exp:${id}:position`} label="Должность" value={e.position} placeholder="должность" changed={f("position")}
                        onSave={(v) => patch({ position: v })} />
                      {e.position && e.company && <span>, </span>}
                      {!(e.position && e.company) && <Sep>·</Sep>}
                      <Field id={`exp:${id}:company`} label="Компания" value={e.company} placeholder="компания" changed={f("company")}
                        onSave={(v) => patch({ company: v })} />
                    </p>
                    <DelBtn label={`Удалить запись: ${title}`} onClick={() => del("experience", id, "Опыт", title)} />
                  </div>
                  <p className="flex flex-wrap items-center gap-y-1 text-sm text-muted">
                    <Field id={`exp:${id}:start`} label="Начало работы" kind="month" value={e.startDate} placeholder="начало" changed={f("startDate")}
                      display={ym(e.startDate)} sourceValue={e.startDate} onSave={(v) => patch({ startDate: v })} />
                    <Sep>—</Sep>
                    <PeriodEnd id={`exp:${id}:end`} e={e} changed={f("endDate") || f("current")}
                      onSave={(p) => patch(p)} />
                    <Sep>·</Sep>
                    <Field id={`exp:${id}:city`} label="Город" value={e.city} placeholder="город" changed={f("city")} onSave={(v) => patch({ city: v })} />
                  </p>
                  <p className="mt-1.5 text-[15px] leading-relaxed">
                    <Field id={`exp:${id}:desc`} label="Описание" kind="area" block value={e.description} placeholder="+ описание" changed={f("description")}
                      display={<span className="whitespace-pre-line">{e.description}</span>} onSave={(v) => patch({ description: v })} />
                  </p>
                  {isNew && <p className="mt-1 text-[12px] font-medium text-accent">добавлено вручную</p>}
                </li>
              );
            })}
          </ol>
          <AddBtn onClick={() => add("experience", { company: null, position: null, city: null, startDate: null, endDate: null, current: false, description: null }, "position", "exp")}>
            Добавить место работы
          </AddBtn>
        </Section>

        <Section title="Образование" i={3}>
          <ul className="space-y-3">
            {ed.ids.education.map((id, i) => {
              const e = r.education[i];
              const oe = orig<Resume["education"][number]>("education", id);
              const patch = (p: Partial<typeof e>) => set((d) => void Object.assign(d.education[idx("education", id)], p));
              const f = (k: keyof typeof e) => !!oe && e[k] !== oe[k];
              const year = (k: "startYear" | "endYear", label: string, ph: string) => (
                <Field id={`edu:${id}:${k}`} label={label} kind="number" value={e[k] == null ? null : String(e[k])} placeholder={ph} changed={f(k)}
                  onSave={(v) => {
                    const n = v === null ? null : Number(v);
                    if (n !== null && (!Number.isInteger(n) || n < 1950 || n > 2100)) return "Год от 1950 до 2100";
                    return patch({ [k]: n });
                  }} />
              );
              const title = e.institution || "запись об образовании";
              return (
                <li key={id}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium break-words">
                      <Field id={`edu:${id}:inst`} label="Учебное заведение" value={e.institution} placeholder="учебное заведение" changed={f("institution")}
                        onSave={(v) => patch({ institution: v })} />
                    </p>
                    <DelBtn label={`Удалить запись: ${title}`} onClick={() => del("education", id, "Образование", title)} />
                  </div>
                  <p className="flex flex-wrap items-center gap-y-1 text-sm text-muted">
                    <Field id={`edu:${id}:degree`} label="Степень" value={e.degree} placeholder="степень" changed={f("degree")} onSave={(v) => patch({ degree: v })} />
                    <Sep />
                    <Field id={`edu:${id}:field`} label="Специальность" value={e.field} placeholder="специальность" changed={f("field")} onSave={(v) => patch({ field: v })} />
                    <Sep />
                    {year("startYear", "Год начала", "год начала")}
                    <Sep>—</Sep>
                    {year("endYear", "Год окончания", "год окончания")}
                  </p>
                </li>
              );
            })}
          </ul>
          <AddBtn onClick={() => add("education", { institution: null, degree: null, field: null, startYear: null, endYear: null }, "inst", "edu")}>
            Добавить образование
          </AddBtn>
        </Section>

        <Section title="Навыки" i={4}>
          <ul className="flex flex-wrap items-center gap-2">
            {ed.ids.skills.map((id, i) => {
              const s = r.skills[i];
              const os = ed.origEntry("skills", id);
              return (
                <li key={id} className="flex items-center rounded-full bg-accent-soft py-1.5 pl-3.5 pr-1.5 text-[14px]">
                  <Field id={`skill:${id}`} label="Навык" value={s} placeholder="навык" changed={os !== undefined && s !== os}
                    removeWhenEmpty onEmpty={() => del("skills", id, "Навык", s || "навык", !s)}
                    onSave={(v) => set((d) => void (d.skills[idx("skills", id)] = v ?? ""))} />
                  <button type="button" className="tap ml-1 grid size-6 place-items-center rounded-full text-muted hover:text-danger active:text-danger" aria-label={`Удалить навык ${s}`} onClick={() => del("skills", id, "Навык", s)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>
                </li>
              );
            })}
            <li>
              <button type="button" className="tap rounded-full px-3.5 py-1.5 text-[14px] font-medium text-accent" style={{ boxShadow: "inset 0 0 0 1.5px var(--line)" }} onClick={() => add("skills", "", "", "skill")}>
                + Навык
              </button>
            </li>
          </ul>
        </Section>

        <Section title="Языки" i={5}>
          <ul className="space-y-1 text-[15px]">
            {ed.ids.languages.map((id, i) => {
              const l = r.languages[i];
              const ol = orig<Resume["languages"][number]>("languages", id);
              const patch = (p: Partial<typeof l>) => set((d) => void Object.assign(d.languages[idx("languages", id)], p));
              const title = l.name || "язык";
              return (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <Field id={`lang:${id}:name`} label="Язык" value={l.name} placeholder="язык" changed={!!ol && l.name !== ol.name} onSave={(v) => patch({ name: v })} />
                    <span className="text-muted"> — </span>
                    <span className="text-muted">
                      <Field id={`lang:${id}:level`} label="Уровень языка" value={l.level} placeholder="уровень" changed={!!ol && l.level !== ol.level} onSave={(v) => patch({ level: v })} />
                    </span>
                  </span>
                  <DelBtn label={`Удалить язык: ${title}`} onClick={() => del("languages", id, "Язык", title)} />
                </li>
              );
            })}
          </ul>
          <AddBtn onClick={() => add("languages", { name: null, level: null }, "name", "lang")}>Добавить язык</AddBtn>
        </Section>
      </article>

      {toast && (
        <div className="pop card fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-[5.5rem] z-30 flex items-center justify-between gap-2 py-1.5 pl-4 pr-1.5 sm:left-auto sm:w-[360px]" role="status">
          <p className="min-w-0 truncate text-[15px]">{toast.text}</p>
          <button type="button" className="btn btn-sm shrink-0 !bg-transparent text-accent" onClick={toast.undo}>
            Отменить
          </button>
        </div>
      )}

      {src && sourceText !== null && <SourceSheet req={src} text={sourceText} onClose={() => setSrc(null)} />}
    </C.Provider>
  );
}

// ---------- условия работы: занятость, график, переезд, командировки, время пути, специализация ----------
const TERMS = ["employment", "schedule", "relocation", "businessTrips", "timeToWork", "specialization"] as const;
const REL = { yes: "Готов к переезду", no: "Не готов к переезду" };

function termsText(r: Resume): string[] {
  return [
    r.specialization && `Специализация: ${r.specialization}`,
    r.employment.length > 0 && `Занятость: ${r.employment.map((v) => LABEL.employment[v]).join(", ")}`,
    r.schedule.length > 0 && `График: ${r.schedule.map((v) => LABEL.schedule[v]).join(", ")}`,
    r.relocation !== null && (r.relocation ? REL.yes : REL.no),
    r.businessTrips && LABEL.businessTrips[r.businessTrips],
    r.timeToWork && `Время до работы: ${LABEL.timeToWork[r.timeToWork]}`,
  ].filter((x): x is string => !!x);
}

function TermsField({ ed, changed }: { ed: ResumeEdit; changed: boolean }) {
  const r = ed.resume;
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({ employment: r.employment, schedule: r.schedule, relocation: "", businessTrips: "", timeToWork: "", specialization: "" });
  const [err, setErr] = useState<string | null>(null);
  const begin = () => {
    setD({
      employment: r.employment, schedule: r.schedule, relocation: r.relocation === null ? "" : r.relocation ? "yes" : "no",
      businessTrips: r.businessTrips ?? "", timeToWork: r.timeToWork ?? "", specialization: r.specialization ?? "",
    });
    setErr(null);
    setEditing(true);
  };
  const save = () => {
    const e = ed.commit((x) => {
      x.employment = d.employment;
      x.schedule = d.schedule;
      x.relocation = d.relocation === "" ? null : d.relocation === "yes";
      x.businessTrips = (d.businessTrips || null) as typeof x.businessTrips;
      x.timeToWork = (d.timeToWork || null) as typeof x.timeToWork;
      x.specialization = d.specialization.trim() || null;
    });
    if (e) return setErr(e);
    setEditing(false);
  };
  const box = "min-h-[44px] w-full rounded-[12px] bg-surface-2 px-3 text-[16px] text-ink outline-none focus-visible:outline-3 focus-visible:outline-accent";
  const toggle = <T extends string>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const chips = <T extends string>(label: string, all: readonly T[], names: Record<T, string>, on: readonly T[], set: (v: T[]) => void) => (
    <span role="group" aria-label={label} className="block">
      <span className="mb-1 block text-[13px] text-muted">{label}</span>
      <span className="flex flex-wrap gap-1.5">
        {all.map((v) => (
          <button key={v} type="button" aria-pressed={on.includes(v)} onClick={() => set(toggle(on, v))}
            className={`min-h-[36px] rounded-full px-3 text-[14px] font-medium ${on.includes(v) ? "bg-accent-fill text-white" : "bg-surface-2 text-ink"}`}>
            {names[v]}
          </button>
        ))}
      </span>
    </span>
  );
  const editor = (
    <span role="group" aria-label="Условия работы" className="my-1 block space-y-3 rounded-[16px] bg-fill p-3 text-ink" onKeyDown={(ev) => ev.key === "Escape" && (ev.stopPropagation(), setEditing(false))}>
      <input className={box} placeholder="Специализация" aria-label="Специализация" value={d.specialization} onChange={(e) => setD({ ...d, specialization: e.target.value })} autoFocus />
      {chips("Занятость", EMPLOYMENT, LABEL.employment, d.employment, (v) => setD({ ...d, employment: v }))}
      {chips("График", SCHEDULE, LABEL.schedule, d.schedule, (v) => setD({ ...d, schedule: v }))}
      <span className="grid gap-2 sm:grid-cols-3">
        <select className={box} aria-label="Переезд" value={d.relocation} onChange={(e) => setD({ ...d, relocation: e.target.value })}>
          <option value="">Переезд: не указано</option>
          <option value="yes">{REL.yes}</option>
          <option value="no">{REL.no}</option>
        </select>
        <select className={box} aria-label="Командировки" value={d.businessTrips} onChange={(e) => setD({ ...d, businessTrips: e.target.value })}>
          <option value="">Командировки: не указано</option>
          {TRIPS.map((v) => <option key={v} value={v}>{LABEL.businessTrips[v]}</option>)}
        </select>
        <select className={box} aria-label="Время до работы" value={d.timeToWork} onChange={(e) => setD({ ...d, timeToWork: e.target.value })}>
          <option value="">Время до работы: не указано</option>
          {TIME_TO_WORK.map((v) => <option key={v} value={v}>{LABEL.timeToWork[v]}</option>)}
        </select>
      </span>
      {err && <span role="alert" className="block text-[13px] text-danger">{err}</span>}
      <span className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm flex-1" onClick={save}>Готово</button>
        <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setEditing(false)}>Отмена</button>
      </span>
    </span>
  );
  const lines = termsText(r);
  return (
    <Tappable id="terms" label="Условия работы" empty={lines.length === 0} changed={changed} sourceValue={null} block={editing}
      editing={editing} editor={editor} onEdit={begin} display={lines.length ? lines.join(" · ") : "+ условия работы"} />
  );
}

// ---------- зарплата: составное поле ----------
function SalaryField({ ed, text, changed }: { ed: ResumeEdit; text: string | null; changed: boolean }) {
  const s = ed.resume.salary;
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState({ from: "", to: "", currency: "", period: "" });
  const [err, setErr] = useState<string | null>(null);
  const begin = () => {
    setD({ from: s.from?.toString() ?? "", to: s.to?.toString() ?? "", currency: s.currency ?? "", period: s.period ?? "" });
    setErr(null);
    setEditing(true);
  };
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const save = () => {
    const from = num(d.from);
    const to = num(d.to);
    if ([from, to].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) return setErr("Введите число");
    const e = ed.commit((r) => {
      r.salary = { from, to, currency: d.currency.trim() || null, period: (d.period || null) as typeof s.period };
    });
    if (e) return setErr(e);
    setEditing(false);
  };
  const box = "min-h-[44px] w-full rounded-[12px] bg-surface-2 px-3 text-[16px] text-ink outline-none focus-visible:outline-3 focus-visible:outline-accent";
  const editor = (
    <span role="group" aria-label="Зарплата" className="mt-1 block space-y-2 rounded-[16px] bg-fill p-3 text-ink">
      <span className="grid grid-cols-2 gap-2">
        <input className={box} type="number" inputMode="numeric" placeholder="от" aria-label="Зарплата от" value={d.from} onChange={(e) => setD({ ...d, from: e.target.value })} autoFocus />
        <input className={box} type="number" inputMode="numeric" placeholder="до" aria-label="Зарплата до" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} />
        <input className={box} placeholder="Валюта (TJS)" aria-label="Валюта" value={d.currency} onChange={(e) => setD({ ...d, currency: e.target.value })} />
        <select className={box} aria-label="Период" value={d.period} onChange={(e) => setD({ ...d, period: e.target.value })}>
          <option value="">Период</option>
          <option value="month">в месяц</option>
          <option value="hour">в час</option>
          <option value="year">в год</option>
        </select>
      </span>
      {err && <span role="alert" className="block text-[13px] text-danger">{err}</span>}
      <span className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm flex-1" onClick={save}>Готово</button>
        <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setEditing(false)}>Отмена</button>
      </span>
    </span>
  );
  return (
    <Tappable
      id="salary" label="Зарплата" empty={!text} changed={changed} block={editing}
      sourceValue={s.from != null ? String(s.from) : s.to != null ? String(s.to) : null}
      editing={editing} editor={editor} onEdit={begin} display={text ?? "+ зарплата"}
    />
  );
}

// ---------- окончание периода: месяц-год или «по настоящее время» ----------
function PeriodEnd({ id, e, changed, onSave }: { id: string; e: Resume["experience"][number]; changed: boolean; onSave: (p: { current: boolean; endDate: string | null }) => string | null }) {
  const [editing, setEditing] = useState(false);
  const [cur, setCur] = useState(false);
  const [end, setEnd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const begin = () => {
    setCur(e.current);
    setEnd(e.endDate ?? "");
    setErr(null);
    setEditing(true);
  };
  const save = () => {
    const x = onSave({ current: cur, endDate: cur ? null : end || null });
    if (x) return setErr(x);
    setEditing(false);
  };
  const editor = (
    <span role="group" aria-label="Окончание работы" className="my-1 block space-y-2 rounded-[16px] bg-fill p-3 text-ink" onKeyDown={(ev) => ev.key === "Escape" && (ev.stopPropagation(), setEditing(false))}>
      <button type="button" role="switch" aria-checked={cur} className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left text-[16px] font-medium" onClick={() => setCur(!cur)}>
        по настоящее время
        <span aria-hidden className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${cur ? "bg-accent-fill" : "bg-line"}`}>
          <span className="absolute left-0.5 top-0.5 size-[22px] rounded-full bg-white shadow transition-transform" style={{ transform: cur ? "translateX(18px)" : "none" }} />
        </span>
      </button>
      <input type="month" aria-label="Месяц окончания" disabled={cur} value={end} onChange={(ev) => setEnd(ev.target.value)} className="min-h-[44px] w-full rounded-[12px] bg-surface-2 px-3 text-[16px] text-ink outline-none disabled:opacity-40 focus-visible:outline-3 focus-visible:outline-accent" autoFocus />
      {err && <span role="alert" className="block text-[13px] text-danger">{err}</span>}
      <span className="flex gap-2">
        <button type="button" className="btn btn-primary btn-sm flex-1" onClick={save}>Готово</button>
        <button type="button" className="btn btn-ghost btn-sm flex-1" onClick={() => setEditing(false)}>Отмена</button>
      </span>
    </span>
  );
  const empty = !e.current && !e.endDate;
  return (
    <Tappable id={id} label="Окончание работы" empty={empty} changed={changed} sourceValue={e.current ? null : e.endDate} block={editing}
      editing={editing} editor={editor} onEdit={begin} display={e.current ? "по настоящее время" : empty ? "окончание" : ym(e.endDate)} />
  );
}
