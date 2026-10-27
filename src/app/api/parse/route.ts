import { MAX_FILE_SIZE, MAX_IMAGES, ParseError, parseResume, parseResumeImages, type Stage } from "../../../lib/parser";
import { checkAuth, fail, rateLimit } from "../../../lib/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const WINDOW_MS = 10 * 60 * 1000;
// ponytail: лимит в памяти инстанса; при злоупотреблении — Upstash/Vercel KV
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const LIMIT = rateLimit(10);
  if (LIMIT === 0) return false;
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 1000) for (const [k, v] of hits) if (now - v[v.length - 1] >= WINDOW_MS) hits.delete(k);
  return list.length > LIMIT;
}

const STATUS: Record<string, number> = { unsupported: 415, too_large: 413, empty: 422, zip_bomb: 422, timeout: 504, llm_failed: 502 };

export async function POST(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  const json = new URL(req.url).searchParams.get("stream") === "0" || (req.headers.get("accept") ?? "").includes("application/json");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(ip)) return fail(429, "rate_limited", "Слишком много запросов, попробуйте через несколько минут");

  // с запасом на multipart-обёртку
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_SIZE + 100_000) {
    return fail(413, "too_large", "Файл больше 10 МБ");
  }

  const t0 = Date.now();
  let files: File[];
  try {
    files = (await req.formData()).getAll("file").filter((f): f is File => f instanceof File);
  } catch {
    return fail(400, "bad_request", "Не удалось прочитать запрос");
  }
  if (!files.length) return fail(400, "bad_request", "Файл не передан");
  if (files.length > MAX_IMAGES) return fail(413, "too_large", `Не больше ${MAX_IMAGES} фото`);
  const size = files.reduce((n, f) => n + f.size, 0);
  if (size > MAX_FILE_SIZE) return fail(413, "too_large", "Файл больше 10 МБ");

  // один файл — как раньше; несколько — только фото (проверка по сигнатуре в parseResumeImages)
  const run = async (onStage?: (s: Stage) => void) => {
    const bufs = await Promise.all(files.map(async (f) => ({ buf: Buffer.from(await f.arrayBuffer()), filename: f.name })));
    return bufs.length === 1 ? parseResume(bufs[0].buf, bufs[0].filename, { onStage }) : parseResumeImages(bufs, { onStage });
  };

  if (json) {
    try {
      const { resume, meta } = await run();
      console.log(JSON.stringify({ format: meta.format, size, ms: meta.ms, model: meta.model }));
      return Response.json({ resume, meta }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ParseError) {
        console.log(JSON.stringify({ size, ms: Date.now() - t0, error: e.code }));
        return fail(STATUS[e.code] ?? 422, e.code, e.message);
      }
      console.log(JSON.stringify({ size, ms: Date.now() - t0, error: "internal" }));
      return fail(500, "internal", "Что-то пошло не так, попробуйте ещё раз");
    }
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => {
        try {
          ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch {}
      };
      try {
        const { resume, meta } = await run((s) => send({ type: "stage", ...s }));
          console.log(JSON.stringify({ format: meta.format, size, ms: meta.ms, model: meta.model }));
        send({ type: "stage", stage: "done" });
        send({ type: "result", resume, meta });
      } catch (e) {
        if (e instanceof ParseError) {
          console.log(JSON.stringify({ size, ms: Date.now() - t0, error: e.code }));
          send({ type: "error", code: e.code, message: e.message });
        } else {
          console.log(JSON.stringify({ size, ms: Date.now() - t0, error: "internal" }));
          send({ type: "error", code: "internal", message: "Что-то пошло не так, попробуйте ещё раз" });
        }
      } finally {
        try {
          ctrl.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
