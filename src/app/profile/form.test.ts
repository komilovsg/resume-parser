import { describe, expect, it } from "vitest";
import type { Resume } from "@/lib/parser/schema";
import type { ProfileView } from "@/lib/profile/view";
import { applyPicks, periodCode, profileProgress, progress, salaryFull, salaryShort, SECTIONS } from "./form";

const base = (over: Partial<Resume> = {}): Resume => ({
  fullName: null, desiredPosition: null, contacts: { email: null, phone: null, city: null, links: [] }, summary: null,
  salary: { from: null, to: null, currency: null, period: null }, experience: [], education: [], skills: [], languages: [], driverLicense: null,
  employment: [], schedule: [], relocation: null, businessTrips: null, timeToWork: null, specialization: null, birthDate: null, ...over,
});

describe("progress", () => {
  it("weights sum to 100", () => expect(SECTIONS.reduce((n, s) => n + s.weight, 0)).toBe(100));
  it("is 0 for an empty resume and 100 when everything is filled", () => {
    expect(progress(base(), {}).percent).toBe(0);
    const full = base({
      summary: "x", skills: ["a"], languages: [{ name: "ru", level: null }], contacts: { email: "a@b.c", phone: null, city: null, links: [] },
      education: [{ institution: "U", degree: null, field: null, startYear: null, endYear: null }],
      experience: [{ company: "c", position: "p", city: null, startDate: "2020-01", endDate: null, current: true, description: null }],
      schedule: ["5/2"], employment: ["full"], timeToWork: "any", relocation: false, businessTrips: "none", salary: { from: 1, to: 2, currency: "TJS", period: "month" },
    });
    const p = { position: { id: 1, name: "p" }, region: { id: 2, name: "r" }, specialization: { id: 3, name: "s" } };
    expect(progress(full, p).percent).toBe(100);
    expect(progress(full, { ...p, position: null }).sections[0].done).toBe(false);
  });
  it("no-experience checkbox satisfies section 1; negotiable satisfies salary", () => {
    const p = { position: { id: 1, name: "p" }, noExperience: true, region: { id: 2, name: "r" }, specialization: { id: 3, name: "s" }, negotiable: true };
    const s = progress(base(), p).sections;
    expect(s[0].done && s[2].done).toBe(true);
  });
  it("profile progress marks unparsed items as pending", () => {
    const pp = profileProgress(base({ experience: [{ company: null, position: "p", city: null, startDate: null, endDate: null, current: false, description: null }] }));
    expect(pp.items.find((i) => i.title === "Курсы")?.done).toBe(false);
    expect(pp.percent).toBe(30);
  });
});

describe("salary", () => {
  const r = base({ salary: { from: 3000, to: 3000, currency: "TJS", period: "month" } });
  it("short and full labels", () => {
    expect(salaryShort(r, {})).toBe("3 000 - 3 000 с");
    expect(salaryFull(r, {})).toBe("3 000 – 3 000 TJS в месяц");
    expect(salaryShort(base(), {})).toBeNull();
    expect(salaryShort(r, { negotiable: true })).toBe("По договорённости");
    expect(salaryShort(base({ salary: { from: 5000, to: null, currency: "USD", period: null } }), {})).toBe("от 5 000 $");
  });
  it("explicit period wins", () => {
    expect(periodCode(r, { salaryPeriod: "INC_DAY" })).toBe("INC_DAY");
    expect(salaryFull(r, { salaryPeriod: "INC_DAY" })).toContain("в день");
  });
});

describe("applyPicks", () => {
  const v = { title: "Auto title", position: { id: 1, name: "Auto title", auto: true }, region: null, city: "Dushanbe", specialization: null, salary: "x" } as unknown as ProfileView;
  it("keeps the match when nothing was chosen, overrides with explicit picks", () => {
    expect(applyPicks(v, base(), {}).title).toBe("Auto title");
    const o = applyPicks(v, base(), { position: { id: 9, name: "Chosen" }, region: { id: 5, name: "Душанбе" }, specialization: { id: 7, name: "IT" } });
    expect(o.title).toBe("Chosen");
    expect(o.position).toMatchObject({ id: 9, auto: false });
    expect(o.city).toBe("Душанбе");
    expect(o.specialization).toEqual({ id: 7, name: "IT" });
  });
  it("a cleared position falls back to the resume text, not the old match", () => {
    expect(applyPicks(v, base({ desiredPosition: "Мой текст" }), { position: null }).title).toBe("Мой текст");
  });
});
