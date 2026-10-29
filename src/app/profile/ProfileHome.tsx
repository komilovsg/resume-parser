"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { plural } from "@/lib/profile/view";
import { ageYears, draftTitle, initials, profileProgress, salaryShort } from "./form";
import { removeDraft, setStatus, fmtDate, takeFlash, useDrafts, type Draft, type Status } from "./store";
import { Confirm, ICheck, IPin, Menu, Shell, useToast } from "./ui";

type Tab = "published" | "draft" | "unpublished";
const TABS: { key: Tab; label: string; short?: string }[] = [
  { key: "published", label: "Опубликованы" },
  { key: "draft", label: "Черновики" },
  { key: "unpublished", label: "Сняты с публикации", short: "Сняты" },
];
const EMPTY: Record<Tab, string> = {
  published: "Опубликованных резюме пока нет. Откройте черновик, нажмите «Предпросмотр» и «Опубликовать».",
  draft: "Черновиков пока нет — загрузите резюме на странице «Разбор резюме».",
  unpublished: "Здесь появятся резюме, снятые с публикации.",
};
const stamp = (d: Draft) => (d.status === "draft" ? "Сохранено" : "Обновлено") + " " + fmtDate(d.updatedAt);

const initialTab = (): Tab | null => {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.search).get("tab");
  return t === "published" || t === "draft" || t === "unpublished" ? t : null;
};

export default function ProfileHome() {
  const { drafts, ready } = useDrafts();
  const [userTab, setUserTab] = useState<Tab | null>(initialTab);
  const [del, setDel] = useState<Draft | null>(null);
  const { show, node } = useToast();

  useEffect(() => {
    const m = takeFlash();
    if (m) show(m);
  }, [show]);

  const by = useMemo(() => {
    const g: Record<Status, Draft[]> = { published: [], draft: [], unpublished: [] };
    for (const d of drafts) g[d.status].push(d);
    for (const k of Object.keys(g) as Status[]) g[k].sort((a, b) => b.updatedAt - a.updatedAt);
    return g;
  }, [drafts]);
  const tab: Tab = userTab ?? (by.draft.length ? "draft" : by.published.length ? "published" : "draft");
  const latest = useMemo(() => drafts.reduce<Draft | null>((a, d) => (!a || d.updatedAt > a.updatedAt ? d : a), null), [drafts]);
  const prof = profileProgress(latest?.resume ?? null);
  const r = latest?.resume;
  const age = ageYears(r?.birthDate ?? null);

  return (
    <Shell>
      <h1 className="mt-6 text-[30px] font-bold leading-tight tracking-[-0.025em] sm:text-[36px]">Мой профиль и резюме</h1>
      <div role="tablist" aria-label="Статус резюме" className="yd-seg mt-5">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" id={`yt-${t.key}`} aria-selected={tab === t.key} aria-controls="yd-panel" onClick={() => setUserTab(t.key)}>
            {t.short ? (<><span className="min-[480px]:hidden">{t.short}</span><span className="hidden min-[480px]:inline">{t.label}</span></>) : t.label}
            <span className="yd-pill-n" aria-label={`${ready ? by[t.key].length : 0}`}>{ready ? by[t.key].length : 0}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section id="yd-panel" role="tabpanel" aria-labelledby={`yt-${tab}`} className="yd-card">
          <Link href="/" className="yd-btn w-full">Создать резюме</Link>
          {!ready ? (
            <div className="mt-4 space-y-3" aria-hidden>
              <div className="yd-skel h-[150px]" />
              <div className="yd-skel h-[150px]" />
            </div>
          ) : by[tab].length === 0 ? (
            <p className="mt-6 mb-3 text-center text-[15px] leading-snug" style={{ color: "var(--yd-muted)" }}>{EMPTY[tab]}</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {by[tab].map((d) => {
                const sal = salaryShort(d.resume, d.picks);
                return (
                  <li key={d.id} className="rise rounded-2xl p-4" style={{ border: "1px solid var(--yd-line)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="pt-2 text-[14px]" style={{ color: "var(--yd-muted)" }}>{stamp(d)}</p>
                      <div className="-mr-2 -mt-1">
                        <Menu
                          label="Действия с резюме"
                          items={[
                            ...(d.status === "published" ? [{ label: "Снять с публикации", onClick: () => { setStatus(d.id, "unpublished"); show("Резюме снято с публикации"); } }] : []),
                            ...(d.status === "unpublished" ? [{ label: "Опубликовать снова", onClick: () => { setStatus(d.id, "published"); show("Резюме опубликовано"); } }] : []),
                            { label: "Удалить", danger: true, onClick: () => setDel(d) },
                          ]}
                        />
                      </div>
                    </div>
                    <h2 className="mt-1 break-words text-[20px] font-bold leading-snug tracking-[-0.01em]">{draftTitle(d)}</h2>
                    {sal && <p className="mt-1 text-[16px] font-bold">{sal}</p>}
                    <p className="mt-0.5 truncate text-[13px]" style={{ color: "var(--yd-muted)" }}>Файл: {d.source.filename}</p>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="yd-pill !min-h-9 !px-3.5 !text-[14px] !font-medium">0 откликов</span>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/profile/edit/${d.id}`} className="yd-btn yd-btn-out yd-btn-sm">Редактировать</Link>
                        <button type="button" aria-disabled="true" title="В демо не работает" className="yd-btn yd-btn-sm">Найти вакансии</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="space-y-4" aria-label="Профиль">
          <div className="yd-card overflow-hidden !p-0">
            <div className="yd-hero" />
            <div className="px-5 pb-5">
              <div className="yd-ava" aria-hidden>{initials(r?.fullName ?? null)}</div>
              <h2 className="mt-4 break-words text-[22px] font-bold leading-tight">{r?.fullName ?? "Ваш профиль"}</h2>
              {age != null && <p className="mt-1 text-[14px]" style={{ color: "var(--yd-muted)" }}>{age} {plural(age, "год", "года", "лет")}</p>}
              {r?.contacts.city && (
                <p className="mt-1 flex items-center gap-1 text-[14px]" style={{ color: "var(--yd-muted)" }}><IPin />{r.contacts.city}</p>
              )}
              <button type="button" aria-disabled="true" title="В демо не работает" className="yd-btn yd-btn-out yd-btn-sm mt-4 w-full">Редактировать профиль</button>
            </div>
          </div>
          <div className="yd-card">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[18px] font-bold">Заполнение профиля</h2>
              <span className="text-[16px] font-bold">{prof.percent}%</span>
            </div>
            <div className="yd-bar mt-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prof.percent} aria-label="Заполнение профиля"><i style={{ width: `${prof.percent}%` }} /></div>
            <ul className="mt-3">
              {prof.items.map((i) => (
                <li key={i.title} className="flex min-h-11 items-center justify-between gap-3 text-[16px]">
                  {i.title}
                  {i.done ? <ICheck /> : <span className="yd-pill">+{i.weight}%</span>}
                </li>
              ))}
            </ul>
            <p className="yd-hint !mt-2">Считается по последнему изменённому резюме.</p>
          </div>
        </aside>
      </div>

      {del && (
        <Confirm
          title="Удалить резюме?"
          text={`«${draftTitle(del)}» будет удалено из браузера без возможности восстановления.`}
          action="Удалить"
          onNo={() => setDel(null)}
          onYes={() => {
            removeDraft(del.id);
            setDel(null);
            show("Резюме удалено");
          }}
        />
      )}
      {node}
    </Shell>
  );
}

