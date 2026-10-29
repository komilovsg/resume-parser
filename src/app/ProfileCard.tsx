"use client";

import { useEffect, useRef, useState } from "react";
import type { ProfileView } from "@/lib/profile/view";

export type CardSkill = { input: string; name: string | null; auto: boolean };
export type CardProps = {
  view: ProfileView;
  title: string | null;
  titleAuto: boolean;
  region: { name: string; auto: boolean } | null;
  skills: CardSkill[];
};

const NONE = <span className="text-muted">Не указано</span>;
const AutoDot = () => <span className="y-auto" title="подобрано автоматически" aria-label="подобрано автоматически" role="img" />;

const h2 = "text-[22px] font-bold leading-tight tracking-[-0.01em] sm:text-2xl";

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-y-0.5 py-2 text-[15px] leading-snug sm:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] sm:gap-x-4 sm:py-1.5 sm:text-base">
      <dt className="text-sm text-muted sm:text-[length:inherit]">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

const list = (a: string[]) => (a.length ? a.join(", ") : NONE);

export function About({ text }: { text: string | null }) {
  const [open, setOpen] = useState(false);
  const [over, setOver] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const check = () => setOver(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [text, open]);
  if (!text) return <p className="mt-3 text-[15px] text-muted">Не указано</p>;
  return (
    <>
      <p ref={ref} className="y-about mt-3 whitespace-pre-line break-words text-[15px] leading-relaxed opacity-90 sm:text-base" data-open={open}>
        {text}
      </p>
      {(over || open) && (
        <button type="button" className="y-more mt-1" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? "rotate(180deg)" : undefined }}>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          {open ? "Свернуть" : "Читать далее"}
        </button>
      )}
    </>
  );
}

