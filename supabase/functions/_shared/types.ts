// ============================================================
// SCHOOLBOT - ALL TYPES
// supabase/functions/_shared/types.ts
// ✅ Added: All custom fee setup state types
// ✅ Added: All school branding and customization state types
// ✅ Added: Parent upgrade/alerts state types
// ✅ Added: Super admin state types
// ============================================================

// ─── User Roles ────────────────────────────────────────────────────────────
export type UserRole = 'parent' | 'admin' | 'teacher';

// ─── All possible bot states ───────────────────────────────────────────────
export type BotState =
  // ── Parent states ─────────────────────────────────────
  | 'MAIN_MENU'
  | 'ATTENDANCE_SELECT_STUDENT'
  | 'ATTENDANCE_OPTIONS'
  | 'FEES_SELECT_STUDENT'
  | 'FEES_OPTIONS'
  | 'FEES_SELECT_INVOICE'
  | 'FEES_CONFIRM_PAY'
  | 'PAYMENT_PENDING'
  | 'PICKUP_SELECT_STUDENT'
  | 'PICKUP_VIEW'
  | 'ALERT_PLAN_SELECT'

  // ── Admin core states ─────────────────────────────────
  | 'ADMIN_MAIN_MENU'
  | 'ADMIN_ATTENDANCE_MENU'
  | 'ADMIN_ATTENDANCE_SELECT_CLASS'
  | 'ADMIN_ATTENDANCE_MARKING'
  | 'ADMIN_FEES_MENU'
  | 'ADMIN_STUDENTS_SEARCH'
  | 'ADMIN_FEES_SELECT_STUDENT'
  | 'ADMIN_FEES_RECORD_PAYMENT'
  | 'ADMIN_FEES_AWAITING_CONFIRM'

  // ── Admin custom fee setup states ─────────────────────
  | 'ADMIN_FEE_SETUP_MENU'
  | 'ADMIN_FEE_ENTER_NAME'
  | 'ADMIN_FEE_ENTER_AMOUNT'
  | 'ADMIN_FEE_SELECT_TARGET'
  | 'ADMIN_FEE_ENTER_DUE_DATE'
  | 'ADMIN_FEE_CONFIRM_CREATE'
  | 'ADMIN_FEE_SEARCH_STUDENT'
  | 'ADMIN_FEE_SELECT_STUDENT'
  | 'ADMIN_FEE_IND_ENTER_NAME'
  | 'ADMIN_FEE_IND_ENTER_AMOUNT'
  | 'ADMIN_FEE_IND_CONFIRM'
  | 'ADMIN_FEE_VIEW_LIST'

  // ── Admin customization & branding states ──────────────
  | 'ADMIN_CUSTOMIZATION_MENU'
  | 'ADMIN_AWAITING_IMAGE'
  | 'ADMIN_AWAITING_TEXT_INPUT'
  | 'ADMIN_GRADE_SCALE_MENU'
  | 'ADMIN_PASSPORT_SEARCH_STUDENT'
  | 'ADMIN_PASSPORT_SELECT_STUDENT'
  | 'ADMIN_AWAITING_PASSPORT'

  // ── Broadcast states ──────────────────────────────────
  | 'ADMIN_BROADCAST_MENU'
  | 'ADMIN_BROADCAST_COMPOSE'
  | 'ADMIN_BROADCAST_CONFIRM'

  // ── Staff states ──────────────────────────────────────
  | 'ADMIN_STAFF_MENU'
  | 'ADMIN_ADDING_STAFF_NAME'
  | 'ADMIN_ADDING_STAFF_PHONE'
  | 'ADMIN_ADDING_STAFF_ROLE'

  // ── Upload states ─────────────────────────────────────
  | 'ADMIN_UPLOAD_MENU'
  | 'ADMIN_AWAITING_CSV'
  | 'ADMIN_CONFIRM_UPLOAD'
  | 'ADMIN_SCORE_UPLOAD_TERM_SELECT'
  | 'ADMIN_AWAITING_SCORE_CSV'
  | 'ADMIN_CONFIRM_SCORE_UPLOAD'

  // ── Report states ─────────────────────────────────────
  | 'ADMIN_REPORTS_MENU'
  | 'ADMIN_REPORT_SEARCH_STUDENT'

  // ── Receipt states ────────────────────────────────────
  | 'ADMIN_RECEIPT_MENU'
  | 'ADMIN_RECEIPT_SEARCH'
  | 'ADMIN_RECEIPT_VIEW'

  // ── Multi-school & onboarding states ──────────────────
  | 'SELECT_SCHOOL'
  | 'AWAITING_SETUP_FEE'
  | 'AWAITING_WA_CONNECTION';

