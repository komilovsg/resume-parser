// Нечёткий поиск по справочникам: нормализация + триграммы Dice.
export type Item = { id: number; name: string };
export type Status = "auto" | "similar" | "none";
export type Hit = { id: number; name: string; score: number; status: Status };
export type Opts = { min: number; auto: number; region?: boolean; guard?: boolean; strictSubset?: boolean };

// Уровни/роли: синонимы сводятся к одному значению; конфликт значений = кандидат отвергается
const SEN: Record<string, string> = {
  junior: "junior", младший: "junior", middle: "middle", senior: "senior", старший: "senior",
  lead: "lead", ведущий: "lead", head: "head", chief: "head", главный: "head",
  intern: "intern", trainee: "intern", стажер: "intern", руководитель: "руководитель",
  начальник: "начальник", заместитель: "заместитель", помощник: "помощник", ассистент: "помощник",
};
export const senOf = (toks: Iterable<string>) => {
  const s = new Set<string>();
  for (const t of toks) if (SEN[t]) s.add(SEN[t]);
  return s;
};
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
// лишние уточнения в названии: « - », «/», скобки, запятая, «в городе», «в стартап»
const QUAL = /[()\/,]| - |\bв городе\b|\bв стартап/i;

// Транслит-алиасы целых слов (латиница -> кириллица справочника)
const ALIAS: Record<string, string> = {
  dushanbe: "душанбе", dushanbé: "душанбе", khujand: "худжанд", khudjand: "худжанд",
  hujand: "худжанд", khojand: "худжанд", bokhtar: "бохтар", bohtar: "бохтар",
  kulob: "куляб", kulyab: "куляб", khorog: "хорог", tashkent: "ташкент",
  moscow: "москва", dubai: "дубай", istaravshan: "истаравшан", panjakent: "пенджикент",
  penjikent: "пенджикент", tursunzoda: "турсунзаде", vahdat: "вахдат",
};
const NOISE = new Set(["г", "город", "гор", "city", "республика", "таджикистан", "tajikistan"]);

export function normalize(s: string, region = false): string {
  const t = s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    // латинская c рядом с цифрой — это кириллическая «С» (1C)
    .map((w) => (/\d/.test(w) ? w.replace(/c/g, "с") : w))
    .map((w) => ALIAS[w] ?? w);
  return (region ? t.filter((w) => !NOISE.has(w)) : t).join(" ");
}

