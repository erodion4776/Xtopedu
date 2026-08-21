// ============================================================
// SCHOOLBOT - MAIN BOT HANDLER
// supabase/functions/_shared/bot/handler.ts
// ✅ Fixed: Platform token used for media downloads
// ✅ Fixed: School token used for sending replies
// ✅ Fixed: CSV auto-routed in any admin state
// ✅ Fixed: Onboarding check BEFORE super admin check
// ✅ Fixed: Super admin school mode works correctly
// ✅ Added: All fee setup states and handlers
// ✅ Added: Individual student billing routes
// ✅ Added: Sample branding previews for receipts/results
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

// Fee setup imports
import {
  startFeeSetup,
  handleFeeSetupMenu,
  handleFeeName,
  handleFeeAmount,
  handleFeeTarget,
  handleFeeDueDate,
  confirmCreateFee,
  handleStudentSearchForFee,
  handleStudentSelectForFee,
  handleIndividualFeeName,
  handleIndividualFeeAmount,
  confirmIndividualFee,
} from './admin/admin.fee.setup.ts';

// Customization imports
import {
  startCustomization,
  handleCustomizationMenu,
  handleImageUpload,
  handleTextInput,
  handleGradeScaleSelect,
  handlePassportStudentSearch,
  handlePassportStudentSelect,
  handlePassportUpload,
  handlePreviewSelect,
} from './admin/admin.customization.ts';

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
  getPlatformWaForSchool,
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
// CSV FILE TYPE CHECKER
// ============================================================

function isCSVFile(
  filename: string,
  mimeType: string
): boolean {
  const name = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  return (
    name.endsWith('.csv')                         ||
    mime.includes('csv')                          ||
    mime.includes('text/plain')                   ||
    mime.includes('text/csv')                     ||
    mime.includes('application/vnd.ms-excel')     ||
    mime.includes('application/octet-stream')     ||
    name.includes('csv')
  );
}

// ============================================================
// GET PLATFORM WHATSAPP INSTANCE
// ============================================================

