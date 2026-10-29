// Чистая логика формы: заполненность разделов, подписи, применение явных выборов к представлению анкеты.
import type { Resume } from "@/lib/parser/schema";
import type { ProfileView } from "@/lib/profile/view";
import { EMPLOYMENT, LABEL, SCHEDULE, TIME_TO_WORK } from "../../lib/parser/terms";
import type { Draft, Picks } from "./store";

export type Item = { id: number; code: string; name: string };
export type Dicts = {
  employment: Item[];
  workSchedule: Item[];
  timeToWork: Item[];
  businessTrips: Item[];
  currencies: Item[];
  salaryPeriod: Item[];
  regions: { id: number; name: string }[];
  specializations: { id: number; name: string; parent?: string }[];
};

// Справочное соответствие значений схемы парсера и code справочников
export const EMP_CODE = { full: "EMP_FULL", part: "EMP_PART", project: "EMP_PROJECT", internship: "EMP_INT", volunteer: "EMP_VOL", rotation: "EMP_TEMP" } as const;
export const TTW_CODE = { min90: "TIME_TO_WARK_05", hour1: "TIME_TO_WARK_1", any: "TIME_TO_WARK_ANY" } as const;
export const schedCode = (v: string) => (v === "free" ? "SCH_FREE" : v === "weekend" ? "SCH_WEEKEND" : `SCH_${v.replace("/", "")}`);

export type SectionKey = "experience" | "conditions" | "desired" | "about" | "education" | "skills" | "languages" | "contacts";
export const SECTIONS: { key: SectionKey; title: string; weight: number }[] = [
  { key: "experience", title: "Опыт работы", weight: 20 },
  { key: "conditions", title: "Условия работы", weight: 20 },
  { key: "desired", title: "Желаемая должность", weight: 20 },
  { key: "about", title: "О себе", weight: 15 },
  { key: "education", title: "Образование", weight: 10 },
  { key: "skills", title: "Навыки", weight: 10 },
  { key: "languages", title: "Языки", weight: 3 },
  { key: "contacts", title: "Контакты", weight: 2 },
];

const has = (s: string | null | undefined) => !!s && s.trim().length > 0;

export function sectionDone(k: SectionKey, r: Resume, p: Picks): boolean {
  switch (k) {
    case "experience":
      return !!p.position && (!!p.noExperience || r.experience.length > 0);
    case "conditions":
      return r.schedule.length > 0 && r.employment.length > 0 && r.timeToWork != null && r.relocation != null && r.businessTrips != null;
    case "desired":
      return !!p.region && !!p.specialization && (!!p.negotiable || r.salary.from != null || r.salary.to != null);
    case "about":
      return has(r.summary);
    case "education":
      return r.education.some((e) => has(e.institution));
    case "skills":
      return r.skills.length > 0;
    case "languages":
      return r.languages.some((l) => has(l.name));
    case "contacts":
      return has(r.contacts.phone) || has(r.contacts.email);
  }
}

export function progress(r: Resume, p: Picks) {
  const sections = SECTIONS.map((s, i) => ({ ...s, n: i + 1, done: sectionDone(s.key, r, p) }));
  return { sections, percent: sections.reduce((n, s) => n + (s.done ? s.weight : 0), 0) };
}

// «Заполнение профиля» на странице списка (курсы, сертификаты и рекомендации парсером не извлекаются)
export function profileProgress(r: Resume | null) {
  const items = [
    { title: "Опыт работы", weight: 30, done: !!r && r.experience.length > 0 },
    { title: "Образование", weight: 15, done: !!r && r.education.length > 0 },
    { title: "Языки", weight: 10, done: !!r && r.languages.length > 0 },
    { title: "Водительские права", weight: 5, done: !!r && has(r.driverLicense) },
    { title: "Курсы", weight: 15, done: false },
    { title: "Сертификаты", weight: 15, done: false },
    { title: "Рекомендации", weight: 10, done: false },
  ];
  return { items, percent: items.reduce((n, i) => n + (i.done ? i.weight : 0), 0) };
}

const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const SIGN: Record<string, string> = { TJS: "с", RUB: "₽", USD: "$", EUR: "€" };
export const periodCode = (r: Resume, p: Picks): string | null => (p.salaryPeriod !== undefined ? p.salaryPeriod : r.salary.period === "month" ? "INC_MONTH" : null);

