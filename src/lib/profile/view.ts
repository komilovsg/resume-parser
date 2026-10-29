// Готовое к показу представление анкеты: имена справочников, период, стаж, форматированная зарплата.
// Без зависимостей от фреймворка: его же отдаёт сервис любому клиенту (в т.ч. Python).
import type { Resume } from "../parser/schema";
import type { Dict } from "./dict";

type Ref = { id: number; name: string };
type Status = "auto" | "similar" | "none";
type MatchLike = { status: Status; field: string; input: string; id: number | null; name: string | null };
type VcLike = {
  specialization_id: number | null; salary_from: number | null; salary_to: number | null; salary_period: number | null; currency_id: number;
  relocate_sign: number | null; business_trips: number | null;
  employment: number[] | null; work_schedule: number[] | null; time_to_work: number[] | null; bussness_trip: number[] | null;
};

export type ProfileView = {
  name: string | null;
  age: string | null; // «31 год» — только если в резюме есть дата рождения (пол не определяем)
  city: string | null;
  birthDate: string | null; // «15 марта 1994»
  driverLicense: string | null;
  title: string | null; // название должности: из справочника, иначе текст из резюме
  position: { id: number; name: string; auto: boolean } | null;
  flags: string[]; // «Готов(а) к переезду», «Готов(а) к командировкам»
  specialization: Ref | null;
  employment: string[];
  workSchedule: string[];
  timeToWork: string[];
  region: { id: number; name: string; auto: boolean; input: string } | null;
  salary: string | null; // «от 8 000 TJS в месяц»
  summary: string | null;
  experienceTotal: string | null; // «1 год 4 месяца»
  experienceMonths: number;
  experience: { period: string; position: string | null; company: string | null; city: string | null }[];
  education: { institution: string | null; details: string }[]; // details: «Бакалавр · Информатика · 2010–2014»
  skills: { input: string; id: number | null; name: string | null; auto: boolean }[];
  languages: { name: string; level: string | null }[];
  contacts: { phone: string | null; email: string | null; links: string[] };
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const m = n % 100;
  const d = n % 10;
  return m >= 11 && m <= 14 ? many : d === 1 ? one : d >= 2 && d <= 4 ? few : many;
};

export function fmtMonths(n: number): string {
  if (n <= 0) return "менее месяца";
  const y = Math.floor(n / 12);
  const m = n % 12;
  return [y && `${y} ${plural(y, "год", "года", "лет")}`, m && `${m} ${plural(m, "месяц", "месяца", "месяцев")}`].filter(Boolean).join(" ");
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const idx = (ym: string) => +ym.slice(0, 4) * 12 + (+ym.slice(5, 7) - 1);
const label = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
const nowYm = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

type Job = { start: string | null; end: string | null; current: boolean };
const span = (j: Job, now: string): [number, number] | null => {
  if (!j.start) return null;
  const s = idx(j.start);
  const e = j.current ? idx(now) : j.end ? idx(j.end) : null;
  return e == null || e < s ? null : [s, e];
};

/** Суммарный стаж в месяцах: пересекающиеся периоды объединяются, текущая работа считается до сегодня. */
export function totalMonths(jobs: Job[], now: string): number {
  const iv = jobs.map((j) => span(j, now)).filter((x): x is [number, number] => !!x).sort((a, b) => a[0] - b[0]);
  let sum = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of iv) {
    if (cur && s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else {
      if (cur) sum += cur[1] - cur[0];
      cur = [s, e];
    }
  }
  return cur ? sum + cur[1] - cur[0] : sum;
}

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
function ageOf(iso: string | null, today: Date): { age: string; date: string } | null {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  let a = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) a--;
  if (a < 0 || a > 120) return null;
  return { age: `${a} ${plural(a, "год", "года", "лет")}`, date: `${d} ${MONTHS_GEN[mo - 1] ?? ""} ${y}` };
}

const money = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const PER: Record<string, string> = { INC_MONTH: "в месяц", INC_DAY: "в день", INC_WEEK: "в неделю" };

