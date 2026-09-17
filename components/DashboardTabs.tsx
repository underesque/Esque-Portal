"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TABS = [
  { href: "/dashboard", label: "Executive" },
  { href: "/dashboard/sales", label: "Sales & Marketing" },
  { href: "/dashboard/support", label: "Support" },
  { href: "/dashboard/financial", label: "Financial" },
];

export function DashboardTabs() {
  const pathname = usePathname();

  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active ? "border-brand-red text-foreground" : "border-transparent text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
