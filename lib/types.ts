export type UserRole = "admin" | "staff" | "employee";

export type ClientStatus = "active" | "inactive" | "prospect";
export type InvoicePayoutType = "normal" | "hourly" | "bonus";

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
  ops_owner_id: string | null;
  is_foundation_account: boolean;
  default_payout_type: InvoicePayoutType;
  fixed_payout_base_usd_cents: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ClientPayoutSplitType = "sales" | "ops";

export interface ClientPayoutSplit {
  id: string;
  client_id: string;
  project_id: string | null;
  split_type: ClientPayoutSplitType;
  employee_id: string;
  share_percent: number;
  created_at: string;
}

export interface ClientAssignment {
  id: string;
  client_id: string;
  employee_id: string;
  role: string | null;
  created_at: string;
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
  project_id: string | null;
  invoice_number: string;
  amount_cents: number;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string | null;
  notes: string | null;
  conversion_rate: number | null;
  payout_type: InvoicePayoutType;
  bonus_co_handler_employee_id: string | null;
  bonus_handler_share_percent: number;
  paid_at: string | null;
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

export type EmploymentType = "full_time" | "part_time" | "contractual";
export type EmployeeStatus = "active" | "inactive";
export type PayType = "fixed" | "commission" | "hybrid";
export type FounderSalaryBasis = "full_time" | "half_time" | "hourly_director" | "custom";
export type TShirtSize = "XS" | "S" | "M" | "L" | "XL" | "XXL";

export interface Employee {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  start_date: string;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  pay_type: PayType;
  base_salary_cents: number;
  commission_rate_percent: number;
  is_founder: boolean;
  salary_basis: FounderSalaryBasis;
  salary_basis_hours: number;
  salary_basis_custom_cents: number;
  bank_account_holder: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_name: string | null;
  t_shirt_size: TShirtSize | null;
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
  employee_id: string | null;
  created_at: string;
}

export interface MonthlyScorecard {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  attendance_score: number;
  punctuality_score: number;
  work_performance_score: number;
  manager_feedback_score: number;
  responsiveness_score: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PayoutShareCategory =
  | "sales"
  | "ops"
  | "partner"
  | "salary"
  | "bonus"
  | "foundation_excess"
  | "client_excess";

export interface PayoutRun {
  id: string;
  period_start: string;
  period_end: string;
  conversion_total_inr_cents: number;
  esque_total_inr_cents: number;
  foundation_excess_inr_cents: number;
  computed_at: string;
}

export interface PayoutShare {
  id: string;
  run_id: string;
  employee_id: string;
  category: PayoutShareCategory;
  source_invoice_id: string | null;
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

export type ProjectStatus = "not_started" | "ongoing" | "completed" | "blocked_by_client";
export type ProjectType = "monthly" | "one_time";

export interface Project {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  project_type: ProjectType;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ProjectBillingType = "hourly" | "fixed_contract";

export interface ProjectAssignment {
  id: string;
  project_id: string;
  employee_id: string;
  billing_type: ProjectBillingType | null;
  hourly_rate_cents: number | null;
  hours: number | null;
  fixed_contract_amount_cents: number | null;
  created_at: string;
}
