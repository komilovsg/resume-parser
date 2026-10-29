"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProfileView } from "@/lib/profile/view";
import { About, Row } from "../ProfileCard";
import { fetchProfile } from "./api";
import { applyPicks, initials } from "./form";
import { flash, setStatus, useDrafts } from "./store";
import { IBack, IPin, Shell } from "./ui";

const NONE = <span style={{ color: "var(--yd-muted)" }}>Не указано</span>;
const list = (a: string[]) => (a.length ? a.join(", ") : NONE);
const h2 = "text-[22px] font-bold leading-tight tracking-[-0.01em]";

export default function PreviewPage({ id }: { id: string }) {
  const router = useRouter();
  const { drafts, ready } = useDrafts();
  const d = drafts.find((x) => x.id === id);
  // то же сопоставление, что на вкладке «Анкета»: POST /api/profile с резюме черновика
  const body = d ? JSON.stringify(d.resume) : null;
  const [res, setRes] = useState<{ body: string; view: ProfileView | null; err: boolean } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!body) return;
    const ac = new AbortController();
    fetchProfile(JSON.parse(body), ac.signal).then(
      (y) => setRes({ body, view: y.view ?? null, err: !y.view }),
      (e) => (e as Error).name !== "AbortError" && setRes({ body, view: null, err: true }),
    );
    return () => ac.abort();
  }, [body, retry]);

  const cur = res && res.body === body ? res : null;
  const v = useMemo(() => (d && cur?.view ? applyPicks(cur.view, d.resume, d.picks) : null), [d, cur]);

  if (!ready || (d && !cur)) {
    return (
      <Shell>
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-hidden>
          <div className="yd-skel h-[420px]" />
          <div className="yd-skel h-[420px]" />
        </div>
      </Shell>
    );
  }
  if (!d) {
    return (
      <Shell>
        <div className="yd-card mt-8 text-center">
          <h1 className="yd-h">Резюме не найдено</h1>
          <Link href="/profile" className="yd-btn mt-5">К моим резюме</Link>
        </div>
      </Shell>
    );
  }
  if (!v) {
    return (
      <Shell>
        <div className="yd-card mt-8 text-center">
          <h1 className="yd-h">Не удалось подготовить предпросмотр</h1>
          <p className="mt-2 text-[15px]" style={{ color: "var(--yd-muted)" }}>Сопоставление со справочниками недоступно.</p>
          <div className="mt-5 flex justify-center gap-3">
            <Link href={`/profile/edit/${id}`} className="yd-btn yd-btn-out">Редактировать</Link>
            <button type="button" className="yd-btn" onClick={() => { setRes(null); setRetry((n) => n + 1); }}>Повторить</button>
          </div>
        </div>
      </Shell>
    );
  }

  const publish = () => {
    setStatus(id, "published");
    flash("Резюме опубликовано");
    router.push("/profile?tab=published");
  };

  return (
    <Shell>
      <div className="mt-4 flex items-center gap-3 lg:mt-6">
        <Link href={`/profile/edit/${id}`} aria-label="Назад к редактированию" className="grid size-11 shrink-0 place-items-center rounded-full"><IBack /></Link>
        <h1 className="min-w-0 text-[24px] font-bold leading-tight tracking-[-0.02em] sm:text-[28px]">Предпросмотр перед публикацией</h1>
      </div>

      <div className="mt-5 grid items-start gap-6 pb-[calc(120px+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside className="yd-card order-first overflow-hidden !p-0 lg:order-last" aria-label="Профиль">
          <div className="yd-hero" style={{ height: 100 }} />
          <div className="px-5 pb-5">
            <div className="yd-ava" style={{ width: 110, height: 110, marginTop: -60, fontSize: 38 }} aria-hidden title="Фото не извлекается — показаны инициалы">{initials(v.name)}</div>
            <h2 className="mt-3 break-words text-[21px] font-bold leading-tight">{v.name ?? "Имя не указано"}</h2>
            {v.age && <p className="mt-1 text-[14px]" style={{ color: "var(--yd-muted)" }}>{v.age}</p>}
            {v.city && <p className="mt-1 flex items-center gap-1 text-[14px]" style={{ color: "var(--yd-muted)" }}><IPin />{v.city}</p>}
            <button type="button" aria-disabled="true" title="В демо не работает" className="yd-btn yd-btn-sm mt-4 w-full" style={{ background: "var(--yd-chip)", color: "var(--yd-ink)" }}>Открыть профиль</button>
            <hr className="my-5" style={{ borderColor: "var(--yd-line)" }} />
            <h3 className="text-[19px] font-bold">Образование</h3>
            {v.education.length === 0 ? <p className="mt-2 text-[15px]">{NONE}</p> : (
              <ul className="mt-3 space-y-3">
                {v.education.map((e, i) => (
                  <li key={i}>
                    <p className="break-words text-[15px] font-semibold leading-snug">{e.institution ?? "Учебное заведение не указано"}</p>
                    {e.details && <p className="mt-0.5 break-words text-[14px]" style={{ color: "var(--yd-muted)" }}>{e.details}</p>}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-6 text-[19px] font-bold">Владение языками</h3>
            {v.languages.length === 0 ? <p className="mt-2 text-[15px]">{NONE}</p> : (
              <ul className="mt-2 space-y-1.5 text-[14px]">
                {v.languages.map((l, i) => (<li key={i}>{l.level ? `${l.name} — ${l.level}` : l.name}</li>))}
              </ul>
            )}
            <h3 className="mt-6 text-[19px] font-bold">Контакты</h3>
            <dl className="mt-1 text-[14px]">
              <div className="py-1"><dt style={{ color: "var(--yd-muted)" }}>Телефон</dt><dd className="font-medium">{v.contacts.phone ?? NONE}</dd></div>
              <div className="py-1"><dt style={{ color: "var(--yd-muted)" }}>Email</dt><dd className="font-medium [overflow-wrap:anywhere]">{v.contacts.email ?? NONE}</dd></div>
            </dl>
          </div>
        </aside>

        <section className="y-card min-w-0" aria-label="Так резюме будет выглядеть в анкете">
          <h2 className="break-words text-[26px] font-bold leading-tight tracking-[-0.015em]">{v.title ?? <span style={{ color: "var(--yd-muted)" }}>Должность не указана</span>}</h2>
          {v.flags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">{v.flags.map((f) => (<li key={f} className="y-pill">{f}</li>))}</ul>
          )}
          <hr className="y-line" />
          <dl>
            <Row label="Специализация">{v.specialization?.name ?? NONE}</Row>
            <Row label="Занятость">{list(v.employment)}</Row>
            <Row label="График работы">{list(v.workSchedule)}</Row>
            <Row label="Время пути до работы">{list(v.timeToWork)}</Row>
            <Row label="Регион">{v.region?.name ?? NONE}</Row>
            <Row label="Зарплата">{v.salary ?? NONE}</Row>
          </dl>
          <hr className="y-line" />
          <h3 className={h2}>О себе</h3>
          <About text={v.summary} />
          <hr className="y-line" />
          <h3 className={h2}>Опыт работы{v.experienceTotal ? ` ${v.experienceTotal}` : ""}</h3>
          {v.experience.length === 0 ? (
            <p className="mt-3 text-[15px]">{NONE}</p>
          ) : (
            <ol className="mt-4">
              {v.experience.map((e, i) => (
                <li key={i} className="y-tl">
                  <p className="text-[13px] leading-snug text-muted">{e.period}</p>
                  <p className="mt-0.5 break-words text-lg font-bold leading-snug sm:text-xl">{e.position ?? "Должность не указана"}</p>
                  {(e.company || e.city) && <p className="mt-0.5 break-words text-sm text-muted">{[e.company, e.city].filter(Boolean).join(" • ")}</p>}
                </li>
              ))}
            </ol>
          )}
          <hr className="y-line" />
          <h3 className={h2}>Навыки</h3>
          {v.skills.length === 0 ? (
            <p className="mt-3 text-[15px]">{NONE}</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {v.skills.map((s, i) =>
                s.name ? (<li key={i} className="y-pill">{s.name}</li>) : (<li key={i} className="y-pill max-w-full break-words" data-dashed="true" title="нет в справочнике">{s.input}</li>),
              )}
            </ul>
          )}
        </section>
      </div>

      <div className="yd-barfix">
        <div>
          <Link href={`/profile/edit/${id}`} className="yd-btn yd-btn-out" style={{ background: "var(--yd-card)" }}>Редактировать</Link>
          <button type="button" className="yd-btn yd-btn-grad" onClick={publish}>Опубликовать</button>
        </div>
      </div>
    </Shell>
  );
}
