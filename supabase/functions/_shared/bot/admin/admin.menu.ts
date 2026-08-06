// ============================================================
// SCHOOLBOT - ADMIN MAIN MENU
// supabase/functions/_shared/bot/admin/admin.menu.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService } from '../../services/admin.service.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();

// ─── Show admin main menu ──────────────────────────────────────────────────
export async function showAdminMenu(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get admin name
  const adminName =
    session.schoolUser?.profiles?.full_name?.split(' ')[0] ??
    'Admin';

  // Get school name
  const schoolName =
    (session.parent?.schools?.name as string | undefined) ??
    (await getSchoolName(session.school_id));

  // Get role
  const roleName =
    session.schoolUser?.roles?.name ?? session.role;

  // Time based greeting
  const greet = getGreeting();

  // Build menu based on role
  // Admins get full menu, teachers get limited menu
  const isAdmin = adminSvc.isAdmin(
    session.schoolUser ?? { roles: { name: session.role } } as never
  );

  await wa.list(
    phone,
    // Header
    `🏫 ${schoolName} — Admin`,
    // Body
    `${greet} *${adminName}!* 👋\n` +
    `🔑 Role: *${formatRole(roleName)}*\n\n` +
    `What would you like to manage?`,
    // Footer
    `Type *0* to return here anytime`,
    // Button label
    `⚙️ Admin Menu`,
    // Sections - build based on role
    buildMenuSections(isAdmin)
  );

  await sessions.setState(phone, 'ADMIN_MAIN_MENU');
}

// ─── Build menu sections based on role ────────────────────────────────────
function buildMenuSections(isAdmin: boolean) {
  const sections = [];

  // Academic section - all staff can access
  sections.push({
    title: '📚 Academics',
    rows: [
      {
        id: 'ADMIN_ATTENDANCE',
        title: '✅ Attendance',
        description: 'Mark & view attendance',
      },
      {
        id: 'ADMIN_STUDENTS',
        title: '👨‍🎓 Students',
        description: 'Search & view student info',
      },
    ],
  });

  // Finance section - admin only
  if (isAdmin) {
    sections.push({
      title: '💰 Finance',
      rows: [
        {
          id: 'ADMIN_FEES',
          title: '💰 Fees & Payments',
          description: 'View & record payments',
        },
        {
          id: 'ADMIN_FEE_STATS',
          title: '📊 Fee Report',
          description: 'Collection summary',
        },
        {
          id: 'ADMIN_RECEIPTS',
          title: '🧾 Receipts',
          description: 'View & send receipts',
        },
      ],
    });
  }

  // Communication section - admin only
  if (isAdmin) {
    sections.push({
      title: '📢 Communication',
      rows: [
        {
          id: 'ADMIN_BROADCAST',
          title: '📢 Broadcast',
          description: 'Send message to parents',
        },
        {
          id: 'ADMIN_STAFF',
          title: '👨‍🏫 Staff Management',
          description: 'Add & manage staff',
        },
      ],
    });
  }

  // Data section - admin only
  if (isAdmin) {
    sections.push({
      title: '📊 Data & Reports',
      rows: [
        {
          id: 'ADMIN_UPLOAD',
          title: '📤 Upload Students',
          description: 'Bulk import via CSV',
        },
        {
          id: 'ADMIN_REPORTS',
          title: '📊 Term Reports',
          description: 'Attendance & fee reports',
        },
      ],
    });
  }

  // Quick stats section - always visible
  sections.push({
    title: '📈 Quick Actions',
    rows: [
      {
        id: 'ADMIN_TODAY_REPORT',
        title: '📈 Today\'s Report',
        description: 'Quick daily overview',
      },
      {
        id: 'ADMIN_HELP',
        title: '❓ Help',
        description: 'How to use admin features',
      },
    ],
  });

  return sections;
}

// ─── Show admin help ───────────────────────────────────────────────────────
export async function showAdminHelp(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `❓ *Admin Bot Guide*\n\n` +
    `📌 *Navigation:*\n` +
    `• Type *0* or *back* → Admin menu\n` +
    `• Type *menu* → Admin menu\n\n` +
    `📌 *Attendance:*\n` +
    `• Select class → Mark students\n` +
    `• ✅ Present  ❌ Absent\n` +
    `• ⏰ Late     📋 Excused\n` +
    `• Parents notified automatically\n\n` +
    `📌 *Fees:*\n` +
    `• Search student by name or adm no\n` +
    `• View outstanding invoices\n` +
    `• Record cash or bank payments\n` +
    `• View collection reports\n\n` +
    `📌 *Staff:*\n` +
    `• Add teacher → they get invite code\n` +
    `• Teacher sends code to this bot\n` +
    `• They get instant bot access\n\n` +
    `📌 *Broadcast:*\n` +
    `• Send to all parents\n` +
    `• Send to specific class\n` +
    `• Send to fee defaulters\n\n` +
    `📌 *Bulk Upload:*\n` +
    `• Download CSV template\n` +
    `• Fill in student details\n` +
    `• Send CSV file to this chat\n` +
    `• Students imported automatically`
  );
}

