// ============================================================
// SCHOOLBOT - SUPER ADMIN BOT MENU
// _shared/bot/superadmin/superadmin.menu.ts
// ✅ Fixed: WA connection uses virtual account pattern
// ✅ Fixed: One platform number serves multiple schools
// ✅ Fixed: Detailed logging for debugging
// ✅ Fixed: Fallback to env vars if no DB row
// ✅ Fixed: Exactly 10 rows in main menu
// ✅ Fixed: All static imports
// ============================================================

import { WhatsApp }        from '../../whatsapp.ts';
import { getSupabase }     from '../../supabase.ts';
import { fmt, formatPhone, delay } from '../../utils.ts';
import { SessionService }  from '../../session.ts';
import { ParentService }   from '../../services/parent.service.ts';
import { showMainMenu }    from '../menu.ts';
import { showAdminMenu }   from '../admin/admin.menu.ts';
import {
  startOnboardingSession,
  getOnboardingSession,
} from '../../onboarding/engine.ts';
import {
  handleMarketingMessage,
} from '../marketing/marketing.handler.ts';
import type { BotSession } from '../../types.ts';

const db       = getSupabase();
const sessions = new SessionService();

// ─── Sum amount helper ─────────────────────────────────────
function sumAmount(
  rows: Array<{ amount: unknown }>
): number {
  return rows.reduce(
    (s, r) => s + parseFloat(String(r.amount ?? 0)),
    0
  );
}

// ============================================================
// GET PLATFORM WA ACCOUNT
// ✅ Key helper — resolves WA account for any school
// ✅ One platform number can serve multiple schools
// ✅ Falls back to env vars if no DB row exists
// ============================================================

export async function getPlatformWaForSchool(
  schoolId: string
): Promise<Record<string, unknown>> {
  const platformPhoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const platformAccessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
  const platformDisplayNumber =
    Deno.env.get('WHATSAPP_DISPLAY_NUMBER') ?? '';

  // Step 1: Try school-specific WA account first
  const { data: schoolWa } = await db
    .from('whatsapp_accounts')
    .select('*')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .maybeSingle();

  if (schoolWa) {
    console.log(
      `[SuperAdmin] Found school-specific WA ` +
      `for school: ${schoolId}`
    );
    return schoolWa as Record<string, unknown>;
  }

  // Step 2: Try to find platform WA by phone_number_id
  if (platformPhoneNumberId) {
    const { data: platformWa } = await db
      .from('whatsapp_accounts')
      .select('*')
      .eq('phone_number_id', platformPhoneNumberId)
      .eq('status', 'active')
      .maybeSingle();

    if (platformWa) {
      console.log(
        `[SuperAdmin] Using platform WA virtually ` +
        `for school: ${schoolId}`
      );
      // Return with school_id overridden in memory
      // This allows one platform number to serve
      // multiple super admin schools without DB conflicts
      return {
        ...platformWa,
        school_id: schoolId,
      } as Record<string, unknown>;
    }
  }

  // Step 3: Build from env vars directly
  // This always works as long as env vars are set
  console.log(
    `[SuperAdmin] Building WA from env vars ` +
    `for school: ${schoolId}`
  );
  return {
    id:              'platform',
    school_id:       schoolId,
    phone_number_id: platformPhoneNumberId,
    access_token:    platformAccessToken,
    display_number:  platformDisplayNumber,
    status:          'active',
  };
}

// ============================================================
// CONNECT PLATFORM WA TO SCHOOL
// ✅ Tries to create/update DB row
// ✅ Handles unique constraint gracefully
// ✅ Detailed logging at every step
// ============================================================