function getPlatformWhatsApp(): WhatsApp {
  return new WhatsApp({
    phone_number_id:
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '',
    access_token:
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
    status: 'active',
  });
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
    `type=${message.type} | ` +
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

  // ── 1. Onboarding check ─────────────────────────────────
  const obSession = await getOnboardingSession(phone);
  if (obSession) {
    console.log(
      `[Bot] Onboarding active | ` +
      `step: ${obSession.step} | ` +
      `phone: ${phone}`
    );
    const handled = await handleOnboardingInput(
      phone, input, rawText, wa, obSession.source
    );
    if (handled) return;
  }

  // ── 2. Super admin ──────────────────────────────────────
  if (isSuperAdminPhone(phone)) {
    console.log('[Bot] ✅ Super admin detected');
    await handleSuperAdminFlow(
      phone, message, rawText, input, waAccount, wa
    );
    return;
  }

  // ── All below only runs for non-super-admin ─────────────

  // ── Payment form buttons ────────────────────────────────
  if (['form_confirm', 'form_restart'].includes(input)) {
    const { handleFormButton } =
      await import('./payment-forms.handler.ts');
    if (await handleFormButton(phone, input, wa)) return;
  }

  // ── Payment form commands / active sessions ─────────────
  const {
    checkPaymentFormCommand,
    hasActiveFormSession,
    handlePaymentFormMessage,
  } = await import('./payment-forms.handler.ts');

  const isFormCmd    =
    await checkPaymentFormCommand(input);
  const isFormActive =
    await hasActiveFormSession(phone);

  if (isFormCmd || isFormActive) {
    if (await handlePaymentFormMessage(
      phone, input, rawText, wa
    )) return;
  }

  // ── Marketing session mid-flow check ────────────────────
  if (isPlatformNumber) {
    const isMarketingActive =
      await hasActiveMarketingSession(
        formatPhone(phone)
      );

    if (isMarketingActive) {
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

  // ── Image uploads (for branding, passports) ─────────────
  if (message.type === 'image') {
    const session = await sessions.get(phone);
    if (
      session &&
      session.role !== 'parent' &&
      (session.state === 'ADMIN_AWAITING_IMAGE' ||
       session.state === 'ADMIN_AWAITING_PASSPORT')
    ) {
      if (session.state === 'ADMIN_AWAITING_IMAGE') {
        await handleImageUpload(
          phone, session, message, wa, wa
        );
      } else {
        await handlePassportUpload(
          phone, session, message, wa, wa
        );
      }
      return;
    }

    await wa.text(
      phone,
      `📷 Image received but not expected.\n\n` +
      `Go to *Admin Menu → More Features → ` +
      `School Branding* to upload logos.`
    );
    return;
  }

  // ── Document uploads (CSVs, images-as-documents) ────────
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

  // ── Only text and interactive beyond this ───────────────
  if (
    !['text', 'interactive'].includes(message.type)
  ) {
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
          await parentSvc.getWaAccount(
            ownedSchools[0].id
          ),
          wa
        );
      } else {
        await showSchoolSelector(
          phone, ownedSchools, wa
        );
      }
      return;
    }

    if (isPlatformNumber) {
      const isMarketingUser =
        await hasActiveMarketingSession(
          formatPhone(phone)
        );
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
    await routeParent(
      phone, session, input, rawText, wa
    );
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

  // ── EXIT school / test mode ─────────────────────────────
  if (rawText.trim().toUpperCase() === 'EXIT') {
    const testMode = await isSuperAdminTestMode(phone);
    if (testMode.active) {
      await clearTestMode(phone);
      await db
        .from('bot_sessions')
        .delete()
        .eq('phone', formatPhone(phone));
      await wa.text(
        phone,
        `✅ *Exited School Panel*\n\n` +
        `Returning to your super admin panel...`
      );
      await delay(800);
      await buildAndShowSuperAdminMenu(
        phone, waAccount, wa
      );
      return;
    }
  }

  const testMode = await isSuperAdminTestMode(phone);

  if (testMode.active) {
    if (testMode.testRole === 'marketing') {
      await handleMarketingMessage(message);
      return;
    }

    if (
      testMode.testRole === 'parent' ||
      testMode.testRole === 'admin'
    ) {
      await handleSuperAdminSchoolMode(
        phone,
        message,
        rawText,
        input,
        testMode.testRole,
        testMode.schoolId,
        waAccount,
        wa
      );
      return;
    }
  }

  await buildAndShowSuperAdminMenu(
    phone, waAccount, wa, input, rawText
  );
}

// ─── Build super admin session and handle input ────────────
async function buildAndShowSuperAdminMenu(
  phone:     string,
  waAccount: WhatsAppAccount | null,
  wa:        WhatsApp,
  input?:    string,
  rawText?:  string
): Promise<void> {
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
      '[SuperAdmin] Session upsert error:',
      error.message
    );
  }

  const dbSession = data as BotSession | null;

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
        phone,
        avatar_url: null,
      },
    },
    waAccount,
  } as BotSession;

  if (
    !input ||
    RESET_KEYWORDS.has(input) ||
    ['0', 'back', 'main_menu'].includes(input)
  ) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  if (session.sub_state === 'SA_BROADCAST_COMPOSE') {
    await handleSuperAdminBroadcast(
      phone, session, rawText ?? '', wa
    );
    return;
  }

  await handleSuperAdminMenu(
    phone, session, input, rawText ?? '', wa
  );
}

// ============================================================
// SUPER ADMIN SCHOOL MODE
// ============================================================

