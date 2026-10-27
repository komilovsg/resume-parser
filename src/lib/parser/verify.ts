import type { Resume } from "./schema";
import { KEYWORDS, LABEL } from "./terms";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const PHONE_RE = /\+?\d[\d\s().-]{7,}\d/g;
const tail = (s: string) => s.replace(/\D/g, "").slice(-9);

// Сверка контактов с исходным текстом без ИИ: убирает выдуманные email/телефон
// mixed: значение ИИ, которого нет в тексте, могло быть на картинке — не перезаписываем, только дозаполняем пустое
export function verifyContacts(resume: Resume, source: string, mixed = false): { resume: Resume; warnings: string[]; unverified: string[] } {
  const warnings: string[] = [];
  const unverified: string[] = [];
  const emails = source.match(EMAIL_RE) ?? [];
  const phones = (source.match(PHONE_RE) ?? []).filter((p) => p.replace(/\D/g, "").length >= 9);
  const c = { ...resume.contacts };

  const lower = source.toLowerCase();
  if (c.email && !lower.includes(c.email.trim().toLowerCase())) {
    if (mixed) unverified.push(`Email: ${c.email}`);
    else {
      c.email = emails[0] ?? null;
      warnings.push("email исправлен по тексту документа");
    }
  } else if (!c.email && emails[0]) {
    c.email = emails[0];
    warnings.push("email найден по тексту документа");
  }

  if (c.phone) {
    const t = tail(c.phone);
    if (!phones.some((p) => tail(p) === t)) {
      if (mixed) unverified.push(`Телефон: ${c.phone}`);
      else {
        c.phone = phones[0]?.trim() ?? null;
        warnings.push("телефон исправлен по тексту документа");
      }
    }
  } else if (phones[0]) {
    c.phone = phones[0].trim();
    warnings.push("телефон найден по тексту документа");
  }

  return { resume: { ...resume, contacts: c }, warnings, unverified };
}

const norm = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// ≥80% слов (длиной ≥3) значения найдены в тексте; подстрока — чтобы терпеть словоформы
function inText(value: string, text: string): boolean {
  const n = norm(value);
  if (!n) return true;
  const words = n.split(" ").filter((w) => w.length >= 3);
  if (!words.length) return ` ${text} `.includes(` ${n} `);
  return words.filter((w) => text.includes(w)).length / words.length >= 0.8;
}

const yearIn = (y: string | number | null, text: string) =>
  y === null || new RegExp(`(?<!\\d)${String(y).slice(0, 4)}(?!\\d)`).test(text);

