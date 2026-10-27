import { z } from "zod";
import { EMPLOYMENT, SCHEDULE, TIME_TO_WORK, TRIPS } from "./terms";

const s = z.string().nullable();
const ym = z.string().regex(/^\d{4}-\d{2}$/).nullable();

export const Resume = z.object({
  fullName: s,
  desiredPosition: s,
  contacts: z.object({
    email: s,
    phone: s,
    city: s,
    links: z.array(z.string()),
  }),
  summary: s,
  salary: z.object({
    from: z.number().nullable(),
    to: z.number().nullable(),
    currency: s,
    period: z.enum(["month", "hour", "year"]).nullable(),
  }),
  experience: z.array(
    z.object({
      company: s,
      position: s,
      city: s,
      startDate: ym,
      endDate: ym,
      current: z.boolean(),
      description: s,
    }),
  ),
  education: z.array(
    z.object({
      institution: s,
      degree: s,
      field: s,
      startYear: z.number().nullable(),
      endYear: z.number().nullable(),
    }),
  ),
  skills: z.array(z.string()),
  languages: z.array(z.object({ name: s, level: s })),
  driverLicense: s,
  // только если явно написано в резюме; иначе null / []
  employment: z.array(z.enum(EMPLOYMENT)),
  schedule: z.array(z.enum(SCHEDULE)),
  relocation: z.boolean().nullable(),
  businessTrips: z.enum(TRIPS).nullable(),
  timeToWork: z.enum(TIME_TO_WORK).nullable(),
  specialization: s,
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export type Resume = z.infer<typeof Resume>;

// Схема для Gemini responseJsonSchema (без служебного $schema)
export const resumeJsonSchema = (() => {
  const schema = z.toJSONSchema(Resume) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
})();