async function handleSuperAdminSchoolMode(
  phone:     string,
  message:   IncomingMessage,
  rawText:   string,
  input:     string,
  role:      'parent' | 'admin',
  schoolId:  string | null,
  waAccount: WhatsAppAccount | null,
  wa:        WhatsApp
): Promise<void> {
  if (!schoolId) {
    await clearTestMode(phone);
    await wa.text(
      phone,
      `❌ School not found.\n\n` +
      `Type *hi* to go back to your panel.`
    );
    return;
  }

  const { data: school } = await db
    .from('schools')
    .select('id, name, is_active')
    .eq('id', schoolId)
    .single();

  if (!school) {
    await clearTestMode(phone);
    await wa.text(
      phone,
      `❌ School not found.\n\n` +
      `Type *hi* to go back to your panel.`
    );
    return;
  }

  const schoolWaData =
    await getPlatformWaForSchool(schoolId);

  const schoolWa = new WhatsApp(schoolWaData as never);

  // ── PARENT MODE ─────────────────────────────────────────
  if (role === 'parent') {
    const { data: parent } = await db
      .from('parents')
      .select(`
        id, school_id, full_name,
        phone, whatsapp_number, email,
        preferred_language,
        schools ( id, name, is_active )
      `)
      .eq('school_id', schoolId)
      .limit(1)
      .maybeSingle();

    if (!parent) {
      await schoolWa.text(
        phone,
        `⚠️ No parents in *${school.name}* yet.\n\n` +
        `Type *EXIT* to go back.`
      );
      return;
    }

    const students =
      await parentSvc.getStudents(parent.id);

    const testSession: BotSession = {
      id:                  `sa-parent-${schoolId}`,
      phone:               formatPhone(phone),
      parent_id:           parent.id,
      school_user_id:      null,
      school_id:           schoolId,
      role:                'parent',
      state:               'MAIN_MENU',
      sub_state:           null,
      selected_student_id: null,
      data:                {},
      last_activity:       new Date().toISOString(),
      created_at:          new Date().toISOString(),
      parent:              parent as never,
      students,
      waAccount:           schoolWaData as never,
    };

    if (!input || RESET_KEYWORDS.has(input)) {
      await showMainMenu(phone, testSession, schoolWa);
      return;
    }

    if (['0', 'back', 'main_menu'].includes(input)) {
      await showMainMenu(phone, testSession, schoolWa);
      return;
    }

    await routeParent(
      phone, testSession, input, rawText, schoolWa
    );
    return;
  }

  // ── ADMIN MODE ──────────────────────────────────────────
  let { data: savedSession } = await db
    .from('bot_sessions')
    .select('*')
    .eq('phone', formatPhone(phone))
    .maybeSingle();

  if (
    !savedSession ||
    savedSession.school_id === null ||
    savedSession.school_id !== schoolId
  ) {
    console.log(
      `[Bot] SuperAdmin school mode — ` +
      `creating fresh session for school: ${schoolId}`
    );

    const { data: newSession } = await db
      .from('bot_sessions')
      .upsert(
        {
          phone:               formatPhone(phone),
          parent_id:           null,
          school_user_id:      null,
          school_id:           schoolId,
          role:                'admin',
          state:               'ADMIN_MAIN_MENU',
          sub_state:           null,
          selected_student_id: null,
          data:                {},
          last_activity:       new Date().toISOString(),
        },
        { onConflict: 'phone' }
      )
      .select()
      .single();

    savedSession = newSession;
  } else {
    await db
      .from('bot_sessions')
      .update({
        last_activity: new Date().toISOString(),
      })
      .eq('phone', formatPhone(phone));
  }

  const virtualProfileId = 'virtual-' + crypto.randomUUID();
  const virtualUserId    = 'virtual-' + crypto.randomUUID();

  const adminUser = {
    id:        virtualProfileId,
    school_id: schoolId,
    user_id:   virtualUserId,
    role_id:   'admin',
    status:    'active',
    roles:     { id: 'admin', name: 'admin' },
    profiles: {
      id:         virtualProfileId,
      full_name:  'School Admin',
      phone,
      avatar_url: null,
    },
  };

  const adminSession: BotSession = {
    ...(savedSession ?? {
      id:                  `sa-admin-${schoolId}`,
      phone:               formatPhone(phone),
      parent_id:           null,
      school_user_id:      null,
      school_id:           schoolId,
      role:                'admin',
      state:               'ADMIN_MAIN_MENU',
      sub_state:           null,
      selected_student_id: null,
      data:                {},
      last_activity:       new Date().toISOString(),
      created_at:          new Date().toISOString(),
    }),
    schoolUser: adminUser as never,
    waAccount:  schoolWaData as never,
  };

  // ✅ Image uploads in school mode
  if (message.type === 'image') {
    if (
      adminSession.state === 'ADMIN_AWAITING_IMAGE'
    ) {
      await handleImageUpload(
        phone, adminSession, message, schoolWa, schoolWa
      );
    } else if (
      adminSession.state === 'ADMIN_AWAITING_PASSPORT'
    ) {
      await handlePassportUpload(
        phone, adminSession, message, schoolWa, schoolWa
      );
    } else {
      await schoolWa.text(
        phone,
        `📷 Image received but not expected.\n\n` +
        `Go to School Branding to upload.`
      );
    }
    return;
  }

  // Document uploads in school mode
  if (message.type === 'document') {
    await handleDocumentUpload(
      phone, adminSession, message, schoolWa
    );
    return;
  }

  if (!input || RESET_KEYWORDS.has(input)) {
    await showAdminMenu(phone, adminSession, schoolWa);
    return;
  }

  if (['0', 'back', 'main_menu'].includes(input)) {
    await showAdminMenu(phone, adminSession, schoolWa);
    return;
  }

  await routeAdmin(
    phone,
    adminSession,
    input,
    rawText,
    schoolWa,
    schoolWaData as never
  );
}

