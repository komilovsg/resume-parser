import { guard, hasDict } from "../../guard";
import NoDict from "../../NoDict";
import EditPage from "../../EditPage";

export const metadata = { title: "Редактирование резюме" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await guard();
  if (!(await hasDict())) return <NoDict />;
  const { id } = await params;
  return <EditPage id={id} />;
}
