// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
//
// Central router for ALL incoming WhatsApp messages on
// school numbers. Identifies who the user is and routes
// them to the correct flow.
// ============================================================

import { WhatsApp }       from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { ParentService }  from '../services/parent.service.ts';
import { AdminService }   from '../services/admin.service.ts';
import { getSupabase }    from '../supabase.ts';
import { formatPhone, isInviteToken, delay } from '../utils.ts';

// Parent flows
import {
  showMainMenu,
  showInviteCodePrompt,
  showProfile,
  showAlertPlans,
  handlePlanSelect,
} from './menu.ts';

import {
  startAttendance,
  handleStudentSelect as attStudentSelect,
  handleAttendanceOption,
} from './attendance.ts';

import {
  startFees,
  handleStudentSelect as feesStudentSelect,
  handleFeesOption,
  handleInvoiceSelect,
  handleConfirmPay,
  handlePaymentPending,
} from './fees.ts';

import {
  startPickup,
  handleStudentSelect as pickupStudentSelect,
} from './pickup.ts';

// Admin flows
import {
  showAdminMenu,
  showAdminHelp,
  showTodayReport,
  showFeeStats,
} from './admin/admin.menu.ts';

import {
  startAdminAttendance,
  handleAdminAttMenu,
  handleClassSelect,
  handleMarking,
} from './admin/admin.attendance.ts';

import {
  startAdminFees,
  handleAdminFeesMenu,
  handleStudentSearch,
  handleFeesStudentSelect,
  handleRecordPayment,
  handlePayMethod,
  confirmPayment,
} from './admin/admin.fees.ts';

import {
  startStaffMgmt,
  handleStaffMenu,
  handleAddStaffName,
  handleAddStaffPhone,
  handleAddStaffRole,
} from './admin/admin.staff.ts';

import {
  startBroadcast,
  handleBroadcastMenu,
  handleBroadcastTarget,
  handleBroadcastCompose,
  handleBroadcastConfirm,
} from './admin/admin.broadcast.ts';

import {
  startBulkUpload,
  handleUploadMenu,
  handleCSVDocument,
  handleConfirmUpload,
  startScoreUpload,
  handleScoreUploadTermSelect,
  handleScoreCSVDocument,
  handleConfirmScoreUpload,
} from './admin/admin.uploads.ts';

import {
  startReports,
  handleReportTermSelect,
  handleReportTypeSelect,
  handleClassReportSelect,
  handleStudentReportSearch,
  handleStudentReportSelect,
} from './admin/admin.reports.ts';

import {
  startReceiptMgmt,
  handleReceiptMenu,
  handleReceiptSearch,
  handleGenerateReceipt,
  handleSendReceipt,
} from './admin/admin.receipts.ts';

// Onboarding
import {
  getOnboardingSession,
  handleOnboardingInput,
  startOnboardingSession,
  handleInvitationToken,
} from '../onboarding/engine.ts';

import type {
  IncomingMessage,
  BotSession,
  WhatsAppAccount,
} from '../types.ts';

const sessions   = new SessionService();
const parentSvc  = new ParentService();
const adminSvc   = new AdminService();
const db         = getSupabase();

// Keywords that reset the session and show main menu
const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start',
  'menu', 'home', 'restart', '00',
]);

// ============================================================
// MAIN ENTRY POINT
// Called by whatsapp-webhook/index.ts for every message
// ============================================================

