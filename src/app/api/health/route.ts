import { DEFAULT_MODELS } from "../../../lib/parser/structure";
import { visionOn } from "../../../lib/parser/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const env = process.env;
  const provider = env.AI_PROVIDER ?? "gemini";
  const raw = env.AI_MODELS ?? (provider === "openai" ? "gpt-4o-mini" : provider === "local" ? "" : (env.GEMINI_MODELS ?? DEFAULT_MODELS));
  const models = raw.split(",").map((m) => m.trim()).filter(Boolean);
  return Response.json({ ok: true, provider, models, vision: provider === "gemini" ? true : visionOn() }, { headers: { "Cache-Control": "no-store" } });
}
