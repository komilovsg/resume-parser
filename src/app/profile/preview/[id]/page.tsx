import { guard, hasDict } from "../../guard";
import NoDict from "../../NoDict";
import PreviewPage from "../../PreviewPage";

export const metadata = { title: "Предпросмотр перед публикацией" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await guard();
  if (!(await hasDict())) return <NoDict />;
  const { id } = await params;
  return <PreviewPage id={id} />;
}
