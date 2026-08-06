// ============================================================
// SCHOOLBOT - ATTENDANCE NOTIFY
// supabase/functions/attendance-notify/index.ts
// ============================================================

import { WhatsApp } from '../_shared/whatsapp.ts';
import { getSupabase } from '../_shared/supabase.ts';

const db = getSupabase();

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const att = await req.json();
    await notify(att);
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[AttendanceNotify] error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});

async function notify(att: {
  id: string;
  student_id: string;
  school_id: string;
  status: string;
  attendance_date: string;
  arrival_time?: string;
  remarks?: string;
}): Promise<void> {
  // Check notification settings
  const { data: settings } = await db
    .from('attendance_settings')
    .select('notify_absent, notify_late, notify_present')
    .eq('school_id', att.school_id)
    .single();

  const shouldNotify =
    (att.status === 'absent' && settings?.notify_absent !== false) ||
    (att.status === 'late' && settings?.notify_late !== false) ||
    (att.status === 'present' && settings?.notify_present === true) ||
    att.status === 'excused';

  if (!shouldNotify) return;

  // Get parents who can receive attendance
  const { data: sps } = await db
    .from('student_parents')
    .select(`
      can_receive_attendance,
      parents ( id, full_name, phone, whatsapp_number ),
      students (
        first_name, last_name,
        classes ( name ), class_arms ( name )
      )
    `)
    .eq('student_id', att.student_id)
    .eq('can_receive_attendance', true);

  if (!sps?.length) return;

  // Get school WA account
  const { data: waAccount } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token, status')
    .eq('school_id', att.school_id)
    .eq('status', 'active')
    .single();

  const wa = new WhatsApp(waAccount);

  const firstSp = sps[0] as Record<string, unknown>;
  const student = firstSp.students as Record<string, unknown> | null;
  const studentName = `${student?.first_name} ${student?.last_name}`;
  const className = (student?.classes as Record<string, string> | null)?.name ?? '';
  const armName = (student?.class_arms as Record<string, string> | null)?.name ?? '';

  const dateStr = new Date(att.attendance_date).toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const message = buildMessage(
    att.status, studentName,
    `${className} ${armName}`.trim(),
    dateStr, att.arrival_time, att.remarks
  );

  for (const sp of sps as Record<string, unknown>[]) {
    const parent = sp.parents as Record<string, string> | null;
    if (!parent) continue;

    const phone = parent.whatsapp_number ?? parent.phone;
    if (!phone) continue;

    try {
      await wa.text(phone, message);

      const { data: notif } = await db.from('notifications').insert({
        school_id: att.school_id,
        channel: 'whatsapp',
        type: 'attendance',
        recipient: phone,
        title: `Attendance: ${studentName}`,
        message,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }).select('id').single();

      await db.from('attendance_notifications').insert({
        attendance_id: att.id,
        parent_id: parent.id,
        notification_id: notif?.id ?? null,
        channel: 'whatsapp',
        sent: true,
        sent_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`[AttNotify] Failed for ${phone}:`, err);
      await db.from('notifications').insert({
        school_id: att.school_id,
        channel: 'whatsapp',
        type: 'attendance',
        recipient: phone,
        title: `Attendance: ${studentName}`,
        message,
        status: 'failed',
        error_message: String(err),
        attempts: 1,
        created_at: new Date().toISOString(),
      });
    }
  }
}

function buildMessage(
  status: string, name: string, cls: string,
  date: string, arrival?: string, remarks?: string
): string {
  const msgs: Record<string, string> = {
    present:
      `✅ *Attendance Update*\n\n` +
      `👤 *${name}* is marked *Present* today.\n` +
      `🏫 Class: ${cls}\n📅 ${date}\n` +
      (arrival ? `⏰ Arrival: ${arrival}\n` : '') +
      `\n_Reply MENU to check attendance_`,

    absent:
      `❌ *Absence Alert*\n\n` +
      `⚠️ *${name}* is marked *Absent* today.\n` +
      `🏫 Class: ${cls}\n📅 ${date}\n` +
      (remarks ? `📝 Note: ${remarks}\n` : '') +
      `\nIf wrong, contact school immediately.\n` +
      `_Reply MENU to view attendance_`,

    late:
      `⏰ *Late Arrival*\n\n` +
      `*${name}* arrived *late* today.\n` +
      `🏫 Class: ${cls}\n📅 ${date}\n` +
      (arrival ? `⏰ Arrived: ${arrival}\n` : '') +
      (remarks ? `📝 ${remarks}\n` : '') +
      `\n_Reply MENU to view attendance_`,

    excused:
      `📋 *Excused Absence*\n\n` +
      `*${name}* has an excused absence.\n` +
      `🏫 Class: ${cls}\n📅 ${date}\n` +
      (remarks ? `📝 Reason: ${remarks}\n` : ''),
  };

  return msgs[status] ?? `📌 Attendance for *${name}*: ${status} on ${date}`;
}
