import type { Resume } from "../parser/schema";
import { LABEL } from "../parser/terms";
import type { Dict } from "./dict";
import { buildView, type ProfileView } from "./view";
import { alternatives, best, buildIndex, fold, normalize, senOf, type Alt, type Hit, type Index, type Opts, type Status } from "./match";


export type HhVcCreateRequest = {
  position_id: number | null; // null = не найдено в справочнике, заполняется вручную (бэкенд требует int)
  currency_id: number;
  status: number;
  phone: string | null;
  email: string | null;
  region_id: number | null;
  specialization_id: number | null;
  salary_from: number | null;
  salary_to: number | null;
  salary_period: number | null;
  description: string | null;
  relocate_sign: number | null;
  business_trips: number | null;
  reasonable_adjustment_id: number | null;
  workplace_adaptation: string | null;
  visible_sign: number | null;
  sign_allow_landing: number | null;
  employment: number[] | null;
  work_schedule: number[] | null;
  time_to_work: number[] | null;
  bussness_trip: number[] | null;
  skills: number[] | null;
};
export type HhVcDetailRequest = {
  start_date: string;
  end_date: string | null;
  sign_cw: 0 | 1;
  organisation: string | null;
  region: number | null;
  website: null;
  position: string;
  duties: string | null;
  specializations: number[];
};
export type EducationRequest = {
  level_id: number | null;
  start_date: string | null;
  date_end: string | null;
  education_institution_name: string | null;
  specialization_id: number | null;
};
// similar = подобрано автоматически по сходству (идёт в payload как auto); alternatives — до 3 запасных вариантов для similar/none
export type Match = { status: Status; field: string; input: string; id: number | null; name: string | null; score: number; alternatives?: Alt[] };
export type { ProfileView };
export type ProfileResult = {
  vc: HhVcCreateRequest;
  details: HhVcDetailRequest[];
  education: EducationRequest[];
  matches: Match[];
  missing: string[];
  view: ProfileView; // готовое к показу представление (имена справочников, стаж, период) — для любого клиента
};

// Индексы строятся лениво и только при смене справочника (кэш по ссылке на dict)
type Indexes = { positions: Index; regions: Index; skills: Index; specializations: Index };
const cache = new WeakMap<Dict, Indexes>();
const indexesOf = (d: Dict): Indexes => {
  let i = cache.get(d);
  if (!i) cache.set(d, (i = { positions: buildIndex(d.positions), regions: buildIndex(d.regions, true), skills: buildIndex(d.skills), specializations: buildIndex(d.specializations) }));
  return i;
};

const PERIOD: Record<string, string> = { month: "INC_MONTH" };
const TJS = 2;
const REG = { min: 0.6, auto: 0.92, region: true };

export const ymToDate = (s: string | null) => (s ? `${s}-01` : null);
const yearToDate = (y: number | null) => (y ? `${y}-01-01` : null);

function eduLevel(dict: Dict, text: string | null): number | null {
  const t = (text ?? "").toLowerCase();
  const code =
    /бакалавр|bachelor/.test(t) ? "EDU_B"
    : /магистр|master/.test(t) ? "EDU_M"
    : /доктор наук|doctor|phd/.test(t) ? "EDU_DOC"
    : /кандидат/.test(t) ? "EDU_CAND"
    : /неоконченн/.test(t) ? "EDU_NHIG"
    : /специалист|высшее|диплом/.test(t) ? "EDU_HIGH"
    : /колледж|техникум|училище|среднее специальное/.test(t) ? "EDU_SP"
    : /среднее|школа/.test(t) ? "EDU_S"
    : null;
  return dict.educationLevels.find((l) => l.code === code)?.id ?? null;
}


// ---- нормализация навыков перед сопоставлением ----
// Синонимы, проверенные по справочнику (целевое имя должно в нём быть; иначе алиас молча не срабатывает).
// Ключ — normalize(), значение — каноничное имя в справочнике.
const SKILL_ALIAS: Record<string, string> = {
  k8s: "Kubernetes", // Kubernetes id 2614
  js: "JavaScript", // JavaScript id 2
  ts: "TypeScript", // TypeScript id 8
  postgres: "PostgreSQL", // PostgreSQL id 32
  nodejs: "Node.js", // Node.js id 16
  reactjs: "React", // React id 3247
  "react js": "React", // «React.js»
  mongo: "MongoDB", // MongoDB id 34
};
// Проверено и НЕ добавлено: в справочнике нет «MS SQL», «ASP.NET», «VMware», «VPS», «Telegram API» — синонимов не выдумываем.

const SKILL_SPLIT = /\s*(?:[\/,;&]|\s+и\s+)\s*/i;
const PAREN = /\s*[(\[][^)\]]*[)\]]\s*/g;
const VERSION = /[\s.-]*v?\d+(?:\.\d+)*$/i;
const isExact = (q: string, index: Index) => {
  const f = fold(normalize(q));
  return !!f && index.some((e) => e.fold === f);
};

