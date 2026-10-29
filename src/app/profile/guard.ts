import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadDict } from "../../lib/profile/dict";
import { serviceMode } from "../../lib/service";

// Демо-страницы анкеты в режиме сервиса не существуют (как и главная)
export async function guard() {
  await connection(); // SERVICE_MODE читается в рантайме, не при сборке
  if (serviceMode()) notFound();
}

// Без настроенных справочников (PROFILE_DICT_URL) страницы анкеты показывают заглушку
export async function hasDict() {
  return !!(await loadDict());
}
