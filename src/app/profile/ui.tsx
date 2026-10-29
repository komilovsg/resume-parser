"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DemoNav } from "./nav";
import { searchDict, type Opt, type SearchType } from "./api";

// ---------- иконки ----------
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;
export const IBack = () => (<svg width="26" height="26" viewBox="0 0 24 24" {...S}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>);
export const IChev = ({ up }: { up?: boolean }) => (<svg width="16" height="16" viewBox="0 0 24 24" {...S} style={up ? { rotate: "180deg" } : undefined}><path d="m6 9 6 6 6-6" /></svg>);
export const IX = ({ s = 14 }: { s?: number }) => (<svg width={s} height={s} viewBox="0 0 24 24" {...S}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IInfo = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 11v5M12 7.6v.1" stroke="var(--yd-soft)" strokeWidth="2" strokeLinecap="round" /></svg>);
export const ICheck = () => (<svg width="20" height="20" viewBox="0 0 24 24" {...S} strokeWidth={1.6} style={{ color: "var(--yd-muted)" }}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.7L16 9.5" /></svg>);
export const IPlus = () => (<svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M12 5v14M5 12h14" /></svg>);
export const IEdit = () => (<svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M16.5 3.5 20.5 7.5 8 20l-5 1 1-5z" /></svg>);
export const ITrash = () => (<svg width="18" height="18" viewBox="0 0 24 24" {...S}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IDots = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>);
export const IFile = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V9h5.5zM11 12h2v2h2v2h-2v2h-2v-2H9v-2h2z" /></svg>);
export const IPin = () => (<svg width="14" height="14" viewBox="0 0 24 24" {...S}><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg>);

// ---------- оболочка и подсказки ----------
export function Shell({ current = "profile", children }: { current?: "parse" | "profile"; children: React.ReactNode }) {
  return (
    <div className="yd">
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-16 sm:px-6">
        <header className="py-1">
          <DemoNav current={current} />
        </header>
        {children}
      </div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const show = useCallback((m: string) => {
    clearTimeout(t.current);
    setMsg(m);
    t.current = setTimeout(() => setMsg(null), 2800);
  }, []);
  const node = msg ? (
    <div className="yd-toast" role="status" aria-live="polite">
      {msg}
    </div>
  ) : null;
  return { show, node };
}

export const Req = () => <span style={{ color: "var(--yd-err)" }}>*</span>;

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="yd-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="yd-chip" aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function Group({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div role="group" aria-label={label}>
      <p className="mb-2 text-[14px]" style={{ color: "var(--yd-muted)" }}>{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="yd-hint">{hint}</p>}
    </div>
  );
}

// ---------- простые поля ----------
type FieldProps = { label: string; required?: boolean; error?: string | null; hint?: React.ReactNode };
export function TextField({ label, required, error, hint, value, onChange, type = "text", multiline, rows = 4, list, inputMode, placeholder, min, max, disabled }: FieldProps & {
  disabled?: boolean; value: string; onChange: (v: string) => void; type?: string; multiline?: boolean; rows?: number; list?: string; inputMode?: "numeric" | "tel" | "email" | "text"; placeholder?: string; min?: number; max?: number;
}) {
  const id = useId();
  return (
    <div>
      <label className="yd-field" data-err={!!error} data-off={disabled} htmlFor={id}>
        <span className="yd-lbl">{label}{required && <Req />}</span>
        {multiline ? (
          <textarea id={id} className="yd-in" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        ) : (
          <input id={id} className="yd-in" disabled={disabled} type={type} list={list} inputMode={inputMode} min={min} max={max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )}
      </label>
      {error && <p className="yd-err" role="alert">{error}</p>}
      {hint && <p className="yd-hint">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, disabled, placeholder = "Не выбрано" }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; disabled?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <label className="yd-field" htmlFor={id} data-off={disabled}>
      <span className="yd-lbl">{label}</span>
      <select id={id} className="yd-in" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
      <span className="yd-chev"><IChev /></span>
    </label>
  );
}

// ---------- автодополнение по справочнику (/api/profile/search) ----------
export function Typeahead({ label, required, error, hint, type, display, onPick, onClear, onFree, freeLabel, placeholder, clearable = true, fieldRef }: FieldProps & {
  type: SearchType;
  display: string | null; // текущее значение (null — пусто)
  onPick: (o: Opt) => void;
  onClear?: () => void;
  onFree?: (text: string) => void; // можно добавить значение, которого нет в справочнике
  freeLabel?: string;
  placeholder?: string;
  clearable?: boolean;
  fieldRef?: React.Ref<HTMLInputElement>;
}) {
  const [q, setQ] = useState<string | null>(null);
  const [opts, setOpts] = useState<{ q: string; items: Opt[] } | null>(null);
  const [active, setActive] = useState(0);
  const lb = useId();
  const text = (q ?? "").trim();

  useEffect(() => {
    if (!text) return;
    const ac = new AbortController();
    const t = setTimeout(() => {
      searchDict(type, text, ac.signal).then(
        (items) => {
          setOpts({ q: text, items });
          setActive(0);
        },
        () => {},
      );
    }, 180);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [text, type]);

  const items = text && opts?.q === text ? opts.items : [];
  const free = onFree && text && !items.some((o) => o.name.toLowerCase() === text.toLowerCase()) ? text : null;
  const total = items.length + (free ? 1 : 0);
  const open = q !== null && !!text;
  const done = () => setQ(null);
  const pick = (i: number) => {
    if (i < items.length) onPick(items[i]);
    else if (free) onFree?.(free);
    done();
  };
  const loading = !!text && opts?.q !== text;

  return (
    <div className="relative">
      <label className="yd-field" data-err={!!error}>
        <span className="yd-lbl">{label}{required && <Req />}</span>
        <input
          ref={fieldRef}
          className="yd-in"
          role="combobox"
          aria-expanded={open}
          aria-controls={lb}
          aria-autocomplete="list"
          aria-activedescendant={open && total ? `${lb}-${active}` : undefined}
          autoComplete="off"
          value={q ?? display ?? ""}
          placeholder={placeholder ?? "Начните вводить"}
          style={clearable && display && q === null ? { paddingRight: 56 } : undefined}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => (display ? e.target.select() : undefined)}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && total) { e.preventDefault(); setActive((a) => (a + 1) % total); }
            else if (e.key === "ArrowUp" && total) { e.preventDefault(); setActive((a) => (a - 1 + total) % total); }
            else if (e.key === "Enter" && open && total) { e.preventDefault(); pick(active); }
            else if (e.key === "Escape") done();
          }}
        />
        {clearable && display && q === null && (
          <button type="button" className="yd-x" aria-label={`Очистить: ${label}`} onClick={onClear}>
            <IX />
          </button>
        )}
        <span className="yd-chev"><IChev /></span>
      </label>
      {open && (
        <div className="yd-list" role="listbox" id={lb} aria-label={label}>
          {items.map((o, i) => (
            <button key={o.id} type="button" role="option" id={`${lb}-${i}`} aria-selected={i === active} className="yd-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(i)}>
              <span className="min-w-0 break-words">{o.name}</span>
              {o.hint && <span className="yd-sub shrink-0 text-right">{o.hint}</span>}
            </button>
          ))}
          {free && (
            <button type="button" role="option" id={`${lb}-${items.length}`} aria-selected={active === items.length} className="yd-opt" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(items.length)}>
              <span className="min-w-0 break-words">{freeLabel ?? "Добавить"} «{free}»</span>
              <span className="yd-sub shrink-0">нет в справочнике</span>
            </button>
          )}
          {!total && <p className="px-3 py-3 text-[14px]" style={{ color: "var(--yd-muted)" }}>{loading ? "Ищем…" : "Ничего не найдено"}</p>}
        </div>
      )}
      {error && <p className="yd-err" role="alert">{error}</p>}
      {hint && <p className="yd-hint">{hint}</p>}
    </div>
  );
}

