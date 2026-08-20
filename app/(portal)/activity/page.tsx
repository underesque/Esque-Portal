import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { ActivityLogEntry } from "@/lib/types";

export default async function ActivityLogPage() {
  const supabase = await createClient();
  const { data: entries } = await supabase
    .from("activity_log")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div>
      <PageHeader title="Activity Log" description="A running record of changes across the portal." />

      <Card>
        {entries && entries.length > 0 ? (
          <ul className="divide-y divide-border">
            {(entries as (ActivityLogEntry & { profiles: { full_name: string } | null })[]).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <span className="font-medium text-foreground">{entry.profiles?.full_name ?? "Someone"}</span>{" "}
                  <span className="text-muted">
                    {entry.action.replace("_", " ")} a {entry.entity_type.replace("_", " ")}
                  </span>
                </div>
                <span className="text-xs text-muted">{formatDateTime(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState message="No activity yet." />
        )}
      </Card>
    </div>
  );
}
