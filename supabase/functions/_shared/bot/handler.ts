// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ============================================================

import { WhatsApp }       from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { ParentService }  from '../services/parent.service.ts';
import { AdminService }   from '../services/admin.service.ts';
import { getSupabase }    from '../supabase.ts';
import {
  formatPhone,
  isInviteToken,
  delay,
} from '../utils.ts';

// ── Parent flows ──────────────────────────────────────────
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

// ── Admin flows ───────────────────────────────────────────
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

// ── Super admin bot ───────────────────────────────────────
import {
  showSuperAdminMenu,
  handleSuperAdminMenu,
  handleSuperAdminBroadcast,
  isSuperAdminTestMode,
  clearTestMode,
} from './superadmin/superadmin.menu.ts';

// ── Marketing bot ─────────────────────────────────────────
import {
  handleMarketingMessage,
  hasActiveMarketingSession,
} from './marketing/marketing.handler.ts';

// ── Onboarding ────────────────────────────────────────────
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

const sessions  = new SessionService();
const parentSvc = new ParentService();
const adminSvc  = new AdminService();
const db        = getSupabase();

const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start',
  'menu', 'home', 'restart', '00',
]);

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function handleMessage(
  message: IncomingMessage,
  waAccount: WhatsAppAccount | null,
  isPlatformNumber = false
): Promise<void> {
  const phone   = message.from;
  const rawText = extractRawText(message);
  const input   = extractInput(message);

  console.log(
    `[Bot] ${phone} | ` +
    `platform=${isPlatformNumber} | ` +
    `input="${input.substring(0, 50)}"`
  );

  const wa = new WhatsApp(waAccount);

  // ── Staff invite token ──────────────────────────────────
  if (message.type === 'text' && isInviteToken(rawText)) {
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ╔══════════════════════════════════════════════════════╗
  // ║  ✅ SUPER ADMIN CHECK — MUST BE FIRST               ║
  // ║  Check if this phone is a platform admin BEFORE     ║
  // ║  any marketing or session checks. This ensures      ║
  // ║  the super admin ALWAYS gets their panel and        ║
  // ║  never falls through to the marketing bot.          ║
  // ╚══════════════════════════════════════════════════════╝
  if (isPlatformNumber) {
    const formatted = formatPhone(phone);

    const { data: platformAdmin } = await db
      .from('platform_admins')
      .select(
        'id, full_name, phone, whatsapp_number, ' +
        'is_active, role'
      )
      .or(
        `phone.eq.${formatted},` +
        `whatsapp_number.eq.${formatted}`
      )
      .eq('is_active', true)
      .maybeSingle();

    if (platformAdmin) {
      // ✅ This is the super admin — handle directly
      await handleSuperAdminMessage(
        phone,
        message,
        rawText,
        input,
        platformAdmin,
        waAccount,
        wa
      );
      return;
    }
  }

  // ── EXIT keyword — leave test mode ──────────────────────
  if (
    message.type === 'text' &&
    rawText.trim().toUpperCase() === 'EXIT' &&
    isPlatformNumber
  ) {
    const testMode = await isSuperAdminTestMode(phone);
    if (testMode.active) {
      await clearTestMode(phone);
      await sessions.delete(phone);
      await wa.text(
        phone,
        `✅ *Test Mode Ended*\n\n` +
        `Returning to your admin panel...`
      );
      await delay(500);
      await handleReset(
        phone, message, wa, waAccount, isPlatformNumber
      );
      return;
    }
  }

  // ── Super admin test mode routing ───────────────────────
  if (isPlatformNumber) {
    const testMode = await isSuperAdminTestMode(phone);
    if (testMode.active) {
      if (testMode.testRole === 'marketing') {
        await handleMarketingMessage(message);
        return;
      }
      // parent/admin test — let normal routing handle
    }
  }

  // ── Active onboarding session ───────────────────────────
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── Marketing session check (DB-backed) ─────────────────
  // Only for platform number AND not a known staff/parent
  if (isPlatformNumber) {
    const isMarketingUser =
      await hasActiveMarketingSession(formatPhone(phone));

    if (isMarketingUser) {
      await handleMarketingMessage(message);
      return;
    }
  }

  // ── Document uploads ────────────────────────────────────
  if (message.type === 'document') {
    const session = await sessions.get(phone);
    if (session && session.role !== 'parent') {
      await handleDocumentUpload(
        phone, session, message, wa
      );
    } else {
      await wa.text(
        phone,
        `📎 I can only handle text messages\n` +
        `and menu selections.\n\n` +
        `Type *menu* to continue.`
      );
    }
    return;
  }

  // ── Only text and interactive beyond this ────────────────
  if (!['text', 'interactive'].includes(message.type)) {
    await wa.text(
      phone,
      `I can only understand text messages\n` +
      `and menu selections.\n\n` +
      `Type *hi* to continue.`
    );
    return;
  }

  // ── Onboarding triggers ─────────────────────────────────
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

  // ── Reset keywords ──────────────────────────────────────
  if (!input || RESET_KEYWORDS.has(input)) {
    await handleReset(
      phone, message, wa, waAccount, isPlatformNumber
    );
    return;
  }

  // ── Get existing DB session ─────────────────────────────
  const session = await sessions.get(phone);

  if (!session) {
    if (isPlatformNumber) {
      await handleMarketingMessage(message);
    } else {
      await handleReset(
        phone, message, wa, waAccount, isPlatformNumber
      );
    }
    return;
  }

  await sessions.touch(phone);

  // ── Global shortcuts ────────────────────────────────────
  if (['0', 'back', 'main_menu'].includes(input)) {
    if (session.role === 'parent') {
      await showMainMenu(phone, session, wa);
    } else if (isSuperAdminRole(session)) {
      await showSuperAdminMenu(phone, session, wa);
    } else {
      await showAdminMenu(phone, session, wa);
    }
    return;
  }

  // ── Route by role ───────────────────────────────────────
  if (session.role === 'parent') {
    await routeParent(
      phone, session, input, rawText, wa
    );
  } else if (isSuperAdminRole(session)) {
    await routeSuperAdmin(
      phone, session, input, rawText, wa
    );
  } else {
    await routeAdmin(
      phone, session, input, rawText, wa
    );
  }
}

// ============================================================
// ✅ SUPER ADMIN MESSAGE HANDLER
// Handles ALL messages from the super admin phone number
// Called immediately after confirming they are super admin
// ============================================================

async function handleSuperAdminMessage(
  phone:         string,
  message:       IncomingMessage,
  rawText:       string,
  input:         string,
  platformAdmin: Record<string, unknown>,
  waAccount:     WhatsAppAccount | null,
  wa:            WhatsApp
): Promise<void> {
  // Update last login
  await db
    .from('platform_admins')
    .update({ last_login: new Date().toISOString() })
    .eq('id', platformAdmin.id as string);

  // ── EXIT test mode ──────────────────────────────────────
  if (rawText.trim().toUpperCase() === 'EXIT') {
    const testMode = await isSuperAdminTestMode(phone);
    if (testMode.active) {
      await clearTestMode(phone);
      await sessions.delete(phone);
      await wa.text(
        phone,
        `✅ *Test Mode Ended*\n\n` +
        `Returning to your admin panel...`
      );
      await delay(500);
    }
    // Fall through to show super admin menu
  }

  // ── Check test mode ─────────────────────────────────────
  const testMode = await isSuperAdminTestMode(phone);

  if (testMode.active) {
    if (testMode.testRole === 'marketing') {
      // Super admin testing marketing bot
      await handleMarketingMessage(message);
      return;
    }
    // For parent/admin test, a real session was created
    // Get that session and route through normal flow
    const testSession = await sessions.get(phone);
    if (testSession) {
      await sessions.touch(phone);
      if (testSession.role === 'parent') {
        const testWa = new WhatsApp(
          testSession.waAccount ?? waAccount
        );
        if (['0', 'back', 'main_menu'].includes(input)) {
          await showMainMenu(phone, testSession, testWa);
        } else {
          await routeParent(
            phone, testSession, input, rawText, testWa
          );
        }
      } else {
        const testWa = new WhatsApp(
          testSession.waAccount ?? waAccount
        );
        if (['0', 'back', 'main_menu'].includes(input)) {
          await showAdminMenu(phone, testSession, testWa);
        } else {
          await routeAdmin(
            phone, testSession, input, rawText, testWa
          );
        }
      }
      return;
    }
  }

  // ── Get or create super admin session ───────────────────
  let session = await sessions.get(phone);

  if (!session) {
    // Create super admin session
    const adminUser = {
      id:        platformAdmin.id as string,
      school_id: platformAdmin.id as string,
      user_id:   platformAdmin.id as string,
      role_id:   'super_admin',
      status:    'active',
      roles: {
        id:   'super_admin',
        name: 'super_admin',
      },
      profiles: {
        id:         platformAdmin.id as string,
        full_name:  platformAdmin.full_name as string,
        phone:      platformAdmin.phone as string | null,
        avatar_url: null,
      },
    };

    session = await sessions.createAdminSession(
      phone,
      adminUser as never,
      waAccount,
      'admin'
    );
  } else {
    await sessions.touch(phone);
  }

  // ── Reset keywords — show super admin menu ───────────────
  if (!input || RESET_KEYWORDS.has(input)) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  // ── Global shortcuts ────────────────────────────────────
  if (['0', 'back', 'main_menu'].includes(input)) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  // ── Route to super admin handler ─────────────────────────
  await routeSuperAdmin(phone, session, input, rawText, wa);
}

// ─── Check if session is super admin ──────────────────────
function isSuperAdminRole(session: BotSession): boolean {
  return (
    session.schoolUser?.roles?.name === 'super_admin' ||
    (
      session.school_id === session.school_user_id &&
      session.role === 'admin'
    )
  );
}

// ============================================================
// IDENTIFY USER — RESET HANDLER
// Only called for NON super admin users
// ============================================================

async function handleReset(
  phone:            string,
  message:          IncomingMessage,
  wa:               WhatsApp,
  waAccount:        WhatsAppAccount | null,
  isPlatformNumber: boolean
): Promise<void> {
  const formatted = formatPhone(phone);

  // ── 1. Check registered parent ──────────────────────────
  const parent = await parentSvc.findByPhone(phone);

  if (parent) {
    const [students, schoolWaAccount] = await Promise.all([
      parentSvc.getStudents(parent.id),
      parentSvc.getWaAccount(parent.school_id),
    ]);

    const contactId =
      await parentSvc.ensureContact(parent, phone);
    if (contactId) {
      await parentSvc.ensureConversation(
        contactId, parent.school_id
      );
    }

    await ensureParentSubscription(
      parent.id, parent.school_id
    );

    const session = await sessions.createParentSession(
      phone, parent, students, schoolWaAccount
    );

    const schoolWa = new WhatsApp(schoolWaAccount);
    await showMainMenu(phone, session, schoolWa);
    return;
  }

  // ── 2. Check registered staff / admin ───────────────────
  const schoolUser =
    await adminSvc.findStaffByPhone(phone);

  if (schoolUser) {
    const schoolWaAccount =
      await parentSvc.getWaAccount(schoolUser.school_id);

    const isAdmin   = adminSvc.isAdmin(schoolUser);
    const isTeacher = adminSvc.isTeacher(schoolUser);

    if (!isAdmin && !isTeacher) {
      await wa.text(
        phone,
        `❌ *Access Denied*\n\n` +
        `Your account does not have bot access.\n\n` +
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

  // ── 3. Unknown user ─────────────────────────────────────
  if (isPlatformNumber) {
    // Platform number → Marketing bot
    await handleMarketingMessage(message);
  } else {
    // School number → Option B
    await showSchoolUnknownUser(phone, wa, waAccount);
  }
}

// ============================================================
// UNKNOWN USER ON SCHOOL NUMBER (Option B)
// ============================================================

async function showSchoolUnknownUser(
  phone:     string,
  wa:        WhatsApp,
  waAccount: WhatsAppAccount | null
): Promise<void> {
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
    `👋 *Welcome to ${schoolName}!*\n\n` +
    `Your number is not registered yet.\n\n` +
    `Are you a:`,
    [
      { id: 'IM_A_PARENT',       title: '👨‍👩‍👧 Parent' },
      { id: 'ENTER_INVITE_CODE', title: '🔑 I Have a Code' },
    ],
    schoolName,
    `Select your role to continue`
  );
}

// ============================================================
// SUPER ADMIN ROUTING
// ============================================================

async function routeSuperAdmin(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  // Broadcast compose state
  if (session.sub_state === 'SA_BROADCAST_COMPOSE') {
    await handleSuperAdminBroadcast(
      phone, session, rawText, wa
    );
    return;
  }

  // All other inputs
  await handleSuperAdminMenu(
    phone, session, input, rawText, wa
  );
}

// ============================================================
// PARENT ROUTING
// ============================================================

async function routeParent(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  if (input === 'im_a_parent') {
    await showParentNotRegistered(phone, wa, session);
    return;
  }

  if (input === 'enter_invite_code') {
    await showInviteCodePrompt(phone, wa);
    return;
  }

  switch (session.state) {

    case 'MAIN_MENU':
      await handleParentMainMenu(
        phone, session, input, wa
      );
      break;

    case 'ATTENDANCE_SELECT_STUDENT':
      await attStudentSelect(phone, session, input, wa);
      break;

    case 'ATTENDANCE_OPTIONS':
      await handleAttendanceOption(
        phone, session, input, wa
      );
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

    default:
      await showMainMenu(phone, session, wa);
  }
}

async function showParentNotRegistered(
  phone:   string,
  wa:      WhatsApp,
  session: BotSession
): Promise<void> {
  const schoolName =
    (session.parent?.schools?.name as string | undefined)
    ?? 'the school';

  await wa.text(
    phone,
    `👨‍👩‍👧 *Parent Registration*\n\n` +
    `To access *${schoolName}* bot,\n` +
    `please contact the school office\n` +
    `to register your WhatsApp number.\n\n` +
    `Once registered, send *hi* to access:\n\n` +
    `✅ Daily attendance records\n` +
    `💰 Fee balance & payments\n` +
    `🚗 Pickup information\n` +
    `📝 Term results`
  );
}

async function handleParentMainMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
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
        `✅ Attendance records\n` +
        `💰 View & pay school fees\n` +
        `🧾 Payment receipts\n` +
        `🚗 Pickup contacts\n` +
        `🔔 Manage alert plan\n\n` +
        `📞 Contact school admin for help.`
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
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  switch (session.state) {

    case 'ADMIN_MAIN_MENU':
      await handleAdminMainMenu(
        phone, session, input, wa
      );
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
      await handleStudentSearch(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEES_SELECT_STUDENT':
      if (input.startsWith('student_')) {
        await handleFeesStudentSelect(
          phone, session, input, wa
        );
      } else if (input.startsWith('record_pay_')) {
        await handleRecordPayment(
          phone, session, input, wa
        );
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    case 'ADMIN_FEES_RECORD_PAYMENT':
      if (input.startsWith('paymethod_')) {
        await handlePayMethod(phone, session, input, wa);
      } else if (input.startsWith('record_pay_')) {
        await handleRecordPayment(
          phone, session, input, wa
        );
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
      await handleAddStaffName(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_ADDING_STAFF_PHONE':
      await handleAddStaffPhone(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_ADDING_STAFF_ROLE':
      await handleAddStaffRole(phone, session, input, wa);
      break;

    case 'ADMIN_BROADCAST_MENU':
      if (input.startsWith('bcast_class_')) {
        await handleBroadcastTarget(
          phone, session, input, wa
        );
      } else {
        await handleBroadcastMenu(
          phone, session, input, wa
        );
      }
      break;

    case 'ADMIN_BROADCAST_COMPOSE':
      await handleBroadcastCompose(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_BROADCAST_CONFIRM':
      await handleBroadcastConfirm(
        phone, session, input, wa
      );
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
        `📤 Please send your *score CSV*\n` +
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
        await handleReportTermSelect(
          phone, session, input, wa
        );
      } else if (input.startsWith('rpt_class_sel_')) {
        await handleClassReportSelect(
          phone, session, input, wa
        );
      } else if (input.startsWith('rpt_')) {
        await handleReportTypeSelect(
          phone, session, input, wa
        );
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
      await handleReceiptSearch(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_RECEIPT_VIEW':
      if (input.startsWith('gen_receipt_')) {
        await handleGenerateReceipt(
          phone, session, input, wa
        );
      } else if (input.startsWith('send_receipt_')) {
        await handleSendReceipt(
          phone, session, input, wa
        );
      } else {
        await startReceiptMgmt(phone, session, wa);
      }
      break;

    default:
      await showAdminMenu(phone, session, wa);
  }
}

async function handleAdminMainMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
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
        `Type student name or admission number:`
      );
      await sessions.setState(
        phone, 'ADMIN_STUDENTS_SEARCH'
      );
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

// ============================================================
// DOCUMENT UPLOAD HANDLER
// ============================================================

async function handleDocumentUpload(
  phone:   string,
  session: BotSession,
  message: IncomingMessage,
  wa:      WhatsApp
): Promise<void> {
  if (session.state === 'ADMIN_AWAITING_CSV') {
    await handleCSVDocument(phone, session, message, wa);
  } else if (
    session.state === 'ADMIN_AWAITING_SCORE_CSV'
  ) {
    await handleScoreCSVDocument(
      phone, session, message, wa
    );
  } else {
    await wa.text(
      phone,
      `📤 To upload students go to:\n\n` +
      `*Admin Menu → Upload Students*\n\n` +
      `Then send your CSV file here.`
    );
  }
}

// ============================================================
// HELPERS
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
      .maybeSingle();

    if (existing) return;

    const { data: basicPlan } = await db
      .from('alert_plans')
      .select('id')
      .eq('slug', 'basic')
      .maybeSingle();

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
    // Non-critical
  }
}

export function extractInput(
  message: IncomingMessage
): string {
  if (message.type === 'text') {
    return (
      message.text?.body?.trim().toLowerCase() ?? ''
    );
  }
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.id
        ?.toLowerCase() ??
      message.interactive?.list_reply?.id
        ?.toLowerCase() ??
      ''
    );
  }
  return '';
}

export function extractRawText(
  message: IncomingMessage
): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}
