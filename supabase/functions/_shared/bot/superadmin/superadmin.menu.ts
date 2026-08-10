// ============================================================
// SCHOOLBOT - SUPER ADMIN BOT MENU
// _shared/bot/superadmin/superadmin.menu.ts
//
// What YOU (the platform owner) see when you message
// your own WhatsApp number (08073128887).
// Includes ability to switch into any bot mode for testing.
// ============================================================

import { WhatsApp }        from '../../whatsapp.ts';
import { getSupabase }     from '../../supabase.ts';
import { fmt }             from '../../utils.ts';
import { SessionService }  from '../../session.ts';
import type { BotSession } from '../../types.ts';

const db       = getSupabase();
const sessions = new SessionService();

// ─── Delay helper ─────────────────────────────────────────
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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
// CHECK IF SUPER ADMIN IS IN TEST MODE
// Called by handler.ts before routing
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
    return { active: false, testRole: null, schoolId: null };
  }

  // Test sessions expire after 2 hours
  const age = Date.now() -
    new Date(data.created_at).getTime();
  if (age > 2 * 60 * 60 * 1000) {
    await db
      .from('super_admin_test_sessions')
      .delete()
      .eq('phone', phone);
    return { active: false, testRole: null, schoolId: null };
  }

  return {
    active:   true,
    testRole: data.test_role,
    schoolId: data.school_id,
  };
}

// ─── Set test mode ─────────────────────────────────────────
async function setTestMode(
  phone: string,
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

// ─── Clear test mode ───────────────────────────────────────
export async function clearTestMode(
  phone: string
): Promise<void> {
  await db
    .from('super_admin_test_sessions')
    .delete()
    .eq('phone', phone);
}

// ============================================================
// MAIN SUPER ADMIN MENU
// ============================================================

export async function showSuperAdminMenu(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const name =
    session.schoolUser?.profiles?.full_name
      ?.split(' ')[0] ?? 'Boss';

  const hour = new Date().getHours();
  const greet =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening';

  // Get quick stats
  const stats = await getQuickStats();

  await wa.list(
    phone,
    `🔐 XtopEdu Admin`,
    `${greet} *${name}!* 👋\n\n` +
    `📊 *Quick Stats:*\n` +
    `🏫 Schools: *${stats.totalSchools}* ` +
    `(${stats.activeSchools} active)\n` +
    `💰 This Month: *${fmt(stats.monthRevenue)}*\n` +
    `👥 Students: *${stats.totalStudents.toLocaleString()}*\n` +
    `💬 Active Now: *${stats.activeSessions}*`,
    `Type *0* anytime to return here`,
    `⚙️ Open Menu`,
    [
      {
        title: '📊 Platform',
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
            title:       '🏫 Schools',
            description: 'View all schools',
          },
        ],
      },
      {
        title: '🧲 Sales',
        rows: [
          {
            id:          'SA_LEADS',
            title:       '🧲 Leads',
            description: 'New school leads',
          },
          {
            id:          'SA_SESSIONS',
            title:       '💬 Active Sessions',
            description: 'Who is online now',
          },
        ],
      },
      {
        title: '🛠️ Operations',
        rows: [
          {
            id:          'SA_LOGS',
            title:       '📋 System Logs',
            description: 'Errors & warnings',
          },
          {
            id:          'SA_BROADCAST',
            title:       '📢 Broadcast',
            description: 'Message all schools',
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
            title:       '🔍 Debug School',
            description: 'Inspect a school bot session',
          },
          {
            id:          'SA_SYSTEM_TEST',
            title:       '🤖 System Health',
            description: 'Check all systems working',
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
  phone: string,
  session: BotSession,
  input: string,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {

    // ── Platform ─────────────────────────────────────────
    case 'sa_stats':
      await showFullStats(phone, wa);
      break;

    case 'sa_revenue':
      await showRevenue(phone, wa);
      break;

    case 'sa_schools':
      await showSchools(phone, wa);
      break;

    // ── Sales ─────────────────────────────────────────────
    case 'sa_leads':
      await showLeads(phone, wa);
      break;

    case 'sa_sessions':
      await showActiveSessions(phone, wa);
      break;

    // ── Operations ────────────────────────────────────────
    case 'sa_logs':
      await showLogs(phone, wa);
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

    // ── Testing & Debug ───────────────────────────────────
    case 'sa_test_bot':
      await showTestOptions(phone, session, wa);
      break;

    case 'sa_debug':
      await promptDebug(phone, wa);
      break;

    case 'sa_system_test':
      await showSystemHealth(phone, wa);
      break;

    // ── Test mode selections ──────────────────────────────
    case 'test_as_parent':
      await activateParentTest(phone, session, wa);
      break;

    case 'test_as_admin':
      await activateAdminTest(phone, session, wa);
      break;

    case 'test_marketing':
      await activateMarketingTest(phone, session, wa);
      break;

    // ── School selector for admin test ────────────────────
    default:
      if (input.startsWith('test_school_')) {
        const schoolId = input.replace('test_school_', '');
        await activateAdminTestForSchool(
          phone, session, schoolId, wa
        );
      } else if (input.startsWith('debug_school_')) {
        const schoolId = input.replace('debug_school_', '');
        await showSchoolDebug(phone, schoolId, wa);
      } else {
        await showSuperAdminMenu(phone, session, wa);
      }
  }
}

// ============================================================
// 🧪 TEST BOT FEATURES
// ============================================================

async function showTestOptions(
  phone: string,
  session: BotSession,
  wa: WhatsApp
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
      { id: 'test_as_parent',  title: '👨‍👩‍👧 Test as Parent' },
      { id: 'test_as_admin',   title: '👨‍💼 Test as Admin' },
      { id: 'test_marketing',  title: '🎯 Test Marketing Bot' },
    ],
    '🧪 Test Mode'
  );
}

// ─── Activate Parent Test Mode ────────────────────────────
async function activateParentTest(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get list of schools to test with
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
      `school to test the parent bot.`,
      [{ id: 'SA_TEST_BOT', title: '↩️ Back' }]
    );
    return;
  }

  if (schools.length === 1) {
    // Only one school — go straight to test
    await activateParentTestForSchool(
      phone, session, schools[0].id, schools[0].name, wa
    );
    return;
  }

  // Multiple schools — let them pick
  await wa.list(
    phone,
    `👨‍👩‍👧 Test as Parent`,
    `Select which school to test\nthe parent experience for:`,
    `You will see what parents see`,
    `🏫 Select School`,
    [
      {
        title: 'Active Schools',
        rows: schools.map((s) => ({
          id:          `test_school_parent_${s.id}`,
          title:       s.name.substring(0, 24),
          description: 'Test parent bot for this school',
        })),
      },
    ]
  );
}

