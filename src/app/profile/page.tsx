import { guard, hasDict } from "./guard";
import NoDict from "./NoDict";
import ProfileHome from "./ProfileHome";

export const metadata = { title: "Мой профиль и резюме" };

export default async function Page() {
  await guard();
  if (!(await hasDict())) return <NoDict />;
  return <ProfileHome />;
}
