import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import { InsightsView } from "@/app/workspace/components/insights-view";

export default async function WorkspaceInsightsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (role !== "HOSPITAL" && role !== "MEDICAL") {
    redirect("/workspace");
  }

  return <InsightsView />;
}
