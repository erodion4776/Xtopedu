// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { ParentService } from '../services/parent.service.ts';
import { AdminService } from '../services/admin.service.ts';
import { getSupabase } from '../supabase.ts';

// Parent flows
import {
  showMainMenu,
  showNewUserOptions,
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

import type { IncomingMessage, BotSession } from '../types.ts';

const sessions = new SessionService();
const parentSvc = new ParentService();
const adminSvc = new AdminService();
const db = getSupabase();

const RESET_KEYWORDS = new Set([
  'hi', 'hello', 'hey', 'start',
  'menu', 'home', 'restart', '00',
]);

// ─── Currency formatter ────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function handleMessage(
  message: IncomingMessage
): Promise<void> {
  const phone = message.from;
  const rawText = extractRawText(message);
  const input = extractInput(message);

  console.log(`[Bot] ${phone} | input="${input.substring(0, 50)}"`);

  // Check for staff invitation token (8 char alphanumeric)
  if (
    message.type === 'text' &&
    /^[A-Z0-9]{8}$/i.test(rawText.trim())
  ) {
    const wa = new WhatsApp();
    await handleInvitationToken(
      phone, rawText.trim().toUpperCase(), wa
    );
    return;
  }

  // Check active onboarding session
  const obSession = getOnboardingSession(phone);
  if (obSession) {
    const obWa = new WhatsApp();
    const handled = await handleOnboardingInput(
      phone, input, rawText, obWa, obSession.source
    );
    if (handled) return;
  }

  // Handle document uploads
  if (message.type === 'document') {
    const session = await sessions.get(phone);
    if (session && session.role !== 'parent') {
      const wa = new WhatsApp(session.waAccount);
      await handleCSVDocument(phone, session, message, wa);
    } else {
      const wa = new WhatsApp();
      await wa.text(
        phone,
        `I can only handle text messages and menu selections.\n\nType *menu* to get started.`
      );
    }
    return;
  }

  // Handle onboarding buttons
  if (input === 'start_school_onboarding') {
    const wa = new WhatsApp();
    startOnboardingSession(phone, 'main');
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\nLet's get you set up!\n\nWhat is your *full name*?`
    );
    return;
  }

  if (input === 'enter_invite_code') {
    const wa = new WhatsApp();
    await showInviteCodePrompt(phone, wa);
    return;
  }

  // Reset keywords
  if (!input || RESET_KEYWORDS.has(input)) {
    await handleReset(phone, message);
    return;
  }

  // Get existing session
  const session = await sessions.get(phone);
  if (!session) {
    await handleReset(phone, message);
    return;
  }

  await sessions.touch(phone);
  const wa = new WhatsApp(session.waAccount);

  // Global shortcuts
  if (input === '0' || input === 'back' || input === 'main_menu') {
    if (session.role === 'parent') {
      await showMainMenu(phone, session, wa);
    } else {
      await showAdminMenu(phone, session, wa);
    }
    return;
  }

  // Route by role
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
    default:
      await showMainMenu(phone, session, wa);
  }
}

// ─── Parent main menu handler ──────────────────────────────────
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
    case 'menu_alerts':
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
    case 'fees':
    case 'fee':
      await startFees(phone, session, wa);
      break;
    case 'attendance':
    case 'att':
      await startAttendance(phone, session, wa);
      break;
    case 'alerts':
    case 'plan':
    case 'upgrade':
      await showAlertPlans(phone, session, wa);
      await sessions.setState(phone, 'ALERT_PLAN_SELECT');
      break;
    // Demo options for new users who got a session somehow
    case 'demo_attendance':
      await showAttendanceDemo(phone, wa);
      break;
    case 'demo_fees':
      await showFeesDemo(phone, wa);
      break;
    case 'demo_pickup':
      await showPickupDemo(phone, wa);
      break;
    case 'demo_pricing':
      await showPricingDemo(phone, wa);
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
      if (input.startsWith('paymethod_')) {
        await handlePayMethod(phone, session, input, wa);
      } else if (input.startsWith('confirm_pay_')) {
        await confirmPayment(phone, session, input, wa);
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
        `📤 Please send a *CSV file* as attachment.\n\nType *0* to go back.`
      );
      break;
    case 'ADMIN_CONFIRM_UPLOAD':
      await handleConfirmUpload(phone, session, input, wa);
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
        await handleStudentReportSelect(phone, session, input, wa);
      } else {
        await handleStudentReportSearch(phone, session, rawText, wa);
      }
      break;
    case 'ADMIN_RECEIPT_MENU':
      await handleReceiptMenu(phone, session, input, rawText, wa);
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

