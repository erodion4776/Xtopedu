// ============================================================
// SCHOOLBOT - ADMIN STAFF MANAGEMENT
// supabase/functions/_shared/bot/admin/admin.staff.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AdminService } from '../../services/admin.service.ts';
import { showAdminMenu } from './admin.menu.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();

// ─── Start staff management ────────────────────────────────────────────────
export async function startStaffMgmt(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await showStaffMenu(phone, session, 'view', wa);
}

// ─── Show staff menu ───────────────────────────────────────────────────────
export async function handleStaffMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'staff_add':
      await promptAddStaff(phone, session, wa);
      break;

    case 'staff_list':
      await showStaffList(phone, session, wa);
      break;

    case 'staff_remove':
      await showStaffForRemoval(phone, session, wa);
      break;

    // Resend invite
    default:
      if (input.startsWith('resend_invite_')) {
        const staffId = input.replace('resend_invite_', '');
        await resendInvite(phone, session, staffId, wa);
        return;
      }

      // Remove staff confirmation
      if (input.startsWith('remove_staff_')) {
        const staffId = input.replace('remove_staff_', '');
        await confirmRemoveStaff(phone, session, staffId, wa);
        return;
      }

      // Confirm removal
      if (input.startsWith('confirm_remove_')) {
        const staffId = input.replace('confirm_remove_', '');
        await removeStaff(phone, session, staffId, wa);
        return;
      }

      await showStaffMenu(phone, session, 'view', wa);
  }
}

