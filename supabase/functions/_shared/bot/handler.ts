// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ✅ V3 - Merged best of V1 + V2
// ✅ Fixed: School selector loop bug
// ✅ Fixed: routeAdmin undefined `message` variable
// ✅ Fixed: Missing state handlers
// ✅ Fixed: Token expiry check
// ✅ Restored: Payment form handler
// ✅ Restored: Marketing session mid-flow check
// ✅ Added: Structured logging
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
  setOnboardingSession,
  showSetupFeeInfo,
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
  return formatPhone(Deno.env.get('SUPER_ADMIN_PHONE') ?? '');
}

function isSuperAdminPhone(phone: string): boolean {
  const superPhone = getSuperAdminPhone();
  if (!superPhone) return false;
  return formatPhone(phone) === superPhone;
}

// ============================================================
// SCHOOL INFO TYPE
// ============================================================

type SchoolInfo = {
  id:                string;
  name:              string;
  is_active:         boolean;
  onboarding_status: string;
  setup_fee_paid:    boolean;
};

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
  if (message.type === 'text' && isInviteToken(rawText)) {
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
    console.log(`[Bot] Onboarding | step: ${obSession.step}`);
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── ✅ Payment form buttons (restored from V1) ──────────
  if (['form_confirm', 'form_restart'].includes(input)) {
    const { handleFormButton } =
      await import('./payment-forms.handler.ts');
    if (await handleFormButton(phone, input, wa)) return;
  }

  // ── ✅ Payment form commands / active sessions ──────────
  const {
    checkPaymentFormCommand,
    hasActiveFormSession,
    handlePaymentFormMessage,
  } = await import('./payment-forms.handler.ts');

  const isFormCmd    = await checkPaymentFormCommand(input);
  const isFormActive = await hasActiveFormSession(phone);

  if (isFormCmd || isFormActive) {
    if (await handlePaymentFormMessage(
      phone, input, rawText, wa
    )) return;
  }

  // ── ✅ Marketing session mid-flow check (restored V1) ───
  if (isPlatformNumber) {
    const isMarketingActive =
      await hasActiveMarketingSession(formatPhone(phone));

    if (isMarketingActive) {
      // Only route to marketing if no real school session
      const existingSession = await sessions.get(phone);
      const hasRealSession  =
        existingSession &&
        existingSession.role !== 'parent' &&
        existingSession.school_id !== null;

      if (!hasRealSession) {
        await handleMarketingMessage(message);
        return;
      }
    }
  }

  // ── Document uploads ────────────────────────────────────
  if (message.type === 'document') {
    const session = await sessions.get(phone);
    if (session && session.role !== 'parent') {
      await handleDocumentUpload(phone, session, message, wa);
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

  // ── Only text and interactive beyond this ───────────────
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
  // ✅ School ownership check lives INSIDE handleReset only
  // NOT here — prevents school selector loop
  if (!input || RESET_KEYWORDS.has(input)) {
    await handleReset(
      phone, message, wa, waAccount, isPlatformNumber
    );
    return;
  }

  // ── Get existing DB session ─────────────────────────────
  const session = await sessions.get(phone);

  if (!session) {
    // No session — check if school owner (session may have expired)
    const ownedSchools = await getSchoolsByPhone(phone);

    if (ownedSchools.length > 0) {
      console.log(
        `[Bot] No session but school owner — ` +
        `${ownedSchools.length} school(s)`
      );

      try {
        await db
          .from('demo_sessions')
          .delete()
          .eq('phone', formatPhone(phone));
      } catch { /* Non-critical */ }

      if (ownedSchools.length === 1) {
        await checkAndGuideOnboarding(
          phone,
          ownedSchools[0],
          await parentSvc.getWaAccount(ownedSchools[0].id),
          wa
        );
      } else {
        await showSchoolSelector(phone, ownedSchools, wa);
      }
      return;
    }

    // Not a school owner — marketing or reset
    if (isPlatformNumber) {
      const isMarketingUser =
        await hasActiveMarketingSession(formatPhone(phone));
      if (isMarketingUser) {
        await handleMarketingMessage(message);
        return;
      }
    }

    await handleReset(
      phone, message, wa, waAccount, isPlatformNumber
    );
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
    await routeParent(phone, session, input, rawText, wa);
  } else {
    await routeAdmin(
      phone, session, input, rawText, wa, waAccount
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

  // EXIT test mode
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
          phone, testSession, input, rawText,
          testWa, waAccount
        );
      }
      return;
    }
  }

  // Build / fetch super admin session
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
        '[SuperAdmin] Session upsert error:', error.message
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
    waAccount,
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
// RESET / IDENTIFY USER
// ✅ School ownership check lives HERE only
// ✅ Runs only on reset keywords — prevents selector loop
// ============================================================

async function handleReset(
  phone:            string,
  message:          IncomingMessage,
  wa:               WhatsApp,
  waAccount:        WhatsAppAccount | null,
  isPlatformNumber: boolean
): Promise<void> {

  // 1. Registered parent
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

    await showMainMenu(phone, session, new WhatsApp(schoolWaAccount));
    return;
  }

  // 2. School owner
  const ownedSchools = await getSchoolsByPhone(phone);

  if (ownedSchools.length > 0) {
    console.log(
      `[Bot] ✅ School owner — ${ownedSchools.length} school(s)`
    );

    try {
      await db
        .from('demo_sessions')
        .delete()
        .eq('phone', formatPhone(phone));
    } catch { /* Non-critical */ }

    if (ownedSchools.length === 1) {
      await checkAndGuideOnboarding(
        phone,
        ownedSchools[0],
        await parentSvc.getWaAccount(ownedSchools[0].id),
        wa
      );
    } else {
      await showSchoolSelector(phone, ownedSchools, wa);
    }
    return;
  }

  // 3. Staff / admin
  const schoolUser = await adminSvc.findStaffByPhone(phone);

  if (schoolUser) {
    const schoolWaAccount =
      await parentSvc.getWaAccount(schoolUser.school_id);

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

    await showAdminMenu(
      phone, session, new WhatsApp(schoolWaAccount)
    );
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
// MULTI-SCHOOL HELPERS
// ============================================================

async function getSchoolsByPhone(
  phone: string
): Promise<SchoolInfo[]> {
  const formatted = formatPhone(phone);

  const { data } = await db
    .from('school_onboarding')
    .select(`
      school_id,
      schools (
        id,
        name,
        is_active,
        onboarding_status,
        setup_fee_paid
      )
    `)
    .eq('admin_phone', formatted);

  if (!data?.length) return [];

  return data
    .map((r) => r.schools as unknown as SchoolInfo)
    .filter((s) => s !== null && s.id !== undefined);
}

async function checkAndGuideOnboarding(
  phone:           string,
  school:          SchoolInfo,
  schoolWaAccount: unknown,
  wa:              WhatsApp
): Promise<void> {
  const { data: waAcc } = await db
    .from('whatsapp_accounts')
    .select('status, display_number')
    .eq('school_id', school.id)
    .maybeSingle();

  const waConnected = waAcc?.status === 'active';

  console.log(
    `[Bot] ${school.name} | ` +
    `fee_paid=${school.setup_fee_paid} | ` +
    `status=${school.onboarding_status} | ` +
    `wa_connected=${waConnected}`
  );

  // ── Setup fee NOT paid ────────────────────────────────
  if (!school.setup_fee_paid) {
    await wa.text(
      phone,
      `👋 *Welcome back!*\n\n` +
      `🏫 *${school.name}*\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `⏳ *Setup Not Complete*\n\n` +
      `Your one-time setup fee has not\n` +
      `been paid yet.\n\n` +
      `*To activate your school:*\n` +
      `1️⃣ Pay the setup fee\n` +
      `2️⃣ Connect your WhatsApp number\n` +
      `3️⃣ Start managing your school!\n\n` +
      `━━━━━━━━━━━━━━━━`
    );

    await delay(500);

    await wa.buttons(
      phone,
      `Would you like to complete your setup?`,
      [
        { id: 'RESUME_SETUP_FEE',  title: '💳 Pay Setup Fee'    },
        { id: 'CONTACT_SUPPORT',   title: '📞 Contact Support'  },
      ]
    );

    await db.from('bot_sessions').upsert(
      {
        phone:               formatPhone(phone),
        parent_id:           null,
        school_user_id:      null,
        school_id:           school.id,
        role:                'admin',
        state:               'AWAITING_SETUP_FEE',
        sub_state:           null,
        selected_student_id: null,
        data: {
          school_name:       school.name,
          pending_setup_fee: true,
        },
        last_activity: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );
    return;
  }

  // ── Fee paid but WhatsApp not connected ───────────────
  if (!waConnected) {
    const appUrl = Deno.env.get('APP_URL') ?? '';

    // ✅ Check for valid (non-expired) token first
    const { data: existingToken } = await db
      .from('school_activation_tokens')
      .select('token, expires_at')
      .eq('school_id', school.id)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let activationLink = `${appUrl}/activate`;

    if (existingToken) {
      activationLink =
        `${appUrl}/activate/${existingToken.token}`;
    } else {
      // ✅ Use crypto.randomUUID for secure token
      const token =
        crypto.randomUUID().replace(/-/g, '');

      const { error: tokenError } = await db
        .from('school_activation_tokens')
        .insert({
          school_id:  school.id,
          token,
          expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000
          ).toISOString(),
          used:       false,
          created_at: new Date().toISOString(),
        });

      if (tokenError) {
        console.error(
          '[Bot] Token insert error:', tokenError.message
        );
      }

      activationLink = `${appUrl}/activate/${token}`;
    }

    await wa.text(
      phone,
      `👋 *Welcome back!*\n\n` +
      `🏫 *${school.name}*\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Setup fee paid!\n\n` +
      `🔌 *WhatsApp Not Connected Yet*\n\n` +
      `You need to connect your school's\n` +
      `WhatsApp Business number to go LIVE.\n\n` +
      `👇 *Tap this link to connect:*\n` +
      `${activationLink}\n\n` +
      `⏰ Valid for 7 days\n` +
      `Takes less than 2 minutes! ✅\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `After connecting, type *menu* to\n` +
      `access your admin panel! 🚀`
    );

    await db.from('bot_sessions').upsert(
      {
        phone:               formatPhone(phone),
        parent_id:           null,
        school_user_id:      null,
        school_id:           school.id,
        role:                'admin',
        state:               'AWAITING_WA_CONNECTION',
        sub_state:           null,
        selected_student_id: null,
        data: {
          school_name:     school.name,
          activation_link: activationLink,
        },
        last_activity: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );
    return;
  }

  // ── Fully set up — go to admin panel ─────────────────
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
    schoolWaAccount as never,
    'admin'
  );

  await showAdminMenu(
    phone, session, new WhatsApp(schoolWaAccount as never)
  );
}

async function showSchoolSelector(
  phone:   string,
  schools: SchoolInfo[],
  wa:      WhatsApp
): Promise<void> {
  await db.from('bot_sessions').upsert(
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

  const rows = schools.slice(0, 9).map((s) => {
    let icon        = '🟢';
    let description = 'Active — tap to manage';

    if (!s.setup_fee_paid) {
      icon        = '💳';
      description = 'Setup fee pending';
    } else if (s.onboarding_status !== 'active') {
      icon        = '🔌';
      description = 'WhatsApp not connected';
    }

    return {
      id:          `SELECT_SCHOOL_${s.id}`,
      title:       `${icon} ${s.name}`.substring(0, 24),
      description,
    };
  });

  rows.push({
    id:          'REGISTER_NEW_SCHOOL',
    title:       '➕ Register New School',
    description: 'Add another school',
  });

  await wa.list(
    phone,
    `🏫 Your Schools`,
    `You have *${schools.length}* school(s).\n\n` +
    `Select which school to manage:\n\n` +
    `🟢 Active  💳 Fee pending  🔌 WA pending`,
    `Tap a school to continue`,
    `🏫 Select School`,
    [{ title: 'Your Schools', rows }]
  );
}

async function switchToSchool(
  phone:    string,
  schoolId: string,
  wa:       WhatsApp
): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select(
      'id, name, is_active, onboarding_status, setup_fee_paid'
    )
    .eq('id', schoolId)
    .single();

  if (!school) {
    await wa.text(
      phone, `❌ School not found. Please try again.`
    );
    return;
  }

  const schoolWaAccount =
    await parentSvc.getWaAccount(schoolId);

  await checkAndGuideOnboarding(
    phone, school as SchoolInfo, schoolWaAccount, wa
  );
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
      { id: 'IM_A_PARENT',       title: '👨‍👩‍👧 Parent'      },
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

async function showParentNotRegistered(
  phone:   string,
  wa:      WhatsApp,
  session: BotSession
): Promise<void> {
  const schoolName =
    (session.parent?.schools?.name as string | undefined) ??
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
// ✅ `message` variable removed — document handled separately
// ✅ All states from V2 preserved
// ✅ AWAITING_WA_CONNECTION state handler added
// ============================================================

async function routeAdmin(
  phone:     string,
  session:   BotSession,
  input:     string,
  rawText:   string,
  wa:        WhatsApp,
  waAccount?: WhatsAppAccount | null
): Promise<void> {

  // ── School selector ─────────────────────────────────────
  if (session.state === 'SELECT_SCHOOL') {
    if (input.startsWith('select_school_')) {
      await switchToSchool(
        phone,
        input.replace('select_school_', ''),
        wa
      );
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

    // Unknown input — re-show selector
    const ownedSchools = await getSchoolsByPhone(phone);
    await showSchoolSelector(phone, ownedSchools, wa);
    return;
  }

  // ── Awaiting setup fee ──────────────────────────────────
  if (session.state === 'AWAITING_SETUP_FEE') {
    if (input === 'resume_setup_fee') {
      const { data: schoolData } = await db
        .from('schools')
        .select('name, student_count')
        .eq('id', session.school_id ?? '')
        .single();

      const { data: onboarding } = await db
        .from('school_onboarding')
        .select('admin_name, admin_email')
        .eq('school_id', session.school_id ?? '')
        .maybeSingle();

      const obSession = {
        phone:             formatPhone(phone),
        step:              'SHOW_SETUP_FEE' as const,
        source:            'main'            as const,
        contactName:       onboarding?.admin_name    ?? null,
        schoolName:        schoolData?.name          ?? null,
        studentCount:      schoolData?.student_count ?? null,
        studentCountRange: null,
        schoolType:        null,
        location:          null,
        email:             onboarding?.admin_email   ?? null,
        schoolId:          session.school_id          ?? null,
        setupFeePaid:      false,
        tempData:          {},
        lastActivity:      Date.now(),
      };

      await setOnboardingSession(phone, obSession);
      await showSetupFeeInfo(phone, obSession, wa);
      return;
    }

    if (input === 'contact_support') {
      const superPhone =
        Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
      await wa.text(
        phone,
        `📞 *Contact Support*\n\n` +
        `WhatsApp us directly:\n` +
        `*${superPhone}*\n\n` +
        `⏰ Available: Mon-Fri, 8AM-6PM\n\n` +
        `We'll help you complete your setup! 🚀`
      );
      return;
    }

    // Recheck status for any other input
    const ownedSchools = await getSchoolsByPhone(phone);
    if (ownedSchools.length >= 1) {
      await checkAndGuideOnboarding(
        phone,
        ownedSchools[0],
        await parentSvc.getWaAccount(ownedSchools[0].id),
        wa
      );
    }
    return;
  }

  // ── Awaiting WhatsApp connection ────────────────────────
  if (session.state === 'AWAITING_WA_CONNECTION') {
    if (input === 'contact_support') {
      const superPhone =
        Deno.env.get('SUPER_ADMIN_PHONE') ?? '';
      await wa.text(
        phone,
        `📞 *Contact Support*\n\n` +
        `WhatsApp us directly:\n` +
        `*${superPhone}*\n\n` +
        `We'll help you connect your\n` +
        `WhatsApp number! 🚀`
      );
      return;
    }

    // Recheck connection for any other input
    const ownedSchools = await getSchoolsByPhone(phone);
    if (ownedSchools.length >= 1) {
      await checkAndGuideOnboarding(
        phone,
        ownedSchools[0],
        await parentSvc.getWaAccount(ownedSchools[0].id),
        wa
      );
    }
    return;
  }

  // ── Main state router ───────────────────────────────────
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

    // ✅ Document states — just prompt; file handled
    // by handleDocumentUpload() when message.type === 'document'
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

// ── Admin main menu dispatcher ────────────────────────────
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

    case 'switch_school': {
      const ownedSchools = await getSchoolsByPhone(phone);
      if (ownedSchools.length > 1) {
        await showSchoolSelector(phone, ownedSchools, wa);
      } else {
        await wa.text(
          phone,
          `ℹ️ You only have one school registered.\n\n` +
          `Type *menu* to continue.`
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
// ✅ Receives message object correctly — no scope issues
// ============================================================

async function handleDocumentUpload(
  phone:   string,
  session: BotSession,
  message: IncomingMessage,
  wa:      WhatsApp
): Promise<void> {
  if (session.state === 'ADMIN_AWAITING_CSV') {
    await handleCSVDocument(phone, session, message, wa);
  } else if (session.state === 'ADMIN_AWAITING_SCORE_CSV') {
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

export function extractRawText(
  message: IncomingMessage
): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}
