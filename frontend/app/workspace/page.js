import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import WorkspaceClient from "@/app/workspace/workspace-client";

export default async function WorkspacePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login?callbackUrl=/workspace");
  }

  return <WorkspaceClient user={session.user} />;
}