async function connectPlatformWaToSchool(
  schoolId:   string,
  schoolName: string
): Promise<Record<string, unknown>> {
  const platformPhoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const platformAccessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
  const platformDisplayNumber =
    Deno.env.get('WHATSAPP_DISPLAY_NUMBER') ?? '';

  console.log(
    `[SuperAdmin] connectPlatformWaToSchool:\n` +
    `  schoolId: ${schoolId}\n` +
    `  schoolName: ${schoolName}\n` +
    `  phoneNumberId: ${
      platformPhoneNumberId
        ? platformPhoneNumberId.substring(0, 8) + '...'
        : '❌ MISSING'
    }\n` +
    `  accessToken: ${
      platformAccessToken
        ? '✅ set'
        : '❌ MISSING'
    }`
  );

  // Always return a valid WA object using env vars
  // even if DB operations fail
  const fallbackWa: Record<string, unknown> = {
    id:              'platform',
    school_id:       schoolId,
    phone_number_id: platformPhoneNumberId,
    access_token:    platformAccessToken,
    display_number:  platformDisplayNumber,
    status:          'active',
  };

  if (!platformPhoneNumberId || !platformAccessToken) {
    console.error(
      '[SuperAdmin] ❌ Missing env vars — ' +
      'using fallback WA object'
    );
    return fallbackWa;
  }

  try {
    // Check what already exists
    const { data: allAccounts } = await db
      .from('whatsapp_accounts')
      .select('id, school_id, phone_number_id, status')
      .or(
        `school_id.eq.${schoolId},` +
        `phone_number_id.eq.${platformPhoneNumberId}`
      );

    console.log(
      `[SuperAdmin] Existing WA accounts:`,
      JSON.stringify(allAccounts ?? [])
    );

    const existingForSchool = (allAccounts ?? []).find(
      (a) => a.school_id === schoolId
    );
    const existingForPhoneId = (allAccounts ?? []).find(
      (a) => a.phone_number_id === platformPhoneNumberId
    );

    // Case A: School already has WA account — update it
    if (existingForSchool) {
      console.log(
        `[SuperAdmin] Updating existing account ` +
        `id: ${existingForSchool.id}`
      );

      const { data: updated, error: updateErr } = await db
        .from('whatsapp_accounts')
        .update({
          phone_number_id: platformPhoneNumberId,
          access_token:    platformAccessToken,
          display_number:  platformDisplayNumber,
          status:          'active',
          updated_at:      new Date().toISOString(),
        })
        .eq('id', existingForSchool.id)
        .select()
        .single();

      if (updateErr) {
        console.error(
          '[SuperAdmin] ❌ Update error:',
          JSON.stringify(updateErr)
        );
        return {
          ...fallbackWa,
          id: existingForSchool.id,
        };
      }

      console.log(
        `[SuperAdmin] ✅ Updated WA for ${schoolName}`
      );
      return updated as Record<string, unknown>;
    }

    // Case B: phone_number_id exists for another school
    // Use virtual approach — do NOT reassign the row
    // because that would break the other school
    if (existingForPhoneId) {
      console.log(
        `[SuperAdmin] platform phone_number_id ` +
        `exists for different school — using virtual WA`
      );

      // Return virtual WA object with school_id in memory
      return {
        ...existingForPhoneId,
        school_id: schoolId,
      } as Record<string, unknown>;
    }

    // Case C: No existing row — insert fresh
    console.log(
      `[SuperAdmin] Inserting fresh WA account ` +
      `for school: ${schoolName}`
    );

    const { data: inserted, error: insertErr } = await db
      .from('whatsapp_accounts')
      .insert({
        school_id:       schoolId,
        phone_number_id: platformPhoneNumberId,
        access_token:    platformAccessToken,
        display_number:  platformDisplayNumber,
        status:          'active',
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      console.error(
        '[SuperAdmin] ❌ Insert error:',
        JSON.stringify(insertErr)
      );
      // Return fallback — bot will still work
      return fallbackWa;
    }

    console.log(
      `[SuperAdmin] ✅ Inserted WA for ${schoolName}`
    );
    return inserted as Record<string, unknown>;

  } catch (err) {
    console.error(
      '[SuperAdmin] ❌ Unexpected error:',
      err instanceof Error ? err.message : String(err)
    );
    // Return fallback so bot still works
    return fallbackWa;
  }
}

// ============================================================
// CHECK IF SUPER ADMIN IS IN TEST / SCHOOL MODE
// ============================================================

export async function isSuperAdminTestMode(
  phone: string
): Promise<{
  active:   boolean;
  testRole: 'parent' | 'admin' | 'marketing' | null;
  schoolId: string | null;
}> {
  const { data } = await db
    .from('super_admin_test_sessions')
    .select('test_role, school_id, created_at')
    .eq('phone', phone)
    .maybeSingle();

  if (!data) {
    return {
      active:   false,
      testRole: null,
      schoolId: null,
    };
  }

  const age =
    Date.now() - new Date(data.created_at).getTime();
  if (age > 2 * 60 * 60 * 1000) {
    await db
      .from('super_admin_test_sessions')
      .delete()
      .eq('phone', phone);
    return {
      active:   false,
      testRole: null,
      schoolId: null,
    };
  }

  return {
    active:   true,
    testRole: data.test_role,
    schoolId: data.school_id,
  };
}

// ─── Set test / school mode ────────────────────────────────
export async function setTestMode(
  phone:    string,
  testRole: 'parent' | 'admin' | 'marketing',
  schoolId: string | null
): Promise<void> {
  await db
    .from('super_admin_test_sessions')
    .upsert(
      {
        phone,
        test_role:  testRole,
        school_id:  schoolId,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'phone' }
    );
}

// ─── Clear test / school mode ──────────────────────────────
export async function clearTestMode(
  phone: string
): Promise<void> {
  await db
    .from('super_admin_test_sessions')
    .delete()
    .eq('phone', phone);
}

// ============================================================
// MAIN SUPER ADMIN MENU — 10 rows exactly
// ============================================================

export async function showSuperAdminMenu(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const name =
    session.schoolUser?.profiles?.full_name
      ?.split(' ')[0] ?? 'Boss';

  const hour = new Date().getHours();
  const greet =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening';

  const stats = await getQuickStats();

  await wa.list(
    phone,
    `🔐 XtopEdu Admin`,
    `${greet} *${name}!* 👋\n\n` +
    `📊 *Quick Stats:*\n` +
    `🏫 Schools: *${stats.totalSchools}* ` +
    `(${stats.activeSchools} active)\n` +
    `💰 This Month: *${fmt(stats.monthRevenue)}*\n` +
    `👥 Students: ` +
    `*${stats.totalStudents.toLocaleString()}*\n` +
    `💬 Active Now: *${stats.activeSessions}*`,
    `Type *0* anytime to return here`,
    `⚙️ Open Menu`,
    [
      {
        title: '📊 Platform & Sales',
        rows: [
          {
            id:          'SA_STATS',
            title:       '📊 Full Stats',
            description: 'Revenue, schools, users',
          },
          {
            id:          'SA_REVENUE',
            title:       '💰 Revenue',
            description: 'Earnings breakdown',
          },
          {
            id:          'SA_SCHOOLS',
            title:       '🏫 All Schools',
            description: 'View all registered schools',
          },
          {
            id:          'SA_LEADS',
            title:       '🧲 Leads',
            description: 'New school leads pipeline',
          },
        ],
      },
      {
        title: '🏫 My School & Operations',
        rows: [
          {
            id:          'SA_REGISTER_MY_SCHOOL',
            title:       '🏫 Register My School',
            description: 'Full onboarding as real owner',
          },
          {
            id:          'SA_MANAGE_MY_SCHOOL',
            title:       '⚙️ Manage My School',
            description: 'Switch to your school admin',
          },
          {
            id:          'SA_BROADCAST',
            title:       '📢 Broadcast',
            description: 'Message all school admins',
          },
          {
            id:          'SA_SESSIONS',
            title:       '💬 Active Sessions',
            description: 'Who is online right now',
          },
        ],
      },
      {
        title: '🧪 Testing & Debug',
        rows: [
          {
            id:          'SA_TEST_BOT',
            title:       '🧪 Test Bot Features',
            description: 'Test as parent/admin/marketing',
          },
          {
            id:          'SA_DEBUG',
            title:       '🔍 Debug & Health',
            description: 'School debug, logs & health',
          },
        ],
      },
    ]
  );
}

// ============================================================
// HANDLE SUPER ADMIN MENU SELECTIONS
// ============================================================

export async function handleSuperAdminMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {

    case 'sa_stats':
      await showFullStats(phone, wa);
      break;

    case 'sa_revenue':
      await showRevenue(phone, wa);
      break;

    case 'sa_schools':
      await showSchools(phone, wa);
      break;

    case 'sa_leads':
      await showLeads(phone, wa);
      break;

    case 'sa_sessions':
      await showActiveSessions(phone, wa);
      break;

    case 'sa_register_my_school':
      await startSuperAdminSchoolRegistration(
        phone, session, wa
      );
      break;

    case 'sa_manage_my_school':
      await manageMySuperAdminSchool(
        phone, session, wa
      );
      break;

    case 'sa_add_another_school':
      await addAnotherSchool(phone, session, wa);
      break;

    case 'sa_broadcast':
      await promptBroadcast(phone, session, wa);
      break;

    case 'sa_broadcast_confirm':
      await confirmBroadcast(phone, session, wa);
      break;

    case 'sa_broadcast_cancel':
      await showSuperAdminMenu(phone, session, wa);
      break;

    case 'sa_debug':
      await showDebugAndHealthMenu(phone, wa);
      break;

    case 'sa_debug_school':
      await promptDebug(phone, wa);
      break;

    case 'sa_system_test':
      await showSystemHealth(phone, wa);
      break;

    case 'sa_logs':
      await showLogs(phone, wa);
      break;

    case 'sa_test_bot':
      await showTestOptions(phone, session, wa);
      break;

    case 'test_as_parent':
      await activateParentTest(phone, session, wa);
      break;

    case 'test_as_admin':
      await activateAdminTest(phone, session, wa);
      break;

    case 'test_marketing':
      await activateMarketingTest(phone, session, wa);
      break;

    default:
      if (input.startsWith('sa_switch_school_')) {
        const schoolId =
          input.replace('sa_switch_school_', '');
        await switchToMySuperAdminSchool(
          phone, schoolId, wa
        );
      } else if (
        input.startsWith('test_school_parent_')
      ) {
        const schoolId =
          input.replace('test_school_parent_', '');
        const { data: schoolData } = await db
          .from('schools')
          .select('id, name')
          .eq('id', schoolId)
          .single();
        if (schoolData) {
          await activateParentTestForSchool(
            phone, session,
            schoolData.id, schoolData.name, wa
          );
        }
      } else if (input.startsWith('test_school_')) {
        const schoolId =
          input.replace('test_school_', '');
        await activateAdminTestForSchool(
          phone, session, schoolId, wa
        );
      } else if (input.startsWith('debug_school_')) {
        const schoolId =
          input.replace('debug_school_', '');
        await showSchoolDebug(phone, schoolId, wa);
      } else {
        await showSuperAdminMenu(phone, session, wa);
      }
  }
}