// Свёртка для сравнения «на глаз»: э/е, й/и и латинские двойники кириллицы считаются равными
const LOOK: Record<string, string> = { э: "е", й: "и", a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", k: "к", m: "м", t: "т", h: "н", b: "в" };
export const fold = (s: string) => s.replace(/[эйacеopxkmthb]/g, (c) => LOOK[c] ?? c);

function lev(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < min) min = cur[j];
    }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const grams = (s: string) => {
  const p = ` ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
  return out;
};

type Entry = Item & { sen: Set<string>; norm: string; fold: string; toks: Set<string>; sorted: string; g: Set<string> };

export type Index = Entry[];

export function buildIndex(items: Item[], region = false): Entry[] {
  return items.map((it) => {
    const norm = normalize(it.name, region);
    const toks = new Set(norm.split(" "));
    return { ...it, sen: senOf(toks), norm, fold: fold(norm), toks, sorted: [...toks].sort().join(" "), g: grams(norm) };
  });
}

function score(q: string, qt: Set<string>, qg: Set<string>, e: Entry): number {
  if (q === e.norm) return 1;
  if ([...qt].sort().join(" ") === e.sorted) return 0.99; // тот же набор слов
  let inter = 0;
  for (const x of qg) if (e.g.has(x)) inter++;
  let s = (2 * inter) / (qg.size + e.g.size || 1);
  if ([...qt].every((t) => e.toks.has(t))) s += 0.1;
  return Math.min(s, 0.99);
}

function run(query: string, index: Entry[], o: Opts, ok: (e: Entry) => boolean): Hit | null {
  const q = normalize(query, o.region);
  if (!q) return null;
  const qt = new Set(q.split(" "));
  const qg = grams(q);
  const qual = QUAL.test(query);
  const scored: (Hit & { len: number })[] = [];
  let max = 0;
  for (const e of index) {
    if (!ok(e)) continue;
    if (o.guard && !qual && (QUAL.test(e.name) || e.toks.size > qt.size + 2)) continue;
    const s = score(q, qt, qg, e);
    if (s < o.min) continue;
    // запрос — собственное подмножество слов названия («Version Control» ⊂ «Data Version Control»): это догадка, не совпадение
    const sub = !!o.strictSubset && qt.size < e.toks.size && [...qt].every((t) => e.toks.has(t));
    scored.push({ id: e.id, name: e.name, score: s, len: e.norm.length, status: sub ? "similar" : "none" });
    if (s > max) max = s;
  }
  const p = scored.filter((c) => c.score >= max - 0.02).sort((a, b) => a.len - b.len || a.id - b.id)[0];
  return p && { id: p.id, name: p.name, score: p.score, status: p.status !== "similar" && p.score >= o.auto ? "auto" : "similar" };
}

/** Лучший кандидат >= min; auto только при score >= auto и без конфликта уровня. Среди близких (0.02): кратчайшее имя, затем меньший id. */
export function best(query: string, index: Entry[], o: Opts): Hit | null {
  // для регионов пробуем и всю строку, и части по запятой («Душанбе, Таджикистан»)
  const variants = o.region ? [query, ...query.split(",")] : [query];
  // полное совпадение после нормализации всегда побеждает: любой путь, дубли — наименьший id
  for (const v of variants) {
    const q = fold(normalize(v, o.region));
    const e = q ? index.filter((x) => x.fold === q).sort((a, b) => a.id - b.id)[0] : undefined;
    if (e) return { id: e.id, name: e.name, score: 1, status: "auto" };
  }
  // очевидная опечатка: расстояние <=1 (<=2 при длине >=10), единственный такой кандидат в радиусе 2
  for (const v of variants) {
    const nv = normalize(v, o.region);
    const q = fold(nv);
    if (q.length < 5) continue;
    const lim = q.length >= 10 ? 2 : 1;
    const near = new Map<string, { d: number; e: Entry }>();
    for (const e of index) {
      const d = lev(q, e.fold, 2);
      if (d > 2) continue;
      const cur = near.get(e.fold);
      if (!cur || e.id < cur.e.id) near.set(e.fold, { d, e });
    }
    if (near.size !== 1) continue;
    const { d, e } = [...near.values()][0];
    // уровень не подменяем: должность с другим senior/junior — только подсказка
    if (d <= lim && (!o.guard || sameSet(e.sen, senOf(nv.split(" "))))) return { id: e.id, name: e.name, score: 0.97, status: "auto" };
  }
  let top: Hit | null = null;
  for (const v of variants) {
    let h: Hit | null;
    if (!o.guard) h = run(v, index, o, () => true);
    else {
      const qs = senOf(normalize(v).split(" "));
      h = run(v, index, o, (e) => sameSet(e.sen, qs));
      // нет кандидата с тем же уровнем: ищем по названию без уровня среди «нейтральных», автоподбор с пометкой
      if (!h && qs.size) {
        const stripped = normalize(v).split(" ").filter((t) => !SEN[t]).join(" ");
        h = run(stripped, index, o, (e) => e.sen.size === 0);
        if (h) h.status = "similar";
      }
    }
    if (h && (!top || h.score > top.score)) top = h;
  }
  return top;
}

export type Alt = { id: number; name: string; score: number };

/** До 3 ближайших записей справочника (по триграммам, без защиты уровня) — для ручной замены автоподбора. */
export function alternatives(query: string, index: Entry[], o: Pick<Opts, "region">, exclude?: number): Alt[] {
  const variants = o.region ? [query, ...query.split(",")] : [query];
  const byId = new Map<number, Alt>();
  for (const v of variants) {
    const q = normalize(v, o.region);
    if (!q) continue;
    const qt = new Set(q.split(" "));
    const qg = grams(q);
    for (const e of index) {
      if (e.id === exclude) continue;
      const s = score(q, qt, qg, e);
      if (s < 0.3) continue;
      const cur = byId.get(e.id);
      if (!cur || s > cur.score) byId.set(e.id, { id: e.id, name: e.name, score: +s.toFixed(3) });
    }
  }
  const seen = new Set<string>(); // дубли с одинаковым названием показываем один раз (меньший id)
  const out: Alt[] = [];
  for (const x of [...byId.values()].sort((a, b) => b.score - a.score || a.id - b.id)) {
    const n = normalize(x.name, o.region);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(x);
  }
  return out.slice(0, 3);
}
