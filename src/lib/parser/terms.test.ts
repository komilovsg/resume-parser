import { describe, expect, it } from "vitest";
import { Resume } from "./schema";
import { verifyResume } from "./verify";
import { toProfile as toProfileWith } from "../profile";
import { fixture as dict } from "../profile/fixture.test-dict";
const toProfile = (x: Resume) => toProfileWith(x, dict);

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
const id = (list: { id: number; name: string }[], name: string) => list.find((x) => x.name === name)!.id;

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

describe("toProfile: условия работы", () => {
  it("null -> ничего не выдумывается", () => {
    const y = toProfile(base);
    expect(y.vc).toMatchObject({ employment: null, work_schedule: null, time_to_work: null, bussness_trip: null, relocate_sign: null, specialization_id: null, business_trips: null });
    expect(y.view.flags).toEqual([]);
    expect(y.view.employment).toEqual([]);
  });
  it("employment -> id справочника по имени", () => {
    const y = toProfile(r({ employment: ["full", "part", "project", "internship", "volunteer", "rotation"] }));
    expect(y.vc.employment).toEqual(["Полная", "Частичная", "Проектная", "Стажировка", "Волонтерство", "Вахта"].map((n) => id(dict.employment, n)));
    expect(y.view.employment).toContain("Вахта");
  });
  it("schedule -> id справочника", () => {
    const y = toProfile(r({ schedule: ["free", "weekend", "5/2", "2/2"] }));
    expect(y.vc.work_schedule).toEqual(["Свободный", "По выходным", "5/2", "2/2"].map((n) => id(dict.workSchedule, n)));
    expect(y.view.workSchedule).toEqual(["Свободный", "По выходным", "5/2", "2/2"]);
  });
  it("timeToWork и businessTrips", () => {
    expect(toProfile(r({ timeToWork: "hour1" })).vc.time_to_work).toEqual([id(dict.timeToWork, "Не более часа")]);
    expect(toProfile(r({ timeToWork: "min90" })).vc.time_to_work).toEqual([id(dict.timeToWork, "Не более полутрочасов")]);
    expect(toProfile(r({ timeToWork: "any" })).vc.time_to_work).toEqual([id(dict.timeToWork, "Не имеет значения")]);
    expect(toProfile(r({ businessTrips: "often" })).vc.bussness_trip).toEqual([id(dict.businessTrips, "Часто")]);
    expect(toProfile(r({ businessTrips: "rarely" })).vc.bussness_trip).toEqual([id(dict.businessTrips, "Редко")]);
    expect(toProfile(r({ businessTrips: "none" })).vc.bussness_trip).toEqual([id(dict.businessTrips, "Нет командировок")]);
  });
  it("плашки только при true; «нет» не показывает", () => {
    expect(toProfile(r({ relocation: true })).view.flags).toEqual(["Готов(а) к переезду"]);
    const no = toProfile(r({ relocation: false, businessTrips: "none" }));
    expect(no.vc.relocate_sign).toBe(0);
    expect(no.view.flags).toEqual([]);
    const ready = toProfile(r({ businessTrips: "ready" }));
    expect(ready.vc.business_trips).toBe(1);
    expect(ready.view.flags).toEqual(["Готов(а) к командировкам"]);
    expect(toProfile(r({ businessTrips: "rarely" })).view.flags).toEqual(["Готов(а) к командировкам"]);
  });
  it("specialization сопоставляется со справочником", () => {
    const name = dict.specializations[0].name;
    const y = toProfile(r({ specialization: name }));
    expect(y.vc.specialization_id).toBe(dict.specializations[0].id);
    expect(y.view.specialization?.name).toBe(name);
    expect(y.matches.some((m) => m.field === "specialization")).toBe(true);
    const none = toProfile(r({ specialization: "Космическая зоология ксенобиологов" }));
    expect(none.vc.specialization_id).toBeNull();
  });
});
