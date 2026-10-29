"use client";

import { useState } from "react";
import { normalize } from "@/lib/profile/match";
import type { Profile } from "./types";
import Notice from "./Notice";
import ProfileCard, { type CardSkill } from "./ProfileCard";

const FIELD: Record<string, string> = {
  position: "Должность", region: "Регион", city: "Город", country: "Страна", citizenship: "Гражданство", gender: "Пол", currency: "Валюта",
  skill: "Навык", skills: "Навык", language: "Язык", level: "Уровень языка", degree: "Степень", institution: "Учебное заведение",
  specialty: "Специальность", field: "Специальность", educationLevel: "Уровень образования", schedule: "График", employment: "Занятость",
  salary: "Зарплата", period: "Период зарплаты", experience: "Место работы", education: "Образование",
};

type M = Profile["matches"][number];

const pill = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

function Badge({ status, score }: { status: M["status"]; score: number }) {
  if (status === "none") return <span className={`${pill} bg-fill text-muted`}>нет в справочнике</span>;
  const exact = status === "auto" && score >= 0.95;
  const tone = status === "auto" ? "text-ok" : "text-warn";
  return (
    <span className={`${pill} ${tone}`} style={{ background: `color-mix(in srgb, currentColor 14%, transparent)` }}>
      {exact ? "точно" : status === "similar" ? `подобрано · ${Math.round(score * 100)}%` : `похоже · ${Math.round(score * 100)}%`}
    </span>
  );
}

