import { loadDict } from "../../../../lib/profile/dict";
import { checkAuth, fail } from "../../../../lib/service";
import { makeLimiter } from "../limit";

export const runtime = "nodejs";

const limited = makeLimiter(120);

// Небольшие справочники для формы редактирования (демо). Только чтение.
export async function GET(req: Request) {
  const denied = checkAuth(req);
  if (denied) return denied;
  if (limited(req)) return fail(429, "rate_limited", "Слишком много запросов, попробуйте через несколько минут");
  const d = await loadDict();
  if (!d) return fail(503, "no_dictionaries", "Справочники не настроены (PROFILE_DICT_URL)");
  try {
    const body = {
      employment: d.employment,
      workSchedule: d.workSchedule,
      // в справочнике опечатка «полутрочасов»
      timeToWork: d.timeToWork.map((t) => ({ ...t, name: t.name.replace("полутрочасов", "полутора часов") })),
      businessTrips: d.businessTrips,
      currencies: d.currencies,
      salaryPeriod: d.salaryPeriod,
      regions: d.regions.map((r) => ({ id: r.id, name: r.name })),
      specializations: d.specializations.map((s) => ({ id: s.id, name: s.name, parent: s.parent })),
    };
    return Response.json(body, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return fail(500, "internal", "Не удалось загрузить справочники");
  }
}
