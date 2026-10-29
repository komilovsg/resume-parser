import { describe, expect, it } from "vitest";
import type { Resume } from "../parser/schema";
import { fixture as dict } from "./fixture.test-dict";
import { toProfile as toProfileWith } from "./index";
import { best, buildIndex, fold, normalize } from "./match";
import { fmtMonths, totalMonths } from "./view";

const base: Resume = {
  fullName: null, desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null,
  salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};
const toProfile = (x: Resume) => toProfileWith(x, dict);
const pid = (list: { id: number; name: string }[], n: string) => list.find((x) => x.name === n)!.id;
const r = (p: Partial<Resume>): Resume => ({ ...base, ...p });
const pos = (id: number | null) => dict.positions.find((p) => p.id === id)?.name;

describe("toProfile", () => {
  it("frontend", () => {
    const y = toProfile(r({ desiredPosition: "Frontend-разработчик" }));
    expect(pos(y.vc.position_id)).toMatch(/frontend/i);
    expect(y.vc.status).toBe(0);
  });
  it("1С канон", () => {
    // точное имя побеждает перестановку слов
    expect(toProfile(r({ desiredPosition: "Программист 1С" })).vc.position_id).toBe(pid(dict.positions, "Программист 1С"));
    expect(toProfile(r({ desiredPosition: "1С программист" })).vc.position_id).toBe(pid(dict.positions, "1С программист"));
  });
  it("уровень: не подставляем чужой", () => {
    const m = toProfile(r({ desiredPosition: "Senior Frontend Developer" }));
    const h = m.matches[0];
    expect(h.status).toBe("similar");
    expect(h.name).toBe("Frontend developer");
    expect(m.vc.position_id).toBe(h.id); // автоподбор попадает в payload
    expect(m.missing.join()).toContain("«Senior Frontend Developer» подобрана как «Frontend developer» — уровень в справочнике не указан");
    expect(m.missing.join()).not.toContain("подтвердите");
    const k = toProfile(r({ desiredPosition: "Старший кассир" }));
    expect(k.matches[0].status).not.toBe("auto");
    expect(toProfile(r({ desiredPosition: "Водитель категории B" })).matches[0].status).not.toBe("auto");
    const b = toProfile(r({ desiredPosition: "Бухгалтер" }));
    expect(b.matches[0].status).toBe("auto");
    expect(b.vc.position_id).toBe(Math.min(...dict.positions.filter((x) => x.name === "Бухгалтер").map((x) => x.id)));
  });
  it("неизвестная должность", () => {
    const y = toProfile(r({ desiredPosition: "qwertyuiop zxcvb" }));
    expect(y.vc.position_id).toBeNull();
    expect(y.missing.join()).toContain("«qwertyuiop zxcvb» нет в справочнике должностей — поле останется пустым");
    expect(y.matches[0].status).toBe("none");
  });
  it("similar идёт в payload, none — нет; alternatives ≤3 по убыванию", () => {
    const y = toProfile(r({ skills: ["Version Control", "Ниндзя-код"] }));
    const [a, b] = y.matches;
    expect(a.status).toBe("similar");
    expect(y.vc.skills).toEqual([a.id]);
    expect(y.missing.join()).not.toContain("Version Control");
    expect(b.status).toBe("none");
    expect(y.missing.join()).toContain("«Ниндзя-код»");
    for (const m of y.matches.filter((x) => x.alternatives)) {
      expect(m.alternatives!.length).toBeLessThanOrEqual(3);
      expect(m.alternatives!.map((x) => x.score)).toEqual([...m.alternatives!.map((x) => x.score)].sort((p, q) => q - p));
      expect(m.alternatives!.some((x) => x.id === m.id)).toBe(false);
    }
    expect(a.alternatives?.length).toBeGreaterThan(0);
  });
  it("регионы", () => {
    for (const c of ["Dushanbe", "г. Душанбе", "Душанбе, Таджикистан"])
      expect(toProfile(r({ contacts: { ...base.contacts, city: c } })).vc.region_id).toBe(pid(dict.regions, "Душанбе"));
    expect(toProfile(r({ contacts: { ...base.contacts, city: "Khujand" } })).vc.region_id).toBe(pid(dict.regions, "Худжанд"));
  });
  it("навыки", () => {
    const y = toProfile(r({ skills: ["JavaScript", "React", "Несуществующий навык xyz"] }));
    expect(y.vc.skills).toEqual([pid(dict.skills, "JavaScript"), pid(dict.skills, "React")]);
    expect(y.matches.filter((m) => m.field === "skill" && m.id === null)).toHaveLength(1);
  });
  it("опыт и даты", () => {
    const e = { company: "A", position: "Dev", city: null, description: null };
    const y = toProfile(r({ experience: [
      { ...e, startDate: "2020-03", endDate: null, current: true },
      { ...e, startDate: "2018-01", endDate: "2020-02", current: false },
    ], education: [{ institution: "ТТУ", degree: "Бакалавр", field: null, startYear: 2014, endYear: 2018 }] }));
    expect(y.details[0]).toMatchObject({ start_date: "2020-03-01", end_date: null, sign_cw: 1 });
    expect(y.details[1]).toMatchObject({ end_date: "2020-02-01", sign_cw: 0 });
    expect(y.education[0]).toMatchObject({ level_id: pid(dict.educationLevels, "Бакалавр"), start_date: "2014-01-01", date_end: "2018-01-01" });
  });
  it("валюта и период", () => {
    const y = toProfile(r({ salary: { from: 500, to: null, currency: "USD", period: "month" } }));
    expect(y.vc.currency_id).toBe(pid(dict.currencies, "US Dollar"));
    expect(y.vc.salary_period).toBe(pid(dict.salaryPeriod, "Месяц"));
    expect(toProfile(r({})).vc.currency_id).toBe(pid(dict.currencies, "Tajikistani Somoni"));
  });
  it("быстро", () => {
    const t = performance.now();
    toProfile(r({ desiredPosition: "Бухгалтер", skills: Array(20).fill("Python") }));
    toProfile(r({ desiredPosition: "Бухгалтер", skills: ["Excel", "SQL", "Docker", "Git", "Figma"] }));
    expect(performance.now() - t).toBeLessThan(500);
  });
});