export async function handleMessage(
  message: IncomingMessage,
  waAccount: WhatsAppAccount | null
): Promise<void> {
  const phone   = message.from;
  const rawText = extractRawText(message);
  const input   = extractInput(message);

  console.log(
    `[Bot] ${phone} | ` +
    `type=${message.type} | ` +
    `input="${input.substring(0, 50)}"`
  );

  // ── Create WhatsApp client for this school ───────────────
  const wa = new WhatsApp(waAccount);

  // ── Staff invite token (8 char alphanumeric) ─────────────
  if (message.type === 'text' && isInviteToken(rawText)) {
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ── Active onboarding session ────────────────────────────
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── Document / CSV upload ────────────────────────────────
  if (message.type === 'document') {
    const session = await sessions.get(phone);
    if (session && session.role !== 'parent') {
      await handleCSVOrScoreDocument(phone, session, message, wa);
    } else {
      await wa.text(
        phone,
        `📎 I can only handle text messages and\n` +
        `menu selections.\n\n` +
        `Type *menu* to get started.`
      );
    }
    return;
  }

  // ── Only handle text and interactive beyond this point ───
  if (!['text', 'interactive'].includes(message.type)) {
    await wa.text(
      phone,
      `I can only understand text messages\n` +
      `and menu selections.\n\n` +
      `Type *hi* to continue.`
    );
    return;
  }

  // ── School onboarding trigger ────────────────────────────
  if (input === 'start_school_onboarding') {
    startOnboardingSession(phone, 'main');
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\n` +
      `Let's get you set up!\n\n` +
      `What is your *full name*?`
    );
    return;
  }

  if (input === 'enter_invite_code') {
    await showInviteCodePrompt(phone, wa);
    return;
  }

  // ── Reset keywords ───────────────────────────────────────
  if (!input || RESET_KEYWORDS.has(input)) {
    await handleReset(phone, wa, waAccount);
    return;
  }

  // ── Get existing session ─────────────────────────────────
  const session = await sessions.get(phone);
  if (!session) {
    await handleReset(phone, wa, waAccount);
    return;
  }

  // Update last activity
  await sessions.touch(phone);

  // ── Global shortcuts ─────────────────────────────────────
  if (
    input === '0' ||
    input === 'back' ||
    input === 'main_menu'
  ) {
    if (session.role === 'parent') {
      await showMainMenu(phone, session, wa);
    } else {
      await showAdminMenu(phone, session, wa);
    }
    return;
  }

  // ── Route by role ─────────────────────────────────────────
  if (session.role === 'parent') {
    await routeParent(phone, session, input, rawText, wa);
  } else {
    await routeAdmin(phone, session, input, rawText, wa);
  }
}

// ============================================================
// IDENTIFY USER & CREATE SESSION (RESET HANDLER)
// ============================================================

async function handleReset(
  phone: string,
  wa: WhatsApp,
  waAccount: WhatsAppAccount | null
): Promise<void> {
  const formatted = formatPhone(phone);

  // ── 1. Check if platform super admin ────────────────────
  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active, role')
    .or(`phone.eq.${formatted},whatsapp_number.eq.${formatted}`)
    .eq('is_active', true)
    .single();

  if (platformAdmin) {
    await db
      .from('platform_admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', platformAdmin.id);

    const adminUser = {
      id:        platformAdmin.id,
      school_id: platformAdmin.id,
      user_id:   platformAdmin.id,
      role_id:   'super_admin',
      status:    'active',
      roles:     { id: 'super_admin', name: 'super_admin' },
      profiles: {
        id:         platformAdmin.id,
        full_name:  platformAdmin.full_name,
        phone:      platformAdmin.phone ?? null,
        avatar_url: null,
      },
    };

    const session = await sessions.createAdminSession(
      phone,
      adminUser as never,
      waAccount,
      'admin'
    );

    await showAdminMenu(phone, session, wa);
    return;
  }

  // ── 2. Check registered parent ───────────────────────────
  const parent = await parentSvc.findByPhone(phone);

  if (parent) {
    const [students, schoolWaAccount] = await Promise.all([
      parentSvc.getStudents(parent.id),
      parentSvc.getWaAccount(parent.school_id),
    ]);

    // Ensure contact & conversation records exist
    const contactId = await parentSvc.ensureContact(parent, phone);
    if (contactId) {
      await parentSvc.ensureConversation(
        contactId, parent.school_id
      );
    }

    // Ensure parent has a subscription (default: basic)
    await ensureParentSubscription(parent.id, parent.school_id);

    const session = await sessions.createParentSession(
      phone, parent, students, schoolWaAccount
    );

    // Use school's WhatsApp account for reply
    const schoolWa = new WhatsApp(schoolWaAccount);
    await showMainMenu(phone, session, schoolWa);
    return;
  }

  // ── 3. Check registered staff / admin ────────────────────
  const schoolUser = await adminSvc.findStaffByPhone(phone);

  if (schoolUser) {
    const schoolWaAccount = await parentSvc.getWaAccount(
      schoolUser.school_id
    );

    const isAdmin   = adminSvc.isAdmin(schoolUser);
    const isTeacher = adminSvc.isTeacher(schoolUser);

    if (!isAdmin && !isTeacher) {
      await wa.text(
        phone,
        `❌ *Access Denied*\n\n` +
        `Your account does not have\n` +
        `bot access.\n\n` +
        `Contact your school administrator.`
      );
      return;
    }

    const role = isAdmin ? 'admin' : 'teacher';
    const session = await sessions.createAdminSession(
      phone,
      schoolUser,
      schoolWaAccount,
      role as 'admin' | 'teacher'
    );

    const schoolWa = new WhatsApp(schoolWaAccount);
    await showAdminMenu(phone, session, schoolWa);
    return;
  }

  // ── 4. Unknown user — Option B welcome ───────────────────
  await showUnknownUserWelcome(phone, wa, waAccount);
}