// ─── Show today's quick report ─────────────────────────────────────────────
export async function showTodayReport(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const { ReportService } = await import('../../report.service.ts');
  const reportSvc = new ReportService();

  // Get today's attendance stats
  const attStats = await reportSvc.getTodayStats(session.school_id);

  // Get fee stats
  const feeStats = await reportSvc.getFeeStats(session.school_id);

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  await wa.buttons(
    phone,
    `📈 *Today's Report*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📅 ${today}\n\n` +
    `✅ *Attendance:*\n` +
    `${attStats.rateIcon} Rate: *${attStats.rate}%*\n` +
    `Present: *${attStats.present}*\n` +
    `Absent:  *${attStats.absent}*\n` +
    `Late:    *${attStats.late}*\n` +
    `Total:   *${attStats.total}*\n\n` +
    `💰 *Fee Collection:*\n` +
    `${feeStats.rateIcon} Rate: *${feeStats.collectionRate}%*\n` +
    `Collected:   *${feeStats.totalCollectedFmt}*\n` +
    `Outstanding: *${feeStats.totalOutstandingFmt}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'ADMIN_ATTENDANCE', title: '✅ Attendance' },
      { id: 'ADMIN_FEES', title: '💰 Fees' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Show fee stats ────────────────────────────────────────────────────────
export async function showFeeStats(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const stats = await adminSvc.getFeeStats(session.school_id);

  const rateIcon =
    stats.collectionRate >= 80
      ? '🟢'
      : stats.collectionRate >= 60
      ? '🟡'
      : '🔴';

  await wa.buttons(
    phone,
    `📊 *Fee Collection Summary*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `💵 Total Billed:\n` +
    `   *${adminSvc.currency(stats.totalBilled)}*\n\n` +
    `✅ Total Collected:\n` +
    `   *${adminSvc.currency(stats.totalCollected)}*\n\n` +
    `⚠️ Outstanding:\n` +
    `   *${adminSvc.currency(stats.totalOutstanding)}*\n\n` +
    `${rateIcon} Collection Rate: *${stats.collectionRate}%*\n\n` +
    `📋 Total Invoices: *${stats.total}*\n` +
    `✅ Fully Paid:     *${stats.paidCount}*\n` +
    `⏳ Pending:        *${stats.pendingCount}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'ADMIN_FEES', title: '💰 Manage Fees' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Show settings ─────────────────────────────────────────────────────────
export async function showSettings(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const settings = await adminSvc.getAttendanceSettings(
    session.school_id
  );

  await wa.buttons(
    phone,
    `⚙️ *Bot Settings*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📢 *Attendance Notifications:*\n` +
    `Absent Alert:  ${settings.notify_absent ? '✅ ON' : '❌ OFF'}\n` +
    `Late Alert:    ${settings.notify_late ? '✅ ON' : '❌ OFF'}\n` +
    `Present Alert: ${settings.notify_present ? '✅ ON' : '❌ OFF'}\n\n` +
    `⏰ *Auto-close Session:* ${settings.auto_close_hour}:00\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_To change settings, contact\n` +
    `your system administrator_`,
    [
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

// Get school name from DB if not in session
async function getSchoolName(schoolId: string): Promise<string> {
  const db = (await import('../../supabase.ts')).getSupabase();
  const { data } = await db
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();
  return data?.name ?? 'School';
}

// Format role name for display
function formatRole(role: string): string {
  const roleLabels: Record<string, string> = {
    admin:          'Administrator',
    teacher:        'Teacher',
    super_admin:    'Super Admin',
    principal:      'Principal',
    bursar:         'Bursar',
    head_teacher:   'Head Teacher',
    class_teacher:  'Class Teacher',
    subject_teacher:'Subject Teacher',
  };

  return roleLabels[role.toLowerCase()] ?? role;
}

// Time based greeting
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Hello';
}
