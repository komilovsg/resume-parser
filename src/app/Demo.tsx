"use client";

import { useEffect, useRef, useState } from "react";
import { compressImage, isImage } from "./compress";
import PhotoGrid from "./PhotoGrid";
import { target } from "./progress";
import { hostLimitMb, sizeError, statusMessage } from "./uploadLimit";
import ResumeCard from "./ResumeCard";
import StageIcon from "./StageIcons";
import ScanSheet, { type ScanMode } from "./ScanSheet";
import ThemeToggle from "./ThemeToggle";
import Notice from "./Notice";
import type { Meta, Stage, StreamLine } from "./types";
import type { Resume } from "@/lib/parser";
import { useResumeEdit } from "./useResumeEdit";

const MAX_PHOTOS = 6;
const ACCEPT = ".pdf,.doc,.docx,.rtf,.odt,.txt,.html,image/*";
const STEPS = ["Отправка файла", "Чтение документа", "ИИ собирает резюме"];

type Kind = "compress" | "upload" | "reading" | "ai" | "retry" | "done";
type Busy = { kind: Kind; model?: string; reason?: string };
type Payload = { resume: Resume; meta: Meta };
type State =
  | { s: "idle" }
  | ({ s: "busy" } & Busy)
  | { s: "finishing"; p: Payload }
  | { s: "done"; p: Payload }
  | { s: "error"; message: string };

const MODE: Record<Kind, ScanMode> = { compress: "scan", upload: "scan", reading: "scan", ai: "ai", retry: "retry", done: "done" };
const stepOf = (k: Kind) => ({ compress: 0, upload: 0, reading: 1, ai: 2, retry: 2, done: 3 })[k];

const REASON: Record<string, string> = {
  busy: "занята",
  quota: "исчерпала лимит",
  timeout: "не отвечает",
  invalid: "вернула неполный ответ",
};

function describe(b: Busy): { title: string; sub?: string } {
  switch (b.kind) {
    case "compress": return { title: "Сжимаем фото…" };
    case "upload": return { title: "Отправляем файл" };
    case "reading": return { title: "Читаем документ" };
    case "ai": return { title: "ИИ собирает резюме", sub: b.model };
    case "retry": return { title: `Модель ${b.model} ${REASON[b.reason ?? "busy"] ?? "занята"}, пробуем другую` };
    default: return { title: "Готово" };
  }
}

// POST через XHR: нужен прогресс отправки; ответ NDJSON отдаём построчно по мере прихода
function postXhr(fd: FormData, signal: AbortSignal, onUp: (f: number) => void, onLine: (l: string) => void) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const x = new XMLHttpRequest();
    let i = 0;
    let buf = "";
    const ok = () => x.status >= 200 && x.status < 300;
    const feed = (last: boolean) => {
      if (!ok()) return;
      buf += x.responseText.slice(i);
      i = x.responseText.length;
      const lines = buf.split("\n");
      buf = last ? "" : (lines.pop() ?? "");
      if (last && lines.length && !lines[lines.length - 1]) lines.pop();
      lines.forEach(onLine);
    };
    x.open("POST", "/api/parse");
    x.upload.onprogress = (e) => e.lengthComputable && onUp(e.loaded / e.total);
    x.upload.onload = () => onUp(1);
    x.onprogress = () => feed(false);
    x.onload = () => {
      feed(true);
      resolve({ status: x.status, body: ok() ? "" : x.responseText });
    };
    x.onerror = () => reject(new Error("network"));
    const abort = () => {
      x.abort();
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    x.send(fd);
  });
}