describe("точное совпадение должности", () => {
  const dups = new Map<string, number[]>();
  for (const p of dict.positions) {
    const k = normalize(p.name);
    dups.set(k, [...(dups.get(k) ?? []), p.id]);
  }
  const lowest = (name: string) => Math.min(...dups.get(normalize(name))!);
  const names = [
    "Backend-разработчик", "Frontend-разработчик", "Программист", "Специалист", "Инженер",
    "Ведущий специалист", "Старший специалист", "Младший специалист", "Главный бухгалтер",
    "Frontend Junior", "Middle Backend-разработчик", "Android-разработчик - Junior/Middle",
    "Backend-разработчик (Junior+/Middle) в Компания Альфа", "Frontend (Junior)",
  ];
  for (const n of names)
    it(n, () => {
      expect(dict.positions.some((p) => p.name === n)).toBe(true);
      const m = toProfile(r({ desiredPosition: n })).matches[0];
      expect(m).toMatchObject({ status: "auto", score: 1, id: lowest(n) });
    });
  it("дубли: наименьший id", () => {
    expect(toProfile(r({ desiredPosition: "Специалист" })).vc.position_id).toBe(Math.min(...dict.positions.filter((x) => x.name === "Специалист").map((x) => x.id)));
  });
  it("точное имя не уступает перестановке слов (tie-window)", () => {
    for (const n of ["Full-stack/Back-end разработчик", "golang backend developer", "Кассир-бухгалтер", "PHP разработчик (Middle)"]) {
      const m = toProfile(r({ desiredPosition: n })).matches[0];
      expect(m.status).toBe("auto");
      expect(normalize(m.name!)).toBe(normalize(n));
    }
  });
  it("весь справочник: своё имя -> auto и то же имя", () => {
    const idx = buildIndex(dict.positions);
    for (const p of dict.positions) {
      const h = best(p.name, idx, { min: 0.6, auto: 0.92, guard: true })!;
      expect(h.status).toBe("auto");
      expect(fold(normalize(h.name))).toBe(fold(normalize(p.name)));
    }
  });
});