function Raw({ title, data }: { title: string; data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);
  return (
    <details className="card overflow-hidden">
      <summary className="flex min-h-[52px] cursor-pointer items-center justify-between px-4 text-[17px] font-medium">
        <span className="font-mono text-[15px]">{title}</span>
        <span aria-hidden className="chev text-xl text-muted">›</span>
      </summary>
      <div className="relative border-t border-line">
        <button
          className="btn btn-ghost btn-sm absolute right-2 top-2"
          aria-label={`Копировать ${title}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {}
          }}
        >
          {copied ? "Скопировано" : "Копировать"}
        </button>
        <pre className="max-h-80 overflow-auto p-4 pt-16 font-mono text-xs leading-relaxed">{text}</pre>
      </div>
    </details>
  );
}

// Выбор пользователя («изменить») попадает в отображаемый vc (только на клиенте)
function applyChoice(vc: Profile["vc"], m: M, id: number | null): Profile["vc"] {
  if (m.field === "position") return { ...vc, position_id: id };
  if (m.field === "region") return { ...vc, region_id: id };
  if (m.field === "skill") {
    const cur = (Array.isArray(vc.skills) ? (vc.skills as number[]) : []).filter((x) => x !== m.id);
    if (id != null && !cur.includes(id)) cur.push(id);
    return { ...vc, skills: cur.length ? cur : null };
  }
  return vc;
}

// Выбор пользователя переживает смену вкладки и новый разбор: localStorage["profile-choices"].
// {id,name} — своя замена; {rejected:true} («оставить пустым», так же читается старый формат) — поле пустое
type Choice = { id: number; name: string } | { rejected: true };
type Choices = Record<string, Choice>;
const STORE = "profile-choices";
const keyOf = (m: M) => `${m.field}|${normalize(m.input)}`;

function readChoices(): Choices {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}
function writeChoices(c: Choices) {
  try {
    localStorage.setItem(STORE, JSON.stringify(c));
  } catch {}
}

const NOUN: Record<string, string> = { position: "должностей", region: "регионов", skill: "навыков" };
const HINT: Record<string, string> = {
  position: "поле останется пустым, заполните его в анкете вручную",
  region: "поле останется пустым, заполните его в анкете вручную",
  skill: "навык не попадёт в анкету, добавьте его в анкете вручную",
};

export default function ProfileTab({ y, status = null }: { y: Profile; status?: "updating" | "error" | null }) {
  const [choices, setChoices] = useState<Choices>(readChoices);
  const [open, setOpen] = useState<string | null>(null);
  const decide = (k: string, c: Choice | null) => {
    setChoices((prev) => {
      const next = { ...prev };
      if (c) next[k] = c;
      else delete next[k];
      writeChoices(next);
      return next;
    });
    setOpen(null);
  };
  const chosen = (m: M) => (m.status === "auto" ? undefined : choices[keyOf(m)]);
  const vc = y.matches.reduce((acc, m) => {
    const c = chosen(m);
    return c ? applyChoice(acc, m, "id" in c ? c.id : null) : acc;
  }, y.vc);
  // «нет в справочнике» по должности/городу снимается, если пользователь сам выбрал вариант
  const PREFIX: Record<string, string> = { position: "", region: "Город " };
  const missing = y.missing.filter((text) => {
    const m = y.matches.find((x) => x.status === "none" && x.field in PREFIX && text.startsWith(`${PREFIX[x.field]}«${x.input}»`));
    const c = m && chosen(m);
    return !(c && "id" in c);
  });
  // карточка анкеты показывает те же id/имена, что и vc: с учётом выбора пользователя
  const pick = (m: M | undefined) => {
    if (!m) return null;
    const c = chosen(m);
    if (c) return "id" in c ? { name: c.name, auto: false } : null;
    return m.status === "none" || !m.name ? null : { name: m.name, auto: m.status === "similar" };
  };
  const pm = y.matches.find((m) => m.field === "position");
  const rm = y.matches.find((m) => m.field === "region");
  const posPick = pick(pm);
  const skills: CardSkill[] = [];
  const seen = new Set<string>();
  for (const m of y.matches) {
    if (m.field !== "skill") continue;
    const p = pick(m);
    const key = p ? `n:${p.name}` : `i:${m.input}`;
    if (seen.has(key)) continue;
    seen.add(key);
    skills.push({ input: m.input, name: p?.name ?? null, auto: p?.auto ?? false });
  }
  return (
    <div className="space-y-5">
      {status === "updating" && <p role="status" className="px-1 text-[13px] text-muted">Обновляем сопоставление после правок…</p>}
      {status === "error" && <Notice title="Сопоставление не обновилось" items={["Показаны данные до последних правок. Попробуйте изменить поле ещё раз."]} />}
      {y.view ? (
        <>
          <h3 className="px-1 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">Так резюме будет выглядеть в анкете</h3>
          <ProfileCard view={y.view} title={posPick?.name ?? pm?.input ?? y.view.title} titleAuto={!!posPick?.auto} region={pick(rm)} skills={skills} />
        </>
      ) : null}
      <Notice title="Обратите внимание" items={missing} />

      <section className="card rise overflow-hidden" style={{ ["--i" as string]: 1 }}>
        <h3 className="px-5 pt-5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">Сопоставление со справочниками</h3>
        {y.matches.length === 0 ? (
          <p className="p-5 text-[15px] text-muted">Совпадений нет.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {y.matches.map((m, i) => {
              const k = keyOf(m);
              const choice = chosen(m);
              const picked = choice && "id" in choice ? choice : null;
              const emptied = !!choice && "rejected" in choice;
              const label = FIELD[m.field] ?? m.field;
              const canEdit = m.status !== "auto" && (m.alternatives?.length ?? 0) > 0;
              const shown = picked?.name ?? (emptied || m.status === "none" ? null : m.name);
              const shownId = picked?.id ?? (emptied ? null : m.id);
              return (
                <li key={i} className="rise px-5 py-3.5" style={{ ["--i" as string]: i + 2 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] text-muted">{label}</p>
                      {shown ? (
                        <>
                          <p className="break-words text-[17px] leading-snug">{shown}</p>
                          {m.input !== shown && <p className="mt-0.5 break-words text-[13px] text-muted">в резюме: «{m.input}»</p>}
                        </>
                      ) : (
                        <>
                          <p className="break-words text-[17px] leading-snug text-muted">«{m.input}» — {emptied ? "оставлено пустым" : "нет в справочнике"}</p>
                          {!emptied && <p className="mt-1 break-words text-[13px] leading-snug text-warn">Нет в справочнике {NOUN[m.field] ?? "profile"} profile — {HINT[m.field] ?? "заполните вручную"}</p>}
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {picked ? <span className={`${pill} bg-ok/15 text-ok`}>выбрано вами</span> : emptied ? <span className={`${pill} bg-fill text-muted`}>пусто</span> : <Badge status={m.status} score={m.score} />}
                      {shownId != null && <span className="text-[11px] tabular-nums text-muted/80">id {shownId}</span>}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted">
                      {choice && <button className="-ml-2 inline-flex min-h-[44px] items-center px-2 text-[15px] font-medium text-accent underline underline-offset-2" onClick={() => decide(k, null)}>сбросить</button>}
                      <button
                        className={`inline-flex min-h-[44px] items-center px-2 text-[15px] font-medium text-accent underline underline-offset-2 ${choice ? "" : "-ml-2"}`}
                        aria-expanded={open === k}
                        aria-label={`Изменить: ${label} «${m.input}»`}
                        onClick={() => setOpen(open === k ? null : k)}
                      >
                        изменить
                      </button>
                    </div>
                  )}
                  {open === k && (
                    <ul className="mt-1 flex flex-col gap-2">
                      {m.alternatives!.map((a) => (
                        <li key={a.id}>
                          <button className="btn btn-sm w-full justify-between gap-2" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line)" }} title={a.name} onClick={() => decide(k, { id: a.id, name: a.name })}>
                            <span className="min-w-0 truncate">{a.name}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted">{Math.round(a.score * 100)}%</span>
                          </button>
                        </li>
                      ))}
                      <li>
                        <button className="btn btn-sm w-full text-muted" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--line)" }} onClick={() => decide(k, { rejected: true })}>
                          оставить пустым
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-3">
        <Raw title="vc" data={vc} />
        <Raw title="details" data={y.details} />
        <Raw title="education" data={y.education} />
      </div>
    </div>
  );
}