/** «Linux/Windows Server» -> две записи; «Docker (Basic)» -> запрос «Docker» с исходным текстом для показа. Целое имя из справочника не режем. */
export function expandSkill(raw: string, index: Index): { input: string; query: string }[] {
  const text = raw.trim();
  if (!text) return [];
  if (isExact(text, index)) return [{ input: text, query: text }];
  const clean = text.replace(PAREN, " ").replace(/\s+/g, " ").trim();
  if (clean !== text && clean.length >= 2) {
    if (isExact(clean, index)) return [{ input: text, query: clean }];
  }
  const base = clean.length >= 2 ? clean : text;
  const parts = base.split(SKILL_SPLIT).map((p) => p.trim());
  if (parts.length > 1 && parts.every((p) => p.length >= 2)) return parts.map((p) => ({ input: p, query: p }));
  return [{ input: text, query: base }];
}

/** Алиас -> точное -> версия отброшена (только точное/опечатка даёт auto) -> обычное сходство. */
function matchSkill(query: string, index: Index): Hit | null {
  const O: Opts = { min: 0.85, auto: 0.95, strictSubset: true };
  const alias = SKILL_ALIAS[normalize(query)];
  if (alias) {
    const a = best(alias, index, O);
    if (a?.status === "auto") return a;
  }
  const h = best(query, index, O);
  if (h?.status === "auto") return h;
  const stripped = query.replace(VERSION, "").trim();
  if (stripped !== query && stripped.length >= 2 && /\p{L}/u.test(stripped)) {
    const v = best(stripped, index, O);
    if (v?.status === "auto") return v;
    if (v && (!h || v.score > h.score)) return v;
  }
  return h;
}