describe("слабые навыки", () => {
  it("«Git (version control)» не предлагает Data Version Control", () => {
    // скобки и запятая теперь разбираются: остаётся точный «Git», а «version control» — не auto
    const g = toProfile(r({ skills: ["Git (version control)", "Git, version control"] }));
    expect(g.matches.map((m) => [m.input, m.status, m.name])).toEqual([["Git (version control)", "auto", "Git"], ["version control", "similar", "Data Version Control"]]);
    for (const s of ["Version Controls", "Data Control", "Version control systems"]) {
      const m = toProfile(r({ skills: [s] })).matches[0];
      expect(m.status).toBe("none");
      expect(m.name).toBeNull();
    }
  });
  it("часть названия — similar, не auto", () => {
    const y = toProfile(r({ skills: ["Version Control"] }));
    expect(y.matches[0].status).toBe("similar");
  });
  it("«Data Version» (0.85) остаётся similar", () => {
    expect(toProfile(r({ skills: ["Data Version"] })).matches[0].status).toBe("similar");
  });
});

describe("тексты уведомлений", () => {
  it("называют значение из резюме", () => {
    const y = toProfile(r({ desiredPosition: "Senior Frontend Developer", contacts: { ...base.contacts, city: "Qwertyuiop" } }));
    expect(y.missing.join("|")).toContain("«Senior Frontend Developer»");
    expect(y.missing.join("|")).toContain("Город «Qwertyuiop» нет в справочнике");
  });
});

describe("опечатки", () => {
  const city = (c: string) => toProfile(r({ contacts: { ...base.contacts, city: c } }));
  it("«Душанбэ» -> Душанбе auto", () => {
    const y = city("Душанбэ");
    expect(y.matches[0].status).toBe("auto");
    expect(y.vc.region_id).toBe(pid(dict.regions, "Душанбе"));
    expect(y.missing.join("|")).not.toContain("Город");
  });
  it("латинские двойники и э/е", () => {
    expect(normalize("Душанбэ")).not.toBe(normalize("Душанбе")); // свёртка только для сравнения
    expect(toProfile(r({ skills: ["Рython"] })).vc.skills).toEqual([toProfile(r({ skills: ["Python"] })).vc.skills![0]]);
  });
  it("одна опечатка в навыке и должности -> auto", () => {
    expect(toProfile(r({ skills: ["Javascrip"] })).vc.skills).toEqual([pid(dict.skills, "JavaScript")]);
    const y = toProfile(r({ desiredPosition: "Программст" }));
    expect(y.matches[0]).toMatchObject({ status: "auto", name: "Программист" });
  });
  it("два разных кандидата в радиусе 2 -> не auto", () => {
    // Blacklist / Blocklist — оба в справочнике, «Blicklist» на расстоянии 1 от обоих
    const m = toProfile(r({ skills: ["Blicklist"] })).matches[0];
    expect(m.status).not.toBe("auto");
  });
  it("уровень не подменяется опечаткой", () => {
    const y = toProfile(r({ desiredPosition: "Старший программст" }));
    expect(y.matches[0].status).not.toBe("auto");
  });
});