// ============================================================
// 🔍 DEBUG & HEALTH SUBMENU
// ============================================================

async function showDebugAndHealthMenu(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `🔍 *Debug & Health*\n\n` +
    `What would you like to check?`,
    [
      { id: 'SA_DEBUG_SCHOOL', title: '🔍 Debug a School' },
      { id: 'SA_SYSTEM_TEST',  title: '🤖 System Health'  },
      { id: 'SA_LOGS',         title: '📋 System Logs'    },
    ]
  );
}

// ============================================================
// 🏫 REGISTER MY OWN SCHOOL
// ============================================================

async function startSuperAdminSchoolRegistration(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: existing } = await db
    .from('school_onboarding')
    .select(`
      school_id,
      schools (
        id, name, is_active,
        onboarding_status, setup_fee_paid
      )
    `)
    .eq('admin_phone', formatPhone(phone));

  if (existing?.length) {
    const schoolList = existing
      .map((s, i) => {
        const school =
          s.schools as Record<string, unknown> | null;
        const isActive = school?.is_active as boolean;
        const status =
          school?.onboarding_status as string;
        return (
          `${i + 1}. *${school?.name ?? 'Unknown'}*\n` +
          `   ${
            isActive
              ? '🟢 Active'
              : `⏳ ${status ?? 'Pending'}`
          }`
        );
      })
      .join('\n\n');

    await wa.buttons(
      phone,
      `🏫 *Your Registered Schools*\n\n` +
      `${schoolList}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `What would you like to do?`,
      [
        {
          id:    'SA_ADD_ANOTHER_SCHOOL',
          title: '➕ Register New School',
        },
        {
          id:    'SA_MANAGE_MY_SCHOOL',
          title: '⚙️ Manage Existing',
        },
        {
          id:    '0',
          title: '↩️ Back',
        },
      ]
    );
    return;
  }

  await wa.text(
    phone,
    `🏫 *Register Your School*\n\n` +
    `You are about to register your own\n` +
    `school on SchoolBot!\n\n` +
    `✅ *What is different for you:*\n` +
    `• Setup fee is *WAIVED* automatically\n` +
    `• Platform WA number auto-connected\n` +
    `• Everything else is 100% real\n\n` +
    `✅ *What is exactly the same:*\n` +
    `• Same onboarding flow customers see\n` +
    `• Real bank account setup\n` +
    `• Real classes, real staff invites\n` +
    `• Real admin panel after setup\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Let's start! 🚀\n\n` +
    `What is your *full name*?`
  );

  await launchSuperAdminOnboarding(phone);
}

async function launchSuperAdminOnboarding(
  phone: string
): Promise<void> {
  await db
    .from('onboarding_sessions')
    .delete()
    .eq('phone', formatPhone(phone));

  await startOnboardingSession(phone, 'main');

  await db
    .from('onboarding_sessions')
    .update({
      temp_data: { is_super_admin: true },
    })
    .eq('phone', formatPhone(phone));

  console.log(
    `[SuperAdmin] ✅ Onboarding started for ${phone}`
  );
}

async function addAnotherSchool(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🏫 *Register Another School*\n\n` +
    `Let's add a new school!\n\n` +
    `✅ Setup fee waived\n` +
    `✅ Platform WA auto-connected\n\n` +
    `What is your *full name*?`
  );

  await launchSuperAdminOnboarding(phone);
}

// ============================================================
// ⚙️ MANAGE MY SCHOOL
// ============================================================

async function manageMySuperAdminSchool(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: mySchools } = await db
    .from('school_onboarding')
    .select(`
      school_id,
      schools (
        id, name, is_active,
        onboarding_status, setup_fee_paid
      )
    `)
    .eq('admin_phone', formatPhone(phone));

  if (!mySchools?.length) {
    await wa.buttons(
      phone,
      `🏫 *No Schools Registered*\n\n` +
      `You have not registered a school yet.\n\n` +
      `Register your first school now!`,
      [
        {
          id:    'SA_REGISTER_MY_SCHOOL',
          title: '🏫 Register School',
        },
        {
          id:    '0',
          title: '↩️ Back',
        },
      ]
    );
    return;
  }

  if (mySchools.length === 1) {
    await switchToMySuperAdminSchool(
      phone, mySchools[0].school_id, wa
    );
    return;
  }

  const rows = mySchools.slice(0, 9).map((s) => {
    const school =
      s.schools as Record<string, unknown> | null;
    const isActive = school?.is_active  as boolean;
    const feePaid  =
      school?.setup_fee_paid as boolean;

    let icon        = '🟢';
    let description = 'Active — tap to manage';

    if (!feePaid) {
      icon        = '💳';
      description = 'Setup fee pending';
    } else if (!isActive) {
      icon        = '🔌';
      description = 'WhatsApp not connected';
    }

    return {
      id:    `SA_SWITCH_SCHOOL_${s.school_id}`,
      title: `${icon} ${
        String(school?.name ?? 'School')
          .substring(0, 20)
      }`,
      description,
    };
  });

  await wa.list(
    phone,
    `🏫 Your Schools`,
    `Select a school to manage:\n\n` +
    `🟢 Active  💳 Fee pending  🔌 WA pending`,
    `Tap to switch`,
    `🏫 Select School`,
    [{ title: 'Your Schools', rows }]
  );
}

