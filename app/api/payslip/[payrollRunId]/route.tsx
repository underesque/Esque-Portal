import { NextResponse, type NextRequest } from "next/server";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/format";
import type { Employee, PayrollRun, Profile } from "@/lib/types";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  header: { fontSize: 18, marginBottom: 4, fontWeight: 700 },
  sub: { fontSize: 10, color: "#666666", marginBottom: 24 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eeeeee",
  },
  label: { color: "#666666" },
  value: { fontWeight: 700 },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 2,
    borderTopColor: "#111111",
  },
});

export async function GET(_request: NextRequest, { params }: { params: Promise<{ payrollRunId: string }> }) {
  const { payrollRunId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: run } = await supabase
    .from("payroll_runs")
    .select("*")
    .eq("id", payrollRunId)
    .single<PayrollRun>();
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = profile.employee_id !== null && profile.employee_id === run.employee_id;
  if (profile.role !== "admin" && !isOwner) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("full_name, employee_code, start_date")
    .eq("id", run.employee_id)
    .single<Pick<Employee, "full_name" | "employee_code" | "start_date">>();

  const buffer = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.header}>ESQUE Outsourcing</Text>
        <Text style={styles.sub}>
          Salary Slip — {formatDate(run.period_start)} to {formatDate(run.period_end)}
        </Text>

        <View style={styles.row}>
          <Text style={styles.label}>Employee</Text>
          <Text style={styles.value}>{employee?.full_name ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Employee ID</Text>
          <Text style={styles.value}>{employee?.employee_code ?? "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Start date</Text>
          <Text style={styles.value}>{employee?.start_date ? formatDate(employee.start_date) : "—"}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Base amount</Text>
          <Text style={styles.value}>{formatINR(run.base_amount_cents)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Commission</Text>
          <Text style={styles.value}>{formatINR(run.commission_amount_cents)}</Text>
        </View>
        <View style={styles.total}>
          <Text>Total</Text>
          <Text>{formatINR(run.total_amount_cents)}</Text>
        </View>
      </Page>
    </Document>
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payslip-${run.period_start}.pdf"`,
    },
  });
}
