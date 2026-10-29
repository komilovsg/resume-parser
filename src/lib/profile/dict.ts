import { readFile } from "node:fs/promises";

type Row = { id: number; name: string };
type Coded = Row & { code: string };

export type Dict = {
  positions: Row[];
  regions: (Row & { country: string })[];
  specializations: (Row & { parent: string })[];
  skills: Row[];
  currencies: Coded[];
  educationLevels: Coded[];
  employment: Coded[];
  workSchedule: Coded[];
  salaryPeriod: Coded[];
  driverLicense: Coded[];
  businessTrips: Coded[];
  timeToWork: Coded[];
  reasonableAdjustment: Coded[];
};

const TTL = 60 * 60 * 1000;
const FAIL_TTL = 60 * 1000;
const TIMEOUT = 8000;
const REQUIRED = ["skills", "positions", "regions", "specializations"] as const;

function valid(d: unknown): d is Dict {
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  return REQUIRED.every((k) => {
    const rows = o[k];
    return Array.isArray(rows) && rows.every((r) => r && typeof r.id === "number" && typeof r.name === "string");
  });
}

const warned = new Set<string>();
const warnOnce = (why: string) => {
  if (warned.has(why)) return;
  warned.add(why);
  console.warn(`[profile] справочники недоступны: ${why}`);
};

let cache: { at: number; ttl: number; dict: Dict | null } | undefined;
let inflight: Promise<Dict | null> | undefined;

async function read(src: string): Promise<unknown> {
  if (/^https?:\/\//i.test(src)) {
    const token = process.env.PROFILE_DICT_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    const res = await fetch(src, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(TIMEOUT),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(await readFile(src, "utf8"));
}

async function build(): Promise<Dict | null> {
  const src = process.env.PROFILE_DICT_URL?.trim();
  if (!src) return null;
  let dict: Dict | null = null;
  try {
    const raw = await read(src);
    if (valid(raw)) dict = raw;
    else warnOnce("неверный формат");
  } catch (e) {
    // текст ошибки без адреса и токена
    warnOnce(e instanceof Error && /^HTTP \d+$/.test(e.message) ? e.message : "ошибка загрузки");
  }
  cache = { at: Date.now(), ttl: dict ? TTL : FAIL_TTL, dict };
  return dict;
}

/** Справочники из PROFILE_DICT_URL (http(s) или путь к файлу). Не задано или сбой -> null. Не бросает. */
export async function loadDict(): Promise<Dict | null> {
  try {
    if (!process.env.PROFILE_DICT_URL?.trim()) return null;
    if (cache && Date.now() - cache.at < cache.ttl) return cache.dict;
    return await (inflight ??= build().finally(() => (inflight = undefined)));
  } catch {
    return null;
  }
}

/** Только для тестов */
export function resetDictCache() {
  cache = undefined;
  inflight = undefined;
  warned.clear();
}
