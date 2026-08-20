import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Button, Input, Textarea, Label, EmptyState } from "@/components/ui";
import { addHoliday, deleteHoliday } from "@/lib/actions/holidays";
import type { Holiday } from "@/lib/types";

export default async function HolidaysPage() {
  const { profile } = await requireUser();
  const isAdmin = profile.role === "admin";
  const supabase = await createClient();

  const { data: holidays } = await supabase
    .from("holidays")
    .select("*")
    .order("date", { ascending: true })
    .returns<Holiday[]>();

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (holidays ?? []).filter((h) => h.date >= today);
  const past = (holidays ?? []).filter((h) => h.date < today);

  return (
    <div>
      <PageHeader title="ESQUE Holiday Calendar" description="Company holidays and observances." />

      {isAdmin && (
        <Card className="p-5 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">Add holiday</h2>
          <form action={addHoliday} className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:items-end">
            <div className="sm:col-span-2">
              <Label>Name</Label>
              <Input name="name" required />
            </div>
            <div>
              <Label>Date</Label>
              <Input name="date" type="date" required />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input id="recurring" type="checkbox" name="recurring_annually" className="h-4 w-4 rounded border-border" />
              <label htmlFor="recurring" className="text-sm text-muted">
                Repeats every year
              </label>
            </div>
            <div className="sm:col-span-4">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} />
            </div>
            <div className="sm:col-span-4 flex justify-end">
              <Button type="submit">Add holiday</Button>
            </div>
          </form>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-foreground mb-3">Upcoming</h2>
      <Card className="mb-6">
        {upcoming.length > 0 ? (
          <ul className="divide-y divide-border">
            {upcoming.map((h) => (
              <HolidayRow key={h.id} holiday={h} isAdmin={isAdmin} />
            ))}
          </ul>
        ) : (
          <EmptyState message="No upcoming holidays scheduled." />
        )}
      </Card>

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-foreground mb-3">Past</h2>
          <Card>
            <ul className="divide-y divide-border">
              {past
                .slice()
                .reverse()
                .map((h) => (
                  <HolidayRow key={h.id} holiday={h} isAdmin={isAdmin} muted />
                ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function HolidayRow({ holiday, isAdmin, muted }: { holiday: Holiday; isAdmin: boolean; muted?: boolean }) {
  return (
    <li className={`flex items-center justify-between px-5 py-3 text-sm ${muted ? "opacity-60" : ""}`}>
      <div>
        <span className="font-medium text-foreground">{holiday.name}</span>{" "}
        <span className="text-muted">
          —{" "}
          {new Date(holiday.date).toLocaleDateString("en-US", {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
        {holiday.recurring_annually && <span className="ml-2 text-xs text-muted">(annual)</span>}
        {holiday.notes && <div className="text-xs text-muted mt-0.5">{holiday.notes}</div>}
      </div>
      {isAdmin && (
        <form action={deleteHoliday.bind(null, holiday.id)}>
          <button type="submit" className="text-xs font-medium text-brand-red hover:underline">
            Remove
          </button>
        </form>
      )}
    </li>
  );
}