// ============================================================
// UNKNOWN USER WELCOME (Option B)
// ============================================================

async function showUnknownUserWelcome(
  phone: string,
  wa: WhatsApp,
  waAccount: WhatsAppAccount | null
): Promise<void> {
  // Get school name from WA account if available
  let schoolName = 'this school';

  if (waAccount?.school_id) {
    const { data: school } = await db
      .from('schools')
      .select('name')
      .eq('id', waAccount.school_id)
      .single();

    if (school?.name) schoolName = school.name;
  }

  await wa.buttons(
    phone,
    `👋 *Welcome to ${schoolName} Bot!*\n\n` +
    `Your number is not registered yet.\n\n` +
    `Are you a:`,
    [
      {
        id: 'IM_A_PARENT',
        title: '👨‍👩‍👧 Parent',
      },
      {
        id: 'ENTER_INVITE_CODE',
        title: '🔑 I Have a Code',
      },
    ],
    `${schoolName}`,
    `Select your role to continue`
  );
}

// ─── Handle unknown user role selection ───────────────────
async function handleUnknownUserRole(
  phone: string,
  input: string,
  wa: WhatsApp,
  waAccount: WhatsAppAccount | null
): Promise<void> {
  if (input === 'im_a_parent') {
    let schoolName = 'the school';

    if (waAccount?.school_id) {
      const { data: school } = await db
        .from('schools')
        .select('name')
        .eq('id', waAccount.school_id)
        .single();
      if (school?.name) schoolName = school.name;
    }

    await wa.text(
      phone,
      `👨‍👩‍👧 *Parent Registration*\n\n` +
      `To get access to *${schoolName}* bot,\n` +
      `please contact the school office\n` +
      `to register your WhatsApp number.\n\n` +
      `The school admin will add you and\n` +
      `link your children to your number.\n\n` +
      `Once registered, send *hi* to\n` +
      `access your child's:\n` +
      `✅ Attendance records\n` +
      `💰 Fee status & payments\n` +
      `🚗 Pickup information\n` +
      `📝 Term results`
    );
    return;
  }

  if (input === 'enter_invite_code') {
    await showInviteCodePrompt(phone, wa);
    return;
  }
}

// ============================================================
// PARENT ROUTING
// ============================================================

async function routeParent(
  phone: string,
  session: BotSession,
  input: string,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  switch (session.state) {
    case 'MAIN_MENU':
      await handleParentMainMenu(phone, session, input, wa);
      break;

    case 'ATTENDANCE_SELECT_STUDENT':
      await attStudentSelect(phone, session, input, wa);
      break;

    case 'ATTENDANCE_OPTIONS':
      await handleAttendanceOption(phone, session, input, wa);
      break;

    case 'FEES_SELECT_STUDENT':
      await feesStudentSelect(phone, session, input, wa);
      break;

    case 'FEES_OPTIONS':
      await handleFeesOption(phone, session, input, wa);
      break;

    case 'FEES_SELECT_INVOICE':
      await handleInvoiceSelect(phone, session, input, wa);
      break;

    case 'FEES_CONFIRM_PAY':
      await handleConfirmPay(phone, session, input, wa);
      break;

    case 'PAYMENT_PENDING':
      await handlePaymentPending(phone, session, wa);
      break;

    case 'PICKUP_SELECT_STUDENT':
      await pickupStudentSelect(phone, session, input, wa);
      break;

    case 'PICKUP_VIEW':
      await showMainMenu(phone, session, wa);
      break;

    case 'ALERT_PLAN_SELECT':
      if (input.startsWith('plan_')) {
        await handlePlanSelect(phone, session, input, wa);
      } else {
        await showAlertPlans(phone, session, wa);
      }
      break;

    // Unknown user role selection (no session yet)
    case 'UNKNOWN_USER':
      await handleUnknownUserRole(
        phone, input, wa,
        session.waAccount ?? null
      );
      break;

    default:
      await showMainMenu(phone, session, wa);
  }
}

