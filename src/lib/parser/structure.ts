import { ParseError } from "./errors";
import type { Extracted } from "./extract";
import { LlmHttpError, makeCaller, openaiImages, visionOn, type Level } from "./providers";
import { Resume } from "./schema";

export type Stage =
  | { stage: "reading" }
  | { stage: "ai"; model: string }
  | { stage: "retry"; model: string; reason: "busy" | "quota" | "timeout" | "invalid" }
  | { stage: "done" };

export const DEFAULT_MODELS =
  "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.8-flash,gemini-3.7-flash,gemini-flash-lite-latest,gemini-flash-latest";
const COOLDOWN_QUOTA_MS = 60_000;
const COOLDOWN_SLOW_MS = 30_000;

// ponytail: per-instance память — 429 пропускаем 60 с, 503/таймаут 30 с
export const cooling = new Map<string, number>();
// модели, не поддерживающие thinkingLevel "minimal"
export const thinking = new Map<string, Level>();

const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);

// ```json ... ``` и текст вокруг JSON (локальные модели) -> объект
export function extractJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) return JSON.parse(fence[1].trim());
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new SyntaxError("no json");
}

const overloaded = () => new ParseError("llm_failed", "Сервис ИИ сейчас перегружен, попробуйте через минуту");

export async function structureResume(
  input: Extracted,
  onStage: (s: Stage) => void = () => {},
): Promise<{ resume: Resume; model: string; warnings: string[]; imagesUsed: boolean }> {
  const env = process.env;
  const provider = env.AI_PROVIDER ?? "gemini";
  const local = provider === "local";
  const compat = provider === "openai" || local;
  const apiKey = env.AI_API_KEY ?? (compat ? undefined : env.GEMINI_API_KEY) ?? "";
  if (!apiKey && !local) throw new ParseError("llm_failed", "Сервис ИИ не настроен");
  if (local && !(env.AI_MODELS ?? "").split(",").some((m) => m.trim())) {
    throw new ParseError("llm_failed", "Укажите AI_MODELS для локальной модели");
  }
  if (compat && input.kind === "images" && !visionOn()) {
    throw new ParseError("unsupported", "Изображения не поддерживаются этой моделью (AI_VISION=0)");
  }
  if (compat && input.kind === "file" && input.mimeType !== "application/pdf" && !visionOn()) {
    throw new ParseError("unsupported", "Изображения не поддерживаются этой моделью (AI_VISION=0)");
  }
  if (compat && input.kind === "file" && input.mimeType === "application/pdf") {
    throw new ParseError("unsupported", "PDF-скан не поддерживается этим ИИ-провайдером");
  }
  // не все картинки/PDF этот провайдер сможет прочитать
  const warnings: string[] = [];
  const imagesUsed = input.kind === "mixed" && (!compat || openaiImages(input).length > 0);
  if (compat && input.kind === "mixed" && openaiImages(input).length < input.parts.length) {
    warnings.push("Изображения в документе не обработаны этим ИИ-провайдером");
  }
  const call = makeCaller(provider, apiKey, input);

  const all = (env.AI_MODELS ?? (compat ? (local ? "" : "gpt-4o-mini") : (env.GEMINI_MODELS ?? DEFAULT_MODELS))).split(",").map((m) => m.trim()).filter(Boolean);
  const now = Date.now();
  const ready = all.filter((m) => (cooling.get(m) ?? 0) < now);
  const models = ready.length ? ready : all;

  const budgetMs = num(env.AI_BUDGET_MS, local ? 180_000 : 50_000);
  const modelTimeoutMs = num(env.AI_TIMEOUT_MS, local ? 120_000 : 12_000);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), budgetMs);
  try {
    for (const model of models) {
      let reason: "busy" | "quota" | "timeout" | "invalid" = "busy";
      for (let attempt = 0; attempt < 2; attempt++) {
        let text: string;
        onStage({ stage: "ai", model });
        try {
          for (;;) {
            try {
              text = await call(model, thinking.get(model) ?? "minimal", AbortSignal.any([ctrl.signal, AbortSignal.timeout(modelTimeoutMs)]));
              break;
            } catch (e) {
              // 400 про thinking level — один повтор с "low", запоминаем
              if (e instanceof LlmHttpError && e.status === 400 && /thinking/i.test(e.message) && !thinking.has(model)) {
                thinking.set(model, "low");
                continue;
              }
              throw e;
            }
          }
        } catch (e) {
          if (ctrl.signal.aborted) throw new ParseError("timeout", "Обработка заняла слишком много времени");
          const status = e instanceof LlmHttpError ? e.status : 0; // 0 — сеть/таймаут модели
          if (status === 429) cooling.set(model, Date.now() + COOLDOWN_QUOTA_MS);
          else if (status !== 404) cooling.set(model, Date.now() + COOLDOWN_SLOW_MS);
          reason = status === 429 ? "quota" : status === 0 ? "timeout" : "busy";
          console.warn("llm error", model, status);
          break; // любая ошибка вызова — сразу следующая модель
        }
        try {
          return { resume: Resume.parse(extractJson(text)), model, warnings, imagesUsed };
        } catch {
          reason = "invalid";
          console.warn("llm invalid json", model, attempt);
        }
      }
      onStage({ stage: "retry", model, reason });
    }
    throw overloaded();
  } finally {
    clearTimeout(timer);
  }
}
