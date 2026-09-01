import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Clock, Send } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatUSD, formatINR, formatDate } from "@/lib/format";
import type { Vendor } from "@/lib/types";

type NotificationItem = {
  id: string;
  severity: "overdue" | "due-soon" | "info";
  icon: ReactNode;
  title: string;
  detail: string;
  href: string;
};

export default async function NotificationsPage() {
  const { profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const soonStr = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const items: NotificationItem[] = [];

  // --- Client invoices: needs sending, or coming due / overdue -----------
  const { data: draftInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, issued_date, client_id, clients(name)")
    .eq("status", "draft");

  (draftInvoices ?? []).forEach((inv) => {
    const ageDays = (today.getTime() - new Date(inv.issued_date).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= 3) {
      items.push({
        id: `draft-${inv.id}`,
        severity: "info",
        icon: <Send size={16} />,
        title: `Invoice ${inv.invoice_number} needs to be sent`,
        detail: `${(inv.clients as unknown as { name: string } | null)?.name ?? "Client"} — drafted ${formatDate(inv.issued_date)}`,
        href: `/clients/${inv.client_id}`,
      });
    }
  });

  const { data: dueInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, due_date, amount_cents, client_id, clients(name)")
    .in("status", ["sent", "overdue"])
    .not("due_date", "is", null)
    .lte("due_date", soonStr);

  (dueInvoices ?? []).forEach((inv) => {
    const overdue = inv.due_date! < todayStr;
    items.push({
      id: `invoice-${inv.id}`,
      severity: overdue ? "overdue" : "due-soon",
      icon: <AlertTriangle size={16} />,
      title: `Invoice ${inv.invoice_number} ${overdue ? "is overdue" : "is due soon"}`,
      detail: `${(inv.clients as unknown as { name: string } | null)?.name ?? "Client"} — ${formatUSD(inv.amount_cents)} due ${formatDate(inv.due_date)}`,
      href: `/clients/${inv.client_id}`,
    });
  });

  // --- Open tickets that need attention -------------------------------------
  const { data: urgentTickets } = await supabase
    .from("tickets")
    .select("id, subject, priority")
    .in("status", ["open", "in_progress"])
    .in("priority", ["high", "urgent"]);

  (urgentTickets ?? []).forEach((t) => {
    items.push({
      id: `ticket-${t.id}`,
      severity: t.priority === "urgent" ? "overdue" : "due-soon",
      icon: <AlertTriangle size={16} />,
      title: `${t.priority === "urgent" ? "Urgent" : "High-priority"} ticket still open`,
      detail: t.subject,
      href: `/tickets/${t.id}`,
    });
  });

  if (isAdmin) {
    // --- Projects blocked by the client -------------------------------------
    const { data: blockedProjects } = await supabase
      .from("projects")
      .select("id, name, client_id, clients(name)")
      .eq("status", "blocked_by_client");

    (blockedProjects ?? []).forEach((p) => {
      items.push({
        id: `project-${p.id}`,
        severity: "overdue",
        icon: <AlertTriangle size={16} />,
        title: `${p.name} is blocked by the client`,
        detail: (p.clients as unknown as { name: string } | null)?.name ?? "Client",
        href: `/projects/${p.id}`,
      });
    });

    // --- Vendor bills due / overdue ---------------------------------------
    const { data: vendors } = await supabase
      .from("vendors")
      .select("*")
      .eq("status", "active")
      .not("next_due_date", "is", null)
      .lte("next_due_date", soonStr)
      .returns<Vendor[]>();

    (vendors ?? []).forEach((v) => {
      const overdue = v.next_due_date! < todayStr;
      items.push({
        id: `vendor-${v.id}`,
        severity: overdue ? "overdue" : "due-soon",
        icon: <AlertTriangle size={16} />,
        title: `${v.name} payment ${overdue ? "is overdue" : "is due soon"}`,
        detail: `${formatINR(v.amount_cents)} due ${formatDate(v.next_due_date)}`,
        href: `/vendors/${v.id}`,
      });
    });

    // --- Payroll due reminder ----------------------------------------------
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
    const { count: runsThisMonth } = await supabase
      .from("payroll_runs")
      .select("id", { count: "exact", head: true })
      .gte("period_start", monthStart)
      .lte("period_start", monthEnd);

    if (today.getDate() >= 25 && (runsThisMonth ?? 0) === 0) {
      items.push({
        id: "payroll-due",
        severity: "due-soon",
        icon: <Clock size={16} />,
        title: "Payroll hasn't been run this month",
        detail: `No payroll runs processed for ${today.toLocaleDateString("en-US", { month: "long", year: "numeric" })} yet.`,
        href: "/payroll",
      });
    }
  }

  const severityOrder = { overdue: 0, "due-soon": 1, info: 2 };
  items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return (
    <div>
      <PageHeader title="Notifications" description="What needs attention right now." />

      <Card>
        {items.length > 0 ? (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-start gap-3 px-5 py-3.5 text-sm hover:bg-black/[0.02]"
                >
                  <span
                    className={
                      item.severity === "overdue"
                        ? "text-brand-red"
                        : item.severity === "due-soon"
                          ? "text-amber-600"
                          : "text-muted"
                    }
                  >
                    {item.icon}
                  </span>
                  <span>
                    <div className="font-medium text-foreground">{item.title}</div>
                    <div className="text-xs text-muted mt-0.5">{item.detail}</div>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="Nothing needs attention right now." />
        )}
      </Card>
    </div>
  );
}
