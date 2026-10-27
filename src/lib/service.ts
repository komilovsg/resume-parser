import { timingSafeEqual } from "node:crypto";

export const serviceMode = () => process.env.SERVICE_MODE === "1";

export function fail(status: number, code: string, message: string, headers: Record<string, string> = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// SERVICE_TOKEN задан -> нужен Authorization: Bearer <token>; null = доступ разрешён
export function checkAuth(req: Request): Response | null {
  const token = process.env.SERVICE_TOKEN;
  if (!token) return null;
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "");
  const a = Buffer.from(m?.[1] ?? "");
  const b = Buffer.from(token);
  if (m && a.length === b.length && timingSafeEqual(a, b)) return null;
  return fail(401, "unauthorized", "Нужен корректный Authorization: Bearer токен", { "WWW-Authenticate": "Bearer" });
}

// RATE_LIMIT — запросов за 10 минут с IP; 0 — без лимита
export function rateLimit(def: number): number {
  const v = process.env.RATE_LIMIT;
  return v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : def;
}
