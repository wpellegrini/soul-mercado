import { redirect } from "next/navigation";
import { homeFor, requireUser } from "@/lib/auth";

export default async function Home() {
  const { profile } = await requireUser();
  redirect(homeFor(profile.role));
}