// ─── School ────────────────────────────────────────────────────────────────
export interface School {
  id:                  string;
  name:                string;
  slug:                string;
  email:               string | null;
  phone:               string | null;
  logo_url:            string | null;
  address:             string | null;
  country:             string;
  timezone:            string;
  is_active:           boolean;
  setup_fee_paid:      boolean;
  onboarding_status:   string;
  subscription_status: string;
  student_count:       number;
  stamp_url?:          string | null;
  signature_url?:      string | null;
  motto?:              string | null;
  website?:            string | null;
  principal_name?:     string | null;
  receipt_footer?:     string | null;
  result_footer?:      string | null;
}

// ─── Parent ────────────────────────────────────────────────────────────────
export interface Parent {
  id:                 string;
  school_id:          string;
  full_name:          string;
  phone:              string;
  whatsapp_number:    string | null;
  email:              string | null;
  preferred_language: string;
  schools?:           School;
}

// ─── Student ───────────────────────────────────────────────────────────────
export interface Student {
  id:                            string;
  school_id:                     string;
  first_name:                    string;
  last_name:                     string;
  middle_name:                   string | null;
  admission_number:              string;
  status:                        string;
  gender:                        string | null;
  date_of_birth:                 string | null;
  class_id:                      string | null;
  class_arm_id:                  string | null;
  passport_url:                  string | null;
  classes:                       { id: string; name: string } | null;
  class_arms:                    { id: string; name: string } | null;
  // From student_parents join
  relationship:                  string | null;
  is_primary:                    boolean;
  can_receive_attendance:        boolean;
  can_receive_fee_notifications: boolean;
  can_receive_results:           boolean;
  can_pickup:                    boolean;
  // Computed fields
  full_name:                     string;
  class_name:                    string;
  arm_name:                      string;
}

// ─── Invoice ───────────────────────────────────────────────────────────────
export interface Invoice {
  id:             string;
  school_id:      string;
  student_id:     string;
  invoice_number: string | null;
  amount:         number;
  amount_paid:    number;
  balance:        number;
  status:         string;
  due_date:       string | null;
  title:          string;
  is_overdue:     boolean;
}

// ─── Fee Structure ─────────────────────────────────────────────────────────
export interface FeeStructure {
  id:               string;
  school_id:        string;
  title:            string;
  amount:           number;
  due_date:         string | null;
  term_id:          string | null;
  academic_year_id: string | null;
  fee_type:         'tuition' | 'custom' | 'individual';
  is_active:        boolean;
  applies_to:       'all' | 'class' | 'arm' | 'individual';
  target_class_id:  string | null;
  target_arm_id:    string | null;
  created_at:       string;
  updated_at:       string;
}

// ─── WhatsApp Account ──────────────────────────────────────────────────────
export interface WhatsAppAccount {
  id:              string;
  school_id:       string;
  phone_number_id: string;
  access_token:    string;
  status:          string;
}

// ─── School User (admin/teacher) ───────────────────────────────────────────
export interface SchoolUser {
  id:        string;
  school_id: string;
  user_id:   string;
  role_id:   string;
  status:    string;
  roles?: {
    id:   string;
    name: string;
  };
  profiles?: {
    id:         string;
    full_name:  string;
    phone:      string | null;
    avatar_url: string | null;
  };
}

// ─── Platform Admin (you — the owner) ─────────────────────────────────────
export interface PlatformAdmin {
  id:              string;
  full_name:       string;
  email:           string;
  phone:           string | null;
  whatsapp_number: string | null;
  role:            'super_admin' | 'support' | 'finance';
  is_active:       boolean;
}

