import { describe, expect, it } from "vitest";
import type { Resume } from "./schema";
import { locate, verifyContacts } from "./verify";

const base = (email: string | null, phone: string | null): Resume => ({
  fullName: "Т", desiredPosition: null,
  contacts: { email, phone, city: null, links: [] },
  summary: null, salary: { from: null, to: null, currency: null, period: null },
  experience: [], education: [], skills: [], languages: [], driverLicense: null, birthDate: null, employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null,
});
const src = "Алишер Каримов\nТел: +992 93 123-45-67\nEmail: alisher@mail.tj";

describe("verifyContacts", () => {
  it("верные контакты не трогает", () => {
    const r = verifyContacts(base("Alisher@mail.tj", "+992931234567"), src);
    expect(r.warnings).toEqual([]);
    expect(r.resume.contacts.email).toBe("Alisher@mail.tj");
  });
  it("выдуманный email заменяется на найденный", () => {
    const r = verifyContacts(base("fake@x.com", "931234567"), src);
    expect(r.resume.contacts.email).toBe("alisher@mail.tj");
    expect(r.warnings).toContain("email исправлен по тексту документа");
    expect(r.resume.contacts.phone).toBe("931234567");
  });
  it("выдуманные контакты без совпадений -> null", () => {
    const r = verifyContacts(base("fake@x.com", "+992 11 111 11 11"), "просто текст");
    expect(r.resume.contacts).toMatchObject({ email: null, phone: null });
    expect(r.warnings).toHaveLength(2);
  });
  it("null дозаполняется из текста", () => {
    const r = verifyContacts(base(null, null), src);
    expect(r.resume.contacts.email).toBe("alisher@mail.tj");
    expect(r.resume.contacts.phone).toBe("+992 93 123-45-67");
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { verifyResume } from "./verify";

describe("verifyResume grounding", () => {
  const text = readFileSync(join(__dirname, "../../../fixtures/resume.txt"), "utf8");
  const exp = (company: string, position: string, startDate: string, endDate: string) => ({
    company, position, city: null, startDate, endDate, current: false, description: null,
  });

  it("выдуманная работа удаляется, настоящие остаются", () => {
    const real = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 8).slice(1, 3);
    const r = base(null, null);
    r.fullName = "Алишер Каримов";
    r.experience = [exp(real[0], real[1], "2015-01", "2018-01"), exp("Google", "Senior Engineer", "2015-01", "2018-01")];
    const v = verifyResume(r, text);
    expect(v.grounded).toBe(true);
    expect(v.resume.fullName).toBe("Алишер Каримов");
    expect(v.resume.experience.map((e) => e.company)).not.toContain("Google");
    expect(v.warnings.some((w) => w.startsWith("Удалена запись опыта, которой нет в документе: Google"))).toBe(true);
  });

  it("частичный провал обнуляет поле, выдуманный навык и имя убираются", () => {
    const r = base(null, null);
    r.fullName = "Джон Смит";
    r.skills = ["Kubernetes-xyz"];
    r.experience = [exp("Google", "Алишер", "2015-01", "2018-01")];
    const v = verifyResume(r, "Алишер Каримов работал. 2015");
    expect(v.resume.fullName).toBeNull();
    expect(v.resume.skills).toEqual([]);
    expect(v.resume.experience[0]).toMatchObject({ company: null, startDate: "2015-01", endDate: null });
  });

  it("скан: grounded=false и предупреждение", () => {
    const v = verifyResume(base(null, null), null);
    expect(v.grounded).toBe(false);
    expect(v.warnings[0]).toMatch(/^Скан/);
  });
});


describe("locate", () => {
  const text = "Алишер Каримов\nТел: +992 (93) 123-45-67\nEmail: alisher@mail.tj\n\nОпыт\nООО «Ёлка-Софт», разработчик с 09.2019 по март 2022\nЖивёт в Душанбе. Навыки: React, TypeScript";
  const cut = (v: string, t = text) => {
    const r = locate(v, t);
    return r && t.slice(r.start, r.end);
  };
  it("finds cyrillic case-insensitive with original offsets", () => {
    const r = locate("алишер каримов", text)!;
    expect(r).toEqual({ start: 0, end: 14 });
    expect(cut("душанбе")).toBe("Душанбе");
  });
  it("handles ё/е and punctuation", () => {
    expect(cut("ООО Елка Софт")).toBe("ООО «Ёлка-Софт");
    expect(cut("Ёлка-Софт")).toBe("Ёлка-Софт");
  });
  it("tolerates word forms by prefix", () => {
    expect(cut("Разработчика")).toBe("разработчик");
    expect(cut("Душанбинский")).toBe("Душанбе");
  });
  it("matches phone by last 9 digits ignoring separators", () => {
    expect(cut("+992931234567")).toBe("+992 (93) 123-45-67");
    expect(cut("93 123 45 67")).toBe("+992 (93) 123-45-67");
  });
  it("finds email", () => expect(cut("ALISHER@mail.tj")).toBe("alisher@mail.tj"));
  it("finds dates by MM.YYYY, month name and year", () => {
    expect(cut("2019-09")).toBe("09.2019");
    expect(cut("2022-03")).toBe("март 2022");
    expect(cut("2022-07")).toBe("2022");
  });
  it("returns the best word span within 200 chars", () => {
    expect(cut("Каримов Алишер")).toBe("Алишер Каримов");
  });
  it("falls back to a single word", () => expect(cut("Каримов Сергей")).toBe("Каримов"));
  it("returns null when not found", () => {
    expect(locate("Kubernetes", text)).toBeNull();
    expect(locate("2010-01", text)).toBeNull();
    expect(locate("+992 55 000 11 22", text)).toBeNull();
    expect(locate("", text)).toBeNull();
  });
  it("finds numbers with thousand separators", () => expect(cut("5000", "Зарплата 5 000 сомони")).toBe("5 000"));
});