// ─── Switch super admin into their own real school ─────────
// ✅ Uses virtual WA account pattern
// ✅ Never fails even if DB has unique constraints
// ✅ Always shows admin menu
async function switchToMySuperAdminSchool(
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
    await wa.text(phone, `❌ School not found.`);
    return;
  }

  // Setup fee not paid → resume onboarding
  if (!school.setup_fee_paid) {
    await wa.text(
      phone,
      `⏳ *${school.name}*\n\n` +
      `Setup is not complete yet.\n` +
      `Resuming onboarding...`
    );
    await delay(500);

    const obSession = await getOnboardingSession(phone);
    if (!obSession) {
      await launchSuperAdminOnboarding(phone);
      await wa.text(
        phone,
        `What is your *full name*?`
      );
    }
    return;
  }

  // ✅ Get WA account — never fails
  // Uses virtual pattern if unique constraint blocks DB insert
  let waAccount = await getPlatformWaForSchool(schoolId);

  // Try to ensure DB row exists for this school
  // (best effort — bot works even if this fails)
  const { data: existingWa } = await db
    .from('whatsapp_accounts')
    .select('id')
    .eq('school_id', schoolId)
    .maybeSingle();

  if (!existingWa) {
    // Attempt to create DB row — non-critical
    const dbWa = await connectPlatformWaToSchool(
      schoolId,
      school.name
    );
    if (dbWa && dbWa.id !== 'platform') {
      waAccount = dbWa;
    }

    // Mark school as active
    await db
      .from('schools')
      .update({
        is_active:         true,
        onboarding_status: 'active',
        updated_at:        new Date().toISOString(),
      })
      .eq('id', schoolId);

    await db
      .from('school_onboarding')
      .update({
        current_step: 'complete',
        completed:    true,
        updated_at:   new Date().toISOString(),
      })
      .eq('school_id', schoolId);
  }

  // ✅ Step 1: Set test mode FIRST
  await setTestMode(phone, 'admin', schoolId);

  // ✅ Step 2: Update bot_sessions with school_id
  await db
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
    );

  // ✅ Step 3: Build admin session
  const adminUser = {
    id:        `sa-own-${schoolId}`,
    school_id: schoolId,
    user_id:   `sa-own-${schoolId}`,
    role_id:   'admin',
    status:    'active',
    roles:     { id: 'admin', name: 'admin' },
    profiles: {
      id:         `sa-own-${schoolId}`,
      full_name:  'School Admin',
      phone,
      avatar_url: null,
    },
  };

  const adminSession = await sessions.createAdminSession(
    phone,
    adminUser as never,
    waAccount as never,
    'admin'
  );

  // ✅ Step 4: Use school WhatsApp
  const schoolWa = new WhatsApp(waAccount as never);

  // ✅ Step 5: Send confirmation
  await schoolWa.text(
    phone,
    `✅ *You are now in ${school.name}!*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 *${school.name}*\n\n` +
    `You are now managing this school\n` +
    `as the admin.\n\n` +
    `✅ *Everything here is 100% real:*\n` +
    `• Attendance marking works\n` +
    `• Fee recording works\n` +
    `• Staff management works\n` +
    `• All features active\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `⚠️ Type *EXIT* anytime to return\n` +
    `to your super admin panel.`
  );

  await delay(1000);

  // ✅ Step 6: Show real admin menu
  await showAdminMenu(phone, adminSession, schoolWa);
}

// ============================================================
// 🧪 TEST BOT FEATURES
// ============================================================

async function showTestOptions(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `🧪 *Test Bot Features*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `Choose what you want to test.\n\n` +
    `You will experience the bot\n` +
    `*exactly as real users do.*\n\n` +
    `⚠️ Type *EXIT* at any time\n` +
    `to return to your admin panel.`,
    [
      { id: 'TEST_AS_PARENT',  title: '👨‍👩‍👧 Test as Parent'    },
      { id: 'TEST_AS_ADMIN',   title: '👨‍💼 Test as Admin'     },
      { id: 'TEST_MARKETING',  title: '🎯 Test Marketing Bot' },
    ],
    '🧪 Test Mode'
  );
}

async function activateParentTest(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: schools } = await db
    .from('schools')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(8);

  if (!schools?.length) {
    await wa.buttons(
      phone,
      `❌ *No Active Schools*\n\n` +
      `You need at least one active\n` +
      `school to test the parent bot.\n\n` +
      `Register your own school first!`,
      [
        { id: 'SA_REGISTER_MY_SCHOOL', title: '🏫 Register' },
        { id: 'SA_TEST_BOT',           title: '↩️ Back'     },
      ]
    );
    return;
  }

  if (schools.length === 1) {
    await activateParentTestForSchool(
      phone, session,
      schools[0].id, schools[0].name, wa
    );
    return;
  }

  await wa.list(
    phone,
    `👨‍👩‍👧 Test as Parent`,
    `Select which school to test:`,
    `You will see what parents see`,
    `🏫 Select School`,
    [
      {
        title: 'Active Schools',
        rows: schools.map((s) => ({
          id:          `TEST_SCHOOL_PARENT_${s.id}`,
          title:       s.name.substring(0, 24),
          description: 'Test parent bot',
        })),
      },
    ]
  );
}

async function activateParentTestForSchool(
  phone:      string,
  session:    BotSession,
  schoolId:   string,
  schoolName: string,
  wa:         WhatsApp
): Promise<void> {
  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, whatsapp_number')
    .eq('school_id', schoolId)
    .limit(1)
    .maybeSingle();

  if (!parent) {
    await wa.buttons(
      phone,
      `⚠️ *No parents found*\n\n` +
      `*${schoolName}* has no parents yet.\n\n` +
      `Add students with parent data first.`,
      [
        { id: 'TEST_AS_ADMIN', title: '👨‍💼 Test as Admin' },
        { id: 'SA_TEST_BOT',   title: '↩️ Back'           },
      ]
    );
    return;
  }

  // ✅ Get WA account using virtual pattern
  const waAccount = await getPlatformWaForSchool(schoolId);

  await setTestMode(phone, 'parent', schoolId);

  const parentSvc = new ParentService();
  const students  = await parentSvc.getStudents(parent.id);

  const testSession = await sessions.createParentSession(
    phone,
    {
      ...parent,
      school_id: schoolId,
      schools:   { name: schoolName } as never,
    } as never,
    students,
    waAccount as never
  );

  const schoolWa = new WhatsApp(waAccount as never);

  await schoolWa.text(
    phone,
    `🧪 *Parent Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 School: *${schoolName}*\n` +
    `👤 Testing as: *${parent.full_name}*\n` +
    `👨‍👩‍👧 Children: *${students.length}*\n\n` +
    `You see exactly what parents see!\n\n` +
    `⚠️ Type *EXIT* to return.`
  );

  await delay(1000);
  await showMainMenu(phone, testSession, schoolWa);
}

