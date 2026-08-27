"use client";

import { useState } from "react";
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
  ClipboardCheck,
  FolderKanban,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { logout } from "@/lib/actions/auth";
import type { UserRole } from "@/lib/types";

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] },
  { href: "/clients", label: "Clients", icon: Contact, roles: ["admin", "staff"] },
  { href: "/employees", label: "Employees", icon: Users, roles: ["admin"] },
  { href: "/projects", label: "Projects", icon: FolderKanban, roles: ["admin"] },
  { href: "/payroll", label: "Payroll", icon: Wallet, roles: ["admin"] },
  { href: "/vendors", label: "Vendors", icon: Building, roles: ["admin"] },
  { href: "/my-scorecard", label: "My Scorecard", icon: ClipboardCheck, roles: ["employee"] },
  { href: "/notifications", label: "Notifications", icon: Bell, roles: ["admin", "staff"] },
  { href: "/holidays", label: "Holidays", icon: CalendarDays, roles: ["admin", "staff", "employee"] },
  { href: "/activity", label: "Activity Log", icon: ClipboardList, roles: ["admin", "staff"] },
];

export function Sidebar({ role, fullName }: { role: UserRole; fullName: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <>
      <div className="md:hidden fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-sidebar-bg px-4 py-3 border-b border-black/[0.06]">
        <Logo className="h-8 w-auto" />
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-sidebar-fg hover:bg-black/[0.05]"
        >
          <Menu size={22} />
        </button>
      </div>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={clsx(
          "w-64 shrink-0 bg-sidebar-bg text-sidebar-fg backdrop-blur-2xl border-l-4 border-l-brand-plum border-r border-r-black/[0.06] shadow-[8px_0_32px_-16px_rgba(38,35,44,0.12)] flex flex-col h-full",
          "fixed inset-y-0 left-0 z-50 transition-transform duration-200 md:sticky md:top-0 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-6 py-6 md:justify-start">
          <Logo className="h-10 w-auto" />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="md:hidden rounded-lg p-1.5 text-sidebar-fg hover:bg-black/[0.05]"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
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
    </>
  );
}
