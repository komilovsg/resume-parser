export type ProgressKind = "compress" | "upload" | "reading" | "ai" | "retry" | "matching" | "done";

const ease = (ms: number, tau: number) => 1 - Math.exp(-ms / tau);

// целевой процент 0..100; uploadFrac — реальная доля отправленных байт, stageMs — время в текущей стадии, aiMs — время с первого ai
export function target(kind: ProgressKind, uploadFrac: number, stageMs: number, aiMs: number): number {
  switch (kind) {
    case "compress": return 4.9 * ease(stageMs, 1500);
    case "upload": return 15 * Math.min(1, Math.max(0, uploadFrac)) + (uploadFrac >= 1 ? 2 * ease(stageMs, 3000) : 0);
    case "reading": return 15 + 9 * ease(stageMs, 2000);
    case "ai":
    case "retry": return Math.min(88, 25 + 65 * ease(aiMs, 8000));
    case "matching": return 90 + 8.9 * ease(stageMs, 2000);
    default: return 100;
  }
}
