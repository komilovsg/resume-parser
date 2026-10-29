import type { Resume } from "@/lib/parser";
import type { ProfileView } from "@/lib/profile/view";

// Локальные типы контракта стрима (зеркалят parser/adapters)
export type Stage =
  | { stage: "reading" }
  | { stage: "ai"; model: string }
  | { stage: "retry"; model: string; reason: "busy" | "quota" | "timeout" | "invalid" }
  | { stage: "matching" }
  | { stage: "done" };

export type Meta = { format: string; ms: number; model: string; warnings?: string[]; grounded?: boolean; unverified?: string[]; sourceText?: string | null; pages?: number };

export type Profile = {
  vc: Record<string, unknown>;
  details: unknown;
  education: unknown;
  matches: { status: "auto" | "similar" | "none"; field: string; input: string; id: number | null; name: string | null; score: number; alternatives?: { id: number; name: string; score: number }[] }[];
  missing: string[];
  view?: ProfileView; // нет у ответов старого формата
};

export type StreamLine =
  | ({ type: "stage" } & Stage)
  | { type: "result"; resume: Resume; meta: Meta; profile?: Profile }
  | { type: "error"; code: string; message: string };
