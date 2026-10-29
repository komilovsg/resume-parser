"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Resume } from "@/lib/parser/schema";
import type { ProfileView } from "@/lib/profile/view";
import { fetchProfile, useDicts } from "./api";
import { progress, SECTIONS } from "./form";
import * as S from "./Sections";
import { updateDraft, useDrafts, type Draft, type Picks } from "./store";
import { IBack, ICheck, IChev, IInfo, Shell, useToast } from "./ui";

export default function EditPage({ id }: { id: string }) {
  const { drafts, ready } = useDrafts();
  const d = drafts.find((x) => x.id === id);
  if (!ready) {
    return (
      <Shell>
        <div className="yd-skel mt-8 h-[320px]" aria-hidden />
      </Shell>
    );
  }
  if (!d) {
    return (
      <Shell>
        <div className="yd-card mt-8 text-center">
          <h1 className="yd-h">Резюме не найдено</h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--yd-muted)" }}>Черновики хранятся только в этом браузере. Возможно, резюме удалено или открыто в другом браузере.</p>
          <Link href="/profile" className="yd-btn mt-5">К моим резюме</Link>
        </div>
      </Shell>
    );
  }
  return <EditForm key={id} draft={d} />;
}

function Steps({ sections, active, go }: { sections: ReturnType<typeof progress>["sections"]; active: number; go: (n: number) => void }) {
  return (
    <ul>
      {sections.map((s) => (
        <li key={s.key}>
          <button type="button" className="yd-step" aria-current={active === s.n} onClick={() => go(s.n)}>
            <span className="yd-num">{s.n}</span>
            <span className="min-w-0 flex-1">{s.title}</span>
            {s.done ? <ICheck /> : <span className="yd-pill">+{s.weight}%</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function EditForm({ draft }: { draft: Draft }) {
  const router = useRouter();
  const id = draft.id;
  const [r, setRState] = useState<Resume>(draft.resume);
  const [p, setPState] = useState<Picks>(draft.picks);
  const [view, setView] = useState<ProfileView | null>(null);
  const [files, setFiles] = useState<{ name: string; size: number }[]>([]);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [posError, setPosError] = useState(false);
  const [active, setActive] = useState(1);
  const [open, setOpen] = useState(false);
  const [promo, setPromo] = useState(true);
  const [saving, setSaving] = useState(false);
  const { dicts } = useDicts();
  const { show, node } = useToast();
  const posRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ resume: r, picks: p });
  const first = useRef(true);

  const setR = useCallback((f: (x: Resume) => Resume) => setRState(f), []);
  const setP = useCallback((patch: Partial<Picks>) => setPState((x) => ({ ...x, ...patch })), []);

  // автосохранение: 500 мс после последней правки + сброс при уходе со страницы
  useEffect(() => {
    latest.current = { resume: r, picks: p };
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      updateDraft(id, latest.current);
      setSaving(false);
    }, 500);
    return () => clearTimeout(t);
  }, [r, p, id]);
  const flush = useCallback(() => updateDraft(id, latest.current), [id]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // сопоставление со справочниками: подставляет разобранные значения в поля, где выбор ещё не сделан, и помечает навыки
  const key = JSON.stringify([r.skills, r.desiredPosition, r.experience[0]?.position, r.contacts.city, r.specialization]);
  const have = useRef(false);
  useEffect(() => {
    const ac = new AbortController();
    const t = setTimeout(() => {
      fetchProfile(latest.current.resume, ac.signal).then(
        (y) => {
          have.current = true;
          const v = y.view ?? null;
          setView(v);
          if (!v) return;
          setPState((x) => {
            const n: Picks = { ...x };
            if (x.position === undefined) n.position = v.position ? { id: v.position.id, name: v.position.name } : null;
            if (x.region === undefined) n.region = v.region ? { id: v.region.id, name: v.region.name } : null;
            if (x.specialization === undefined) n.specialization = v.specialization ? { id: v.specialization.id, name: v.specialization.name } : null;
            return n.position === x.position && n.region === x.region && n.specialization === x.specialization ? x : n;
          });
        },
        () => {},
      );
    }, have.current ? 600 : 0);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [key]);

  const { sections, percent } = useMemo(() => progress(r, p), [r, p]);

  // активный раздел — по прокрутке
  useEffect(() => {
    const els = SECTIONS.map((_, i) => document.getElementById(`sec-${i + 1}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) if (e.isIntersecting) setActive(Number(e.target.id.slice(4)));
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const go = (n: number) => {
    setActive(n);
    setOpen(false);
    document.getElementById(`sec-${n}`)?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const preview = () => {
    if (!p.position) {
      setPosError(true);
      go(1);
      setTimeout(() => posRef.current?.focus({ preventScroll: true }), 350);
      return;
    }
    flush();
    router.push(`/profile/preview/${id}`);
  };

  const ctx: S.Ctx = { r, p, setR: (f) => { setSaving(true); setR(f); }, setP: (x) => { setSaving(true); setP(x); }, dicts, view, posError, posRef };
  const body = (k: (typeof SECTIONS)[number]["key"]) => {
    switch (k) {
      case "experience": return <S.Experience {...ctx} />;
      case "conditions": return <S.Conditions {...ctx} />;
      case "desired": return <S.Desired {...ctx} />;
      case "about": return <S.About {...ctx} files={files} setFiles={setFiles} fileErr={fileErr} setFileErr={setFileErr} />;
      case "education": return <S.Education {...ctx} />;
      case "skills": return <S.Skills {...ctx} />;
      case "languages": return <S.Languages {...ctx} />;
      case "contacts": return <S.Contacts {...ctx} />;
    }
  };
  const Bar = (
    <div className="yd-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Степень заполнения"><i style={{ width: `${percent}%` }} /></div>
  );

  return (
    <Shell>
      {/* мобильная панель прогресса */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2 lg:hidden" style={{ background: "var(--yd-bg)" }}>
        <button type="button" className="flex w-full items-center gap-3 text-left" aria-expanded={open} aria-controls="yd-steps" onClick={() => setOpen((o) => !o)}>
          <span className="shrink-0 text-[15px] font-bold">Степень заполнения {percent}%</span>
          <span className="min-w-0 flex-1">{Bar}</span>
          <span className="grid size-9 shrink-0 place-items-center"><IChev up={open} /></span>
        </button>
        {open && (
          <div id="yd-steps" className="yd-card mt-2 !p-2">
            <Steps sections={sections} active={active} go={go} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3 lg:mt-6">
        <Link href="/profile" aria-label="Назад к списку резюме" className="grid size-11 shrink-0 place-items-center rounded-full"><IBack /></Link>
        <h1 className="min-w-0 flex-1 text-[26px] font-bold leading-tight tracking-[-0.02em] sm:text-[30px]">Редактирование резюме</h1>
        <span className="shrink-0 text-[13px]" role="status" aria-live="polite" style={{ color: "var(--yd-muted)" }}>{saving ? "Сохранение…" : "Сохранено"}</span>
      </div>

      <div className="mt-5 grid items-start justify-center gap-6 lg:grid-cols-[minmax(0,660px)_360px]">
        <div className="min-w-0 space-y-5">
          <div className="yd-info"><span className="mt-px shrink-0"><IInfo /></span>Полностью заполненные разделы опыта работы, предпочитаемых условий работы и информации о себе повышают Ваши шансы на рассмотрение резюме работодателем.</div>
          {SECTIONS.map((s, i) => {
            return (
              <section key={s.key} id={`sec-${i + 1}`} className="yd-card yd-sec" aria-labelledby={`h-${i + 1}`}>
                <div className="mb-5 flex items-center gap-4">
                  <span className="yd-num" aria-hidden>{i + 1}</span>
                  <h2 id={`h-${i + 1}`} className="yd-h">{s.title}</h2>
                </div>
                {body(s.key)}
              </section>
            );
          })}
          <button type="button" className="yd-btn w-full" onClick={preview}>Предпросмотр</button>
        </div>

        <aside className="hidden space-y-4 lg:sticky lg:top-4 lg:block" aria-label="Степень заполнения">
          <div className="yd-card">
            <h2 className="text-[17px] font-bold">Степень заполнения</h2>
            <p className="mt-3 text-[26px] font-bold leading-none">{percent}%</p>
            <div className="mt-3">{Bar}</div>
            <div className="mt-4"><Steps sections={sections} active={active} go={go} /></div>
          </div>
          {promo && (
            <div className="yd-promo">
              <h2 className="text-[19px] font-bold leading-snug">Хотите разместить резюме на главной странице сайта?</h2>
              <p className="mt-2 text-[14px] leading-snug opacity-90">Ваше резюме появится на главной странице сайта, чтобы его увидело больше работодателей.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button type="button" className="yd-btn yd-btn-soft" onClick={() => setPromo(false)}>Не сейчас</button>
                <button type="button" className="yd-btn yd-btn-white" onClick={() => show("В демо не работает")}>Разместить</button>
              </div>
            </div>
          )}
        </aside>
      </div>
      {node}
    </Shell>
  );
}