// ─── Bot Session ───────────────────────────────────────────────────────────
export interface BotSession {
  id:                  string;
  phone:               string;
  parent_id:           string | null;
  school_user_id:      string | null;
  school_id:           string;
  role:                UserRole;
  state:               BotState;
  sub_state:           string | null;
  selected_student_id: string | null;
  data:                Record<string, unknown>;
  last_activity:       string;
  created_at:          string;
  // Joined at runtime (not stored in DB)
  parent?:             Parent;
  students?:           Student[];
  schoolUser?:         SchoolUser;
  waAccount?:          WhatsAppAccount | null;
}

// ─── WhatsApp Webhook Types ────────────────────────────────────────────────
export interface WebhookBody {
  object: string;
  entry:  WebhookEntry[];
}

export interface WebhookEntry {
  id:      string;
  changes: WebhookChange[];
}

export interface WebhookChange {
  value: WebhookValue;
  field: string;
}

export interface WebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id:      string;
  };
  contacts?: WebhookContact[];
  messages?: IncomingMessage[];
  statuses?: MessageStatus[];
}

export interface WebhookContact {
  profile: { name: string };
  wa_id:   string;
}

export interface MessageStatus {
  id:           string;
  status:       'sent' | 'delivered' | 'read' | 'failed';
  timestamp:    string;
  recipient_id: string;
  errors?:      Array<{ code: number; title: string }>;
}

// ─── Incoming WhatsApp Message ─────────────────────────────────────────────
export interface IncomingMessage {
  id:        string;
  from:      string;
  timestamp: string;
  type:
    | 'text'
    | 'interactive'
    | 'image'
    | 'document'
    | 'audio'
    | 'video'
    | 'location'
    | 'sticker'
    | 'reaction';
  text?: {
    body: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id:    string;
      title: string;
    };
    list_reply?: {
      id:          string;
      title:       string;
      description?: string;
    };
  };
  document?: {
    id:         string;
    filename?:  string;
    mime_type?: string;
    sha256?:    string;
    file_size?: number;
  };
  image?: {
    id:         string;
    mime_type?: string;
    sha256?:    string;
  };
  location?: {
    latitude:  number;
    longitude: number;
    name?:     string;
    address?:  string;
  };
}

// ─── WhatsApp Send Helpers ─────────────────────────────────────────────────
export interface ListRow {
  id:          string;
  title:       string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows:  ListRow[];
}

export interface ButtonOption {
  id:    string;
  title: string;
}

// ─── Onboarding ────────────────────────────────────────────────────────────
export type OnboardingStep =
  | 'COLLECT_NAME'
  | 'COLLECT_SCHOOL_NAME'
  | 'COLLECT_STUDENT_COUNT'
  | 'COLLECT_SCHOOL_TYPE'
  | 'COLLECT_LOCATION'
  | 'COLLECT_EMAIL'
  | 'SHOW_SETUP_FEE'
  | 'AWAITING_SETUP_FEE'
  | 'BANK_SELECT'
  | 'BANK_ACCOUNT_NUMBER'
  | 'BANK_CONFIRM'
  | 'CLASS_MENU'
  | 'CLASS_ADD_NAME'
  | 'CLASS_ADD_ARM'
  | 'STAFF_MENU'
  | 'STAFF_ADD_NAME'
  | 'STAFF_ADD_PHONE'
  | 'STAFF_ADD_ROLE'
  | 'COMPLETE';

export interface OnboardingState {
  phone:              string;
  step:               OnboardingStep;
  source:             'marketing' | 'main';
  // Collected info
  contactName:        string | null;
  schoolName:         string | null;
  studentCount:       number | null;
  studentCountRange:  string | null;
  schoolType:         string | null;
  location:           string | null;
  email:              string | null;
  // School record
  schoolId:           string | null;
  setupFeePaid:       boolean;
  // Temporary data for multi-step inputs
  tempData:           Record<string, unknown>;
  lastActivity:       number;
}

// ─── Marketing / Demo ──────────────────────────────────────────────────────
export interface DemoSession {
  id:              string;
  phone:           string;
  contact_name:    string | null;
  school_name:     string | null;
  school_type:     string | null;
  location:        string | null;
  student_count:   string | null;
  email:           string | null;
  state:           string;
  ai_context:      Array<{ role: string; content: string }>;
  interested:      boolean;
  registered:      boolean;
  demo_completed:  boolean;
}

