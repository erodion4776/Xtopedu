// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { ParentService } from '../services/parent.service.ts';
import { AdminService } from '../services/admin.service.ts';
import { getSupabase } from '../supabase.ts';

// ── Parent flows ─────────────────────────────────────────────────────────
import {
  showMainMenu,
  showNewUserOptions,
  showInviteCodePrompt,
  showProfile,
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

// ── Admin flows ───────────────────────────────────────────────────────────
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

// ── Onboarding ────────────────────────────────────────────────────────────
import {
  getOnboardingSession,
  handleOnboardingInput,
  startOnboardingSession,
  handleInvitationToken,
} from '../onboarding/engine.ts';

import type { IncomingMessage, BotSession } from '../types.ts';

// ─── Services ──────────────────────────────────────────────────────────────
const sessions = new SessionService();
const parentSvc = new ParentService();
const adminSvc = new AdminService();
const db = getSupabase();

// ─── Reset keywords ────────────────────────────────────────────────────────
const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start',
  'menu', 'home', 'restart', '00',
]);

// ============================================================
// MAIN ENTRY POINT
// Called from whatsapp-webhook/index.ts
// ============================================================

export async function handleMessage(
  message: IncomingMessage
): Promise<void> {
  const phone = message.from;

  // Extract what the user sent
  const rawText = extractRawText(message);
  const input = extractInput(message);

  console.log(
    `[Bot] ${phone} | type=${message.type} | input="${input.substring(0, 50)}"`
  );

  // ── Check for staff invitation token first ─────────────────────────────
  // 8-character alphanumeric code (e.g. ABC12345)
  if (
    message.type === 'text' &&
    /^[A-Z0-9]{8}$/i.test(rawText.trim())
  ) {
    const wa = new WhatsApp();
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ── Check active onboarding session ────────────────────────────────────
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const obWa = new WhatsApp();
    const handled = await handleOnboardingInput(
      phone,
      input,
      rawText,
      obWa,
      obSession.source
    );
    if (handled) return;
  }

  // ── Handle document uploads (CSV files) ────────────────────────────────
  if (message.type === 'document') {
    const session = await sessions.get(phone);
    if (session && session.role !== 'parent') {
      const wa = new WhatsApp(session.waAccount);
      await handleCSVDocument(phone, session, message, wa);
    } else {
      const wa = new WhatsApp();
      await wa.text(
        phone,
        `I can only handle text messages and menu selections.\n\n` +
        `Type *menu* to get started.`
      );
    }
    return;
  }

  // ── Handle start onboarding button ────────────────────────────────────
  if (input === 'start_school_onboarding') {
    const wa = new WhatsApp();
    startOnboardingSession(phone, 'main');
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\n` +
      `Let's get you set up!\n\n` +
      `What is your *full name*?`
    );
    return;
  }

  // ── Handle invite code prompt ─────────────────────────────────────────
  if (input === 'enter_invite_code') {
    const wa = new WhatsApp();
    await showInviteCodePrompt(phone, wa);
    return;
  }

  // ── Reset keywords ────────────────────────────────────────────────────
  if (!input || RESET_KEYWORDS.has(input)) {
    await handleReset(phone, message);
    return;
  }

  // ── Get existing session ──────────────────────────────────────────────
  const session = await sessions.get(phone);

  if (!session) {
    await handleReset(phone, message);
    return;
  }

  // Update last activity
  await sessions.touch(phone);

  // Get WhatsApp client
  const wa = new WhatsApp(session.waAccount);

  // ── Global shortcuts ──────────────────────────────────────────────────
  if (input === '0' || input === 'back') {
    if (session.role === 'parent') {
      await showMainMenu(phone, session, wa);
    } else {
      await showAdminMenu(phone, session, wa);
    }
    return;
  }

  if (input === 'main_menu') {
    if (session.role === 'parent') {
      await showMainMenu(phone, session, wa);
    } else {
      await showAdminMenu(phone, session, wa);
    }
    return;
  }

  // ── Route by role ─────────────────────────────────────────────────────
  if (session.role === 'parent') {
    await routeParent(phone, session, input, rawText, wa);
  } else {
    await routeAdmin(phone, session, input, rawText, wa);
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

    // ── Main menu ──────────────────────────────────────────────────────
    case 'MAIN_MENU':
      await handleParentMainMenu(phone, session, input, wa);
      break;

    // ── Attendance ─────────────────────────────────────────────────────
    case 'ATTENDANCE_SELECT_STUDENT':
      await attStudentSelect(phone, session, input, wa);
      break;

    case 'ATTENDANCE_OPTIONS':
      await handleAttendanceOption(phone, session, input, wa);
      break;

    // ── Fees ───────────────────────────────────────────────────────────
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

    // ── Pickup ─────────────────────────────────────────────────────────
    case 'PICKUP_SELECT_STUDENT':
      await pickupStudentSelect(phone, session, input, wa);
      break;

    case 'PICKUP_VIEW':
      if (input === 'main_menu') {
        await showMainMenu(phone, session, wa);
      } else {
        await showMainMenu(phone, session, wa);
      }
      break;

    // ── Default ────────────────────────────────────────────────────────
    default:
      await showMainMenu(phone, session, wa);
  }
}

