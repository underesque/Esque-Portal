import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth";
import { DashboardTabs } from "@/components/DashboardTabs";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <div>
      <DashboardTabs />
      {children}
    </div>
  );
}