async function activateParentTestForSchool(
  phone: string,
  session: BotSession,
  schoolId: string,
  schoolName: string,
  wa: WhatsApp
): Promise<void> {
  // Get a real parent from this school to test with
  const { data: parent } = await db
    .from('parents')
    .select('id, full_name, phone, whatsapp_number')
    .eq('school_id', schoolId)
    .limit(1)
    .maybeSingle();

  // Get school WA account
  const { data: waAccount } = await db
    .from('whatsapp_accounts')
    .select('*')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .maybeSingle();

  if (!parent) {
    await wa.buttons(
      phone,
      `⚠️ *No parents found*\n\n` +
      `*${schoolName}* has no parents\n` +
      `registered yet.\n\n` +
      `Add parents first to test\n` +
      `the parent experience.`,
      [
        { id: 'test_as_admin',  title: '👨‍💼 Test as Admin' },
        { id: 'SA_TEST_BOT',    title: '↩️ Back' },
      ]
    );
    return;
  }

  // Set test mode in DB
  await setTestMode(phone, 'parent', schoolId);

  // Create a parent session using the real parent's data
  const { ParentService } = await import(
    '../../services/parent.service.ts'
  );
  const parentSvc = new ParentService();

  const students = await parentSvc.getStudents(parent.id);

  const testSession = await sessions.createParentSession(
    phone,
    {
      ...parent,
      school_id: schoolId,
      schools: { name: schoolName } as never,
    } as never,
    students,
    waAccount as never
  );

  // Import and show the real parent menu
  const { showMainMenu } = await import('../menu.ts');
  const schoolWa = new WhatsApp(waAccount as never);

  await wa.text(
    phone,
    `🧪 *Parent Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 School: *${schoolName}*\n` +
    `👤 Testing as: *${parent.full_name}*\n` +
    `👨‍👩‍👧 Children: *${students.length}*\n\n` +
    `You are now seeing exactly what\n` +
    `*${parent.full_name}* sees!\n\n` +
    `⚠️ Type *EXIT* to return to\n` +
    `your super admin panel.`
  );

  await delay(1000);
  await showMainMenu(phone, testSession, schoolWa);
}