describe("нормализация навыков", () => {
  const sk = (skills: string[]) => toProfile(r({ skills }));
  const rows = (y: ReturnType<typeof toProfile>) => y.matches.filter((m) => m.field === "skill");
  const name = (id: number) => dict.skills.find((x) => x.id === id)?.name;

  it("делит составные навыки", () => {
    const y = sk(["Linux/Windows Server", "PHP, Laravel; Docker & Git"]);
    const n = y.vc.skills!.map(name);
    expect(n).toEqual(expect.arrayContaining(["Linux", "Windows Server", "PHP", "Laravel", "Docker", "Git"]));
    expect(rows(y).map((m) => m.input)).toEqual(["Linux", "Windows Server", "PHP", "Laravel", "Docker", "Git"]);
  });
  it("не режет, если часть короче 2 символов", () => {
    expect(rows(sk(["C/C++"])).map((m) => m.input)).toEqual(["C/C++"]);
  });
  it("не режет целое имя справочника с «/»", () => {
    const y = sk(["CI/CD", "UI/UX Design"]);
    expect(rows(y).map((m) => m.input)).toEqual(["CI/CD", "UI/UX Design"]);
    expect(y.vc.skills!.map(name)).toEqual(["CI/CD", "UI/UX Design"]);
  });
  it("убирает уточнение в скобках, input остаётся исходным", () => {
    const y = sk(["Docker (Basic)", "Git (базовый)"]);
    expect(rows(y)[0]).toMatchObject({ input: "Docker (Basic)", status: "auto", name: "Docker" });
    expect(y.vc.skills!.map(name)).toEqual(["Docker", "Git"]);
  });
  it("отбрасывает версию: auto только при точном совпадении", () => {
    const y = sk(["CSS3", "HTML5", "Python 3.11"]);
    expect(rows(y).map((m) => [m.status, m.name])).toEqual([["auto", "CSS"], ["auto", "HTML"], ["auto", "Python"]]);
    // без точной базы версия не помогает
    expect(rows(sk(["Ниндзя 3"]))[0].status).toBe("none");
  });
  it("алиасы только на существующие записи", () => {
    const y = sk(["k8s", "NodeJS", "JS"]);
    expect(y.vc.skills!.map(name)).toEqual(["Kubernetes", "Node.js", "JavaScript"]);
  });
  it("убирает дубли id и строки", () => {
    const y = sk(["Docker", "Docker (Basic)", "docker", "Linux/Docker"]);
    expect(y.vc.skills!.map(name)).toEqual(["Docker", "Linux"]);
    expect(rows(y)).toHaveLength(2);
  });
  it("нет в справочнике: исходный текст попадает в missing", () => {
    const y = sk(["VMware", "Linux/VPS"]);
    expect(y.missing.join()).toContain("«VMware»");
    expect(y.missing.join()).toContain("«VPS»");
  });
});

describe("view", () => {
  it("стаж: объединяет пересечения, текущая работа до сегодня", () => {
    const J = (start: string, end: string | null) => ({ start, end, current: end === null });
    expect(totalMonths([J("2020-01", "2021-01"), J("2020-06", "2021-06")], "2026-10")).toBe(17);
    expect(totalMonths([J("2025-06", null)], "2026-10")).toBe(16);
    expect(fmtMonths(16)).toBe("1 год 4 месяца");
    expect(fmtMonths(24)).toBe("2 года");
    expect(fmtMonths(11 * 12 + 11)).toBe("11 лет 11 месяцев");
    expect(fmtMonths(5 * 12 + 1)).toBe("5 лет 1 месяц");
  });
  it("имена, зарплата, период, пустые поля", () => {
    const y = toProfile(r({
      desiredPosition: "Frontend-разработчик", contacts: { email: "a@b.c", phone: null, city: "Душанбе", links: [] },
      salary: { from: 8000, to: null, currency: "TJS", period: "month" },
      experience: [{ company: "ZINDA", position: "Frontend Developer", city: "Душанбе", startDate: "2025-06", endDate: null, current: true, description: null }],
      education: [{ institution: "ТТУ", degree: "Бакалавр", field: "IT", startYear: 2010, endYear: 2014 }],
      languages: [{ name: "Русский", level: "C1" }],
    }));
    expect(y.view.salary).toBe("от 8\u00a0000 TJS в месяц");
    expect(y.view.title).toMatch(/frontend/i);
    expect(y.view.region?.name).toBe("Душанбе");
    expect(y.view.experience[0].period).toMatch(/^июнь 2025 — настоящее время \(/);
    expect(y.view.education[0].details).toBe("Бакалавр · IT · 2010–2014");
    expect(y.view.languages).toEqual([{ name: "Русский", level: "C1" }]);
    expect(y.view.contacts.email).toBe("a@b.c");
    expect(y.view.employment).toEqual([]);
    expect(y.view.flags).toEqual([]);
  });
});
