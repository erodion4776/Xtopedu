// ============================================================
// SCHOOLBOT - PARENT MAIN MENU
// supabase/functions/_shared/bot/menu.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import type { BotSession } from '../types.ts';

const sessions = new SessionService();

// ─── Show main menu to parent ──────────────────────────────────────────────
export async function showMainMenu(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get parent first name for greeting
  const firstName =
    session.parent?.full_name?.split(' ')[0] ?? 'Parent';

  // Get school name
  const schoolName =
    session.parent?.schools?.name ?? 'Your School';

  // Get children count
  const childrenCount = session.students?.length ?? 0;

  // Time based greeting
  const greet = getGreeting();

  await wa.list(
    phone,
    // Header
    `🏫 ${schoolName}`,
    // Body - personalized greeting
    `${greet} *${firstName}!* 👋\n\n` +
    (childrenCount > 0
      ? `You have *${childrenCount}* child${
          childrenCount > 1 ? 'ren' : ''
        } registered.\n\n`
      : '') +
    `How can I help you today?`,
    // Footer
    `Type *0* anytime to return here`,
    // Button label
    `📋 Open Menu`,
    // Sections
    [
      {
        title: '👨‍👩‍👧 My Children',
        rows: [
          {
            id: 'MENU_ATTENDANCE',
            title: '✅ Attendance',
            description: 'Check attendance records',
          },
          {
            id: 'MENU_FEES',
            title: '💰 School Fees',
            description: 'View & pay school fees',
          },
        ],
      },
      {
        title: '🔔 More Options',
        rows: [
          {
            id: 'MENU_PICKUP',
            title: '🚗 Pickup Contacts',
            description: 'View authorized pickups',
          },
          {
            id: 'MENU_PROFILE',
            title: '👤 My Profile',
            description: 'View your details',
          },
          {
            id: 'MENU_HELP',
            title: '❓ Help',
            description: 'How to use this bot',
          },
        ],
      },
    ]
  );

  // Update session state to MAIN_MENU
  await sessions.setState(phone, 'MAIN_MENU');
}

// ─── Show help message ─────────────────────────────────────────────────────
export async function showHelp(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `❓ *How to use SchoolBot*\n\n` +
    `📌 *Keywords:*\n` +
    `• Type *menu* or *hi* → Main menu\n` +
    `• Type *0* or *back* → Go back\n` +
    `• Type *fees* → Check school fees\n` +
    `• Type *attendance* → Check attendance\n\n` +
    `📌 *What you can do:*\n` +
    `✅ Check daily attendance\n` +
    `✅ View term attendance summary\n` +
    `💰 View outstanding school fees\n` +
    `💳 Pay school fees online\n` +
    `🧾 Receive payment receipts\n` +
    `🚗 View authorized pickup contacts\n` +
    `👤 View your profile & children\n\n` +
    `📌 *Need more help?*\n` +
    `Contact your school's admin office\n` +
    `directly for any issues.`
  );
}

// ─── Show unregistered message ─────────────────────────────────────────────
// Shown when phone number is not in the database
export async function showUnregistered(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `Sorry, your number *${phone}* is not\n` +
    `registered in our system.\n\n` +
    `📞 *Contact your school admin* to\n` +
    `register your WhatsApp number.\n\n` +
    `Tell them:\n` +
    `• Your full name\n` +
    `• Your child's name & admission number\n` +
    `• This number: *${phone}*\n\n` +
    `_Once registered, send *hi* to start._`
  );
}

// ─── Show new user options ─────────────────────────────────────────────────
// Shown when number is completely unknown
// Gives option to register as school or use invite code
export async function showNewUserOptions(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `👋 *Welcome to SchoolBot!*\n\n` +
    `Your number is not registered yet.\n\n` +
    `What would you like to do?`,
    [
      {
        id: 'START_SCHOOL_ONBOARDING',
        title: '🏫 Register School',
      },
      {
        id: 'ENTER_INVITE_CODE',
        title: '🔑 I Have a Code',
      },
    ],
    'Welcome!',
    'Register your school or join with invite code'
  );
}

// ─── Show invite code prompt ───────────────────────────────────────────────
export async function showInviteCodePrompt(
  phone: string,
  wa: WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `🔑 *Enter Invite Code*\n\n` +
    `Type your *8-character invite code*\n` +
    `sent to you by your school admin.\n\n` +
    `_Example: ABC12345_\n\n` +
    `Type *hi* to go back.`
  );
}

// ─── Show profile ──────────────────────────────────────────────────────────
export async function showProfile(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const parent = session.parent!;
  const school = parent.schools;
  const students = session.students ?? [];

  // Build children list
  const childrenList = students.length
    ? students
        .map(
          (s) =>
            `• *${s.full_name}*\n` +
            `  🏫 ${s.class_name} ${s.arm_name}`
        )
        .join('\n\n')
    : '_No children linked to your account_';

  await wa.buttons(
    phone,
    `👤 *My Profile*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *Name:* ${parent.full_name}\n` +
    `📱 *Phone:* ${parent.phone}\n` +
    `📧 *Email:* ${parent.email ?? 'Not set'}\n` +
    `🌐 *Language:* ${parent.preferred_language}\n` +
    `🏫 *School:* ${school?.name ?? 'N/A'}\n\n` +
    `👨‍👩‍👧 *My Children (${students.length}):*\n\n` +
    `${childrenList}`,
    [
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ],
    'Profile Details'
  );
}

// ─── Get time-based greeting ───────────────────────────────────────────────
export function getGreeting(): string {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) {
    return 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'Good evening';
  } else {
    return 'Hello';
  }
}