// ─── Activate Admin Test Mode ─────────────────────────────
async function activateAdminTest(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get list of schools
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
      `school to test the admin bot.`,
      [{ id: 'SA_TEST_BOT', title: '↩️ Back' }]
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
    `Select which school to test\nthe admin experience for:`,
    `You will see what school admins see`,
    `🏫 Select School`,
    [
      {
        title: 'Active Schools',
        rows: schools.map((s) => ({
          id:          `test_school_${s.id}`,
          title:       s.name.substring(0, 24),
          description: 'Test admin bot for this school',
        })),
      },
    ]
  );
}

async function activateAdminTestForSchool(
  phone: string,
  session: BotSession,
  schoolId: string,
  wa: WhatsApp
): Promise<void> {
  // Get school details
  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();

  // Get school WA account
  const { data: waAccount } = await db
    .from('whatsapp_accounts')
    .select('*')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .maybeSingle();

  // Set test mode in DB
  await setTestMode(phone, 'admin', schoolId);

  // Build a fake admin school user for this school
  const fakeAdminUser = {
    id:        `test-admin-${schoolId}`,
    school_id: schoolId,
    user_id:   `test-admin-${schoolId}`,
    role_id:   'admin',
    status:    'active',
    roles: {
      id:   'admin',
      name: 'admin',
    },
    profiles: {
      id:         `test-admin-${schoolId}`,
      full_name:  'Super Admin (Testing)',
      phone:      phone,
      avatar_url: null,
    },
  };

  // Create admin session for this school
  const testSession = await sessions.createAdminSession(
    phone,
    fakeAdminUser as never,
    waAccount as never,
    'admin'
  );

  const schoolWa = new WhatsApp(waAccount as never);

  await wa.text(
    phone,
    `🧪 *School Admin Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `🏫 School: *${school?.name ?? 'Unknown'}*\n\n` +
    `You are now seeing exactly what\n` +
    `the school admin sees!\n\n` +
    `You can test:\n` +
    `✅ Mark attendance\n` +
    `💰 Record fees\n` +
    `👨‍🏫 Manage staff\n` +
    `📊 View reports\n` +
    `📢 Send broadcasts\n\n` +
    `⚠️ Type *EXIT* to return to\n` +
    `your super admin panel.`
  );

  await delay(1000);

  // Import and show real admin menu
  const { showAdminMenu } = await import(
    '../admin/admin.menu.ts'
  );
  await showAdminMenu(phone, testSession, schoolWa);
}

// ─── Activate Marketing Bot Test ──────────────────────────
async function activateMarketingTest(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Set test mode
  await setTestMode(phone, 'marketing', null);

  // Clear any existing marketing session so it starts fresh
  await db
    .from('demo_sessions')
    .delete()
    .eq('phone', phone.replace(/\D/g, ''));

  await wa.text(
    phone,
    `🧪 *Marketing Bot Test Mode ACTIVE*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `You are now seeing exactly what\n` +
    `school owners see when they\n` +
    `message your number!\n\n` +
    `You can test:\n` +
    `🎯 Demo features (attendance, fees)\n` +
    `🤖 Sabi AI responses\n` +
    `💵 Pricing display\n` +
    `🚀 Registration flow\n\n` +
    `⚠️ Type *EXIT* to return to\n` +
    `your super admin panel.\n\n` +
    `Starting marketing bot now...`
  );

  await delay(1000);

  // Trigger the marketing bot welcome
  const { handleMarketingMessage } = await import(
    '../marketing/marketing.handler.ts'
  );

  // Create a fake "hi" message
  const fakeMessage = {
    id:        'test-message',
    from:      phone,
    timestamp: Date.now().toString(),
    type:      'text' as const,
    text:      { body: 'hi' },
  };

  await handleMarketingMessage(fakeMessage);
}