// ─── Handle parent main menu selections ───────────────────────────────────
async function handleParentMainMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'menu_attendance':
      await startAttendance(phone, session, wa);
      break;

    case 'menu_fees':
      await startFees(phone, session, wa);
      break;

    case 'menu_pickup':
      await startPickup(phone, session, wa);
      break;

    case 'menu_profile':
      await showProfile(phone, session, wa);
      break;

    case 'menu_help':
      await wa.text(
        phone,
        `❓ *Help*\n\n` +
        `📌 *Keywords:*\n` +
        `• Type *menu* or *hi* → Main menu\n` +
        `• Type *0* → Go back\n\n` +
        `📌 *Features:*\n` +
        `✅ Check daily attendance\n` +
        `📊 View term attendance summary\n` +
        `💰 View & pay school fees\n` +
        `🧾 Receive payment receipts\n` +
        `🚗 View pickup contacts\n\n` +
        `📞 *Need help?*\n` +
        `Contact your school admin office.`
      );
      break;

    // Handle keyword shortcuts
    case 'fees':
    case 'fee':
      await startFees(phone, session, wa);
      break;

    case 'attendance':
    case 'att':
      await startAttendance(phone, session, wa);
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

    // ── Admin main menu ────────────────────────────────────────────────
    case 'ADMIN_MAIN_MENU':
      await handleAdminMainMenu(phone, session, input, wa);
      break;

    // ── Attendance ─────────────────────────────────────────────────────
    case 'ADMIN_ATTENDANCE_MENU':
      await handleAdminAttMenu(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_SELECT_CLASS':
      await handleClassSelect(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_MARKING':
      await handleMarking(phone, session, input, wa);
      break;

    // ── Fees ───────────────────────────────────────────────────────────
    case 'ADMIN_FEES_MENU':
      await handleAdminFeesMenu(phone, session, input, wa);
      break;

    case 'ADMIN_STUDENTS_SEARCH':
      // Text input for student search
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
      if (input.startsWith('paymethod_')) {
        await handlePayMethod(phone, session, input, wa);
      } else if (input.startsWith('confirm_pay_')) {
        await confirmPayment(phone, session, input, wa);
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    // ── Staff ──────────────────────────────────────────────────────────
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

    // ── Broadcast ──────────────────────────────────────────────────────
    case 'ADMIN_BROADCAST_MENU':
      if (input.startsWith('bcast_class_')) {
        await handleBroadcastTarget(phone, session, input, wa);
      } else {
        await handleBroadcastMenu(phone, session, input, wa);
      }
      break;

    case 'ADMIN_BROADCAST_COMPOSE':
      // Raw text input for the message
      await handleBroadcastCompose(phone, session, rawText, wa);
      break;

    case 'ADMIN_BROADCAST_CONFIRM':
      await handleBroadcastConfirm(phone, session, input, wa);
      break;

    // ── Upload ─────────────────────────────────────────────────────────
    case 'ADMIN_UPLOAD_MENU':
      await handleUploadMenu(phone, session, input, wa);
      break;

    case 'ADMIN_AWAITING_CSV':
      // Waiting for CSV document
      // Document handled at top of handleMessage
      // If they send text here, remind them
      await wa.text(
        phone,
        `📤 Please send a *CSV file* as\n` +
        `an attachment.\n\n` +
        `Type *0* to go back.`
      );
      break;

    case 'ADMIN_CONFIRM_UPLOAD':
      await handleConfirmUpload(phone, session, input, wa);
      break;

    // ── Reports ────────────────────────────────────────────────────────
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
        await handleStudentReportSelect(phone, session, input, wa);
      } else {
        // Text input for student search
        await handleStudentReportSearch(
          phone,
          session,
          rawText,
          wa
        );
      }
      break;

    // ── Receipts ───────────────────────────────────────────────────────
    case 'ADMIN_RECEIPT_MENU':
      await handleReceiptMenu(phone, session, input, rawText, wa);
      break;

    case 'ADMIN_RECEIPT_SEARCH':
      // Text input for receipt search
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

    // ── Default ────────────────────────────────────────────────────────
    default:
      await showAdminMenu(phone, session, wa);
  }
}