// ─── Admin main menu handler ───────────────────────────────────
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
      await wa.text(phone, `🔍 *Search Students*\n\nType a student name or admission number:`);
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
// RESET HANDLER - Identifies who the user is
// ============================================================

async function handleReset(
  phone: string,
  message: IncomingMessage
): Promise<void> {
  const wa = new WhatsApp();
  const formatted = new ParentService().formatPhone(phone);

  // 1. Check platform super admin
  const { data: platformAdmin } = await db
    .from('platform_admins')
    .select('id, full_name, phone, whatsapp_number, is_active, role')
    .or(`phone.eq.${formatted},whatsapp_number.eq.${formatted}`)
    .eq('is_active', true)
    .single();

  if (platformAdmin) {
    await db.from('platform_admins')
      .update({ last_login: new Date().toISOString() })
      .eq('id', platformAdmin.id);

    // Create admin session for super admin
    const adminUser = {
      id: platformAdmin.id,
      school_id: platformAdmin.id,
      user_id: platformAdmin.id,
      role_id: 'super_admin',
      status: 'active',
      roles: { id: 'super_admin', name: 'super_admin' },
      profiles: {
        id: platformAdmin.id,
        full_name: platformAdmin.full_name,
        phone: platformAdmin.phone ?? null,
        avatar_url: null,
      },
    };

    const session = await sessions.createAdminSession(
      phone,
      adminUser as never,
      null,
      'admin'
    );

    await showAdminMenu(phone, session, wa);
    return;
  }

  // 2. Check registered parent
  const parent = await parentSvc.findByPhone(phone);

  if (parent) {
    const [students, waAccount] = await Promise.all([
      parentSvc.getStudents(parent.id),
      parentSvc.getWaAccount(parent.school_id),
    ]);

    const contactId = await parentSvc.ensureContact(parent, phone);
    if (contactId) {
      await parentSvc.ensureConversation(contactId, parent.school_id);
    }

    await ensureParentSubscription(parent.id, parent.school_id);

    const session = await sessions.createParentSession(
      phone, parent, students, waAccount
    );

    const schoolWa = new WhatsApp(waAccount);
    await showMainMenu(phone, session, schoolWa);
    return;
  }

  // 3. Check registered staff/admin
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
        `❌ *Access Denied*\n\nContact your school administrator.`
      );
      return;
    }

    const role = isAdmin ? 'admin' : 'teacher';
    const session = await sessions.createAdminSession(
      phone, schoolUser, waAccount, role as 'admin' | 'teacher'
    );

    const schoolWa = new WhatsApp(waAccount);
    await showAdminMenu(phone, session, schoolWa);
    return;
  }

  // 4. Unknown user - Show Demo/Marketing options
  await showDemoWelcome(phone, wa);
}

// ============================================================
// DEMO FLOWS (for new unknown users / school owners)
// ============================================================

async function showDemoWelcome(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  // Log as potential lead
  const formatted = phone.replace(/\D/g, '').replace(/^0/, '234');
  await db.from('demo_sessions').upsert({
    phone: formatted,
    state: 'WELCOME',
    ai_context: [],
    interested: true,
    registered: false,
    demo_completed: false,
    last_activity: new Date().toISOString(),
  }, { onConflict: 'phone' }).catch(() => {});

  await wa.text(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `I'm *Sabi* — your SchoolBot assistant! 🤖✨\n\n` +
    `SchoolBot helps Nigerian schools manage:\n` +
    `✅ Student attendance (WhatsApp alerts to parents)\n` +
    `💰 Fee collection & online payments\n` +
    `🚗 Student pickup management\n` +
    `📊 School reports & analytics\n\n` +
    `*All through WhatsApp — no app needed!*`
  );

  await new Promise((r) => setTimeout(r, 1000));

  await wa.list(
    phone,
    `🏫 SchoolBot`,
    `What would you like to do?`,
    `Powered by SchoolBot`,
    `📋 Choose Option`,
    [
      {
        title: '🎯 See Demo',
        rows: [
          {
            id: 'DEMO_ATTENDANCE',
            title: '✅ Attendance Demo',
            description: 'See how parent alerts work',
          },
          {
            id: 'DEMO_FEES',
            title: '💰 Fee Collection Demo',
            description: 'Online payments demo',
          },
          {
            id: 'DEMO_PICKUP',
            title: '🚗 Pickup Security Demo',
            description: 'Student pickup alerts',
          },
          {
            id: 'DEMO_PRICING',
            title: '💵 See Pricing',
            description: 'One-time setup fee only',
          },
        ],
      },
      {
        title: '🚀 Get Started',
        rows: [
          {
            id: 'START_SCHOOL_ONBOARDING',
            title: '🏫 Register My School',
            description: 'Start free onboarding now',
          },
          {
            id: 'ENTER_INVITE_CODE',
            title: '🔑 I Have an Invite Code',
            description: 'For teachers and staff',
          },
        ],
      },
    ]
  );
}