export default function Demo() {
  const [st, setSt] = useState<State>({ s: "idle" });
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState<{ id: number; file: File; url: string }[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const pendingRef = useRef(pending);
  const nextId = useRef(0);
  const [tab, setTab] = useState<"card" | "json">("card");
  const [drag, setDrag] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pct, setPct] = useState(0);
  const prog = useRef({ up: 0, kind: "upload" as Kind, since: 0, ai: 0, max: 0 });
  const stRef = useRef(st);
  const [copied, setCopied] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errRef = useRef<HTMLDivElement>(null);

  const orig = st.s === "done" ? st.p.resume : null;
  const ed = useResumeEdit(orig);
  const active = st.s === "busy" || st.s === "finishing";
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    stRef.current = st;
  }, [st]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  // плавный процент: реальная отправка + оценка по времени, никогда не назад
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const s = stRef.current;
      const k: Kind = s.s === "busy" ? s.kind : "done";
      const r = prog.current;
      const now = Date.now();
      if (k !== r.kind) {
        r.kind = k;
        r.since = now;
      }
      if ((k === "ai" || k === "retry") && !r.ai) r.ai = now;
      r.max = Math.max(r.max, target(k, r.up, now - r.since, r.ai ? now - r.ai : 0));
      setPct(Math.floor(r.max));
    };
    tick();
    const id = setInterval(tick, 150);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (st.s !== "finishing") return;
    const p = st.p;
    const id = setTimeout(() => setSt({ s: "done", p }), 1100);
    return () => clearTimeout(id);
  }, [st]);

  useEffect(() => {
    if (st.s === "done") resultRef.current?.focus({ preventScroll: true });
    if (st.s === "error") errRef.current?.focus({ preventScroll: true });
  }, [st.s]);

  useEffect(() => () => pendingRef.current.forEach((x) => URL.revokeObjectURL(x.url)), []);

  const clearPending = () => {
    pendingRef.current.forEach((x) => URL.revokeObjectURL(x.url));
    setPending([]);
  };

  // recompressed=true — файлы уже сжаты (повтор после ошибки)
  async function send(list: File[], recompressed = false) {
    setNote(null);
    clearPending();
    setElapsed(0);
    prog.current = { up: 0, kind: "upload", since: Date.now(), ai: 0, max: 0 };
    setPct(0);
    setSt({ s: "busy", kind: "upload" });
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    const fail = (message: string) => setSt({ s: "error", message });
    try {
      let f = list;
      if (!recompressed && list.some(isImage)) {
        // стадию показываем, только если сжатие заметно (>150 мс)
        const t = setTimeout(() => setSt({ s: "busy", kind: "compress" }), 150);
        try {
          f = await Promise.all(list.map(compressImage));
        } finally {
          clearTimeout(t);
        }
        if (ac.signal.aborted) return;
        setSt({ s: "busy", kind: "upload" });
      }
      setFiles(f);
      const tooBig = sizeError(f.reduce((n, x) => n + x.size, 0), hostLimitMb, f.length > 1);
      if (tooBig) return fail(tooBig);
      const fd = new FormData();
      for (const x of f) fd.append("file", x);
      let settled = false;
      const handle = (line: string) => {
        if (!line.trim()) return;
        let m: StreamLine;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        if (m.type === "stage") {
          const { type: _t, ...stage } = m;
          void _t;
          const g = stage as Stage;
          if (g.stage === "done") return;
          setSt({ s: "busy", kind: g.stage, model: "model" in g ? g.model : undefined, reason: "reason" in g ? g.reason : undefined });
        } else if (m.type === "result") {
          settled = true;
          setTab("card");
          setSt({ s: "finishing", p: { resume: m.resume, meta: m.meta } });
        } else if (m.type === "error") {
          settled = true;
          fail(m.message);
        }
      };
      const res = await postXhr(fd, ac.signal, (u) => (prog.current.up = u), handle);
      if (res.status < 200 || res.status >= 300) {
        let msg = "Не удалось обработать файл";
        try {
          msg = JSON.parse(res.body).error?.message ?? msg;
        } catch {}
        return fail(statusMessage(res.status, hostLimitMb, f.length > 1, msg === "Не удалось обработать файл" ? undefined : msg) ?? msg);
      }
      if (!settled) fail("Соединение прервано, попробуйте ещё раз");
    } catch (e) {
      if ((e as Error).name !== "AbortError") fail("Нет соединения с сервером");
    }
  }

  const reset = () => {
    ctl.current?.abort();
    setFiles([]);
    clearPending();
    setNote(null);
    setTab("card");
    setSt({ s: "idle" });
    window.scrollTo({ top: 0 });
  };
  const addPhotos = (list: File[]) => {
    const room = MAX_PHOTOS - pendingRef.current.length;
    if (list.length > room) setNote(`Не больше ${MAX_PHOTOS} фото`);
    const add = list.slice(0, Math.max(0, room)).map((file) => ({ id: nextId.current++, file, url: URL.createObjectURL(file) }));
    if (add.length) setPending((p) => [...p, ...add]);
  };
  // добавление в список: источник — «Выбрать файл», камера или перетаскивание
  const pick = (fl: FileList | null, camera = false) => {
    const list = Array.from(fl ?? []);
    if (!list.length) return;
    setNote(null);
    const inList = pendingRef.current.length > 0;
    if (list.length > 1 || camera || inList) {
      if (!list.every(isImage)) return setNote(list.length > 1 ? "Несколько файлов можно только фото; документ загрузите один" : "Добавлять в список можно только фото");
      return addPhotos(list);
    }
    send(list);
  };
  const move = (from: number, to: number) =>
    setPending((p) => {
      if (to < 0 || to >= p.length) return p;
      const n = [...p];
      n.splice(to, 0, n.splice(from, 1)[0]);
      return n;
    });
  const remove = (id: number) => {
    const x = pendingRef.current.find((q) => q.id === id);
    if (x) URL.revokeObjectURL(x.url);
    setPending((p) => p.filter((q) => q.id !== id));
  };

  const json = ed ? JSON.stringify(ed.resume, null, 2) : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const TABS = [["card", "Резюме"], ["json", "JSON"]] as const;
  const tabIdx = TABS.findIndex(([k]) => k === tab);
  const onTabKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const n = TABS[(tabIdx + d + TABS.length) % TABS.length][0];
    setTab(n);
    document.getElementById(`tab-${n}`)?.focus();
  };

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-28 pt-10 sm:pt-16">
      <header className="mb-7 px-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-[34px] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[44px]">Разбор резюме</h1>
          <ThemeToggle />
        </div>
        <p className="mt-2.5 text-[17px] leading-snug text-muted">
          PDF, Word, фото или скан — чистые структурированные данные за пару секунд.
        </p>
      </header>

      {(st.s === "idle" || st.s === "error") && (
        <div className="rise" style={{ ["--i" as string]: 1 }}>
          <div
            data-drag={drag}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              pick(e.dataTransfer.files);
            }}
            className="drop relative flex flex-col items-center gap-5 px-5 py-11 text-center"
          >
            {pending.length > 0 ? (
            <PhotoGrid items={pending} max={MAX_PHOTOS} onMove={move} onRemove={remove} onAdd={pick} onSend={() => send(pending.map((x) => x.file))} />
            ) : (
            <>
            <span className="drop-ico grid size-[68px] place-items-center rounded-full bg-accent-soft text-accent" aria-hidden>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
            </span>
            <span className="text-[19px] font-semibold tracking-[-0.015em]">{drag ? "Отпустите, чтобы загрузить" : "Перетащите резюме сюда"}</span>
            <span className="flex w-full max-w-xs flex-col gap-3">
              <label className="btn btn-primary has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                Выбрать файл
                <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => {
                    pick(e.target.files);
                    e.target.value = "";
                  }} />
              </label>
              <label className="btn btn-ghost has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
                Сфотографировать
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => {
                    pick(e.target.files, true);
                    e.target.value = "";
                  }} />
              </label>
            </span>
            <span className="text-[13px] text-muted">PDF, DOC, DOCX, RTF, ODT, TXT, HTML, фото (до 6) · {hostLimitMb ? `до ${String(hostLimitMb).replace(".", ",")} МБ (ограничение демо на Vercel)` : "до 10 МБ"}</span>
            </>
            )}
            {note && <p role="alert" className="text-[15px] leading-snug text-danger">{note}</p>}
          </div>
          <p className="mt-4 px-4 text-center text-[13px] leading-snug text-muted">Файл не сохраняется — обрабатывается в памяти и сразу удаляется.</p>
        </div>
      )}

      {st.s === "error" && (
        <div ref={errRef} tabIndex={-1} role="alert" className="card pop mt-4 p-5 text-center outline-none">
          <div className="mx-auto w-fit"><StageIcon kind="error" /></div>
          <p className="mt-2 text-[17px] leading-snug text-danger">{st.message}</p>
          <div className="mx-auto mt-5 flex max-w-xs flex-col gap-3">
            {files.length > 0 && (
              <button className="btn btn-primary" onClick={() => send(files, true)}>
                Попробовать снова
              </button>
            )}
            <button className="btn btn-ghost" onClick={reset}>
              Другой файл
            </button>
          </div>
        </div>
      )}

      {active && (
        <div className="card pop p-6 sm:p-8">
          {(() => {
            const b: Busy = st.s === "busy" ? st : { kind: "done" };
            const d = describe(b);
            const cur = stepOf(b.kind);
            const n = b.kind === "done" ? 100 : pct;
            return (
              <>
                <ScanSheet mode={MODE[b.kind]} />
                <p className="mt-6 text-center text-[40px] font-semibold leading-none tabular-nums tracking-[-0.03em]" aria-hidden>{n}%</p>
                <div key={b.kind} className="pop flex flex-col items-center text-center">
                  <p className="mt-3 text-[21px] font-semibold leading-snug tracking-[-0.02em]">{d.title}</p>
                  <p className="mt-0.5 h-5 font-mono text-xs text-muted">{d.sub ?? ""}</p>
                </div>
                <p className="sr-only" role="status" aria-live="polite">{d.title}{d.sub ? `, ${d.sub}` : ""}</p>
                <div className="bar mx-auto mt-5 max-w-xs" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n} aria-label="Ход обработки">
                  <i className={b.kind === "done" ? "" : "run"} style={{ ["--p" as string]: n / 100 }} />
                </div>
                <ol className="mx-auto mt-6 max-w-xs space-y-3">
                  {STEPS.map((label, i) => (
                    <li key={label} className={`flex items-center gap-3 text-[16px] transition-colors duration-300 ${i > cur ? "text-muted" : "text-ink"}`} aria-current={i === cur ? "step" : undefined}>
                      <span
                        className={`dot grid size-6 shrink-0 place-items-center rounded-full border-2 text-[13px] font-bold ${i > cur ? "border-line" : ""}`}
                        data-s={i < cur ? "done" : i === cur ? "now" : "todo"}
                      >
                        {i < cur ? "✓" : ""}
                      </span>
                      {label}
                    </li>
                  ))}
                </ol>
                <p className="mt-6 text-center text-[13px] tabular-nums text-muted">Прошло {elapsed} с</p>
              </>
            );
          })()}
        </div>
      )}

      {st.s === "done" && (
        <div ref={resultRef} tabIndex={-1} aria-label="Результат разбора" className="outline-none">
          <div className="glass sticky top-0 z-20 -mx-4 mb-4 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <div role="tablist" aria-label="Вид результата" className="seg" style={{ ["--idx" as string]: tabIdx }} onKeyDown={onTabKey}>
                <span className="seg-thumb" aria-hidden />
                {TABS.map(([k, l]) => (
                  <button
                    key={k}
                    id={`tab-${k}`}
                    role="tab"
                    aria-selected={tab === k}
                    aria-controls="tabpanel"
                    tabIndex={tab === k ? 0 : -1}
                    onClick={() => setTab(k)}
                    className="seg-tab"
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button className="btn btn-icon" onClick={reset} aria-label="Загрузить другое резюме" title="Другой файл">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5" />
                </svg>
              </button>
            </div>
          </div>

          {files.length > 0 && <p className="mb-4 truncate px-1 text-[13px] text-muted">{files.length > 1 ? `${files.length} фото` : files[0].name}</p>}

          <div className="mb-4 space-y-3 empty:hidden">
            {st.p.meta.grounded === false && <Notice title="Скан" items={["Проверьте данные вручную"]} />}
            <Notice title="Предупреждения" items={st.p.meta.warnings ?? []} />
          </div>

          <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} key={tab} className="fade">
            {tab === "card" && ed && <ResumeCard ed={ed} sourceText={st.p.meta.sourceText ?? null} unverified={st.p.meta.unverified} />}
            {tab === "json" && (
              <div className="card pop relative overflow-hidden">
                <button className="btn btn-ghost btn-sm absolute right-2 top-2" onClick={copy}>
                  {copied ? "Скопировано" : "Копировать"}
                </button>
                <pre className="max-h-[70vh] overflow-auto p-4 pt-16 font-mono text-xs leading-relaxed">{json}</pre>
              </div>
            )}
          </div>

          <button className="btn btn-primary mt-6 w-full" onClick={reset}>
            Новый разбор
          </button>

          <p className="mt-5 text-center text-[13px] text-muted">
            {st.p.meta.format.toUpperCase()} · {(st.p.meta.ms / 1000).toFixed(1)} с · {st.p.meta.model}
          </p>
        </div>
      )}
    </main>
  );
}