// Анти-галлюцинации: оставляем только то, что реально есть в тексте документа
// mixed=true (текст + картинки): ничего не удаляем, а не найденное в тексте помечаем в unverified
export function verifyResume(
  resume: Resume,
  source: string | null,
  mixed = false,
): { resume: Resume; warnings: string[]; grounded: boolean; unverified: string[] } {
  if (source === null) {
    return { resume, warnings: ["Скан: проверка по тексту недоступна — проверьте данные"], grounded: false, unverified: [] };
  }
  const { resume: r0, warnings, unverified } = verifyContacts(resume, source, mixed);
  const text = norm(source);
  const r: Resume = { ...r0 };
  const miss = (label: string, value: string | number) => unverified.push(`${label}: ${value}`);

  if (r.fullName && !inText(r.fullName, text)) {
    if (mixed) miss("Имя", r.fullName);
    else (warnings.push(`Имя не найдено в документе: ${r.fullName}`), (r.fullName = null));
  }

  r.experience = r0.experience.flatMap((e) => {
    const okC = !e.company || inText(e.company, text);
    const okP = !e.position || inText(e.position, text);
    if (mixed) {
      if (!okC) miss("Опыт, компания", e.company!);
      if (!okP) miss("Опыт, должность", e.position!);
      for (const k of ["startDate", "endDate"] as const) if (e[k] && !yearIn(e[k], text)) miss("Опыт, дата", e[k]!);
      return [e];
    }
    if (!okC && !okP) {
      warnings.push(`Удалена запись опыта, которой нет в документе: ${e.company ?? ""} ${e.position ?? ""}`.trim());
      return [];
    }
    const x = { ...e };
    if (!okC) (warnings.push(`Компания не найдена в документе: ${e.company}`), (x.company = null));
    if (!okP) (warnings.push(`Должность не найдена в документе: ${e.position}`), (x.position = null));
    for (const k of ["startDate", "endDate"] as const) {
      if (x[k] && !yearIn(x[k], text)) (warnings.push(`Дата не найдена в документе: ${x[k]}`), (x[k] = null));
    }
    return [x];
  });

  r.education = r0.education.flatMap((e) => {
    if (mixed) {
      if (e.institution && !inText(e.institution, text)) miss("Образование", e.institution);
      for (const k of ["startYear", "endYear"] as const) if (e[k] !== null && !yearIn(e[k], text)) miss("Образование, год", e[k]!);
      return [e];
    }
    const x = { ...e };
    if (x.institution && !inText(x.institution, text)) {
      warnings.push(`Учебное заведение не найдено в документе: ${x.institution}`);
      x.institution = null;
    }
    for (const k of ["startYear", "endYear"] as const) {
      if (!yearIn(x[k], text)) (warnings.push(`Год не найден в документе: ${x[k]}`), (x[k] = null));
    }
    if (e.institution && !x.institution && !x.degree && !x.field) return [];
    return [x];
  });

  r.skills = r0.skills.filter((s) => {
    const ok = inText(s, text);
    if (!ok) {
      if (mixed) miss("Навык", s);
      else warnings.push(`Навык не найден в документе: ${s}`);
    }
    return ok || mixed;
  });

  // условия работы: значение остаётся, только если в тексте есть его ключевое слово
  const kw = (re: RegExp) => re.test(source);
  const gate = (label: string, shown: string, ok: boolean): boolean => {
    if (ok) return true;
    if (mixed) unverified.push(`${label}: ${shown}`);
    else warnings.push(`${label} «${shown}» не найдена в документе`);
    return mixed;
  };
  r.employment = r0.employment.filter((v) => gate("Занятость", LABEL.employment[v], kw(KEYWORDS.employment[v])));
  r.schedule = r0.schedule.filter((v) => gate("График", LABEL.schedule[v], kw(KEYWORDS.schedule[v])));
  if (r.relocation !== null && !gate("Переезд", r.relocation ? "готов" : "не готов", kw(KEYWORDS.relocation))) r.relocation = null;
  if (r.businessTrips && !gate("Командировки", LABEL.businessTrips[r.businessTrips], kw(KEYWORDS.businessTrips))) r.businessTrips = null;
  if (r.timeToWork && !gate("Время до работы", LABEL.timeToWork[r.timeToWork], kw(KEYWORDS.timeToWork[r.timeToWork]))) r.timeToWork = null;
  if (r.specialization && !gate("Специализация", r.specialization, kw(KEYWORDS.specialization) && inText(r.specialization, text))) r.specialization = null;

  if (mixed) {
    unverified.splice(0, unverified.length, ...new Set(unverified));
    if (unverified.length) warnings.push("В документе есть изображения: часть данных распознана с них — проверьте");
  }

  return { resume: r, warnings, grounded: true, unverified };
}

// ---------- «Откуда это взято»: поиск значения в исходном тексте ----------

export type Span = { start: number; end: number };
type Tok = { w: string; start: number; end: number };

const fold = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const WORD_RE = /[\p{L}\p{N}]+/gu;
const MAX_SPAN = 200;

// слова с оригинальными смещениями — по ним и строим «карту» обратно в исходный текст
function tokens(s: string): Tok[] {
  const out: Tok[] = [];
  for (const m of s.matchAll(WORD_RE)) out.push({ w: fold(m[0]), start: m.index!, end: m.index! + m[0].length });
  return out;
}

