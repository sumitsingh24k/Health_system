"use client";

import { BottomRoleDock } from "@/app/workspace/components/bottom-role-dock";
import { WorkspaceProvider, useWorkspace } from "@/app/workspace/workspace-context";

function WorkspaceChromeInner({ children }) {
  const { showBottomDock } = useWorkspace();

  return (
    <>
      <main
        className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_35%,#f1f5f9_100%)] px-4 py-6 md:px-6 md:py-8 ${showBottomDock ? "pb-24 md:pb-8" : ""}`}
      >
        <div className="mx-auto max-w-7xl space-y-6">{children}</div>
      </main>
      {showBottomDock ? <BottomRoleDock /> : null}
    </>
  );
}

export default function WorkspaceShell({ user, children }) {
  return (
    <WorkspaceProvider user={user}>
      <WorkspaceChromeInner>{children}</WorkspaceChromeInner>
    </WorkspaceProvider>
  );
}
