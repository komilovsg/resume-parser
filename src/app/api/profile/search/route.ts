import { loadDict } from "../../../../lib/profile/dict";
import { alternatives, best, buildIndex, fold, normalize, type Index } from "../../../../lib/profile/match";
import { checkAuth, fail } from "../../../../lib/service";
import { makeLimiter } from "../limit";

export const runtime = "nodejs";

const limited = makeLimiter(240);
const TYPES = ["position", "skill", "region", "specialization"] as const;
type Type = (typeof TYPES)[number];
const KEY = { position: "positions", skill: "skills", region: "regions", specialization: "specializations" } as const;
const MAX = 10;

type Row = { id: number; name: string; parent?: string; country?: string };
const cache = new WeakMap<object, Index>();
const indexOf = (rows: Row[], region: boolean) => {
  let i = cache.get(rows);
  if (!i) cache.set(rows, (i = buildIndex(rows, region)));
  return i;
};

// Подсказки для поля с автодополнением: сначала вхождения (с начала названия — выше), затем нечёткие совпадения матчера
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  if (limited(req)) return fail(429, "rate_limited", "Слишком много запросов, попробуйте через несколько минут");
  const u = new URL(req.url);
  const type = u.searchParams.get("type") as Type | null;
  const q = (u.searchParams.get("q") ?? "").trim();
  if (!type || !TYPES.includes(type)) return fail(400, "bad_request", "Параметр type: position, skill, region или specialization");
  if (!q || q.length > 100) return fail(400, "bad_request", "Параметр q: от 1 до 100 символов");

  const dict = await loadDict();
  if (!dict) return fail(503, "no_dictionaries", "Справочники не настроены (PROFILE_DICT_URL)");
  try {
    const rows = dict[KEY[type]] as Row[];
    const region = type === "region";
    const index = indexOf(rows, region);
    const nq = normalize(q, region);
    const fq = fold(nq);
    const toks = fq.split(" ").filter(Boolean);

    const out: { id: number; name: string }[] = [];
    const seen = new Set<string>();
    const push = (id: number, name: string) => {
      const k = fold(normalize(name, region));
      if (out.length >= MAX || seen.has(k)) return;
      seen.add(k);
      out.push({ id, name });
    };

    if (toks.length) {
      const hits: { id: number; name: string; rank: number; len: number }[] = [];
      for (const e of index) {
        if (!toks.every((t) => e.fold.includes(t))) continue;
        const rank = e.fold.startsWith(fq) ? 0 : e.fold.split(" ").some((w) => w.startsWith(toks[0])) ? 1 : 2;
        hits.push({ id: e.id, name: e.name, rank, len: e.fold.length });
      }
      hits.sort((a, b) => a.rank - b.rank || a.len - b.len || a.id - b.id).forEach((h) => push(h.id, h.name));
    }
    // нечёткие: опечатки и транслит («Dushanbe»)
    if (out.length < MAX && nq.length >= 3) {
      const h = best(q, index, region ? { min: 0.6, auto: 0.92, region: true } : { min: 0.6, auto: 0.92 });
      if (h) push(h.id, h.name);
      for (const a of alternatives(q, index, { region }, h?.id)) push(a.id, a.name);
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = out.map((o) => {
      const r = byId.get(o.id);
      const hint = type === "specialization" ? r?.parent : type === "region" ? r?.country : undefined;
      return hint ? { ...o, hint } : o;
    });
    return Response.json({ type, items }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch {
    return fail(500, "internal", "Не удалось выполнить поиск");
  }
}