async function activateAdminTest(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const { data: schools } = await db
    .from('schools')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
    .limit(8);

  if (!schools?.length) {
    await wa.buttons(
      phone,
      `❌ *No Active Schools*\n\n` +
      `Register your own school first!`,
      [
        { id: 'SA_REGISTER_MY_SCHOOL', title: '🏫 Register' },
        { id: 'SA_TEST_BOT',           title: '↩️ Back'     },
      ]
    );
    return;
  }

  if (schools.length === 1) {
    await activateAdminTestForSchool(
      phone, session, schools[0].id, wa
    );
    return;
  }

  await wa.list(
    phone,
    `👨‍💼 Test as School Admin`,
    `Select which school to test:`,
    `You will see what admins see`,
    `🏫 Select School`,
    [
      {
        title: 'Active Schools',
        rows: schools.map((s) => ({
          id:          `TEST_SCHOOL_${s.id}`,
          title:       s.name.substring(0, 24),
          description: 'Test admin bot',
        })),
      },
    ]
  );
}

async function activateAdminTestForSchool(
  phone:    string,
  session:  BotSession,
  schoolId: string,
  wa:       WhatsApp
): Promise<void> {
  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();

  // ✅ Get WA account using virtual pattern
  const waAccount = await getPlatformWaForSchool(schoolId);

  await setTestMode(phone, 'admin', schoolId);

  await db
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
    );

  const fakeAdminUser = {
    id:        `test-admin-${schoolId}`,
    school_id: schoolId,
    user_id:   `test-admin-${schoolId}`,
    role_id:   'admin',
    status:    'active',
    roles:     { id: 'admin', name: 'admin' },
    profiles: {
      id:         `test-admin-${schoolId}`,
      full_name:  'Super Admin (Testing)',
      phone,
      avatar_url: null,
    },
  };

  const testSession = await sessions.createAdminSession(
    phone,
    fakeAdminUser as never,
    waAccount as never,
    'admin'
  );

  const schoolWa = new WhatsApp(waAccount as never);

  await schoolWa.text(
    phone,
    `🧪 *School Admin Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 School: *${school?.name ?? 'Unknown'}*\n\n` +
    `You see exactly what admins see!\n\n` +
    `⚠️ Type *EXIT* to return.`
  );

  await delay(1000);
  await showAdminMenu(phone, testSession, schoolWa);
}

async function activateMarketingTest(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await setTestMode(phone, 'marketing', null);

  await db
    .from('demo_sessions')
    .delete()
    .eq('phone', phone.replace(/\D/g, ''));

  await wa.text(
    phone,
    `🧪 *Marketing Bot Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `You see exactly what school owners see!\n\n` +
    `⚠️ Type *EXIT* to return.\n\n` +
    `Starting marketing bot now...`
  );

  await delay(1000);

  await handleMarketingMessage({
    id:        'test-message',
    from:      phone,
    timestamp: Date.now().toString(),
    type:      'text' as const,
    text:      { body: 'hi' },
  });
}

// ============================================================
// 🔍 DEBUG SCHOOL
// ============================================================

async function promptDebug(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const { data: schools } = await db
    .from('schools')
    .select('id, name, is_active')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!schools?.length) {
    await wa.text(phone, `❌ No schools found.`);
    return;
  }

  await wa.list(
    phone,
    `🔍 Debug School`,
    `Select a school to inspect:`,
    `Tap to view debug info`,
    `🔍 Select School`,
    [
      {
        title: 'Schools',
        rows: schools.map((s) => ({
          id:          `DEBUG_SCHOOL_${s.id}`,
          title:       s.name.substring(0, 24),
          description: s.is_active
            ? '🟢 Active'
            : '🔴 Inactive',
        })),
      },
    ]
  );
}

async function showSchoolDebug(
  phone:    string,
  schoolId: string,
  wa:       WhatsApp
): Promise<void> {
  const [
    school, sessions_, waAccount,
    students, parents, staff,
    payments, logs,
  ] = await Promise.all([
    db.from('schools')
      .select(
        'name, is_active, onboarding_status, ' +
        'setup_fee_paid, student_count, created_at'
      )
      .eq('id', schoolId)
      .single(),
    db.from('bot_sessions')
      .select('phone, role, state, last_activity')
      .eq('school_id', schoolId)
      .gte(
        'last_activity',
        new Date(Date.now() - 3600000).toISOString()
      ),
    db.from('whatsapp_accounts')
      .select('status, phone_number_id, display_number')
      .eq('school_id', schoolId)
      .maybeSingle(),
    db.from('students')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('status', 'active'),
    db.from('parents')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId),
    db.from('staff')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('employment_status', 'active'),
    db.from('payments')
      .select('id', { count: 'exact' })
      .eq('school_id', schoolId)
      .eq('status', 'Success'),
    db.from('platform_logs')
      .select('level, message, created_at')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const s         = school.data;
  const wa_       = waAccount.data;
  const activeSes = sessions_.data ?? [];

  const recentLogs = (logs.data ?? [])
    .map((l) => {
      const icon =
        l.level === 'error'   ? '🔴' :
        l.level === 'warning' ? '🟡' : '🔵';
      return `${icon} ${l.message.substring(0, 40)}`;
    })
    .join('\n');

  await wa.buttons(
    phone,
    `🔍 *School Debug Report*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 *${s?.name ?? 'Unknown'}*\n\n` +
    `📊 *Status:*\n` +
    `Active: ${s?.is_active ? '✅' : '❌'}\n` +
    `Setup Fee: ${
      s?.setup_fee_paid ? '✅ Paid' : '❌ Not Paid'
    }\n` +
    `Onboarding: ${s?.onboarding_status ?? 'N/A'}\n\n` +
    `📱 *WhatsApp:*\n` +
    `Status: ${
      wa_?.status === 'active'
        ? '✅ Connected'
        : '❌ Not Connected'
    }\n` +
    `Number: ${wa_?.display_number ?? 'Not set'}\n\n` +
    `👥 *Users:*\n` +
    `Students: *${students.count ?? 0}*\n` +
    `Parents:  *${parents.count ?? 0}*\n` +
    `Staff:    *${staff.count ?? 0}*\n\n` +
    `💬 *Active Sessions:* ${activeSes.length}\n` +
    `💰 *Total Payments:* ${payments.count ?? 0}\n\n` +
    `📋 *Recent Logs:*\n` +
    `${recentLogs || '✅ No recent errors'}\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      {
        id:    `TEST_SCHOOL_${schoolId}`,
        title: '🧪 Test as Admin',
      },
      {
        id:    'SA_DEBUG_SCHOOL',
        title: '🔍 Other School',
      },
      {
        id:    '0',
        title: '↩️ Menu',
      },
    ]
  );
}