// ─── Parent main menu handler ─────────────────────────────
async function handleParentMainMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'menu_attendance':
    case 'attendance':
    case 'att':
      await startAttendance(phone, session, wa);
      break;

    case 'menu_fees':
    case 'fees':
    case 'fee':
      await startFees(phone, session, wa);
      break;

    case 'menu_pickup':
      await startPickup(phone, session, wa);
      break;

    case 'menu_profile':
      await showProfile(phone, session, wa);
      break;

    case 'menu_alerts':
    case 'alerts':
    case 'plan':
    case 'upgrade':
      await showAlertPlans(phone, session, wa);
      await sessions.setState(phone, 'ALERT_PLAN_SELECT');
      break;

    case 'menu_help':
      await wa.text(
        phone,
        `❓ *Help*\n\n` +
        `• Type *menu* or *hi* → Main menu\n` +
        `• Type *0* → Go back\n\n` +
        `📌 *Features:*\n` +
        `✅ Check daily attendance\n` +
        `💰 View & pay school fees\n` +
        `🧾 Payment receipts\n` +
        `🚗 Pickup contacts\n` +
        `🔔 Manage alert plan\n\n` +
        `📞 Contact school admin for help.`
      );
      break;

    // Unknown user buttons (if they somehow get here)
    case 'im_a_parent':
    case 'enter_invite_code':
      await handleUnknownUserRole(
        phone, input, wa,
        session.waAccount ?? null
      );
      break;

    default:
      await showMainMenu(phone, session, wa);
  }
}

// ============================================================
// ADMIN ROUTING
// ============================================================

