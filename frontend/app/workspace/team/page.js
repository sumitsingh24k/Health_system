import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import { TeamView } from "@/app/workspace/components/team-view";

export default async function WorkspaceTeamPage() {
  const session = await getServerSession(authOptions);

  if (session?.user?.role !== "ADMIN") {
    redirect("/workspace");
  }

  return <TeamView />;
}
