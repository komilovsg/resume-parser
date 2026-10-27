import { ParseError } from "./errors";
import { detectAndExtract, sniffImage, type Extracted } from "./extract";
import type { Resume } from "./schema";
import { MAX_IMAGES } from "./images";
import { structureResume, type Stage } from "./structure";
import { verifyResume } from "./verify";

export { ParseError } from "./errors";
export { MAX_IMAGES };
export { Resume, resumeJsonSchema } from "./schema";
export type { Stage } from "./structure";

// тот же лимит, что уходит в ИИ (providers.ts)
const MAX_SOURCE_TEXT = 100_000;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

type Result = { resume: Resume; meta: { format: string; ms: number; model: string; warnings: string[]; grounded: boolean; unverified: string[]; sourceText: string | null; pages?: number } };
type Opts = { onStage?: (s: Stage) => void };

export async function parseResume(buf: Buffer, filename: string, opts: Opts = {}): Promise<Result> {
  if (buf.length > MAX_FILE_SIZE) throw new ParseError("too_large", "Файл больше 10 МБ");
  return run(opts, () => detectAndExtract(buf, filename));
}

// Несколько фото = страницы одного резюме (по порядку)
export async function parseResumeImages(files: { buf: Buffer; filename: string }[], opts: Opts = {}): Promise<Result> {
  if (files.length > MAX_IMAGES) throw new ParseError("unsupported", `Не больше ${MAX_IMAGES} фото`);
  if (files.reduce((n, f) => n + f.buf.length, 0) > MAX_FILE_SIZE) throw new ParseError("too_large", "Файлы больше 10 МБ");
  return run(opts, async () => {
    const parts = files.map((f) => {
      const img = sniffImage(f.buf);
      if (!img) throw new ParseError("unsupported", "Несколько файлов можно только фото");
      return { mimeType: img.mimeType, data: f.buf };
    });
    return { kind: "images", parts, format: "images" } as Extracted;
  }, files.length);
}

async function run(opts: Opts, extract: () => Promise<Extracted>, pages?: number): Promise<Result> {
  const emit = opts.onStage ?? (() => {});
  const t0 = Date.now();
  emit({ stage: "reading" });
  const extracted = await extract();
  const { resume, model, warnings: aiWarnings, imagesUsed } = await structureResume(extracted, emit);
  const mixed = extracted.kind === "mixed" && imagesUsed;
  // mixed без картинок для ИИ (провайдер не умеет) — то же, что обычный текст
  const text = extracted.kind === "text" || extracted.kind === "mixed" ? extracted.text : null;
  const { resume: checked, warnings, grounded, unverified } = verifyResume(resume, text, mixed);
  const extra = [...(extracted.kind === "mixed" ? (extracted.warnings ?? []) : []), ...aiWarnings];
  emit({ stage: "done" });
  return {
    resume: checked,
    meta: {
      format: extracted.format,
      ms: Date.now() - t0,
      model,
      warnings: [...warnings, ...extra],
      grounded,
      unverified,
      sourceText: text === null ? null : text.slice(0, MAX_SOURCE_TEXT),
      ...(pages ? { pages } : {}),
    },
  };
}
