import { notFound } from "next/navigation";
import { connection } from "next/server";
import { serviceMode } from "@/lib/service";
import Demo from "./Demo";

export default async function Page() {
  await connection(); // SERVICE_MODE читается в рантайме, не при сборке
  if (serviceMode()) notFound();
  return <Demo />;
}
