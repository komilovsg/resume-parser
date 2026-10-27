"use client";

import { useSyncExternalStore } from "react";

type Theme = "auto" | "light" | "dark";
const ORDER: Theme[] = ["auto", "light", "dark"];
const LABEL: Record<Theme, string> = { auto: "Авто", light: "Светлая", dark: "Тёмная" };

let mem: Theme | null = null; // запасной вариант, если localStorage недоступен
function read(): Theme {
  if (mem) return mem;
  try {
    const v = localStorage.getItem("theme");
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

const listeners = new Set<() => void>();
const sub = (f: () => void) => (listeners.add(f), () => void listeners.delete(f));

function apply(t: Theme) {
  mem = t;
  const el = document.documentElement;
  if (t === "auto") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", t);
  // theme-color: при принудительной теме оба meta получают её цвет, в авто возвращаем исходные
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.orig ??= m.content;
    m.content = t === "light" ? "#f2f2f7" : t === "dark" ? "#000000" : m.dataset.orig;
  });
  try {
    if (t === "auto") localStorage.removeItem("theme");
    else localStorage.setItem("theme", t);
  } catch {}
  listeners.forEach((f) => f());
}

const Icon = ({ t }: { t: Theme }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {t === "auto" && (<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" /></>)}
    {t === "light" && (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>)}
    {t === "dark" && <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />}
  </svg>
);

// Цикл Авто -> Светлая -> Тёмная; выбор в localStorage["theme"], data-theme на <html> (нет атрибута = системная тема)
export default function ThemeToggle() {
  const t = useSyncExternalStore(sub, read, () => "auto" as Theme);
  const next = ORDER[(ORDER.indexOf(t) + 1) % ORDER.length];
  return (
    <button
      type="button"
      className="btn-icon btn grid shrink-0 place-items-center"
      aria-label={`Тема: ${LABEL[t]}`}
      title={`Тема: ${LABEL[t]}. Нажмите: ${LABEL[next]}`}
      onClick={() => {
        apply(next);
      }}
    >
      <Icon t={t} />
    </button>
  );
}