async function routeAdmin(
  phone: string,
  session: BotSession,
  input: string,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  switch (session.state) {
    case 'ADMIN_MAIN_MENU':
      await handleAdminMainMenu(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_MENU':
      await handleAdminAttMenu(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_SELECT_CLASS':
      await handleClassSelect(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_MARKING':
      await handleMarking(phone, session, input, wa);
      break;

    case 'ADMIN_FEES_MENU':
      await handleAdminFeesMenu(phone, session, input, wa);
      break;

    case 'ADMIN_STUDENTS_SEARCH':
      await handleStudentSearch(phone, session, rawText, wa);
      break;

    case 'ADMIN_FEES_SELECT_STUDENT':
      if (input.startsWith('student_')) {
        await handleFeesStudentSelect(phone, session, input, wa);
      } else if (input.startsWith('record_pay_')) {
        await handleRecordPayment(phone, session, input, wa);
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    case 'ADMIN_FEES_RECORD_PAYMENT':
      if (input.startsWith('paymethod_')) {
        await handlePayMethod(phone, session, input, wa);
      } else if (input.startsWith('record_pay_')) {
        await handleRecordPayment(phone, session, input, wa);
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    case 'ADMIN_FEES_AWAITING_CONFIRM':
      if (input.startsWith('confirm_pay_')) {
        await confirmPayment(phone, session, input, wa);
      } else if (input.startsWith('paymethod_')) {
        await handlePayMethod(phone, session, input, wa);
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    case 'ADMIN_STAFF_MENU':
      await handleStaffMenu(phone, session, input, wa);
      break;

    case 'ADMIN_ADDING_STAFF_NAME':
      await handleAddStaffName(phone, session, rawText, wa);
      break;

    case 'ADMIN_ADDING_STAFF_PHONE':
      await handleAddStaffPhone(phone, session, rawText, wa);
      break;

    case 'ADMIN_ADDING_STAFF_ROLE':
      await handleAddStaffRole(phone, session, input, wa);
      break;

    case 'ADMIN_BROADCAST_MENU':
      if (input.startsWith('bcast_class_')) {
        await handleBroadcastTarget(phone, session, input, wa);
      } else {
        await handleBroadcastMenu(phone, session, input, wa);
      }
      break;

    case 'ADMIN_BROADCAST_COMPOSE':
      await handleBroadcastCompose(phone, session, rawText, wa);
      break;

    case 'ADMIN_BROADCAST_CONFIRM':
      await handleBroadcastConfirm(phone, session, input, wa);
      break;

    case 'ADMIN_UPLOAD_MENU':
      await handleUploadMenu(phone, session, input, wa);
      break;

    case 'ADMIN_AWAITING_CSV':
      await wa.text(
        phone,
        `📤 Please send your *CSV file*\n` +
        `as an attachment.\n\n` +
        `Type *0* to go back.`
      );
      break;

    case 'ADMIN_CONFIRM_UPLOAD':
      await handleConfirmUpload(phone, session, input, wa);
      break;

    case 'ADMIN_SCORE_UPLOAD_TERM_SELECT':
      await handleScoreUploadTermSelect(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_AWAITING_SCORE_CSV':
      await wa.text(
        phone,
        `📤 Please send your *score CSV file*\n` +
        `as an attachment.\n\n` +
        `Type *0* to go back.`
      );
      break;

    case 'ADMIN_CONFIRM_SCORE_UPLOAD':
      await handleConfirmScoreUpload(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_REPORTS_MENU':
      if (input.startsWith('report_term_')) {
        await handleReportTermSelect(phone, session, input, wa);
      } else if (input.startsWith('rpt_class_sel_')) {
        await handleClassReportSelect(phone, session, input, wa);
      } else if (input.startsWith('rpt_')) {
        await handleReportTypeSelect(phone, session, input, wa);
      } else {
        await startReports(phone, session, wa);
      }
      break;

    case 'ADMIN_REPORT_SEARCH_STUDENT':
      if (input.startsWith('student_report_')) {
        await handleStudentReportSelect(
          phone, session, input, wa
        );
      } else {
        await handleStudentReportSearch(
          phone, session, rawText, wa
        );
      }
      break;

    case 'ADMIN_RECEIPT_MENU':
      await handleReceiptMenu(
        phone, session, input, rawText, wa
      );
      break;

    case 'ADMIN_RECEIPT_SEARCH':
      await handleReceiptSearch(phone, session, rawText, wa);
      break;

    case 'ADMIN_RECEIPT_VIEW':
      if (input.startsWith('gen_receipt_')) {
        await handleGenerateReceipt(phone, session, input, wa);
      } else if (input.startsWith('send_receipt_')) {
        await handleSendReceipt(phone, session, input, wa);
      } else {
        await startReceiptMgmt(phone, session, wa);
      }
      break;

    default:
      await showAdminMenu(phone, session, wa);
  }
}

// ─── Admin main menu handler ──────────────────────────────
async function handleAdminMainMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'admin_attendance':
      await startAdminAttendance(phone, session, wa);
      break;

    case 'admin_fees':
      await startAdminFees(phone, session, wa);
      break;

    case 'admin_students':
      await wa.text(
        phone,
        `🔍 *Search Students*\n\n` +
        `Type a student name or\n` +
        `admission number:`
      );
      await sessions.setState(phone, 'ADMIN_STUDENTS_SEARCH');
      break;

    case 'admin_staff':
      await startStaffMgmt(phone, session, wa);
      break;

    case 'admin_broadcast':
      await startBroadcast(phone, session, wa);
      break;

    case 'admin_upload':
      await startBulkUpload(phone, session, wa);
      break;

    case 'admin_upload_scores':
      await startScoreUpload(phone, session, wa);
      break;

    case 'admin_reports':
      await startReports(phone, session, wa);
      break;

    case 'admin_receipts':
      await startReceiptMgmt(phone, session, wa);
      break;

    case 'admin_fee_stats':
      await showFeeStats(phone, session, wa);
      break;

    case 'admin_today_report':
      await showTodayReport(phone, session, wa);
      break;

    case 'admin_help':
      await showAdminHelp(phone, wa);
      break;

    default:
      await showAdminMenu(phone, session, wa);
  }
}

// ─── Handle CSV or Score document uploads ─────────────────
async function handleCSVOrScoreDocument(
  phone: string,
  session: BotSession,
  message: IncomingMessage,
  wa: WhatsApp
): Promise<void> {
  if (session.state === 'ADMIN_AWAITING_CSV') {
    await handleCSVDocument(phone, session, message, wa);
  } else if (session.state === 'ADMIN_AWAITING_SCORE_CSV') {
    await handleScoreCSVDocument(phone, session, message, wa);
  } else {
    await wa.text(
      phone,
      `📤 To upload students, go to:\n\n` +
      `*Admin Menu → Upload Students*\n\n` +
      `Then send your CSV file.`
    );
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

async function ensureParentSubscription(
  parentId: string,
  schoolId: string
): Promise<void> {
  try {
    const { data: existing } = await db
      .from('parent_subscriptions')
      .select('id')
      .eq('parent_id', parentId)
      .eq('school_id', schoolId)
      .single();

    if (existing) return;

    const { data: basicPlan } = await db
      .from('alert_plans')
      .select('id')
      .eq('slug', 'basic')
      .single();

    await db.from('parent_subscriptions').insert({
      parent_id:    parentId,
      school_id:    schoolId,
      plan_id:      basicPlan?.id ?? null,
      plan_slug:    'basic',
      billing_type: 'monthly',
      amount_paid:  0,
      status:       'active',
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    });
  } catch {
    // Non-critical — don't crash
  }
}

export function extractInput(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim().toLowerCase() ?? '';
  }
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.id?.toLowerCase() ??
      message.interactive?.list_reply?.id?.toLowerCase() ??
      ''
    );
  }
  return '';
}

export function extractRawText(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}
