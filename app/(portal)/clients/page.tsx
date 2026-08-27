import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, Button } from "@/components/ui";
import type { Client } from "@/lib/types";

export default async function ClientsPage() {
  const supabase = await createClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("*, employees!sales_owner_id(full_name)")
    .order("created_at", { ascending: false })
    .returns<(Client & { employees: { full_name: string } | null })[]>();

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Every client ESQUE works with, in one place."
        action={
          <Link href="/clients/new">
            <Button>Add client</Button>
          </Link>
        }
      />

      <Card>
        {clients && clients.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase text-muted">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Business</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Sales owner</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-black/[0.02]">
                  <td className="px-5 py-3">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-muted">{client.business_name ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{client.email ?? "—"}</td>
                  <td className="px-5 py-3 text-muted">{client.employees?.full_name ?? "Unassigned"}</td>
                  <td className="px-5 py-3">
                    <Badge status={client.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState message="No clients yet. Add your first client to get started." />
        )}
      </Card>
    </div>
  );
}
