import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { PageHeader, Card, Button, Input, Select, Textarea, Label } from "@/components/ui";
import { createEmployee } from "@/lib/actions/employees";

export default async function NewEmployeePage() {
  await requireAdmin();

  return (
    <div>
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} /> Back to employees
      </Link>
      <PageHeader title="Add employee" />

      <Card className="p-6 max-w-2xl">
        <form action={createEmployee} className="space-y-4">
          <div>
            <Label>Employee ID</Label>
            <Input name="employee_code" placeholder="Assign later" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Full name</Label>
              <Input name="full_name" required />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Phone</Label>
              <Input name="phone" />
            </div>
            <div>
              <Label>Start date</Label>
              <Input
                name="start_date"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>Employment type</Label>
              <Select name="employment_type" defaultValue="full_time">
                <option value="full_time">Full-time</option>
                <option value="part_time">Part-time</option>
                <option value="contractual">Contractual</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select name="status" defaultValue="active">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <Label>Pay structure</Label>
            <Select name="pay_type" defaultValue="fixed">
              <option value="fixed">Fixed salary</option>
              <option value="commission">Commission only</option>
              <option value="hybrid">Fixed + commission</option>
            </Select>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Base salary (INR / year)</Label>
                <Input name="base_salary" type="number" step="0.01" min="0" defaultValue="0" />
              </div>
              <div>
                <Label>Commission rate (%)</Label>
                <Input name="commission_rate_percent" type="number" step="0.01" min="0" max="100" defaultValue="0" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input type="checkbox" name="is_founder" />
              Is a founder
            </label>
            <p className="mt-1 text-xs text-muted">
              Founders participate in the monthly payout split (sales/operations/partners pools) and
              draw a flat monthly salary from their attributed revenue instead of a fixed payroll salary.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Salary basis</Label>
                <Select name="salary_basis" defaultValue="full_time">
                  <option value="full_time">Full-time (₹75,000 cap)</option>
                  <option value="half_time">Half-time (₹40,000 cap)</option>
                  <option value="hourly_director">Director hourly (₹500/hr)</option>
                  <option value="custom">Custom</option>
                </Select>
              </div>
              <div>
                <Label>Hours (if hourly)</Label>
                <Input name="salary_basis_hours" type="number" step="0.5" min="0" defaultValue="0" />
              </div>
            </div>
            <div className="mt-3">
              <Label>Custom monthly salary (INR, if basis is Custom)</Label>
              <Input name="salary_basis_custom" type="number" step="0.01" min="0" defaultValue="0" />
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <Label>T-shirt size</Label>
            <Select name="t_shirt_size" defaultValue="">
              <option value="">— Not set —</option>
              <option value="XS">XS</option>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
              <option value="XL">XL</option>
              <option value="XXL">XXL</option>
            </Select>
            <div className="mt-3 text-xs font-medium text-muted">Bank details</div>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Account holder</Label>
                <Input name="bank_account_holder" />
              </div>
              <div>
                <Label>Bank name</Label>
                <Input name="bank_name" />
              </div>
              <div>
                <Label>Account number</Label>
                <Input name="bank_account_number" />
              </div>
              <div>
                <Label>IFSC</Label>
                <Input name="bank_ifsc" />
              </div>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea name="notes" rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Link href="/employees">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit">Save employee</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
