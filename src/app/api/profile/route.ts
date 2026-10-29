import { Resume } from "../../../lib/parser/schema";
import { toProfile } from "../../../lib/profile";
import { loadDict } from "../../../lib/profile/dict";
import { checkAuth, fail, rateLimit } from "../../../lib/service";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY = 200_000;
// ponytail: лимит в памяти инстанса (отдельный от /api/parse)
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const LIMIT = rateLimit(60);
  if (LIMIT === 0) return false;
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 1000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return list.length > LIMIT;
}

// Пересчёт сопоставления со справочниками для отредактированного резюме
export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) return fail(429, "rate_limited", "Слишком много запросов, попробуйте через несколько минут");

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return fail(413, "too_large", "Слишком большой запрос");
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return fail(400, "bad_request", "Не удалось прочитать запрос");
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY) return fail(413, "too_large", "Слишком большой запрос");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request", "Некорректный JSON");
  }
  const parsed = Resume.safeParse((body as { resume?: unknown } | null)?.resume);
  if (!parsed.success) return fail(400, "bad_request", "Некорректное резюме");

  const dict = await loadDict();
  if (!dict) return fail(503, "no_dictionaries", "Справочники не настроены (PROFILE_DICT_URL)");
  try {
    return Response.json(toProfile(parsed.data, dict), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(500, "internal", "Не удалось обновить сопоставление");
  }
}
