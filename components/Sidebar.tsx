"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  LayoutDashboard,
  Users,
  Contact,
  Wallet,
  Building,
  Bell,
  CalendarDays,
  ClipboardList,
  LogOut,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/actions/auth";
import type { UserRole } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { href: "/clients", label: "Clients", icon: Contact, adminOnly: false },
  { href: "/employees", label: "Employees", icon: Users, adminOnly: true },
  { href: "/payroll", label: "Payroll", icon: Wallet, adminOnly: true },
  { href: "/vendors", label: "Vendors", icon: Building, adminOnly: true },
  { href: "/notifications", label: "Notifications", icon: Bell, adminOnly: false },
  { href: "/holidays", label: "Holidays", icon: CalendarDays, adminOnly: false },
  { href: "/activity", label: "Activity Log", icon: ClipboardList, adminOnly: false },
];

export function Sidebar({ role, fullName }: { role: UserRole; fullName: string }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || role === "admin");

  return (
    <aside className="w-64 shrink-0 bg-sidebar-bg text-sidebar-fg backdrop-blur-2xl border-l-4 border-l-brand-plum border-r border-r-black/[0.06] shadow-[8px_0_32px_-16px_rgba(38,35,44,0.12)] flex flex-col h-full sticky top-0">
      <div className="px-6 py-6">
        <Logo className="h-10 w-auto" />
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-black/[0.05] text-sidebar-fg"
                  : "text-sidebar-muted hover:bg-black/[0.04] hover:text-sidebar-fg"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-6 pt-3 border-t border-black/[0.06]">
        <div className="px-3 py-2 text-xs text-sidebar-muted">
          <div className="font-medium text-sidebar-fg">{fullName}</div>
          <div className="capitalize">{role}</div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-muted hover:bg-black/[0.04] hover:text-sidebar-fg transition-colors"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