// ============================================================
// RESET / IDENTIFY USER
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

    await showMainMenu(
      phone,
      session,
      new WhatsApp(schoolWaAccount)
    );
    return;
  }

  // 2. School owner
  const ownedSchools = await getSchoolsByPhone(phone);

  if (ownedSchools.length > 0) {
    console.log(
      `[Bot] ✅ School owner — ` +
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
        await parentSvc.getWaAccount(
          ownedSchools[0].id
        ),
        wa
      );
    } else {
      await showSchoolSelector(phone, ownedSchools, wa);
    }
    return;
  }

  // 3. Staff / admin with invite
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

    await showAdminMenu(
      phone,
      session,
      new WhatsApp(schoolWaAccount)
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
        id, name, is_active,
        onboarding_status, setup_fee_paid
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
        {
          id:    'RESUME_SETUP_FEE',
          title: '💳 Pay Setup Fee',
        },
        {
          id:    'CONTACT_SUPPORT',
          title: '📞 Contact Support',
        },
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

  if (!waConnected) {
    const appUrl = Deno.env.get('APP_URL') ?? '';

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
          '[Bot] Token insert error:',
          tokenError.message
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

  const adminUser = {
    id:        `admin-${school.id}`,
    school_id: school.id,
    user_id:   `admin-${school.id}`,
    role_id:   'admin',
    status:    'active',
    roles:     { id: 'admin', name: 'admin' },
    profiles: {
      id:         `admin-${school.id}`,
      full_name:  'School Admin',
      phone,
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
    phone,
    session,
    new WhatsApp(schoolWaAccount as never)
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
      id:    `SELECT_SCHOOL_${s.id}`,
      title: `${icon} ${s.name}`.substring(0, 24),
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
      'id, name, is_active, ' +
      'onboarding_status, setup_fee_paid'
    )
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

  await checkAndGuideOnboarding(
    phone,
    school as SchoolInfo,
    schoolWaAccount,
    wa
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
      { id: 'IM_A_PARENT',       title: '👨‍| Parent'       },
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
      await attStudentSelect(
        phone, session, input, wa
      );
      break;

    case 'ATTENDANCE_OPTIONS':
      await handleAttendanceOption(
        phone, session, input, wa
      );
      break;

    case 'FEES_SELECT_STUDENT':
      await feesStudentSelect(
        phone, session, input, wa
      );
      break;

    case 'FEES_OPTIONS':
      await handleFeesOption(
        phone, session, input, wa
      );
      break;

    case 'FEES_SELECT_INVOICE':
      await handleInvoiceSelect(
        phone, session, input, wa
      );
      break;

    case 'FEES_CONFIRM_PAY':
      await handleConfirmPay(
        phone, session, input, wa
      );
      break;

    case 'PAYMENT_PENDING':
      await handlePaymentPending(
        phone, session, wa
      );
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
        await handlePlanSelect(
          phone, session, input, wa
        );
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
    (
      session.parent?.schools?.name as
        string | undefined
    ) ?? 'the school';

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
// ✅ All states covered including score upload states
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
        `What is your *full name*?`
      );
      return;
    }

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
        contactName:
          onboarding?.admin_name    ?? null,
        schoolName:
          schoolData?.name          ?? null,
        studentCount:
          schoolData?.student_count ?? null,
        studentCountRange: null,
        schoolType:        null,
        location:          null,
        email:
          onboarding?.admin_email   ?? null,
        schoolId:
          session.school_id         ?? null,
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

    const ownedSchools = await getSchoolsByPhone(phone);
    if (ownedSchools.length >= 1) {
      await checkAndGuideOnboarding(
        phone,
        ownedSchools[0],
        await parentSvc.getWaAccount(
          ownedSchools[0].id
        ),
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

    const ownedSchools = await getSchoolsByPhone(phone);
    if (ownedSchools.length >= 1) {
      await checkAndGuideOnboarding(
        phone,
        ownedSchools[0],
        await parentSvc.getWaAccount(
          ownedSchools[0].id
        ),
        wa
      );
    }
    return;
  }

  // ── Main state router ───────────────────────────────────
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
      await handleClassSelect(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_ATTENDANCE_MARKING':
      await handleMarking(
        phone, session, input, wa
      );
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
        await handlePayMethod(
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

    case 'ADMIN_FEES_AWAITING_CONFIRM':
      if (input.startsWith('confirm_pay_')) {
        await confirmPayment(
          phone, session, input, wa
        );
      } else if (input.startsWith('paymethod_')) {
        await handlePayMethod(
          phone, session, input, wa
        );
      } else {
        await startAdminFees(phone, session, wa);
      }
      break;

    // ✅ Fee setup states ─────────────────────────────────
    case 'ADMIN_FEE_SETUP_MENU':
      await handleFeeSetupMenu(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_FEE_ENTER_NAME':
      await handleFeeName(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEE_ENTER_AMOUNT':
      await handleFeeAmount(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEE_SELECT_TARGET':
      await handleFeeTarget(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_FEE_ENTER_DUE_DATE':
      await handleFeeDueDate(
        phone, session, input, rawText, wa
      );
      break;

    case 'ADMIN_FEE_CONFIRM_CREATE':
      if (input === 'fee_confirm_create') {
        await confirmCreateFee(phone, session, wa);
      } else {
        await startFeeSetup(phone, session, wa);
      }
      break;

    case 'ADMIN_FEE_SEARCH_STUDENT':
      await handleStudentSearchForFee(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEE_SELECT_STUDENT':
      await handleStudentSelectForFee(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_FEE_IND_ENTER_NAME':
      await handleIndividualFeeName(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEE_IND_ENTER_AMOUNT':
      await handleIndividualFeeAmount(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_FEE_IND_CONFIRM':
      if (input === 'ind_fee_confirm') {
        await confirmIndividualFee(
          phone, session, wa
        );
      } else {
        await startFeeSetup(phone, session, wa);
      }
      break;

    case 'ADMIN_FEE_VIEW_LIST':
      if (input.startsWith('fee_view_')) {
        await startFeeSetup(phone, session, wa);
      } else {
        await handleFeeSetupMenu(
          phone, session, input, wa
        );
      }
      break;

    // ✅ Customization states ─────────────────────────────
    case 'ADMIN_CUSTOMIZATION_MENU':
      await handleCustomizationMenu(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_AWAITING_IMAGE':
      await wa.text(
        phone,
        `📷 Please send an image (photo).\n\n` +
        `Type *0* to go back.`
      );
      break;

    case 'ADMIN_AWAITING_TEXT_INPUT':
      await handleTextInput(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_GRADE_SCALE_MENU':
      await handleGradeScaleSelect(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_PASSPORT_SEARCH_STUDENT':
      await handlePassportStudentSearch(
        phone, session, rawText, wa
      );
      break;

    case 'ADMIN_PASSPORT_SELECT_STUDENT':
      await handlePassportStudentSelect(
        phone, session, input, wa
      );
      break;

    case 'ADMIN_AWAITING_PASSPORT':
      await wa.text(
        phone,
        `📸 Please send the passport photo.\n\n` +
        `Type *0* to go back.`
      );
      break;

    case 'ADMIN_CUSTOM_PREVIEW':
      await handlePreviewSelect(
        phone, session, input, wa
      );
      break;

    // ── Existing admin states ──────────────────────────────
    case 'ADMIN_STAFF_MENU':
      await handleStaffMenu(
        phone, session, input, wa
      );
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
      await handleUploadMenu(
        phone, session, input, wa
      );
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

    case 'admin_fee_setup':
      await startFeeSetup(phone, session, wa);
      break;

    case 'admin_customization':
      await startCustomization(phone, session, wa);
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
// ============================================================

async function handleDocumentUpload(
  phone:   string,
  session: BotSession,
  message: IncomingMessage,
  wa:      WhatsApp
): Promise<void> {
  const doc      = message.document;
  const filename = doc?.filename ?? '';
  const mimeType = doc?.mime_type ?? '';

  const isCSV = isCSVFile(filename, mimeType);
  const isImage =
    mimeType.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif)$/i.test(filename);

  console.log(
    `[Bot] handleDocumentUpload:\n` +
    `  state: ${session.state}\n` +
    `  filename: "${filename}"\n` +
    `  mimeType: "${mimeType}"\n` +
    `  isCSV: ${isCSV}\n` +
    `  isImage: ${isImage}`
  );

  // Route images to image handlers
  if (isImage) {
    if (session.state === 'ADMIN_AWAITING_IMAGE') {
      await handleImageUpload(
        phone, session, message, wa, wa
      );
      return;
    }
    if (session.state === 'ADMIN_AWAITING_PASSPORT') {
      await handlePassportUpload(
        phone, session, message, wa, wa
      );
      return;
    }
  }

  // Direct state matches for CSV
  if (session.state === 'ADMIN_AWAITING_CSV') {
    await handleCSVDocument(
      phone, session, message, wa, wa
    );
    return;
  }

  if (session.state === 'ADMIN_AWAITING_SCORE_CSV') {
    await handleScoreCSVDocument(
      phone, session, message, wa, wa
    );
    return;
  }

  // Auto-route: CSV sent but state drifted
  if (isCSV && session.role !== 'parent') {
    console.log(
      `[Bot] CSV in state "${session.state}" ` +
      `— auto-routing to CSV handler`
    );

    await sessions.setState(
      phone, 'ADMIN_AWAITING_CSV'
    );

    const updatedSession: BotSession = {
      ...session,
      state: 'ADMIN_AWAITING_CSV',
    };

    await handleCSVDocument(
      phone, updatedSession, message, wa, wa
    );
    return;
  }

  // Fallback — non-CSV or parent sending document
  await wa.text(
    phone,
    `📤 To upload students go to:\n\n` +
    `*Admin Menu → More Features → Upload Students*\n\n` +
    `To upload logos/photos go to:\n\n` +
    `*Admin Menu → More Features → School Branding*\n\n` +
    `_File received: ${filename || 'unknown'}_`
  );
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
