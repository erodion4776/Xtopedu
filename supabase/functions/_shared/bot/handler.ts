// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ✅ Multi-school support added
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

import {
  showAdminMenu,
  showAdminMoreMenu,
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

import {
  showSuperAdminMenu,
  handleSuperAdminMenu,
  handleSuperAdminBroadcast,
  isSuperAdminTestMode,
  clearTestMode,
} from './superadmin/superadmin.menu.ts';

import {
  handleMarketingMessage,
  hasActiveMarketingSession,
} from './marketing/marketing.handler.ts';

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
// SUPER ADMIN DETECTION
// ============================================================

function getSuperAdminPhone(): string {
  return formatPhone(
    Deno.env.get('SUPER_ADMIN_PHONE') ?? ''
  );
}

function isSuperAdminPhone(phone: string): boolean {
  const superPhone = getSuperAdminPhone();
  if (!superPhone) return false;
  return formatPhone(phone) === superPhone;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

export async function handleMessage(
  message:          IncomingMessage,
  waAccount:        WhatsAppAccount | null,
  isPlatformNumber: boolean = false
): Promise<void> {
  const phone   = message.from;
  const rawText = extractRawText(message);
  const input   = extractInput(message);

  console.log(
    `[Bot] from=${phone} | ` +
    `platform=${isPlatformNumber} | ` +
    `superAdmin=${isSuperAdminPhone(phone)} | ` +
    `input="${input.substring(0, 40)}"`
  );

  const wa = new WhatsApp(waAccount);

  // ── Staff invite token ──────────────────────────────────
  if (
    message.type === 'text' &&
    isInviteToken(rawText)
  ) {
    await handleInvitationToken(
      phone,
      rawText.trim().toUpperCase(),
      wa
    );
    return;
  }

  // ── Super admin check FIRST ─────────────────────────────
  if (isSuperAdminPhone(phone)) {
    console.log('[Bot] ✅ Super admin detected');
    await handleSuperAdminFlow(
      phone, message, rawText, input, waAccount, wa
    );
    return;
  }

  // ── Onboarding session check ────────────────────────────
  const obSession = await getOnboardingSession(phone);
  if (obSession) {
    console.log(
      `[Bot] Onboarding | step: ${obSession.step}`
    );
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── Marketing session check ─────────────────────────────
  if (isPlatformNumber) {
    const isMarketingUser =
      await hasActiveMarketingSession(
        formatPhone(phone)
      );

    if (isMarketingUser) {
      const existingSession =
        await sessions.get(phone);

      if (
        existingSession &&
        existingSession.role !== 'parent' &&
        existingSession.school_id !== null
      ) {
        // Has admin session — skip marketing
        console.log(
          `[Bot] Has admin session, skip marketing`
        );
      } else {
        await handleMarketingMessage(message);
        return;
      }
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
    await startOnboardingSession(phone, 'main');
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
  } else {
    await routeAdmin(
      phone, session, input, rawText, wa
    );
  }
}

// ============================================================
// SUPER ADMIN FLOW
// ============================================================

async function handleSuperAdminFlow(
  phone:     string,
  message:   IncomingMessage,
  rawText:   string,
  input:     string,
  waAccount: WhatsAppAccount | null,
  wa:        WhatsApp
): Promise<void> {
  if (rawText.trim().toUpperCase() === 'EXIT') {
    const testMode = await isSuperAdminTestMode(phone);
    if (testMode.active) {
      await clearTestMode(phone);
      await sessions.delete(phone);
      await wa.text(
        phone,
        `✅ *Test Mode Ended*\n\n` +
        `Returning to your super admin panel...`
      );
      await delay(800);
    }
  }

  const testMode = await isSuperAdminTestMode(phone);

  if (testMode.active) {
    if (testMode.testRole === 'marketing') {
      await handleMarketingMessage(message);
      return;
    }

    const testSession = await sessions.get(phone);
    if (testSession) {
      await sessions.touch(phone);
      const testWa = new WhatsApp(
        testSession.waAccount ?? waAccount
      );

      if (['0', 'back', 'main_menu'].includes(input)) {
        if (testSession.role === 'parent') {
          await showMainMenu(phone, testSession, testWa);
        } else {
          await showAdminMenu(phone, testSession, testWa);
        }
        return;
      }

      if (testSession.role === 'parent') {
        await routeParent(
          phone, testSession, input, rawText, testWa
        );
      } else {
        await routeAdmin(
          phone, testSession, input, rawText, testWa
        );
      }
      return;
    }
  }

  let dbSession = await sessions.get(phone);

  if (!dbSession) {
    const { data, error } = await db
      .from('bot_sessions')
      .upsert(
        {
          phone:               formatPhone(phone),
          parent_id:           null,
          school_user_id:      null,
          school_id:           null,
          role:                'admin',
          state:               'ADMIN_MAIN_MENU',
          sub_state:           null,
          selected_student_id: null,
          data:                { is_super_admin: true },
          last_activity:       new Date().toISOString(),
        },
        { onConflict: 'phone' }
      )
      .select()
      .single();

    if (error) {
      console.error(
        '[SuperAdmin] Session error:', error.message
      );
    }

    dbSession = data as BotSession | null;
  } else {
    await sessions.touch(phone);
  }

  const session: BotSession = {
    ...(dbSession ?? {
      id:                  'sa-temp',
      phone:               formatPhone(phone),
      parent_id:           null,
      school_user_id:      null,
      school_id:           null,
      role:                'admin',
      state:               'ADMIN_MAIN_MENU',
      sub_state:           null,
      selected_student_id: null,
      data:                { is_super_admin: true },
      last_activity:       new Date().toISOString(),
      created_at:          new Date().toISOString(),
    }),
    schoolUser: {
      id:        'super_admin',
      school_id: 'super_admin',
      user_id:   'super_admin',
      role_id:   'super_admin',
      status:    'active',
      roles: {
        id:   'super_admin',
        name: 'super_admin',
      },
      profiles: {
        id:         'super_admin',
        full_name:  'Super Admin',
        phone:      phone,
        avatar_url: null,
      },
    },
    waAccount: waAccount,
  } as BotSession;

  if (!input || RESET_KEYWORDS.has(input)) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  if (['0', 'back', 'main_menu'].includes(input)) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  if (session.sub_state === 'SA_BROADCAST_COMPOSE') {
    await handleSuperAdminBroadcast(
      phone, session, rawText, wa
    );
    return;
  }

  await handleSuperAdminMenu(
    phone, session, input, rawText, wa
  );
}

// ============================================================
// IDENTIFY USER — RESET HANDLER
// ✅ Multi-school support added
// ============================================================

async function handleReset(
  phone:            string,
  message:          IncomingMessage,
  wa:               WhatsApp,
  waAccount:        WhatsAppAccount | null,
  isPlatformNumber: boolean
): Promise<void> {

  // 1. Check registered parent
  const parent = await parentSvc.findByPhone(phone);

  if (parent) {
    const [students, schoolWaAccount] =
      await Promise.all([
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

  // ✅ 2. Check ALL schools this phone owns
  const ownedSchools = await getSchoolsByPhone(phone);

  if (ownedSchools.length === 1) {
    // One school — go straight to admin panel
    console.log(
      `[Bot] One school found — logging in directly`
    );
    await loginToSchool(
      phone,
      ownedSchools[0],
      wa,
      waAccount
    );
    return;
  }

  if (ownedSchools.length > 1) {
    // Multiple schools — show selector
    console.log(
      `[Bot] ${ownedSchools.length} schools found — showing selector`
    );
    await showSchoolSelector(
      phone, ownedSchools, wa
    );
    return;
  }

  // 3. Check registered staff / admin
  const schoolUser =
    await adminSvc.findStaffByPhone(phone);

  if (schoolUser) {
    const schoolWaAccount =
      await parentSvc.getWaAccount(
        schoolUser.school_id
      );

    const isAdmin   = adminSvc.isAdmin(schoolUser);
    const isTeacher = adminSvc.isTeacher(schoolUser);

    if (!isAdmin && !isTeacher) {
      await wa.text(
        phone,
        `❌ *Access Denied*\n\n` +
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

  // 4. Unknown user
  if (isPlatformNumber) {
    await handleMarketingMessage(message);
  } else {
    await showSchoolUnknownUser(phone, wa, waAccount);
  }
}

// ============================================================
// ✅ MULTI-SCHOOL HELPERS
// ============================================================

// Get all schools registered by this phone number
async function getSchoolsByPhone(
  phone: string
): Promise<Array<{
  id:                string;
  name:              string;
  is_active:         boolean;
  onboarding_status: string;
}>> {
  const formatted = formatPhone(phone);

  const { data } = await db
    .from('school_onboarding')
    .select(`
      school_id,
      schools (
        id,
        name,
        is_active,
        onboarding_status
      )
    `)
    .eq('admin_phone', formatted);

  if (!data?.length) return [];

  return data
    .map((r) =>
      r.schools as unknown as {
        id:                string;
        name:              string;
        is_active:         boolean;
        onboarding_status: string;
      }
    )
    .filter((s) => s !== null && s.id !== undefined);
}

// Login to a specific school
async function loginToSchool(
  phone:     string,
  school:    {
    id:                string;
    name:              string;
    is_active:         boolean;
    onboarding_status: string;
  },
  wa:        WhatsApp,
  waAccount: WhatsAppAccount | null
): Promise<void> {
  const schoolWaAccount =
    await parentSvc.getWaAccount(school.id);

  const adminUser = {
    id:        `admin-${school.id}`,
    school_id: school.id,
    user_id:   `admin-${school.id}`,
    role_id:   'admin',
    status:    'active',
    roles: {
      id:   'admin',
      name: 'admin',
    },
    profiles: {
      id:         `admin-${school.id}`,
      full_name:  'School Admin',
      phone:      phone,
      avatar_url: null,
    },
  };

  const session = await sessions.createAdminSession(
    phone,
    adminUser as never,
    schoolWaAccount,
    'admin'
  );

  const schoolWa = new WhatsApp(schoolWaAccount);
  await showAdminMenu(phone, session, schoolWa);
}

// Show school selector for multi-school owners
async function showSchoolSelector(
  phone:   string,
  schools: Array<{
    id:                string;
    name:              string;
    is_active:         boolean;
    onboarding_status: string;
  }>,
  wa: WhatsApp
): Promise<void> {
  // Save state
  await db
    .from('bot_sessions')
    .upsert(
      {
        phone:               formatPhone(phone),
        parent_id:           null,
        school_user_id:      null,
        school_id:           null,
        role:                'admin',
        state:               'SELECT_SCHOOL',
        sub_state:           null,
        selected_student_id: null,
        data: {
          owned_school_ids: schools.map((s) => s.id),
        },
        last_activity: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );

  // Build rows (max 9 schools + register new)
  const rows = schools.slice(0, 9).map((s) => ({
    id:          `SELECT_SCHOOL_${s.id}`,
    title:       s.name.substring(0, 24),
    description: s.is_active
      ? '🟢 Active — tap to manage'
      : `⏳ ${s.onboarding_status}`,
  }));

  // Add register new school option
  rows.push({
    id:          'REGISTER_NEW_SCHOOL',
    title:       '➕ Register New School',
    description: 'Add another school',
  });

  await wa.list(
    phone,
    `🏫 Your Schools`,
    `You have *${schools.length}* school(s).\n\n` +
    `Select which school to manage:`,
    `Tap a school to open its admin panel`,
    `🏫 Select School`,
    [
      {
        title: 'Your Schools',
        rows,
      },
    ]
  );
}

// Switch to a different school
async function switchToSchool(
  phone:    string,
  schoolId: string,
  wa:       WhatsApp
): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select('id, name, is_active, onboarding_status')
    .eq('id', schoolId)
    .single();

  if (!school) {
    await wa.text(
      phone,
      `❌ School not found. Please try again.`
    );
    return;
  }

  const schoolWaAccount =
    await parentSvc.getWaAccount(schoolId);

  const adminUser = {
    id:        `admin-${schoolId}`,
    school_id: schoolId,
    user_id:   `admin-${schoolId}`,
    role_id:   'admin',
    status:    'active',
    roles: {
      id:   'admin',
      name: 'admin',
    },
    profiles: {
      id:         `admin-${schoolId}`,
      full_name:  'School Admin',
      phone:      phone,
      avatar_url: null,
    },
  };

  const newSession = await sessions.createAdminSession(
    phone,
    adminUser as never,
    schoolWaAccount,
    'admin'
  );

  const schoolWa = new WhatsApp(schoolWaAccount);

  await wa.text(
    phone,
    `✅ *Switched to ${school.name}*\n\n` +
    `Loading admin panel...`
  );

  await delay(500);
  await showAdminMenu(phone, newSession, schoolWa);
}

// ============================================================
// UNKNOWN USER ON SCHOOL NUMBER
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
      await handleInvoiceSelect(
        phone, session, input, wa
      );
      break;

    case 'FEES_CONFIRM_PAY':
      await handleConfirmPay(phone, session, input, wa);
      break;

    case 'PAYMENT_PENDING':
      await handlePaymentPending(phone, session, wa);
      break;

    case 'PICKUP_SELECT_STUDENT':
      await pickupStudentSelect(
        phone, session, input, wa
      );
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
    (session.parent?.schools?.name as
      string | undefined) ??
    'the school';

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
      await sessions.setState(
        phone, 'ALERT_PLAN_SELECT'
      );
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
// ✅ Added SELECT_SCHOOL and SWITCH_SCHOOL handling
// ============================================================

async function routeAdmin(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {

  // ✅ School selector state
  if (session.state === 'SELECT_SCHOOL') {
    if (input.startsWith('select_school_')) {
      const schoolId =
        input.replace('select_school_', '');
      await switchToSchool(phone, schoolId, wa);
      return;
    }

    if (input === 'register_new_school') {
      await startOnboardingSession(phone, 'main');
      await wa.text(
        phone,
        `🏫 *Register New School*\n\n` +
        `Let's add another school!\n\n` +
        `What is the name of your new school?`
      );
      return;
    }

    // Unknown — show selector again
    const ownedSchools = await getSchoolsByPhone(phone);
    await showSchoolSelector(phone, ownedSchools, wa);
    return;
  }

  switch (session.state) {

    case 'ADMIN_MAIN_MENU':
      await handleAdminMainMenu(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_ATTENDANCE_MENU':
      await handleAdminAttMenu(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_ATTENDANCE_SELECT_CLASS':
      await handleClassSelect(phone, session, input, wa);
      break;

    case 'ADMIN_ATTENDANCE_MARKING':
      await handleMarking(phone, session, input, wa);
      break;

    case 'ADMIN_FEES_MENU':
      await handleAdminFeesMenu(
        phone, session, input, wa
      );
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
      await handleAddStaffRole(
        phone, session, input, wa
      );
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
      await handleConfirmUpload(
        phone, session, input, wa
      );
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

// ─── Admin main menu handler ──────────────────────────────
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

    case 'admin_more':
      await showAdminMoreMenu(phone, session, wa);
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

    // ✅ Switch between schools
    case 'switch_school': {
      const ownedSchools =
        await getSchoolsByPhone(phone);
      if (ownedSchools.length > 1) {
        await showSchoolSelector(
          phone, ownedSchools, wa
        );
      } else {
        await wa.text(
          phone,
          `ℹ️ You only have one school registered.\n\n` +
          `To add another school, contact support.`
        );
        await showAdminMenu(phone, session, wa);
      }
      break;
    }

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
      `*Admin Menu → More Features → Upload Students*\n\n` +
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
