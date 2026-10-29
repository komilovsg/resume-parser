// Небольшой синтетический справочник для тестов: названия типовые, id выдуманные. Настоящие данные в репозитории не хранятся.
import type { Dict } from "./dict";

let next = 9000;
const rows = (names: string[]) => names.map((name) => ({ id: ++next, name }));
const coded = (list: [string, string][]) => list.map(([code, name]) => ({ id: ++next, code, name }));

export const fixture: Dict = {
  positions: rows([
    "Специалист", "Программист", "Бухгалтер", "Frontend developer", "Frontend developer", "Бухгалтер", "бухгалтер",
    "Программист 1С", "1С программист", "Специалист", "Специалист", "Программист",
    "Frontend-разработчик", "Backend-разработчик", "Инженер", "Ведущий специалист", "Старший специалист", "Младший специалист",
    "Главный бухгалтер", "Кассир", "Водитель", "Frontend Junior", "Middle Backend-разработчик", "Android-разработчик - Junior/Middle",
    "Backend-разработчик (Junior+/Middle) в Компания Альфа", "Frontend (Junior)",
    "Full-stack/Back-end разработчик", "Back-end/Full-stack разработчик", "golang backend developer", "Backend golang developer",
    "Кассир-бухгалтер", "Бухгалтер-кассир", "PHP разработчик (Middle)", "PHP разработчик",
  ]),
  regions: [
    { id: 9801, name: "Душанбе", country: "Таджикистан" },
    { id: 9802, name: "Худжанд", country: "Таджикистан" },
    { id: 9803, name: "Bokhtar", country: "Таджикистан" },
  ],
  specializations: [
    { id: 9701, name: "Растениеводство", parent: "Сельское хозяйство" },
    { id: 9702, name: "Разработка программного обеспечения", parent: "Информационные технологии" },
    { id: 9703, name: "Бухгалтерский учёт", parent: "Финансы" },
  ],
  skills: rows([
    "JavaScript", "React", "TypeScript", "Python", "Git", "Data Version Control", "Version Tracking", "Git Flow", "Blacklist", "Blocklist", "Linux", "Windows Server",
    "PHP", "Laravel", "Docker", "CI/CD", "UI/UX Design", "CSS", "HTML", "Kubernetes", "Node.js", "Excel", "SQL", "Figma",
  ]),
  currencies: coded([["EUR", "Euro"], ["RUB", "Russian Ruble"], ["TJS", "Tajikistani Somoni"], ["USD", "US Dollar"]]),
  educationLevels: coded([["EDU_B", "Бакалавр"], ["EDU_M", "Магистр"], ["EDU_HIGH", "Высшее"], ["EDU_S", "Среднее"], ["EDU_SP", "Среднее специальное"]]),
  employment: coded([["EMP_FULL", "Полная"], ["EMP_INT", "Стажировка"], ["EMP_PART", "Частичная"], ["EMP_PROJECT", "Проектная"], ["EMP_TEMP", "Вахта"], ["EMP_VOL", "Волонтерство"]]),
  workSchedule: coded([
    ["SCH_12", "1/2"], ["SCH_13", "1/3"], ["SCH_21", "2/1"], ["SCH_22", "2/2"], ["SCH_32", "3/2"], ["SCH_33", "3/3"], ["SCH_42", "4/2"],
    ["SCH_43", "4/3"], ["SCH_44", "4/4"], ["SCH_52", "5/2"], ["SCH_61", "6/1"], ["SCH_FREE", "Свободный"], ["SCH_OTHER", "Другое"], ["SCH_WEEKEND", "По выходным"],
  ]),
  salaryPeriod: coded([["INC_DAY", "День"], ["INC_MONTH", "Месяц"], ["INC_WEEK", "Неделя"]]),
  driverLicense: coded([["DRIVE_A", "A"], ["DRIVE_B", "B"]]),
  businessTrips: coded([["TRAVEL_NONE", "Нет командировок"], ["TRAVEL_OFTEN", "Часто"], ["TRAVEL_RARELY", "Редко"]]),
  timeToWork: coded([["TIME_TO_WARK_05", "Не более полутрочасов"], ["TIME_TO_WARK_1", "Не более часа"], ["TIME_TO_WARK_ANY", "Не имеет значения"]]),
  reasonableAdjustment: coded([["REASONBALE_ADJUSMENT_NO", "Нет"], ["REASONBALE_ADJUSMENT_YES", "Да"]]),
};