// ============================================================
// 🔍 DEBUG SCHOOL
// ============================================================

async function promptDebug(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  const { data: schools } = await db
    .from('schools')
    .select('id, name, is_active')
    .order('created_at', { ascending: false })
    .limit(8);

  if (!schools?.length) {
    await wa.text(
      phone,
      `❌ No schools found to debug.`
    );
    return;
  }

  await wa.list(
    phone,
    `🔍 Debug School`,
    `Select a school to inspect\nits bot sessions and activity:`,
    `Tap to view debug info`,
    `🔍 Select School`,
    [
      {
        title: 'Schools',
        rows: schools.map((s) => ({
          id:          `debug_school_${s.id}`,
          title:       s.name.substring(0, 24),
          description: s.is_active ? '🟢 Active' : '🔴 Inactive',
        })),
      },
    ]
  );
}

async function showSchoolDebug(
  phone: string,
  schoolId: string,
  wa: WhatsApp
): Promise<void> {
  const [school, sessions_, waAccount, students,
    parents, staff, payments, logs] =
    await Promise.all([
      db.from('schools')
        .select('name, is_active, onboarding_status, ' +
          'setup_fee_paid, student_count, created_at')
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

  const recentLogs = (logs.data ?? []).map((l) => {
    const icon = l.level === 'error' ? '🔴' :
      l.level === 'warning' ? '🟡' : '🔵';
    return `${icon} ${l.message.substring(0, 40)}`;
  }).join('\n');

  await wa.buttons(
    phone,
    `🔍 *School Debug Report*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 *${s?.name ?? 'Unknown'}*\n\n` +
    `📊 *Status:*\n` +
    `Active: ${s?.is_active ? '✅' : '❌'}\n` +
    `Setup Fee: ${s?.setup_fee_paid ? '✅ Paid' : '❌ Not Paid'}\n` +
    `Onboarding: ${s?.onboarding_status ?? 'N/A'}\n\n` +
    `📱 *WhatsApp:*\n` +
    `Status: ${wa_?.status === 'active' ? '✅ Connected' : '❌ Not Connected'}\n` +
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
        id:    `test_school_${schoolId}`,
        title: '🧪 Test as Admin',
      },
      {
        id:    'SA_DEBUG',
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
// 🤖 SYSTEM HEALTH CHECK
// ============================================================

async function showSystemHealth(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `⏳ Running system health check...`
  );

  const checks: Array<{
    name:   string;
    status: boolean;
    detail: string;
  }> = [];

  // ── Check 1: Database ─────────────────────────────────
  try {
    const { data } = await db
      .from('schools')
      .select('id')
      .limit(1);
    checks.push({
      name:   'Database',
      status: true,
      detail: 'Supabase DB responding',
    });
  } catch {
    checks.push({
      name:   'Database',
      status: false,
      detail: 'DB connection failed',
    });
  }

  // ── Check 2: WhatsApp API ─────────────────────────────
  try {
    const apiUrl =
      Deno.env.get('WHATSAPP_API_URL') ??
      'https://graph.facebook.com/v18.0';
    const token =
      Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
    const phoneId =
      Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

    const res = await fetch(
      `${apiUrl}/${phoneId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    checks.push({
      name:   'WhatsApp API',
      status: res.ok,
      detail: res.ok
        ? 'Meta API responding'
        : `Error ${res.status}`,
    });
  } catch {
    checks.push({
      name:   'WhatsApp API',
      status: false,
      detail: 'Cannot reach Meta API',
    });
  }

  // ── Check 3: Paystack ─────────────────────────────────
  try {
    const key = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
    const res = await fetch(
      'https://api.paystack.co/bank?currency=NGN&perPage=1',
      {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      }
    );
    checks.push({
      name:   'Paystack',
      status: res.ok,
      detail: res.ok
        ? 'Payment gateway OK'
        : `Error ${res.status}`,
    });
  } catch {
    checks.push({
      name:   'Paystack',
      status: false,
      detail: 'Cannot reach Paystack',
    });
  }

  // ── Check 4: AI Service ───────────────────────────────
  try {
    const provider =
      Deno.env.get('AI_PROVIDER') ?? 'groq';
    const key = provider === 'groq'
      ? Deno.env.get('GROQ_API_KEY') ?? ''
      : Deno.env.get('OPENAI_API_KEY') ?? '';

    checks.push({
      name:   'AI Service',
      status: key.length > 10,
      detail: key.length > 10
        ? `${provider.toUpperCase()} key set`
        : 'API key missing',
    });
  } catch {
    checks.push({
      name:   'AI Service',
      status: false,
      detail: 'AI check failed',
    });
  }

  // ── Check 5: Active schools ───────────────────────────
  try {
    const { data } = await db
      .from('schools')
      .select('id', { count: 'exact' })
      .eq('is_active', true);
    checks.push({
      name:   'Active Schools',
      status: true,
      detail: `${data?.length ?? 0} schools live`,
    });
  } catch {
    checks.push({
      name:   'Active Schools',
      status: false,
      detail: 'Could not count schools',
    });
  }

  // ── Check 6: Environment vars ─────────────────────────
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
    name:   'Environment',
    status: missingVars.length === 0,
    detail: missingVars.length === 0
      ? 'All env vars set'
      : `Missing: ${missingVars.join(', ')}`,
  });

  // ── Build report ──────────────────────────────────────
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
    `${allPassed
      ? '✅ *All systems operational!*'
      : '⚠️ *Some systems need attention*'}`,
    [
      { id: 'SA_LOGS',     title: '📋 View Logs' },
      { id: 'SA_TEST_BOT', title: '🧪 Test Bot' },
      { id: '0',           title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// PLATFORM STATS
// ============================================================

async function showFullStats(
  phone: string,
  wa: WhatsApp
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
      .select('amount')
      .eq('status', 'Success')
      .gte('created_at', startOfMonth),
    db.from('platform_payments')
      .select('amount')
      .eq('status', 'Success')
      .gte('created_at', startOfYear),
    db.from('platform_payments')
      .select('amount')
      .eq('status', 'Success'),
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
  const activeSchools = schools.filter(
    (s) => s.is_active
  ).length;
  const monthRev      = sumAmount(monthRevRes.data ?? []);
  const yearRev       = sumAmount(yearRevRes.data   ?? []);
  const allRev        = sumAmount(allRevRes.data    ?? []);

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
      { id: 'SA_REVENUE', title: '💰 Revenue Detail' },
      { id: 'SA_SCHOOLS', title: '🏫 Schools' },
      { id: 'SA_LEADS',   title: '🧲 Leads' },
    ]
  );
}

// ============================================================
// REVENUE
// ============================================================

async function showRevenue(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  const startOfMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
  ).toISOString();

  const [sfAll, sfMonth, cmAll, cmMonth] =
    await Promise.all([
      db.from('platform_payments')
        .select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'setup_fee'),
      db.from('platform_payments')
        .select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'setup_fee')
        .gte('created_at', startOfMonth),
      db.from('platform_payments')
        .select('amount')
        .eq('status', 'Success')
        .eq('payment_type', 'commission'),
      db.from('platform_payments')
        .select('amount')
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
    .select(
      'amount, payment_type, created_at, schools(name)'
    )
    .eq('status', 'Success')
    .order('created_at', { ascending: false })
    .limit(5);

  const recentLines = (recent ?? []).map((p) => {
    const school = p.schools as
      Record<string, string> | null;
    const date = new Date(p.created_at)
      .toLocaleDateString('en-NG', {
        day: 'numeric', month: 'short',
      });
    const type = p.payment_type === 'setup_fee'
      ? '🔧' : '💸';
    return (
      `${type} ${school?.name ?? 'Unknown'}\n` +
      `   ${fmt(parseFloat(String(p.amount)))} • ${date}`
    );
  }).join('\n\n');

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
    `All Time:   *${fmt(sfAllAmt + cmAllAmt)}*\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📋 *Recent Payments:*\n\n` +
    `${recentLines || 'No payments yet'}`,
    [
      { id: 'SA_STATS',   title: '📊 Full Stats' },
      { id: 'SA_SCHOOLS', title: '🏫 Schools' },
      { id: '0',          title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// SCHOOLS
// ============================================================

async function showSchools(
  phone: string,
  wa: WhatsApp
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

  const lines = schools.map((s, i) => {
    const status  = s.is_active ? '🟢' : '🔴';
    const feePaid = s.setup_fee_paid ? '✅' : '⏳';
    return (
      `${i + 1}. ${status} *${s.name}*\n` +
      `   👥 ${s.student_count ?? 0} students  ` +
      `${feePaid} ${s.onboarding_status}`
    );
  }).join('\n\n');

  await wa.buttons(
    phone,
    `🏫 *Schools (Latest 10)*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🟢 Active  🔴 Inactive\n` +
    `✅ Fee Paid  ⏳ Pending`,
    [
      { id: 'SA_DEBUG',   title: '🔍 Debug School' },
      { id: 'SA_REVENUE', title: '💰 Revenue' },
      { id: '0',          title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// LEADS
// ============================================================

async function showLeads(
  phone: string,
  wa: WhatsApp
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
    new:       '🆕',
    contacted: '📞',
    demo_done: '👀',
    converted: '✅',
    lost:      '❌',
  };

  const { data: allLeads } = await db
    .from('leads')
    .select('status');

  const counts = (allLeads ?? []).reduce(
    (acc, l) => {
      acc[l.status] = (acc[l.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const lines = leads.map((l, i) => {
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
  }).join('\n\n');

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
      { id: '0',        title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// ACTIVE SESSIONS
// ============================================================

async function showActiveSessions(
  phone: string,
  wa: WhatsApp
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
    parent:  '👨‍👩‍👧',
    admin:   '👨‍💼',
    teacher: '👨‍🏫',
  };

  const parents  = (activeSessions ?? [])
    .filter((s) => s.role === 'parent').length;
  const admins   = (activeSessions ?? [])
    .filter((s) => s.role === 'admin').length;
  const teachers = (activeSessions ?? [])
    .filter((s) => s.role === 'teacher').length;

  const lines = (activeSessions ?? []).map((s) => {
    const icon = roleIcons[s.role] ?? '👤';
    const time = new Date(s.last_activity)
      .toLocaleTimeString('en-NG', {
        hour: '2-digit', minute: '2-digit',
      });
    const ph =
      s.phone.slice(0, 7) + '***' + s.phone.slice(-2);
    return `${icon} ${ph} | ${time}`;
  }).join('\n');

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
      { id: '0',        title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// SYSTEM LOGS
// ============================================================

async function showLogs(
  phone: string,
  wa: WhatsApp
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
      [{ id: '0', title: '↩️ Menu' }]
    );
    return;
  }

  const lines = logs.map((l) => {
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
  }).join('\n\n');

  await wa.buttons(
    phone,
    `📋 *Recent Errors & Warnings*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `Use dashboard for full details.`,
    [
      { id: 'SA_SYSTEM_TEST', title: '🤖 Health Check' },
      { id: '0',              title: '↩️ Menu' },
    ]
  );
}

// ============================================================
// BROADCAST
// ============================================================

async function promptBroadcast(
  phone: string,
  session: BotSession,
  wa: WhatsApp
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
  phone: string,
  session: BotSession,
  rawText: string,
  wa: WhatsApp
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
      { id: 'SA_BROADCAST_CANCEL',  title: '❌ Cancel' },
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
  phone: string,
  session: BotSession,
  wa: WhatsApp
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
      phone,
      `❌ No active school WhatsApp accounts found.`
    );
    return;
  }

  let sent   = 0;
  let failed = 0;

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
        `${message}\n\n` +
        `_XtopEdu Platform_`
      );

      sent++;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      failed++;
    }
  }

  await wa.buttons(
    phone,
    `✅ *Broadcast Complete!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ Sent:   *${sent}* schools\n` +
    (failed > 0
      ? `❌ Failed: *${failed}* schools\n`
      : '') +
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
      new Date().getMonth(),
      1
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
            new Date(
              Date.now() - 3600000
            ).toISOString()
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
