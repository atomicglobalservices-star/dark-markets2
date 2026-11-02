import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { Terminal } from "../terminal";

export const metadata = { title: "My Workspace" };
export default async function WorkspacePage() {
  if (!(await currentUser())) redirect("/login?next=/workspace");
  return <Terminal page="workspace" />;
}
