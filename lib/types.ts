export type UserRole = "admin" | "staff";

export type ClientStatus = "active" | "inactive" | "prospect";

export interface Client {
  id: string;
  name: string;
  email: string | null;
  business_name: string | null;
  business_website: string | null;
  phone: string | null;
  address: string | null;
  status: ClientStatus;
  notes: string | null;
  sales_owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type CommunicationType = "email" | "call" | "meeting" | "note";

export interface ClientCommunication {
  id: string;
  client_id: string;
  type: CommunicationType;
  subject: string;
  body: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";

export interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  amount_cents: number;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string | null;
  client_id: string;
  amount_cents: number;
  payment_date: string;
  method: string | null;
  notes: string | null;
  created_at: string;
}

export type EmploymentType = "full_time" | "part_time" | "contractor";
export type EmployeeStatus = "active" | "inactive";
export type PayType = "fixed" | "commission" | "hybrid";

export interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  start_date: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  pay_type: PayType;
  base_salary_cents: number;
  commission_rate_percent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CommissionStatus = "pending" | "approved" | "paid";

export interface CommissionEntry {
  id: string;
  employee_id: string;
  client_id: string | null;
  description: string;
  base_amount_cents: number;
  rate_percent: number;
  commission_amount_cents: number;
  status: CommissionStatus;
  period_start: string;
  period_end: string;
  created_at: string;
}

export type PayrollStatus = "draft" | "processed" | "paid";

export interface PayrollRun {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  base_amount_cents: number;
  commission_amount_cents: number;
  total_amount_cents: number;
  status: PayrollStatus;
  processed_at: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export type FounderRole = "sales" | "operations" | "partner";

export interface FounderAssignment {
  id: string;
  employee_id: string;
  role: FounderRole;
  active: boolean;
  created_at: string;
}

export interface DistributionRun {
  id: string;
  period_start: string;
  period_end: string;
  revenue_usd_cents: number | null;
  exchange_rate: number | null;
  revenue_inr_cents: number;
  total_salaries_inr_cents: number;
  distributable_inr_cents: number;
  company_retained_inr_cents: number;
  notes: string | null;
  created_at: string;
}

export interface DistributionShare {
  id: string;
  run_id: string;
  employee_id: string;
  role: FounderRole;
  percent_of_pool: number;
  amount_inr_cents: number;
  created_at: string;
}

export type BillingFrequency = "monthly" | "quarterly" | "biannual" | "annual" | "one_time";
export type VendorStatus = "active" | "inactive";

export interface Vendor {
  id: string;
  name: string;
  category: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_frequency: BillingFrequency;
  amount_cents: number;
  next_due_date: string | null;
  status: VendorStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  recurring_annually: boolean;
  notes: string | null;
  created_at: string;
}