async function showAttendanceDemo(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `✅ *Attendance Demo*\n\n` +
    `When teacher marks attendance:\n\n` +
    `Parent instantly receives:\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ *Attendance Update*\n\n` +
    `👤 *Chidi Okonkwo* marked *Present*\n` +
    `🏫 Class: JSS 3A\n` +
    `⏰ Arrival: 07:45 AM\n\n` +
    `_Greenfield Academy_\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📊 *Results at Greenfield Academy:*\n` +
    `• 412 parents notified in 2 mins\n` +
    `• 98.4% delivery rate\n` +
    `• Absences reduced by 67%!`
  );

  await new Promise((r) => setTimeout(r, 1500));

  await wa.buttons(
    phone,
    `Want to see more features? 👀`,
    [
      { id: 'DEMO_FEES', title: '💰 Fee Demo' },
      { id: 'DEMO_PICKUP', title: '🚗 Pickup Demo' },
      { id: 'START_SCHOOL_ONBOARDING', title: '🚀 Register Now' },
    ]
  );
}

async function showFeesDemo(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `💰 *Fee Collection Demo*\n\n` +
    `Parent pays from WhatsApp:\n\n` +
    `📋 *Payment Summary*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 Chidi Okonkwo - JSS 3A\n\n` +
    `💵 School Fee:     ${fmt(50000)}\n` +
    `🏷️ Platform Fee:   ${fmt(750)} (1.5%)\n` +
    `🏦 Processing Fee: ${fmt(125)}\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💳 *Parent Pays: ${fmt(50875)}*\n\n` +
    `🏫 *School receives ${fmt(50000)}* (100%)\n\n` +
    `📈 Schools see 58% → *91%* collection!`
  );

  await new Promise((r) => setTimeout(r, 1500));

  await wa.buttons(
    phone,
    `Ready to collect fees online? 🚀`,
    [
      { id: 'DEMO_PICKUP', title: '🚗 Pickup Demo' },
      { id: 'DEMO_PRICING', title: '💵 See Pricing' },
      { id: 'START_SCHOOL_ONBOARDING', title: '🚀 Register Now' },
    ]
  );
}

async function showPickupDemo(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🚗 *Pickup Security Demo*\n\n` +
    `When student is picked up:\n\n` +
    `Parent instantly receives:\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🚗 *Pickup Notification*\n\n` +
    `✅ *Amara Adeleke* has been\n` +
    `picked up from school!\n\n` +
    `👤 By: Mrs. Funmi Adeleke\n` +
    `👥 Relationship: Mother\n` +
    `⏰ Time: 2:30 PM\n\n` +
    `⚠️ If not authorized contact\n` +
    `school immediately!\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🔐 Every pickup logged & verified!`
  );

  await new Promise((r) => setTimeout(r, 1500));

  await wa.buttons(
    phone,
    `Parents love this for child safety! 🔐`,
    [
      { id: 'DEMO_PRICING', title: '💵 See Pricing' },
      { id: 'START_SCHOOL_ONBOARDING', title: '🚀 Register Now' },
      { id: 'DEMO_ATTENDANCE', title: '↩️ Back' },
    ]
  );
}

async function showPricingDemo(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `💵 *SchoolBot Pricing*\n\n` +
    `*One-Time Setup Fee:*\n` +
    `(Pay once — use forever!)\n\n` +
    `👥 1-100 students:     ₦25,000\n` +
    `👥 101-300 students:   ₦50,000\n` +
    `👥 301-500 students:   ₦80,000\n` +
    `👥 501-1000 students: ₦120,000\n` +
    `👥 1001-2000 students:₦180,000\n` +
    `👥 2000+ students:    ₦250,000\n\n` +
    `*Plus 1.5% commission per payment*\n` +
    `(Added on parent bill)\n` +
    `(Your school gets 100%!) 💪\n\n` +
    `✅ No monthly subscription!\n` +
    `✅ No hidden charges!\n` +
    `✅ Lifetime access! 🎉`
  );

  await new Promise((r) => setTimeout(r, 1500));

  await wa.buttons(
    phone,
    `Ready to get started? 🚀`,
    [
      { id: 'START_SCHOOL_ONBOARDING', title: '🚀 Register Now' },
      { id: 'DEMO_ATTENDANCE', title: '↩️ See Demo' },
    ]
  );
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
      parent_id: parentId,
      school_id: schoolId,
      plan_id: basicPlan?.id ?? null,
      plan_slug: 'basic',
      billing_type: 'monthly',
      amount_paid: 0,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Non critical
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