export function toProfile(resume: Resume, dict: Dict): ProfileResult {
  const idx = indexesOf(dict);
  const matches: Match[] = [];
  const missing: string[] = [];
  // в vc/details попадают auto и similar; none — предупреждение
  const picked = (h: Hit | null): h is Hit => h?.status === "auto" || h?.status === "similar";
  const rec = (field: string, input: string, h: Hit | null, index: Index, o: Pick<Opts, "region">) => {
    const m: Match = { status: h?.status ?? "none", field, input, id: h?.id ?? null, name: h?.name ?? null, score: h ? +h.score.toFixed(3) : 0 };
    if (m.status !== "auto") {
      const alts = alternatives(input, index, o, h?.id);
      if (alts.length) m.alternatives = alts;
    }
    matches.push(m);
  };

  // должность: желаемая, иначе последняя по опыту
  const posQuery = resume.desiredPosition || resume.experience[0]?.position || null;
  let position: Hit | null = null;
  if (posQuery) {
    const h = best(posQuery, idx.positions, { min: 0.6, auto: 0.92, guard: true });
    rec("position", posQuery, h, idx.positions, {});
    if (picked(h)) {
      position = h;
      // уровень из резюме в справочнике не указан: подобрано без уровня
      if (h.status === "similar" && senOf(normalize(posQuery).split(" ")).size && !senOf(normalize(h.name).split(" ")).size)
        missing.push(`Должность «${posQuery}» подобрана как «${h.name}» — уровень в справочнике не указан`);
    } else missing.push(`«${posQuery}» нет в справочнике должностей — поле останется пустым, заполните его в анкете вручную`);
  } else missing.push("Должность не указана в резюме — поле останется пустым, заполните его в анкете вручную");

  const city = resume.contacts.city;
  const rh = city ? best(city, idx.regions, REG) : null;
  const region = picked(rh) ? rh : null;
  if (city) {
    rec("region", city, rh, idx.regions, { region: true });
    if (!region) missing.push(`Город «${city}» нет в справочнике регионов — поле останется пустым, заполните его в анкете вручную`);
  }

  const code = (resume.salary.currency ?? "TJS").toUpperCase();
  const cur = dict.currencies.find((c) => c.code === code);
  if (resume.salary.currency && !cur) missing.push(`Валюта «${resume.salary.currency}» не поддерживается — использована TJS`);

  const hasSalary = resume.salary.from != null || resume.salary.to != null;
  const pcode = resume.salary.period ? PERIOD[resume.salary.period] : undefined;
  const period = dict.salaryPeriod.find((p) => p.code === pcode)?.id ?? null;
  if (hasSalary && period == null) missing.push("Период зарплаты не определён — выберите вручную");

  const skillIds = new Set<number>();
  const lostSkills: string[] = [];
  const seenInput = new Set<string>();
  for (const raw of resume.skills) {
    for (const { input, query } of expandSkill(raw, idx.skills)) {
      const h = matchSkill(query, idx.skills);
      // один и тот же навык после нормализации («Docker (Basic)» и «Docker») — одна строка и один id
      if (picked(h) && skillIds.has(h.id)) continue;
      if (seenInput.has(normalize(input))) continue;
      seenInput.add(normalize(input));
      rec("skill", input, h, idx.skills, {});
      if (picked(h)) skillIds.add(h.id);
      else lostSkills.push(input);
    }
  }
  if (lostSkills.length)
    missing.push(`Нет в справочнике навыков: ${lostSkills.map((s) => `«${s}»`).join(", ")} — эти навыки не попадут в анкету, добавьте их в анкете вручную`);

  // специализация — только если названа в резюме; сходство как у остальных полей
  let spec: Hit | null = null;
  if (resume.specialization) {
    const h = best(resume.specialization, idx.specializations, { min: 0.6, auto: 0.92 });
    rec("specialization", resume.specialization, h, idx.specializations, {});
    if (picked(h)) spec = h;
    else missing.push(`Специализация «${resume.specialization}» нет в справочнике — поле останется пустым, заполните его в анкете вручную`);
  }

  // условия работы: каждое значение enum -> запись справочника по code; без записи — в missing
  const byCode = (list: { id: number; code: string }[], code: string, what: string): number | null => {
    const id = list.find((x) => x.code === code)?.id ?? null;
    if (id == null) missing.push(`${what}: нет в справочнике — заполните вручную`);
    return id;
  };
  const ids = (xs: (number | null)[]) => {
    const u = [...new Set(xs.filter((x): x is number => x != null))];
    return u.length ? u : null;
  };
  const EMP = { full: "EMP_FULL", part: "EMP_PART", project: "EMP_PROJECT", internship: "EMP_INT", volunteer: "EMP_VOL", rotation: "EMP_TEMP" } as const;
  const TRIP = { none: "TRAVEL_NONE", often: "TRAVEL_OFTEN", rarely: "TRAVEL_RARELY" } as const;
  const TTW = { min90: "TIME_TO_WARK_05", hour1: "TIME_TO_WARK_1", any: "TIME_TO_WARK_ANY" } as const;
  const trip = resume.businessTrips;

  const details: HhVcDetailRequest[] = [];
  for (const e of resume.experience) {
    const start = ymToDate(e.startDate);
    if (!start) {
      missing.push(`Место работы «${e.company ?? e.position ?? "?"}»: нет даты начала — пропущено`);
      continue;
    }
    const r0 = e.city ? best(e.city, idx.regions, REG) : null;
    const r = picked(r0) ? r0 : null;
    details.push({
      start_date: start,
      end_date: e.current ? null : ymToDate(e.endDate),
      sign_cw: e.current ? 1 : 0,
      organisation: e.company,
      region: r?.id ?? null,
      website: null,
      position: e.position ?? "",
      duties: e.description,
      specializations: [],
    });
  }

  const education: EducationRequest[] = resume.education.map((e) => ({
    level_id: eduLevel(dict, e.degree),
    start_date: yearToDate(e.startYear),
    date_end: yearToDate(e.endYear),
    education_institution_name: e.institution,
    specialization_id: null,
  }));

  const vc: HhVcCreateRequest = {
      position_id: position?.id ?? null,
      currency_id: cur?.id ?? TJS,
      status: 0,
      phone: resume.contacts.phone,
      email: resume.contacts.email,
      region_id: region?.id ?? null,
      specialization_id: spec?.id ?? null,
      salary_from: resume.salary.from,
      salary_to: resume.salary.to,
      salary_period: period,
      description: resume.summary,
      relocate_sign: resume.relocation === null ? null : resume.relocation ? 1 : 0,
      // «готов» без частоты: в справочнике такой записи нет — флаг business_trips=1, id не подбираем
      business_trips: trip === "ready" ? 1 : null,
      reasonable_adjustment_id: null,
      workplace_adaptation: null,
      visible_sign: null,
      sign_allow_landing: null,
      employment: ids(resume.employment.map((v) => byCode(dict.employment, EMP[v], `Занятость «${LABEL.employment[v]}»`))),
      work_schedule: ids(resume.schedule.map((v) => byCode(dict.workSchedule, v === "free" ? "SCH_FREE" : v === "weekend" ? "SCH_WEEKEND" : `SCH_${v.replace("/", "")}`, `График «${LABEL.schedule[v]}»`))),
      time_to_work: resume.timeToWork ? ids([byCode(dict.timeToWork, TTW[resume.timeToWork], `Время до работы «${LABEL.timeToWork[resume.timeToWork]}»`)]) : null,
      bussness_trip: trip && trip !== "ready" ? ids([byCode(dict.businessTrips, TRIP[trip], `Командировки «${LABEL.businessTrips[trip]}»`)]) : null,
      skills: skillIds.size ? [...skillIds] : null,
  };
  return { vc, details, education, matches, missing, view: buildView(resume, vc, matches, dict) };
}
