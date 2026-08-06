// ============================================================
// SCHOOLBOT - PARENT PICKUP FLOW
// supabase/functions/_shared/bot/pickup.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { getSupabase } from '../supabase.ts';
import { showMainMenu } from './menu.ts';
import type { BotSession, Student } from '../types.ts';

const sessions = new SessionService();
const db = getSupabase();

// ─── Start pickup flow ─────────────────────────────────────────────────────
// Called when parent selects Pickup from main menu
export async function startPickup(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const students = session.students ?? [];

  // No students linked
  if (!students.length) {
    await wa.text(
      phone,
      `❌ *No students found*\n\n` +
      `No students are linked to your account.\n\n` +
      `Contact your school admin to link\n` +
      `your children to this number.`
    );
    return;
  }

  // Only one child - go straight to pickup info
  if (students.length === 1) {
    await showPickupInfo(phone, students[0], session, wa);
    return;
  }

  // Multiple children - show selector
  await wa.list(
    phone,
    `🚗 Pickup Info`,
    `You have *${students.length}* children registered.\n\n` +
    `Select a child to view pickup contacts:`,
    `Tap a name to continue`,
    `👦 Choose Child`,
    [
      {
        title: 'Your Children',
        rows: students.map((s) => ({
          id: `PICKUP_STUDENT_${s.id}`,
          title: s.first_name,
          description:
            `${s.class_name} ${s.arm_name}`.trim() ||
            s.admission_number,
        })),
      },
    ]
  );

  await sessions.setState(phone, 'PICKUP_SELECT_STUDENT');
}

// ─── Handle student selection ──────────────────────────────────────────────
export async function handleStudentSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('pickup_student_')) {
    await startPickup(phone, session, wa);
    return;
  }

  const studentId = input.replace('pickup_student_', '');
  const student = session.students?.find((s) => s.id === studentId);

  if (!student) {
    await showMainMenu(phone, session, wa);
    return;
  }

  await showPickupInfo(phone, student, session, wa);
}

// ─── Show pickup contacts and logs ────────────────────────────────────────
async function showPickupInfo(
  phone: string,
  student: Student,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get authorized pickup contacts for this student
  const { data: contacts } = await db
    .from('pick_up_contacts')
    .select(
      'id, full_name, relationship, phone, is_active'
    )
    .eq('student_id', student.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  // Get last 3 pickup logs
  const { data: logs } = await db
    .from('pick_up_logs')
    .select(`
      id,
      picked_up_by,
      pickup_time,
      notes,
      pick_up_contacts (
        full_name,
        relationship
      )
    `)
    .eq('student_id', student.id)
    .order('pickup_time', { ascending: false })
    .limit(3);

  // ── Build contacts section ───────────────────────────────────────────
  let contactsText: string;

  if (!contacts?.length) {
    contactsText =
      `_No authorized pickup contacts found._\n` +
      `Contact your school admin to add\n` +
      `authorized pickup contacts.`;
  } else {
    contactsText = contacts
      .map((c, index) =>
        `${index + 1}. *${c.full_name}*\n` +
        `   👥 ${c.relationship ?? 'Authorized'}\n` +
        `   📱 ${c.phone ?? 'No phone on record'}`
      )
      .join('\n\n');
  }

  // ── Build recent pickups section ─────────────────────────────────────
  let logsText: string;

  if (!logs?.length) {
    logsText = `_No recent pickup records found_`;
  } else {
    logsText = logs
      .map((log) => {
        const contact = log.pick_up_contacts as Record<
          string,
          string
        > | null;

        // Format pickup time
        const pickupTime = new Date(
          log.pickup_time
        ).toLocaleString('en-NG', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Use contact name or picked_up_by field
        const pickedByName =
          contact?.full_name ??
          log.picked_up_by ??
          'Unknown';

        return (
          `• *${pickupTime}*\n` +
          `  👤 ${pickedByName}` +
          (contact?.relationship
            ? ` (${contact.relationship})`
            : '') +
          (log.notes ? `\n  📝 ${log.notes}` : '')
        );
      })
      .join('\n\n');
  }

  // ── Send combined message ─────────────────────────────────────────────
  await wa.buttons(
    phone,
    `🚗 *Pickup Information*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `✅ *Authorized Contacts:*\n\n` +
    `${contactsText}\n\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📋 *Recent Pickups:*\n\n` +
    `${logsText}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `_To add or remove contacts,\n` +
    `contact your school admin._`,
    [
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );

  await sessions.setState(phone, 'PICKUP_VIEW');
}

// ─── Show pickup notification message ─────────────────────────────────────
// Called by notification service when child is picked up
export function buildPickupNotification(
  studentName: string,
  className: string,
  pickedUpBy: string,
  relationship: string | null,
  pickupTime: Date,
  schoolName: string
): string {
  const timeStr = pickupTime.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const dateStr = pickupTime.toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    `🚗 *Pickup Notification*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `✅ *${studentName}* has been\n` +
    `picked up from school.\n\n` +
    `👤 *Picked up by:* ${pickedUpBy}\n` +
    (relationship
      ? `👥 *Relationship:* ${relationship}\n`
      : '') +
    `⏰ *Time:* ${timeStr}\n` +
    `📅 *Date:* ${dateStr}\n\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `⚠️ *If you did not authorize this\n` +
    `pickup, contact the school\n` +
    `immediately!*\n\n` +
    `📞 *${schoolName}*\n` +
    `_Powered by SchoolBot_`
  );
}