// ============================================================
// 🤖 SYSTEM HEALTH
// ============================================================

async function showSystemHealth(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  await wa.text(phone, `⏳ Running health check...`);

  const checks: Array<{
    name:   string;
    status: boolean;
    detail: string;
  }> = [];

  try {
    await db.from('schools').select('id').limit(1);
    checks.push({
      name: 'Database', status: true,
      detail: 'Supabase DB responding',
    });
  } catch {
    checks.push({
      name: 'Database', status: false,
      detail: 'DB connection failed',
    });
  }

  try {
    const apiUrl =
      Deno.env.get('WHATSAPP_API_URL') ??
      'https://graph.facebook.com/v18.0';
    const token =
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
    const phoneId =
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    const res = await fetch(`${apiUrl}/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    checks.push({
      name: 'WhatsApp API', status: res.ok,
      detail: res.ok
        ? 'Meta API responding'
        : `Error ${res.status}`,
    });
  } catch {
    checks.push({
      name: 'WhatsApp API', status: false,
      detail: 'Cannot reach Meta API',
    });
  }

  try {
    const key =
      Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
    const res = await fetch(
      'https://api.paystack.co/bank?currency=NGN&perPage=1',
      { headers: { Authorization: `Bearer ${key}` } }
    );
    checks.push({
      name: 'Paystack', status: res.ok,
      detail: res.ok ? 'Payment gateway OK' : `Error ${res.status}`,
    });
  } catch {
    checks.push({
      name: 'Paystack', status: false,
      detail: 'Cannot reach Paystack',
    });
  }

  try {
    const provider = Deno.env.get('AI_PROVIDER') ?? 'groq';
    const key = provider === 'groq'
      ? Deno.env.get('GROQ_API_KEY') ?? ''
      : Deno.env.get('OPENAI_API_KEY') ?? '';
    checks.push({
      name: 'AI Service', status: key.length > 10,
      detail: key.length > 10
        ? `${provider.toUpperCase()} key set`
        : 'API key missing',
    });
  } catch {
    checks.push({
      name: 'AI Service', status: false,
      detail: 'AI check failed',
    });
  }

  try {
    const { count } = await db
      .from('schools')
      .select('id', { count: 'exact' })
      .eq('is_active', true);
    checks.push({
      name: 'Active Schools', status: true,
      detail: `${count ?? 0} schools live`,
    });
  } catch {
    checks.push({
      name: 'Active Schools', status: false,
      detail: 'Could not count schools',
    });
  }

  const requiredEnvVars = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    'PAYSTACK_SECRET_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'APP_URL',
  ];
  const missingVars = requiredEnvVars.filter(
    (v) => !Deno.env.get(v)
  );
  checks.push({
    name: 'Environment',
    status: missingVars.length === 0,
    detail: missingVars.length === 0
      ? 'All env vars set'
      : `Missing: ${missingVars.join(', ')}`,
  });

  const allPassed = checks.every((c) => c.status);
  const lines = checks
    .map((c) =>
      `${c.status ? '✅' : '❌'} *${c.name}*\n` +
      `   ${c.detail}`
    )
    .join('\n\n');

  await wa.buttons(
    phone,
    `🤖 *System Health Check*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `${
      allPassed
        ? '✅ *All systems operational!*'
        : '⚠️ *Some systems need attention*'
    }`,
    [
      { id: 'SA_LOGS',         title: '📋 View Logs'    },
      { id: 'SA_DEBUG_SCHOOL', title: '🔍 Debug School' },
      { id: '0',               title: '↩️ Menu'         },
    ]
  );
}

// ============================================================
// PLATFORM STATS
// ============================================================

async function showFullStats(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const now          = new Date();
  const startOfMonth = new Date(
    now.getFullYear(), now.getMonth(), 1
  ).toISOString();
  const startOfYear  = new Date(
    now.getFullYear(), 0, 1
  ).toISOString();

  const [
    schoolsRes, studentsRes, parentsRes,
    monthRevRes, yearRevRes, allRevRes,
    sessionsRes, leadsRes,
  ] = await Promise.all([
    db.from('schools').select('id, is_active'),
    db.from('students')
      .select('id', { count: 'exact' })
      .eq('status', 'active'),
    db.from('parents')
      .select('id', { count: 'exact' }),
    db.from('platform_payments')
      .select('amount').eq('status', 'Success')
      .gte('created_at', startOfMonth),
    db.from('platform_payments')
      .select('amount').eq('status', 'Success')
      .gte('created_at', startOfYear),
    db.from('platform_payments')
      .select('amount').eq('status', 'Success'),
    db.from('bot_sessions')
      .select('id', { count: 'exact' })
      .gte(
        'last_activity',
        new Date(Date.now() - 3600000).toISOString()
      ),
    db.from('leads')
      .select('id', { count: 'exact' })
      .eq('status', 'new'),
  ]);

  const schools       = schoolsRes.data ?? [];
  const activeSchools =
    schools.filter((s) => s.is_active).length;
  const monthRev = sumAmount(monthRevRes.data ?? []);
  const yearRev  = sumAmount(yearRevRes.data  ?? []);
  const allRev   = sumAmount(allRevRes.data   ?? []);

  await wa.buttons(
    phone,
    `📊 *Full Platform Stats*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 *Schools:*\n` +
    `Total:    *${schools.length}*\n` +
    `Active:   *${activeSchools}*\n` +
    `Inactive: *${schools.length - activeSchools}*\n\n` +
    `👥 *Users:*\n` +
    `Students: *${(studentsRes.count ?? 0).toLocaleString()}*\n` +
    `Parents:  *${(parentsRes.count ?? 0).toLocaleString()}*\n\n` +
    `💰 *Revenue:*\n` +
    `This Month: *${fmt(monthRev)}*\n` +
    `This Year:  *${fmt(yearRev)}*\n` +
    `All Time:   *${fmt(allRev)}*\n\n` +
    `📱 *Live Activity:*\n` +
    `Online Now: *${sessionsRes.count ?? 0}*\n` +
    `New Leads:  *${leadsRes.count ?? 0}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'SA_REVENUE',     title: '💰 Revenue Detail' },
      { id: 'SA_LOGS',        title: '📋 System Logs'    },
      { id: 'SA_SYSTEM_TEST', title: '🤖 Health Check'   },
    ]
  );
}

// ============================================================
// REVENUE
// ============================================================

async function showRevenue(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(), 1
  ).toISOString();

  const [sfAll, sfMonth, cmAll, cmMonth] =
    await Promise.all([
      db.from('platform_payments').select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'setup_fee'),
      db.from('platform_payments').select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'setup_fee')
        .gte('created_at', startOfMonth),
      db.from('platform_payments').select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'commission'),
      db.from('platform_payments').select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'commission')
        .gte('created_at', startOfMonth),
    ]);

  const sfAllAmt   = sumAmount(sfAll.data   ?? []);
  const sfMonthAmt = sumAmount(sfMonth.data ?? []);
  const cmAllAmt   = sumAmount(cmAll.data   ?? []);
  const cmMonthAmt = sumAmount(cmMonth.data ?? []);

  const { data: recent } = await db
    .from('platform_payments')
    .select('amount, payment_type, created_at, schools(name)')
    .eq('status', 'Success')
    .order('created_at', { ascending: false })
    .limit(5);

  const recentLines = (recent ?? [])
    .map((p) => {
      const school = p.schools as Record<string, string> | null;
      const date = new Date(p.created_at)
        .toLocaleDateString('en-NG', {
          day: 'numeric', month: 'short',
        });
      const type =
        p.payment_type === 'setup_fee' ? '🔧' : '💸';
      return (
        `${type} ${school?.name ?? 'Unknown'}\n` +
        `   ${fmt(parseFloat(String(p.amount)))} • ${date}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `💰 *Revenue Breakdown*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🔧 *Setup Fees:*\n` +
    `This Month: *${fmt(sfMonthAmt)}*\n` +
    `All Time:   *${fmt(sfAllAmt)}*\n\n` +
    `💸 *Commissions:*\n` +
    `This Month: *${fmt(cmMonthAmt)}*\n` +
    `All Time:   *${fmt(cmAllAmt)}*\n\n` +
    `💵 *Grand Total:*\n` +
    `This Month: *${fmt(sfMonthAmt + cmMonthAmt)}*\n` +
    `All Time:   *${fmt(sfAllAmt  + cmAllAmt)}*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📋 *Recent Payments:*\n\n` +
    `${recentLines || 'No payments yet'}`,
    [
      { id: 'SA_STATS',   title: '📊 Full Stats' },
      { id: 'SA_SCHOOLS', title: '🏫 Schools'    },
      { id: '0',          title: '↩️ Menu'        },
    ]
  );
}

// ============================================================
// SCHOOLS
// ============================================================

async function showSchools(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const { data: schools } = await db
    .from('schools')
    .select(
      'id, name, is_active, student_count, ' +
      'onboarding_status, setup_fee_paid, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(10);

  if (!schools?.length) {
    await wa.buttons(
      phone,
      `🏫 *Schools*\n\nNo schools registered yet.`,
      [{ id: 'SA_LEADS', title: '🧲 View Leads' }]
    );
    return;
  }

  const lines = schools
    .map((s, i) => {
      const status  = s.is_active      ? '🟢' : '🔴';
      const feePaid = s.setup_fee_paid ? '✅' : '⏳';
      return (
        `${i + 1}. ${status} *${s.name}*\n` +
        `   👥 ${s.student_count ?? 0} students  ` +
        `${feePaid} ${s.onboarding_status}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `🏫 *Schools (Latest 10)*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🟢 Active  🔴 Inactive\n` +
    `✅ Fee Paid  ⏳ Pending`,
    [
      { id: 'SA_DEBUG_SCHOOL', title: '🔍 Debug School' },
      { id: 'SA_SYSTEM_TEST',  title: '🤖 Health Check' },
      { id: '0',               title: '↩️ Menu'         },
    ]
  );
}

// ============================================================
// LEADS
// ============================================================

async function showLeads(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const { data: leads } = await db
    .from('leads')
    .select(
      'contact_name, school_name, phone, ' +
      'status, student_count, location, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(8);

  if (!leads?.length) {
    await wa.buttons(
      phone,
      `🧲 *Leads*\n\nNo leads yet.`,
      [{ id: '0', title: '↩️ Menu' }]
    );
    return;
  }

  const statusIcons: Record<string, string> = {
    new: '🆕', contacted: '📞',
    demo_done: '👀', converted: '✅', lost: '❌',
  };

  const { data: allLeads } = await db
    .from('leads').select('status');

  const counts = (allLeads ?? []).reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const lines = leads
    .map((l, i) => {
      const icon = statusIcons[l.status] ?? '•';
      const date = new Date(l.created_at)
        .toLocaleDateString('en-NG', {
          day: 'numeric', month: 'short',
        });
      return (
        `${i + 1}. ${icon} *${l.contact_name}*\n` +
        `   🏫 ${l.school_name}\n` +
        `   📱 ${l.phone} | ${date}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `🧲 *Leads Pipeline*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🆕 New: *${counts.new ?? 0}*  ` +
    `📞 Contacted: *${counts.contacted ?? 0}*\n` +
    `👀 Demo: *${counts.demo_done ?? 0}*  ` +
    `✅ Converted: *${counts.converted ?? 0}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}`,
    [
      { id: 'SA_STATS', title: '📊 Stats' },
      { id: '0',        title: '↩️ Menu'  },
    ]
  );
}

// ============================================================
// ACTIVE SESSIONS
// ============================================================

async function showActiveSessions(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const since = new Date(
    Date.now() - 60 * 60 * 1000
  ).toISOString();

  const { data: activeSessions } = await db
    .from('bot_sessions')
    .select('phone, role, state, last_activity')
    .gte('last_activity', since)
    .order('last_activity', { ascending: false })
    .limit(10);

  const total = activeSessions?.length ?? 0;

  if (!total) {
    await wa.buttons(
      phone,
      `💬 *Active Sessions*\n\n` +
      `No active sessions in the last hour.`,
      [{ id: '0', title: '↩️ Menu' }]
    );
    return;
  }

  const roleIcons: Record<string, string> = {
    parent: '👨‍👩‍👧', admin: '👨‍💼', teacher: '👨‍🏫',
  };

  const parents =
    (activeSessions ?? [])
      .filter((s) => s.role === 'parent').length;
  const admins =
    (activeSessions ?? [])
      .filter((s) => s.role === 'admin').length;
  const teachers =
    (activeSessions ?? [])
      .filter((s) => s.role === 'teacher').length;

  const lines = (activeSessions ?? [])
    .map((s) => {
      const icon = roleIcons[s.role] ?? '👤';
      const time = new Date(s.last_activity)
        .toLocaleTimeString('en-NG', {
          hour: '2-digit', minute: '2-digit',
        });
      const ph =
        s.phone.slice(0, 7) + '***' + s.phone.slice(-2);
      return `${icon} ${ph} | ${time}`;
    })
    .join('\n');

  await wa.buttons(
    phone,
    `💬 *Active Sessions (Last Hour)*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👨‍👩‍👧 Parents:  *${parents}*\n` +
    `👨‍💼 Admins:   *${admins}*\n` +
    `👨‍🏫 Teachers: *${teachers}*\n` +
    `👥 Total:    *${total}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}`,
    [
      { id: 'SA_STATS', title: '📊 Stats' },
      { id: '0',        title: '↩️ Menu'  },
    ]
  );
}

// ============================================================
// SYSTEM LOGS
// ============================================================

async function showLogs(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  const { data: logs } = await db
    .from('platform_logs')
    .select('level, category, message, created_at')
    .in('level', ['error', 'warning'])
    .order('created_at', { ascending: false })
    .limit(5);

  if (!logs?.length) {
    await wa.buttons(
      phone,
      `📋 *System Logs*\n\n` +
      `✅ No errors or warnings!\n` +
      `All systems running clean. 🎉`,
      [
        { id: 'SA_SYSTEM_TEST', title: '🤖 Health Check' },
        { id: '0',              title: '↩️ Menu'          },
      ]
    );
    return;
  }

  const lines = logs
    .map((l) => {
      const icon = l.level === 'error' ? '🔴' : '🟡';
      const time = new Date(l.created_at)
        .toLocaleString('en-NG', {
          day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit',
        });
      return (
        `${icon} *${l.category ?? l.level}*\n` +
        `   ${l.message.substring(0, 60)}\n` +
        `   ${time}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `📋 *Recent Errors & Warnings*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Use dashboard for full details.`,
    [
      { id: 'SA_SYSTEM_TEST', title: '🤖 Health Check' },
      { id: '0',              title: '↩️ Menu'          },
    ]
  );
}

// ============================================================
// BROADCAST
// ============================================================

async function promptBroadcast(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `📢 *Broadcast to All School Admins*\n\n` +
    `Type your message below.\n\n` +
    `It will be sent to ALL school\n` +
    `admin WhatsApp numbers.\n\n` +
    `Type *CANCEL* to go back.`
  );

  await sessions.setState(
    phone,
    'ADMIN_MAIN_MENU',
    'SA_BROADCAST_COMPOSE'
  );
}

export async function handleSuperAdminBroadcast(
  phone:   string,
  session: BotSession,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  const text = rawText.trim();

  if (text.toLowerCase() === 'cancel') {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  if (text.length < 5) {
    await wa.text(
      phone,
      `⚠️ Message too short. Please type\n` +
      `a proper announcement.`
    );
    return;
  }

  await wa.buttons(
    phone,
    `📢 *Preview Broadcast*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📨 *To:* All School Admins\n\n` +
    `💬 *Message:*\n${text}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Send this message?`,
    [
      { id: 'SA_BROADCAST_CONFIRM', title: '✅ Send Now' },
      { id: 'SA_BROADCAST_CANCEL',  title: '❌ Cancel'  },
    ]
  );

  await sessions.setState(
    phone,
    'ADMIN_MAIN_MENU',
    'SA_BROADCAST_CONFIRM',
    { data: { broadcastMessage: text } }
  );
}

async function confirmBroadcast(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const message =
    session.data?.broadcastMessage as string | null;

  if (!message) {
    await showSuperAdminMenu(phone, session, wa);
    return;
  }

  const { data: waAccounts } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token, school_id')
    .eq('status', 'active');

  if (!waAccounts?.length) {
    await wa.text(
      phone, `❌ No active school WhatsApp accounts.`
    );
    return;
  }

  let sent = 0, failed = 0;

  for (const account of waAccounts) {
    try {
      const { data: onboarding } = await db
        .from('school_onboarding')
        .select('admin_phone')
        .eq('school_id', account.school_id)
        .maybeSingle();

      if (!onboarding?.admin_phone) continue;

      const schoolWa = new WhatsApp({
        phone_number_id: account.phone_number_id,
        access_token:    account.access_token,
        status:          'active',
      });

      await schoolWa.text(
        onboarding.admin_phone,
        `📢 *Announcement from XtopEdu*\n\n` +
        `${message}\n\n_XtopEdu Platform_`
      );

      sent++;
      await delay(200);
    } catch {
      failed++;
    }
  }

  await wa.buttons(
    phone,
    `✅ *Broadcast Complete!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ Sent:   *${sent}* schools\n` +
    (failed > 0 ? `❌ Failed: *${failed}* schools\n` : '') +
    `━━━━━━━━━━━━━━━━`,
    [{ id: '0', title: '↩️ Menu' }]
  );
}

// ============================================================
// QUICK STATS HELPER
// ============================================================

async function getQuickStats(): Promise<{
  totalSchools:   number;
  activeSchools:  number;
  totalStudents:  number;
  monthRevenue:   number;
  activeSessions: number;
}> {
  try {
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(), 1
    ).toISOString();

    const [schools, students, revenue, activeSess] =
      await Promise.all([
        db.from('schools').select('id, is_active'),
        db.from('students')
          .select('id', { count: 'exact' })
          .eq('status', 'active'),
        db.from('platform_payments')
          .select('amount')
          .eq('status', 'Success')
          .gte('created_at', startOfMonth),
        db.from('bot_sessions')
          .select('id', { count: 'exact' })
          .gte(
            'last_activity',
            new Date(Date.now() - 3600000).toISOString()
          ),
      ]);

    const schoolList = schools.data ?? [];

    return {
      totalSchools:   schoolList.length,
      activeSchools:  schoolList.filter(
        (s) => s.is_active
      ).length,
      totalStudents:  students.count  ?? 0,
      monthRevenue:   sumAmount(revenue.data ?? []),
      activeSessions: activeSess.count ?? 0,
    };
  } catch {
    return {
      totalSchools:   0,
      activeSchools:  0,
      totalStudents:  0,
      monthRevenue:   0,
      activeSessions: 0,
    };
  }
}