// ─── Handle admin main menu selections ────────────────────────────────────
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
        `admission number:\n\n` +
        `_Example: John or ADM/001_`
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

// ============================================================
// RESET HANDLER
// Identifies who the user is and creates/resets their session
// ============================================================

async function handleReset(
  phone: string,
  message: IncomingMessage
): Promise<void> {
  const wa = new WhatsApp();
  const formatted = new ParentService().formatPhone(phone);

  // ── 1. Check if platform super admin ─────────────────────────────────
  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active, role')
    .or(
      `phone.eq.${formatted},whatsapp_number.eq.${formatted}`
    )
    .eq('is_active', true)
    .single();

  if (platformAdmin) {
    // Update last login
    await db
      .from('platform_admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', platformAdmin.id);

    // Route to super admin handler
    const { handleSuperAdminMessage } = await import(
      './superadmin/super.handler.ts'
    );

    await handleSuperAdminMessage(message, {
      id: platformAdmin.id,
      full_name: platformAdmin.full_name,
    });
    return;
  }

  // ── 2. Check if registered parent ────────────────────────────────────
  const parent = await parentSvc.findByPhone(phone);

  if (parent) {
    const [students, waAccount] = await Promise.all([
      parentSvc.getStudents(parent.id),
      parentSvc.getWaAccount(parent.school_id),
    ]);

    // Ensure contact and conversation records
    const contactId = await parentSvc.ensureContact(parent, phone);
    if (contactId) {
      await parentSvc.ensureConversation(
        contactId,
        parent.school_id
      );
    }

    // Create parent session
    const session = await sessions.createParentSession(
      phone,
      parent,
      students,
      waAccount
    );

    // Use school WhatsApp account
    const schoolWa = new WhatsApp(waAccount);
    await showMainMenu(phone, session, schoolWa);
    return;
  }

  // ── 3. Check if registered staff/admin ───────────────────────────────
  const schoolUser = await adminSvc.findStaffByPhone(phone);

  if (schoolUser) {
    const waAccount = await parentSvc.getWaAccount(
      schoolUser.school_id
    );

    const isAdmin = adminSvc.isAdmin(schoolUser);
    const isTeacher = adminSvc.isTeacher(schoolUser);

    if (!isAdmin && !isTeacher) {
      await wa.text(
        phone,
        `❌ *Access Denied*\n\n` +
        `You do not have access to this bot.\n\n` +
        `Contact your school administrator.`
      );
      return;
    }

    const role = isAdmin ? 'admin' : 'teacher';

    // Create admin session
    const session = await sessions.createAdminSession(
      phone,
      schoolUser,
      waAccount,
      role
    );

    const schoolWa = new WhatsApp(waAccount);
    await showAdminMenu(phone, session, schoolWa);
    return;
  }

  // ── 4. Unknown user - show options ───────────────────────────────────
  await showNewUserOptions(phone, wa);
}

// ============================================================
// INPUT EXTRACTION HELPERS
// ============================================================

// Extract button/list ID or text from message
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

// Extract raw text (preserves case, for name/message inputs)
export function extractRawText(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}