// ---------- мультивыбор с чипами (График работы) ----------
export function MultiSelect({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lb = useId();
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", on);
    return () => document.removeEventListener("pointerdown", on);
  }, [open]);
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  const name = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  return (
    <div className="relative" ref={ref}>
      <div
        className="yd-field cursor-pointer"
        role="combobox"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={lb}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); }
          else if (e.key === "Escape") setOpen(false);
        }}
      >
        <span className="yd-lbl">{label}</span>
        <div className="flex min-h-9 flex-wrap items-center gap-2 py-1 pr-7">
          {value.length === 0 && <span style={{ color: "var(--yd-muted)" }}>Не выбрано</span>}
          {value.map((v) => (
            <span key={v} className="yd-tag">
              {name(v)}
              <button type="button" aria-label={`Убрать ${name(v)}`} onClick={(e) => { e.stopPropagation(); toggle(v); }}>
                <IX />
              </button>
            </span>
          ))}
        </div>
        <span className="yd-chev"><IChev up={open} /></span>
      </div>
      {open && (
        <div className="yd-list" role="listbox" id={lb} aria-multiselectable="true" aria-label={label}>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={value.includes(o.value)} className="yd-opt" onClick={() => toggle(o.value)}>
              {o.label}
              {value.includes(o.value) && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- меню «⋮» ----------
export function Menu({ label, items }: { label: string; items: { label: string; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const on = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", on);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", on);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="grid size-11 place-items-center rounded-full" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IDots />
      </button>
      {open && (
        <div className="yd-menu" role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" style={it.danger ? { color: "var(--yd-err)" } : undefined} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Confirm({ title, text, action, onYes, onNo }: { title: string; text: string; action: string; onYes: () => void; onNo: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onNo();
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onNo]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onClick={onNo}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="yd-card w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h2 className="yd-h">{title}</h2>
        <p className="mt-2 text-[15px]" style={{ color: "var(--yd-muted)" }}>{text}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button ref={ref} type="button" className="yd-btn yd-btn-out" onClick={onNo}>Отмена</button>
          <button type="button" className="yd-btn" style={{ background: "var(--yd-err)" }} onClick={onYes}>{action}</button>
        </div>
      </div>
    </div>
  );
}