// ─── Show main staff menu ──────────────────────────────────────────────────
async function showStaffMenu(
  phone: string,
  session: BotSession,
  _action: string,
  wa: WhatsApp
): Promise<void> {
  // Get staff count
  const staffList = await adminSvc.getStaff(session.school_id);
  const count = staffList.length;

  await wa.list(
    phone,
    `👨‍🏫 Staff Management`,
    `You have *${count}* active staff member${
      count !== 1 ? 's' : ''
    }.\n\n` +
    `What would you like to do?`,
    `Staff get WhatsApp bot access`,
    `👨‍🏫 Manage Staff`,
    [
      {
        title: 'Staff Actions',
        rows: [
          {
            id: 'staff_add',
            title: '➕ Add New Staff',
            description: 'Teacher, admin or support',
          },
          {
            id: 'staff_list',
            title: '📋 View All Staff',
            description: 'See staff & invite status',
          },
          {
            id: 'staff_remove',
            title: '🚫 Remove Staff',
            description: 'Deactivate a staff member',
          },
        ],
      },
      {
        title: 'Navigation',
        rows: [
          {
            id: 'main_menu',
            title: '🏠 Main Menu',
            description: 'Return to admin menu',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'ADMIN_STAFF_MENU');
}

// ─── Prompt to enter staff name ────────────────────────────────────────────
async function promptAddStaff(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👨‍🏫 *Add Staff Member*\n\n` +
    `Enter the staff member's *full name*:\n\n` +
    `_Example: Mr. Emeka Okafor_\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(phone, 'ADMIN_ADDING_STAFF_NAME');
}

// ─── Collect staff name ────────────────────────────────────────────────────
export async function handleAddStaffName(
  phone: string,
  session: BotSession,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  const name = rawText.trim();

  if (name.length < 3) {
    await wa.text(
      phone,
      `Please enter a valid full name:\n\n` +
      `_Example: Mrs. Chioma Obi_`
    );
    return;
  }

  // Save name to session data
  await sessions.setState(
    phone,
    'ADMIN_ADDING_STAFF_PHONE',
    null,
    { data: { pendingStaffName: name } }
  );

  await wa.text(
    phone,
    `👤 *${name}*\n\n` +
    `Enter their *WhatsApp phone number:*\n\n` +
    `_Example: 08012345678_\n\n` +
    `Type *0* to go back.`
  );
}

// ─── Collect staff phone ───────────────────────────────────────────────────
export async function handleAddStaffPhone(
  phone: string,
  session: BotSession,
  rawText: string,
  wa: WhatsApp
): Promise<void> {
  const cleaned = rawText.replace(/\D/g, '');

  if (cleaned.length < 10 || cleaned.length > 13) {
    await wa.text(
      phone,
      `❌ *Invalid phone number*\n\n` +
      `Please enter a valid Nigerian\n` +
      `phone number:\n\n` +
      `_Example: 08012345678_`
    );
    return;
  }

  // Format to international
  const formatted = cleaned.startsWith('0')
    ? '234' + cleaned.slice(1)
    : cleaned;

  // Check if this number already has access
  const db = (await import('../../supabase.ts')).getSupabase();
  const { data: existingSession } = await db
    .from('bot_sessions')
    .select('id, role')
    .eq('phone', formatted)
    .eq('school_id', session.school_id)
    .single();

  if (existingSession) {
    await wa.buttons(
      phone,
      `⚠️ *Number Already Registered*\n\n` +
      `This number already has bot access\n` +
      `for your school.\n\n` +
      `Role: *${existingSession.role}*`,
      [
        { id: 'staff_add', title: '➕ Add Different' },
        { id: 'staff_list', title: '📋 View Staff' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Save phone to session
  await sessions.setState(
    phone,
    'ADMIN_ADDING_STAFF_ROLE',
    null,
    {
      data: {
        ...session.data,
        pendingStaffPhone: formatted,
      },
    }
  );

  // Show role selector
  await wa.list(
    phone,
    `💼 Select Role`,
    `What is *${(session.data?.pendingStaffName as string) ?? 'this staff'}*'s role?`,
    `Select the most appropriate role`,
    `💼 Select Role`,
    [
      {
        title: 'Academic Staff',
        rows: [
          {
            id: 'ADMIN_ROLE_CLASS_TEACHER',
            title: '🏫 Class Teacher',
            description: 'Manages a specific class',
          },
          {
            id: 'ADMIN_ROLE_SUBJECT_TEACHER',
            title: '📖 Subject Teacher',
            description: 'Teaches specific subjects',
          },
          {
            id: 'ADMIN_ROLE_HEAD_TEACHER',
            title: '👑 Head Teacher',
            description: 'Head or Deputy Head',
          },
        ],
      },
      {
        title: 'Non-Academic Staff',
        rows: [
          {
            id: 'ADMIN_ROLE_ADMIN',
            title: '💼 Admin Staff',
            description: 'School administrator',
          },
          {
            id: 'ADMIN_ROLE_BURSAR',
            title: '💰 Bursar',
            description: 'Manages school finances',
          },
          {
            id: 'ADMIN_ROLE_SECURITY',
            title: '🔐 Security / Gate',
            description: 'Gate and security staff',
          },
        ],
      },
    ]
  );
}

// ─── Handle role selection ─────────────────────────────────────────────────
export async function handleAddStaffRole(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  const roleMap: Record<string, { label: string; role: string }> = {
    admin_role_class_teacher:   { label: 'Class Teacher',   role: 'teacher' },
    admin_role_subject_teacher: { label: 'Subject Teacher', role: 'teacher' },
    admin_role_head_teacher:    { label: 'Head Teacher',    role: 'admin' },
    admin_role_admin:           { label: 'Admin Staff',     role: 'admin' },
    admin_role_bursar:          { label: 'Bursar',          role: 'admin' },
    admin_role_security:        { label: 'Security',        role: 'teacher' },
  };

  const selected = roleMap[input.toLowerCase()];

  if (!selected) {
    await wa.text(
      phone,
      `Please select a role from the menu.`
    );
    return;
  }

  const staffName =
    (session.data?.pendingStaffName as string) ?? 'Staff';
  const staffPhone =
    (session.data?.pendingStaffPhone as string) ?? '';

  try {
    // Add staff and generate invite token
    const { staffId, token } = await adminSvc.addStaff({
      schoolId: session.school_id,
      firstName: staffName.split(' ')[0],
      lastName: staffName.split(' ').slice(1).join(' ') || 'Staff',
      phone: staffPhone,
      role: selected.role,
      invitedBy: session.school_user_id ?? session.school_id,
    });

    // Log action
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'add_staff',
      {
        staff_id: staffId,
        staff_name: staffName,
        role: selected.role,
      }
    );

    // Send invite to staff member's WhatsApp
    await sendStaffInviteMessage(
      staffPhone,
      staffName,
      session.school_id,
      token,
      selected.label,
      wa
    );

    // Confirm to admin
    await wa.buttons(
      phone,
      `✅ *Staff Added Successfully!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${staffName}*\n` +
      `📱 ${staffPhone}\n` +
      `💼 ${selected.label}\n` +
      `🔑 *Invite Code: ${token}*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `✅ Invite sent to their WhatsApp!\n\n` +
      `They must send the code *${token}*\n` +
      `to this bot to activate access.`,
      [
        { id: 'staff_add', title: '➕ Add More Staff' },
        { id: 'staff_list', title: '📋 View Staff' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );

    await sessions.setState(phone, 'ADMIN_STAFF_MENU');
  } catch (err) {
    console.error('[AdminStaff] add staff error:', err);
    await wa.text(
      phone,
      `❌ *Failed to add staff*\n\n` +
      `Please try again.\n\n` +
      `Error: ${err}`
    );
  }
}

// ─── Show staff list ───────────────────────────────────────────────────────
async function showStaffList(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const staffList = await adminSvc.getStaff(session.school_id);

  if (!staffList.length) {
    await wa.buttons(
      phone,
      `📋 *Staff List*\n\n` +
      `No staff members added yet.\n\n` +
      `Add your first staff member!`,
      [
        { id: 'staff_add', title: '➕ Add Staff' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Build staff list text
  const lines = (staffList as Record<string, unknown>[])
    .map((s) => {
      const inv = (
        s.staff_invitations as Array<{
          status: string;
          token: string;
        }> | null
      )?.[0];

      const statusIcon =
        inv?.status === 'accepted'
          ? '✅'
          : inv?.status === 'pending'
          ? '⏳'
          : '❓';

      const inviteInfo =
        inv?.status === 'pending'
          ? ` (Code: *${inv.token}*)`
          : inv?.status === 'accepted'
          ? ' (Active)'
          : ' (No invite)';

      return (
        `${statusIcon} *${s.first_name} ${s.last_name}*\n` +
        `   📱 ${s.phone ?? 'No phone'}\n` +
        `   🏢 ${s.department ?? 'No dept'}` +
        `${inviteInfo}`
      );
    })
    .join('\n\n');

  await wa.buttons(
    phone,
    `📋 *Staff Members (${staffList.length})*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `${lines}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ Active  ⏳ Invite Pending`,
    [
      { id: 'staff_add', title: '➕ Add Staff' },
      { id: 'staff_remove', title: '🚫 Remove' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Show staff list for removal ───────────────────────────────────────────
async function showStaffForRemoval(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const staffList = await adminSvc.getStaff(session.school_id);

  if (!staffList.length) {
    await wa.text(
      phone,
      `📋 No active staff to remove.`
    );
    return;
  }

  const rows = (staffList as Record<string, unknown>[]).map((s) => ({
    id: `remove_staff_${s.id}`,
    title: `${s.first_name} ${s.last_name}`.substring(0, 24),
    description: (s.department as string) ?? 'No department',
  }));

  await wa.list(
    phone,
    `🚫 Remove Staff`,
    `Select a staff member to deactivate:\n\n` +
    `⚠️ This will revoke their bot access.`,
    `This cannot be undone easily`,
    `🚫 Select Staff`,
    [{ title: 'Active Staff', rows }]
  );
}

// ─── Confirm staff removal ─────────────────────────────────────────────────
async function confirmRemoveStaff(
  phone: string,
  session: BotSession,
  staffId: string,
  wa: WhatsApp
): Promise<void> {
  const db = (await import('../../supabase.ts')).getSupabase();
  const { data: staff } = await db
    .from('staff')
    .select('first_name, last_name, department')
    .eq('id', staffId)
    .single();

  if (!staff) {
    await wa.text(phone, `❌ Staff member not found.`);
    return;
  }

  await wa.buttons(
    phone,
    `🚫 *Confirm Removal*\n\n` +
    `Are you sure you want to remove:\n\n` +
    `👤 *${staff.first_name} ${staff.last_name}*\n` +
    `🏢 ${staff.department ?? 'No department'}\n\n` +
    `⚠️ This will:\n` +
    `• Deactivate their account\n` +
    `• Revoke their bot access\n` +
    `• Expire their invite code`,
    [
      { id: `confirm_remove_${staffId}`, title: '✅ Yes, Remove' },
      { id: 'staff_list', title: '❌ Cancel' },
    ]
  );
}

// ─── Remove staff member ───────────────────────────────────────────────────
async function removeStaff(
  phone: string,
  session: BotSession,
  staffId: string,
  wa: WhatsApp
): Promise<void> {
  try {
    const db = (await import('../../supabase.ts')).getSupabase();

    // Get staff name before removing
    const { data: staff } = await db
      .from('staff')
      .select('first_name, last_name')
      .eq('id', staffId)
      .single();

    if (!staff) {
      await wa.text(phone, `❌ Staff member not found.`);
      return;
    }

    // Deactivate staff
    await adminSvc.deactivateStaff(staffId);

    // Log action
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'remove_staff',
      { staff_id: staffId, staff_name: `${staff.first_name} ${staff.last_name}` }
    );

    await wa.buttons(
      phone,
      `✅ *Staff Removed*\n\n` +
      `*${staff.first_name} ${staff.last_name}* has been\n` +
      `deactivated and their bot access\n` +
      `has been revoked.`,
      [
        { id: 'staff_list', title: '📋 View Staff' },
        { id: 'staff_add', title: '➕ Add Staff' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
  } catch (err) {
    console.error('[AdminStaff] removeStaff error:', err);
    await wa.text(
      phone,
      `❌ Failed to remove staff. Please try again.`
    );
  }
}

// ─── Resend staff invite ───────────────────────────────────────────────────
async function resendInvite(
  phone: string,
  session: BotSession,
  staffId: string,
  wa: WhatsApp
): Promise<void> {
  const db = (await import('../../supabase.ts')).getSupabase();

  const { data: staff } = await db
    .from('staff')
    .select(`
      first_name,
      last_name,
      phone,
      whatsapp_number,
      staff_invitations (
        id,
        token,
        status,
        role
      )
    `)
    .eq('id', staffId)
    .single();

  if (!staff) {
    await wa.text(phone, `❌ Staff member not found.`);
    return;
  }

  const staffPhone =
    staff.whatsapp_number ?? staff.phone;

  if (!staffPhone) {
    await wa.text(
      phone,
      `❌ No phone number found for this staff member.`
    );
    return;
  }

  // Get existing invitation
  const invitations = staff.staff_invitations as Array<{
    id: string;
    token: string;
    status: string;
    role: string;
  }> | null;

  const inv = invitations?.[0];

  if (!inv) {
    // Create new invitation
    const token = adminSvc.generateToken();

    await db.from('staff_invitations').insert({
      school_id: session.school_id,
      staff_id: staffId,
      phone: staffPhone,
      token,
      role: 'teacher',
      status: 'pending',
      expires_at: new Date(
        Date.now() + 48 * 60 * 60 * 1000
      ).toISOString(),
      created_at: new Date().toISOString(),
    });

    await sendStaffInviteMessage(
      staffPhone,
      `${staff.first_name} ${staff.last_name}`,
      session.school_id,
      token,
      'Staff',
      wa
    );

    await wa.text(
      phone,
      `✅ New invite sent to\n` +
      `*${staff.first_name} ${staff.last_name}*`
    );
    return;
  }

  // Extend existing invite expiry
  await db
    .from('staff_invitations')
    .update({
      expires_at: new Date(
        Date.now() + 48 * 60 * 60 * 1000
      ).toISOString(),
      status: 'pending',
    })
    .eq('id', inv.id);

  // Resend invite message
  await sendStaffInviteMessage(
    staffPhone,
    `${staff.first_name} ${staff.last_name}`,
    session.school_id,
    inv.token,
    'Staff',
    wa
  );

  await wa.text(
    phone,
    `✅ Invite resent to\n` +
    `*${staff.first_name} ${staff.last_name}*\n\n` +
    `Code: *${inv.token}*`
  );
}

// ─── Send invite message to staff WhatsApp ─────────────────────────────────
async function sendStaffInviteMessage(
  staffPhone: string,
  staffName: string,
  schoolId: string,
  token: string,
  roleLabel: string,
  wa: WhatsApp
): Promise<void> {
  const db = (await import('../../supabase.ts')).getSupabase();

  const { data: school } = await db
    .from('schools')
    .select('name')
    .eq('id', schoolId)
    .single();

  const firstName = staffName.split(' ')[0];
  const botNumber =
    Deno.env.get('WHATSAPP_DISPLAY_NUMBER') ?? 'our bot';

  // Use a fresh WhatsApp instance
  // (not the school-specific one since staff may be on different number)
  const inviteWa = new WhatsApp();

  await inviteWa.text(
    staffPhone,
    `🎉 *You've been invited to SchoolBot!*\n\n` +
    `Hi *${firstName}!* 👋\n\n` +
    `*${school?.name ?? 'Your school'}* has added\n` +
    `you as a *${roleLabel}* on SchoolBot.\n\n` +
    `To activate your bot access:\n\n` +
    `1️⃣ Send this code to *${botNumber}*:\n\n` +
    `🔑 *${token}*\n\n` +
    `2️⃣ Follow the setup steps\n\n` +
    `*What you can do:*\n` +
    `✅ Mark student attendance\n` +
    `📊 View class reports\n` +
    `📢 Receive school notifications\n` +
    `👨‍🏫 Manage your class\n\n` +
    `⏰ This code expires in *48 hours*\n\n` +
    `_Need help? Contact your school admin_`
  );
}