const names = (list: { id: number; name: string }[], ids: number[] | null) =>
  (ids ?? []).map((i) => list.find((x) => x.id === i)?.name).filter((n): n is string => !!n);

export function buildView(resume: Resume, vc: VcLike, matches: MatchLike[], dict: Dict, today = new Date()): ProfileView {
  const now = nowYm(today);
  const pm = matches.find((m) => m.field === "position");
  const rm = matches.find((m) => m.field === "region");
  const pos = pm && pm.status !== "none" && pm.id != null && pm.name ? { id: pm.id, name: pm.name, auto: pm.status === "similar" } : null;
  const reg = rm && rm.status !== "none" && rm.id != null && rm.name ? { id: rm.id, name: rm.name, auto: rm.status === "similar", input: rm.input } : null;

  const spec = dict.specializations.find((s) => s.id === vc.specialization_id);
  const flags: string[] = [];
  if (vc.relocate_sign === 1) flags.push("Готов(а) к переезду");
  if (vc.business_trips === 1 || (vc.bussness_trip ?? []).some((i) => dict.businessTrips.find((t) => t.id === i && t.code !== "TRAVEL_NONE"))) flags.push("Готов(а) к командировкам");

  const { salary_from: from, salary_to: to } = vc;
  const code = dict.currencies.find((c) => c.id === vc.currency_id)?.code ?? "TJS";
  const pcode = dict.salaryPeriod.find((p) => p.id === vc.salary_period)?.code;
  const amount = from != null && to != null ? `${money(from)} – ${money(to)}` : from != null ? `от ${money(from)}` : to != null ? `до ${money(to)}` : null;
  const salary = amount ? `${amount} ${code}${pcode && PER[pcode] ? ` ${PER[pcode]}` : ""}` : null;

  const jobs: Job[] = resume.experience.map((e) => ({ start: e.startDate, end: e.endDate, current: e.current }));
  const months = totalMonths(jobs, now);
  const hasSpan = jobs.some((j) => span(j, now));
  const experience = resume.experience.map((e, i) => {
    const sp = span(jobs[i], now);
    const period = !e.startDate
      ? "Даты не указаны"
      : `${label(e.startDate)} — ${e.current ? "настоящее время" : e.endDate ? label(e.endDate) : "?"}${sp ? ` (${fmtMonths(sp[1] - sp[0])})` : ""}`;
    return { period, position: e.position, company: e.company, city: e.city };
  });

  const education = resume.education.map((e) => {
    const years = e.startYear && e.endYear ? `${e.startYear}–${e.endYear}` : e.endYear ? String(e.endYear) : e.startYear ? `с ${e.startYear}` : null;
    return { institution: e.institution, details: [e.degree, e.field, years].filter(Boolean).join(" · ") };
  });

  const bd = ageOf(resume.birthDate, today);
  return {
    name: resume.fullName,
    age: bd?.age ?? null,
    city: reg?.name ?? resume.contacts.city,
    birthDate: bd?.date ?? null,
    driverLicense: resume.driverLicense,
    title: pos?.name ?? (pm?.input || null),
    position: pos,
    flags,
    specialization: spec ? { id: spec.id, name: spec.name } : null,
    employment: names(dict.employment, vc.employment),
    workSchedule: names(dict.workSchedule, vc.work_schedule),
    // в справочнике опечатка «полутрочасов»
    timeToWork: names(dict.timeToWork, vc.time_to_work).map((n) => n.replace("полутрочасов", "полутора часов")),
    region: reg,
    salary,
    summary: resume.summary,
    experienceTotal: hasSpan ? fmtMonths(months) : null,
    experienceMonths: months,
    experience,
    education,
    skills: matches.filter((m) => m.field === "skill").map((m) => ({ input: m.input, id: m.status === "none" ? null : m.id, name: m.status === "none" ? null : m.name, auto: m.status === "similar" })),
    languages: resume.languages.filter((l) => l.name).map((l) => ({ name: l.name as string, level: l.level })),
    contacts: { phone: resume.contacts.phone, email: resume.contacts.email, links: resume.contacts.links },
  };
}