const initials = (n: string | null) => (n ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const disabled = { "aria-disabled": true as const, title: "В демо не работает", type: "button" as const };

const Empty = ({ children }: { children?: string }) => <p className="mt-3 text-[15px] text-muted">{children ?? "Не указано"}</p>;

// Так резюме выглядит в анкете: только показ, кнопки действий не работают (демо)
export default function ProfileCard({ view: v, title, titleAuto, region, skills }: CardProps) {
  const [tab, setTab] = useState<"resume" | "profile">("resume");
  const city = region?.name ?? v.city;
  return (
    <section className="y-card rise" data-tab={tab} style={{ ["--i" as string]: 1 }} aria-label="Так резюме будет выглядеть в анкете">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-2xl font-bold leading-tight tracking-[-0.015em] sm:text-[28px]">{v.name ?? <span className="text-muted">Имя не указано</span>}</h2>
          {v.age && <p className="mt-1.5 text-[15px] text-muted">{v.age}</p>}
          <p className="mt-1.5 flex items-center gap-1.5 text-[15px] text-muted">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" />
            </svg>
            <span className="min-w-0 break-words">{city ?? "Не указано"}</span>
            {region?.auto && <AutoDot />}
          </p>
        </div>
        <div className="y-avatar" aria-hidden title="Фото не извлекается — показаны инициалы">{initials(v.name)}</div>
      </div>

      <div className="y-tabs mt-5" role="tablist" aria-label="Раздел анкеты">
        {(["resume", "profile"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="y-tab" onClick={() => setTab(t)}>
            {t === "resume" ? "Резюме" : "Профиль"}
          </button>
        ))}
      </div>

      <div className="y-resume">
        <hr className="y-line hidden sm:block" />
        <div className="mt-6 flex items-start justify-between gap-3 sm:mt-0 sm:block">
        <h3 className="min-w-0 break-words text-xl font-bold leading-tight tracking-[-0.01em] sm:text-[26px]">
          {title ?? <span className="text-muted">Должность не указана</span>}
          {titleAuto && <AutoDot />}
        </h3>
          <button {...disabled} className="y-btn -mt-1 w-11 shrink-0 !px-0 sm:!hidden" aria-label="Редактировать (в демо не работает)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16.5 3.5 20.5 7.5 8 20l-5 1 1-5z" />
            </svg>
          </button>
        </div>
        {v.flags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.flags.map((f) => <li key={f} className="y-pill">{f}</li>)}
          </ul>
        )}

        {/* <640px: кнопки друг под другом (в строку «Снять с публикации» не помещается даже на 390), карандаш рядом с заголовком */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button {...disabled} className="y-btn y-btn-primary w-full whitespace-nowrap sm:min-w-0 sm:flex-1 sm:!px-2">Найти вакансии</button>
          <button {...disabled} className="y-btn w-full whitespace-nowrap sm:min-w-0 sm:flex-1 sm:!px-2">Снять с публикации</button>
          <button {...disabled} className="y-btn !hidden w-11 shrink-0 !px-0 sm:!inline-flex" aria-label="Редактировать (в демо не работает)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M16.5 3.5 20.5 7.5 8 20l-5 1 1-5z" />
            </svg>
          </button>
        </div>

        <hr className="y-line" />
        <dl>
          <Row label="Специализация">{v.specialization?.name ?? NONE}</Row>
          <Row label="Занятость">{list(v.employment)}</Row>
          <Row label="График">{list(v.workSchedule)}</Row>
          <Row label="Время пути до работы">{list(v.timeToWork)}</Row>
          <Row label="Регион">{region ? <>{region.name}{region.auto && <AutoDot />}</> : NONE}</Row>
          <Row label="Зарплата">{v.salary ?? NONE}</Row>
        </dl>

        <hr className="y-line" />
        <h3 className={h2}>О себе</h3>
        <About text={v.summary} />

        <hr className="y-line" />
        <h3 className={h2}>Опыт работы{v.experienceTotal ? ` ${v.experienceTotal}` : ""}</h3>
        {v.experience.length === 0 ? (
          <Empty />
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
        <h3 className={h2}>Образование</h3>
        {v.education.length === 0 ? (
          <Empty />
        ) : (
          <ul className="mt-3 space-y-3">
            {v.education.map((e, i) => (
              <li key={i}>
                <p className="break-words text-base font-bold leading-snug">{e.institution ?? "Учебное заведение не указано"}</p>
                {e.details && <p className="mt-0.5 break-words text-sm text-muted">{e.details}</p>}
              </li>
            ))}
          </ul>
        )}

        <hr className="y-line" />
        <h3 className={h2}>Навыки</h3>
        {skills.length === 0 ? (
          <Empty />
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {skills.map((s, i) =>
              s.name ? (
                <li key={i} className="y-pill">{s.name}{s.auto && <AutoDot />}</li>
              ) : (
                <li key={i} className="y-pill max-w-full break-words" data-dashed="true" title="нет в справочнике">{s.input}</li>
              ),
            )}
          </ul>
        )}
      </div>

      <div className="y-profile">
        <hr className="y-line hidden sm:block" />
        <h3 className={`${h2} mt-6 sm:mt-0`}>Контакты</h3>
        <dl className="mt-2">
          <Row label="Телефон">{v.contacts.phone ?? NONE}</Row>
          <Row label="Email">{v.contacts.email ? <span className="[overflow-wrap:anywhere]">{v.contacts.email}</span> : NONE}</Row>
          <Row label="Ссылки">{v.contacts.links.length ? <span className="flex flex-col [overflow-wrap:anywhere]">{v.contacts.links.map((l) => <span key={l}>{l}</span>)}</span> : NONE}</Row>
        </dl>

        <hr className="y-line" />
        <h3 className={h2}>Личные данные</h3>
        <dl className="mt-2">
          <Row label="Дата рождения">{v.birthDate ?? NONE}</Row>
          <Row label="Водительские права">{v.driverLicense ?? NONE}</Row>
        </dl>

        <hr className="y-line" />
        <h3 className={h2}>Языки</h3>
        {v.languages.length === 0 ? (
          <Empty />
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {v.languages.map((l, i) => <li key={i} className="y-pill">{l.level ? `${l.name} · ${l.level}` : l.name}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
