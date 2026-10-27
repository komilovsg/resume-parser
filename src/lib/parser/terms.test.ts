import { describe, expect, it } from "vitest";
import { Resume } from "./schema";
import { verifyResume } from "./verify";

const TEXT = `Алишер Каримов
Специализация: Информационные технологии
Полная занятость. Удалённая работа. Готов к переезду. Готов к командировкам.`;

const base: Resume = {
  fullName: "Алишер Каримов", desiredPosition: null,
  contacts: { email: null, phone: null, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null,
  employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
};
const r = (p: Partial<Resume>): Resume => ({ ...base, ...p });

describe("schema", () => {
  it("принимает null и пустые массивы", () => expect(Resume.safeParse(base).success).toBe(true));
  it("отклоняет значение вне enum", () => expect(Resume.safeParse({ ...base, employment: ["remote"] }).success).toBe(false));
});

describe("verify: условия работы", () => {
  it("relocation=true без «переезд» в тексте сбрасывается", () => {
    const v = verifyResume(r({ relocation: true }), "Алишер Каримов\nОпыт: нет");
    expect(v.resume.relocation).toBeNull();
    expect(v.warnings.some((w) => w.includes("Переезд"))).toBe(true);
  });
  it("relocation=true с «переезд» остаётся", () => {
    const v = verifyResume(r({ relocation: true }), TEXT);
    expect(v.resume.relocation).toBe(true);
    expect(v.warnings).toEqual([]);
  });
  it("все значения подтверждаются текстом", () => {
    const v = verifyResume(r({ employment: ["full"], businessTrips: "ready", specialization: "Информационные технологии" }), TEXT);
    expect(v.resume).toMatchObject({ employment: ["full"], businessTrips: "ready", specialization: "Информационные технологии" });
  });
  it("занятость без ключевого слова удаляется с предупреждением", () => {
    const v = verifyResume(r({ employment: ["full", "part"] }), TEXT);
    expect(v.resume.employment).toEqual(["full"]);
    expect(v.warnings).toContain("Занятость «частичная» не найдена в документе");
  });
  it("специализация без строки о специализации удаляется", () => {
    expect(verifyResume(r({ specialization: "Бухгалтерия" }), "Алишер Каримов\nБухгалтер").resume.specialization).toBeNull();
  });
  it("mixed: оставляет и помечает unverified", () => {
    const v = verifyResume(r({ relocation: true, schedule: ["5/2"] }), "Алишер Каримов", true);
    expect(v.resume.relocation).toBe(true);
    expect(v.resume.schedule).toEqual(["5/2"]);
    expect(v.unverified).toEqual(expect.arrayContaining(["Переезд: готов", "График: 5/2"]));
  });
  it("скан: без проверки", () => {
    expect(verifyResume(r({ relocation: true }), null).resume.relocation).toBe(true);
  });
});
