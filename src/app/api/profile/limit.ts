import { rateLimit } from "../../../lib/service";

const WINDOW_MS = 10 * 60 * 1000;

// ponytail: лимит в памяти инстанса; свой счётчик на каждый маршрут
export function makeLimiter(def = 60) {
  const hits = new Map<string, number[]>();
  return (req: Request): boolean => {
    const LIMIT = rateLimit(def);
    if (LIMIT === 0) return false;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    const now = Date.now();
    const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    list.push(now);
    hits.set(ip, list);
    if (hits.size > 1000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
    return list.length > LIMIT;
  };
}