// совпадение слов с допуском на словоформы: общий префикс не короче min(len)-2 (но ≥4)
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  if (min < 4) return false;
  let i = 0;
  while (i < min && a[i] === b[i]) i++;
  return i >= Math.max(4, min - 2);
}

const MONTH_STEMS = [
  ["январ", "jan"], ["феврал", "feb"], ["март", "mar"], ["апрел", "apr"], ["ма", "may"], ["июн", "jun"],
  ["июл", "jul"], ["август", "aug"], ["сентябр", "sep"], ["октябр", "oct"], ["ноябр", "nov"], ["декабр", "dec"],
];

function regexSpan(re: RegExp, text: string): Span | null {
  const m = re.exec(text);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

function locateDate(year: string, month: string | null, text: string): Span | null {
  const y = `(?<!\\d)${year}(?!\\d)`;
  if (month) {
    const mm = String(+month);
    const num = regexSpan(new RegExp(`(?<!\\d)0?${mm}\\s*[./-]\\s*${y}`), text);
    if (num) return num;
    const [ru, en] = MONTH_STEMS[+month - 1] ?? [];
    if (ru) {
      const named = regexSpan(new RegExp(`(?<![\\p{L}])(?:${ru}|${en})[\\p{L}]*\\.?,?\\s*${y}`, "iu"), text);
      if (named) return named;
    }
  }
  return regexSpan(new RegExp(y), text);
}

// Находит значение в исходном тексте; возвращает смещения в ОРИГИНАЛЬНОМ тексте
export function locate(value: string, text: string): Span | null {
  const v = value.trim();
  if (!v || !text) return null;

  // точное вхождение без учёта регистра на границах слов (email, ссылки, телефон как в тексте)
  const lower = text.toLowerCase();
  if (lower.length === text.length) {
    const needle = v.toLowerCase();
    const isW = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      if ((isW(needle[0]) && isW(lower[at - 1])) || (isW(needle[needle.length - 1]) && isW(lower[end]))) continue;
      return { start: at, end };
    }
  }

  // дата YYYY-MM / YYYY-MM-DD
  const d = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(v);
  if (d) return locateDate(d[1], d[2], text);

  // только цифры: год или число с разделителями тысяч («5 000»)
  if (/^\d{4,}$/.test(v)) {
    const sep = v.split("").join("[\\s.,]?");
    return regexSpan(new RegExp(`(?<![\\d])${sep}(?![\\d])`), text);
  }

  // телефон: последние 9 цифр, разделители игнорируем
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 7 && !/\p{L}/u.test(v)) {
    const want = digits.slice(-9);
    for (const m of text.matchAll(/\+?\d[\d\s().-]{5,}\d/g)) {
      if (m[0].replace(/\D/g, "").slice(-9) === want) return { start: m.index!, end: m.index! + m[0].length };
    }
    return null;
  }

  // слова: окно ≤ MAX_SPAN символов, максимум совпавших слов
  const all = [...new Set(tokens(v).map((t) => t.w))];
  const words = (all.filter((w) => w.length >= 3).length ? all.filter((w) => w.length >= 3) : all).slice(0, 40);
  if (!words.length) return null;
  const toks = tokens(text);
  const hit = toks.map((t) => words.findIndex((w) => sameWord(w, t.w)));

  let best: { score: number; weight: number; span: Span } | null = null;
  for (let i = 0; i < toks.length; i++) {
    if (hit[i] < 0) continue;
    const seen = new Set<number>();
    let weight = 0;
    let last = i;
    for (let j = i; j < toks.length && toks[j].end - toks[i].start <= MAX_SPAN; j++) {
      if (hit[j] >= 0 && !seen.has(hit[j])) {
        seen.add(hit[j]);
        weight += words[hit[j]].length;
        last = j;
      }
    }
    const span = { start: toks[i].start, end: toks[last].end };
    if (!best || seen.size > best.score || (seen.size === best.score && weight > best.weight)) best = { score: seen.size, weight, span };
  }
  return best?.span ?? null;
}
