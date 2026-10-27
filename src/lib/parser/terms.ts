// Условия работы: значения enum фиксированы (employment, schedule, businessTrips, timeToWork).
// Значение вне этого набора в схему не попадает (fullDay/shift/remote — таких записей нет).
export const EMPLOYMENT = ["full", "part", "project", "internship", "volunteer", "rotation"] as const;
export const PATTERNS = ["1/2", "1/3", "2/1", "2/2", "3/2", "3/3", "4/2", "4/3", "4/4", "5/2", "6/1"] as const;
export const SCHEDULE = ["free", "weekend", ...PATTERNS] as const;
export const TRIPS = ["ready", "none", "often", "rarely"] as const; // ready = «готов» без частоты
export const TIME_TO_WORK = ["min90", "hour1", "any"] as const;

export const LABEL = {
  employment: { full: "полная", part: "частичная", project: "проектная", internship: "стажировка", volunteer: "волонтёрство", rotation: "вахта" },
  schedule: { free: "свободный", weekend: "по выходным", ...Object.fromEntries(PATTERNS.map((p) => [p, p])) } as Record<(typeof SCHEDULE)[number], string>,
  businessTrips: { ready: "готов к командировкам", none: "без командировок", often: "частые командировки", rarely: "редкие командировки" },
  timeToWork: { min90: "не более полутора часов", hour1: "не более часа", any: "не имеет значения" },
} as const;

// Ключевые слова-подтверждения (ru / en / tg). Проверяются по исходному тексту.
const pat = (p: string) => {
  const [a, b] = p.split("/");
  return new RegExp(`(?<!\\d)${a}\\s*(?:/|-|на|в)\\s*${b}(?!\\d)`);
};
export const KEYWORDS = {
  employment: {
    full: /полн\p{L}*\s+занят|полный\s+рабоч|full[\s-]?time|бандии\s+пурра|пурра/iu,
    part: /частичн|неполн|part[\s-]?time|нопурра|ҷузъ/iu,
    project: /проектн|project|лоиҳа/iu,
    internship: /стаж[её]рск|стажировк|intern|таҷрибаомӯз/iu,
    volunteer: /волонт|volunteer|ихтиёрӣ/iu,
    rotation: /вахт|rotation|fly[\s-]?in/iu,
  },
  schedule: {
    free: /свободн|гибк|flexible|free\s+schedule|озод/iu,
    weekend: /выходн|weekend|рӯзҳои\s+истироҳат/iu,
    ...Object.fromEntries(PATTERNS.map((p) => [p, pat(p)])),
  } as Record<(typeof SCHEDULE)[number], RegExp>,
  relocation: /переезд|relocat|кӯчидан|кӯчиш|кучидан/iu,
  businessTrips: /командир|business\s+trip|travel|сафар/iu,
  timeToWork: { min90: /час|hour|минут|min|соат|дақиқа/iu, hour1: /час|hour|минут|min|соат|дақиқа/iu, any: /не\s+имеет\s+знач|не\s+важн|any|фарқ\s+надорад/iu },
  specialization: /специализац|профобласт|профессиональн\p{L}*\s+област|specializ|ихтисос/iu,
} as const;
