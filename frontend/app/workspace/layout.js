import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import WorkspaceShell from "@/app/workspace/workspace-shell";

export default async function WorkspaceLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/workspace");
  }

  return <WorkspaceShell user={session.user}>{children}</WorkspaceShell>;
}