/** Короткая строка зарплаты для карточки в списке: «3 000 - 3 000 с» */
export function salaryShort(r: Resume, p: Picks): string | null {
  if (p.negotiable) return "По договорённости";
  const { from, to } = r.salary;
  if (from == null && to == null) return null;
  const cur = (r.salary.currency ?? "TJS").toUpperCase();
  const s = SIGN[cur] ?? cur;
  return `${from != null && to != null ? `${money(from)} - ${money(to)}` : from != null ? `от ${money(from)}` : `до ${money(to as number)}`} ${s}`;
}

const PER: Record<string, string> = { INC_MONTH: "в месяц", INC_DAY: "в день", INC_WEEK: "в неделю" };
/** Полная строка для предпросмотра: «3 000 – 3 000 TJS в месяц» */
export function salaryFull(r: Resume, p: Picks): string | null {
  if (p.negotiable) return "По договорённости";
  const { from, to } = r.salary;
  if (from == null && to == null) return null;
  const cur = (r.salary.currency ?? "TJS").toUpperCase();
  const amount = from != null && to != null ? `${money(from)} – ${money(to)}` : from != null ? `от ${money(from)}` : `до ${money(to as number)}`;
  const pc = periodCode(r, p) ?? "INC_MONTH";
  return `${amount} ${cur}${pc && PER[pc] ? ` ${PER[pc]}` : ""}`;
}

/** Название резюме в списке: выбранная должность, иначе текст из резюме */
export const draftTitle = (d: Draft): string => d.picks.position?.name ?? d.resume.desiredPosition ?? d.resume.experience[0]?.position ?? "Без названия";

/** Явный выбор в форме перекрывает автоподбор: именно это уйдёт в анкете */
export function applyPicks(v: ProfileView, r: Resume, p: Picks): ProfileView {
  const position = p.position === undefined ? v.position : p.position ? { id: p.position.id, name: p.position.name, auto: false } : null;
  const region = p.region === undefined ? v.region : p.region ? { id: p.region.id, name: p.region.name, auto: false, input: r.contacts.city ?? "" } : null;
  const specialization = p.specialization === undefined ? v.specialization : p.specialization;
  return {
    ...v,
    position,
    title: position?.name ?? (p.position === undefined ? v.title : r.desiredPosition),
    region,
    city: region?.name ?? r.contacts.city,
    specialization,
    salary: salaryFull(r, p),
  };
}

export const initials = (n: string | null) => (n ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

export function ageYears(iso: string | null, today = new Date()): number | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  let a = today.getFullYear() - +m[1];
  if (today.getMonth() + 1 < +m[2] || (today.getMonth() + 1 === +m[2] && today.getDate() < +m[3])) a--;
  return a >= 0 && a <= 120 ? a : null;
}

// ---- варианты для полей: названия из справочника (если загружен), иначе подписи парсера ----
export type Opt1 = { value: string; label: string };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
function fromDict(list: Item[] | undefined, toValue: (code: string) => string | null, fallback: Opt1[]): Opt1[] {
  if (!list?.length) return fallback;
  const out: Opt1[] = [];
  for (const it of list) {
    const value = toValue(it.code);
    if (value) out.push({ value, label: it.name });
  }
  return out.length ? out : fallback;
}
const rev = (m: Record<string, string>) => (code: string) => Object.entries(m).find(([, c]) => c === code)?.[0] ?? null;
export const employmentOpts = (d: Dicts | null) => fromDict(d?.employment, rev(EMP_CODE), EMPLOYMENT.map((v) => ({ value: v, label: cap(LABEL.employment[v]) })));
export const scheduleOpts = (d: Dicts | null) => fromDict(d?.workSchedule, (c) => SCHEDULE.find((v) => schedCode(v) === c) ?? null, SCHEDULE.map((v) => ({ value: v, label: cap(LABEL.schedule[v]) })));
export const timeToWorkOpts = (d: Dicts | null) => fromDict(d?.timeToWork, rev(TTW_CODE), TIME_TO_WORK.map((v) => ({ value: v, label: cap(LABEL.timeToWork[v]) })));
export const periodOpts = (d: Dicts | null): Opt1[] => (d?.salaryPeriod.length ? d.salaryPeriod.map((x) => ({ value: x.code, label: x.name })) : [{ value: "INC_MONTH", label: "Месяц" }]);
export const currencyOpts = (d: Dicts | null): Opt1[] => (d?.currencies.length ? d.currencies.map((x) => ({ value: x.code, label: x.code })) : [{ value: "TJS", label: "TJS" }]);

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const ymLabel = (ym: string | null) => (ym ? `${MONTHS[+ym.slice(5, 7) - 1] ?? ""} ${ym.slice(0, 4)}` : "?");