// ─── Super Admin WhatsApp Session ──────────────────────────────────────────
export interface SuperAdminSession {
  phone:        string;
  adminId:      string;
  adminName:    string;
  state:        SuperAdminState;
  data:         Record<string, unknown>;
  lastActivity: number;
}

export type SuperAdminState =
  | 'SUPER_MAIN_MENU'
  | 'SUPER_SCHOOLS_LIST'
  | 'SUPER_SCHOOL_VIEW'
  | 'SUPER_SCHOOL_DEBUG'
  | 'SUPER_PAYMENTS_MENU'
  | 'SUPER_REVENUE_REPORT'
  | 'SUPER_COMMISSIONS'
  | 'SUPER_SETUP_FEES'
  | 'SUPER_BROADCAST_ALL'
  | 'SUPER_BROADCAST_COMPOSE'
  | 'SUPER_BROADCAST_CONFIRM'
  | 'SUPER_TICKETS'
  | 'SUPER_LOGS';

// ─── Fee Receipt ───────────────────────────────────────────────────────────
export interface FeeReceipt {
  id:              string;
  school_id:       string;
  payment_id:      string;
  student_id:      string;
  invoice_id:      string | null;
  receipt_number:  string;
  amount_paid:     number;
  payment_method:  string | null;
  payment_date:    string | null;
  issued_to:       string | null;
  sent_to_parent:  boolean;
  sent_at:         string | null;
  created_at:      string;
}

// ─── Bulk Upload ───────────────────────────────────────────────────────────
export interface BulkUploadJob {
  id:              string;
  school_id:       string;
  upload_type:     string;
  file_name:       string | null;
  total_rows:      number;
  processed_rows:  number;
  success_rows:    number;
  failed_rows:     number;
  status:
    | 'pending'
    | 'processing'
    | 'completed'
    | 'completed_with_errors'
    | 'failed';
  errors:          Array<{
    row:     number;
    field:   string;
    message: string;
  }>;
  result_summary:  Record<string, unknown>;
}

export interface ParsedStudent {
  first_name:       string;
  last_name:        string;
  admission_number: string;
  class_name:       string;
  class_arm:        string;
  gender:           string | null;
  date_of_birth:    string | null;
  parent_name:      string | null;
  parent_phone:     string | null;
  parent_email:     string | null;
  blood_group:      string | null;
  medical_notes:    string | null;
}

// ─── Term Report ───────────────────────────────────────────────────────────
export interface TermReportData {
  school:        Record<string, unknown>;
  term:          string;
  academic_year: string;
  generated_at:  string;
  report_type:   string;
  attendance?: {
    total_school_days: number;
    total_students:    number;
    present:           number;
    absent:            number;
    late:              number;
    excused:           number;
    attendance_rate:   string;
  };
  fees?: {
    total_billed:          number;
    total_billed_fmt:      string;
    total_paid:            number;
    total_paid_fmt:        string;
    total_outstanding:     number;
    total_outstanding_fmt: string;
    collection_rate:       string;
    total_invoices:        number;
    paid_invoices:         number;
    pending_invoices:      number;
    total_transactions:    number;
  };
  classes?: Array<{
    class:           string;
    arms:            string[];
    students:        number;
    attendance_rate: string;
  }>;
}

// ─── Paystack ──────────────────────────────────────────────────────────────
export interface SetupFeeInfo {
  tier:        string;
  amount:      number;
  description: string;
}

export interface PaymentCharges {
  schoolAmount:       number;
  platformCommission: number;
  paystackCharge:     number;
  totalParentPays:    number;
  breakdown:          string;
}

export interface PaymentVerifyResult {
  ok:                  boolean;
  schoolFeeAmount?:    number;
  platformCommission?: number;
  paystackCharge?:     number;
  totalPaid?:          number;
  invoiceId?:          string;
  studentId?:          string;
  schoolId?:           string;
  parentPhone?:        string;
  channel?:            string;
  reference?:          string;
}

export interface SetupFeeVerifyResult {
  ok:            boolean;
  schoolId?:     string;
  adminPhone?:   string;
  amount?:       number;
  studentCount?: number;
  tierName?:     string;
}
