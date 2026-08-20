import type { ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { requireUser } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireUser();

  return (
    <div className="flex flex-1 min-h-screen">
      <Sidebar role={profile.role} fullName={profile.full_name} />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
