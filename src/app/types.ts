import type { Resume } from "@/lib/parser";

// Локальные типы контракта стрима (зеркалят parser)
export type Stage =
  | { stage: "reading" }
  | { stage: "ai"; model: string }
  | { stage: "retry"; model: string; reason: "busy" | "quota" | "timeout" | "invalid" }
  | { stage: "done" };

export type Meta = { format: string; ms: number; model: string; warnings?: string[]; grounded?: boolean; unverified?: string[]; sourceText?: string | null; pages?: number };

export type StreamLine =
  | ({ type: "stage" } & Stage)
  | { type: "result"; resume: Resume; meta: Meta }
  | { type: "error"; code: string; message: string };
