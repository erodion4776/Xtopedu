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
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[AttendanceNotify] error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500 }
    );
  }
});

// ─── Process notification ──────────────────────────────────────
async function notify(att: {
  id: string;
  student_id: string;
  school_id: string;
  status: string;
  attendance_date: string;
  arrival_time?: string;
  remarks?: string;
}): Promise<void> {

  // ── Get attendance settings ──────────────────────────────────
  const { data: settings } = await db
    .from('attendance_settings')
    .select('notify_absent, notify_late, notify_present')
    .eq('school_id', att.school_id)
    .single();

  // Check school-level settings first
  const schoolAllows =
    (att.status === 'absent'  && settings?.notify_absent  !== false) ||
    (att.status === 'late'    && settings?.notify_late    !== false) ||
    (att.status === 'present' && settings?.notify_present === true)  ||
    (att.status === 'excused');

  if (!schoolAllows) {
    console.log(
      `[AttNotify] School settings block ${att.status} alerts`
    );
    return;
  }

  // ── Get parents who can receive attendance ───────────────────
  const { data: studentParents } = await db
    .from('student_parents')
    .select(`
      can_receive_attendance,
      parents (
        id,
        full_name,
        phone,
        whatsapp_number
      ),
      students (
        first_name,
        last_name,
        classes ( name ),
        class_arms ( name )
      )
    `)
    .eq('student_id', att.student_id)
    .eq('can_receive_attendance', true);

  if (!studentParents?.length) {
    console.log('[AttNotify] No eligible parents found');
    return;
  }

  // ── Get school WhatsApp account ──────────────────────────────
  const { data: waAccount } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token, status')
    .eq('school_id', att.school_id)
    .eq('status', 'active')
    .single();

  const wa = new WhatsApp(waAccount);

  // ── Get student info ─────────────────────────────────────────
  const firstSp = studentParents[0] as Record<string, unknown>;
  const student = firstSp.students as Record<string, unknown> | null;
  const studentName = `${student?.first_name} ${student?.last_name}`;
  const className = (
    student?.classes as Record<string, string> | null
  )?.name ?? '';
  const armName = (
    student?.class_arms as Record<string, string> | null
  )?.name ?? '';

  const dateFormatted = new Date(att.attendance_date)
    .toLocaleDateString('en-NG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const message = buildMessage(
    att.status,
    studentName,
    `${className} ${armName}`.trim(),
    dateFormatted,
    att.arrival_time,
    att.remarks
  );

  // ── Send to each eligible parent ─────────────────────────────
  for (const sp of studentParents as Record<string, unknown>[]) {
    const parent = sp.parents as Record<string, string> | null;
    if (!parent) continue;

    const parentPhone = parent.whatsapp_number ?? parent.phone;
    if (!parentPhone) continue;

    // ── CHECK SUBSCRIPTION PLAN ──────────────────────────────────
    // This is the key check that saves you Meta costs!
    const { data: subscription } = await db
      .from('parent_subscriptions')
      .select('plan_slug, status, expires_at')
      .eq('parent_id', parent.id)
      .eq('school_id', att.school_id)
      .single();

    const planSlug = subscription?.plan_slug ?? 'basic';
    const subStatus = subscription?.status ?? 'active';

    // Check if subscription is expired
    const isExpired = subscription?.expires_at
      ? new Date(subscription.expires_at) < new Date()
      : false;

    // Basic plan or expired = NO automatic alerts
    if (planSlug === 'basic' || subStatus !== 'active' || isExpired) {
      console.log(
        `[AttNotify] Skipping ${parentPhone} - ` +
        `Plan: ${planSlug}, Status: ${subStatus}, ` +
        `Expired: ${isExpired}`
      );

      // Track that we skipped (for analytics)
      await db.from('messaging_usage').insert({
        school_id: att.school_id,
        parent_id: parent.id,
        message_type: `attendance_${att.status}_skipped`,
        meta_charged: false,
        cost_naira: 0,
        created_at: new Date().toISOString(),
      }).catch(() => {}); // non critical

      continue; // Skip - saves your Meta money!
    }

    // ── CHECK WHAT THIS PLAN ALLOWS ──────────────────────────────
    const { data: plan } = await db
      .from('alert_plans')
      .select('features')
      .eq('slug', planSlug)
      .single();

    const features = plan?.features as
      Record<string, boolean> | null;

    // Check if this alert type is included in their plan
    const alertAllowed =
      (att.status === 'present' && features?.notify_present === true) ||
      (att.status === 'absent'  && features?.notify_absent  === true) ||
      (att.status === 'late'    && features?.notify_late    === true) ||
      (att.status === 'excused' && features?.notify_absent  === true);

    if (!alertAllowed) {
      console.log(
        `[AttNotify] Skipping ${parentPhone} - ` +
        `Plan ${planSlug} does not include ${att.status} alerts`
      );
      continue; // Skip - their plan doesn't cover this alert
    }

    // ── SEND THE ALERT ───────────────────────────────────────────
    try {
      await wa.text(parentPhone, message);

      // Track usage and cost
      await db.from('messaging_usage').insert({
        school_id: att.school_id,
        parent_id: parent.id,
        message_type: `attendance_${att.status}`,
        meta_charged: true,
        cost_naira: 64,
        created_at: new Date().toISOString(),
      }).catch(() => {}); // non critical

      // Log to notifications table
      const { data: notif } = await db
        .from('notifications')
        .insert({
          school_id: att.school_id,
          channel: 'whatsapp',
          type: 'attendance',
          recipient: parentPhone,
          title: `Attendance: ${studentName}`,
          message,
          status: 'sent',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      // Log attendance notification
      await db.from('attendance_notifications').insert({
        attendance_id: att.id,
        parent_id: parent.id,
        notification_id: notif?.id ?? null,
        channel: 'whatsapp',
        sent: true,
        sent_at: new Date().toISOString(),
      });

      console.log(
        `[AttNotify] ✅ Sent to ${parentPhone} (${planSlug} plan)`
      );

    } catch (err) {
      console.error(
        `[AttNotify] ❌ Failed for ${parentPhone}:`, err
      );

      // Log failed notification
      await db.from('notifications').insert({
        school_id: att.school_id,
        channel: 'whatsapp',
        type: 'attendance',
        recipient: parentPhone,
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

// ─── Build notification message ────────────────────────────────
function buildMessage(
  status: string,
  studentName: string,
  className: string,
  date: string,
  arrivalTime?: string,
  remarks?: string
): string {
  const messages: Record<string, string> = {
    present:
      `✅ *Attendance Update*\n\n` +
      `👤 *${studentName}* is marked\n` +
      `*Present* today.\n\n` +
      `🏫 Class: ${className}\n` +
      `📅 ${date}\n` +
      (arrivalTime ? `⏰ Arrival: ${arrivalTime}\n` : '') +
      `\n_Reply MENU to check attendance_`,

    absent:
      `❌ *Absence Alert*\n\n` +
      `⚠️ *${studentName}* is marked\n` +
      `*Absent* today.\n\n` +
      `🏫 Class: ${className}\n` +
      `📅 ${date}\n` +
      (remarks ? `📝 Note: ${remarks}\n` : '') +
      `\nIf this is wrong, contact\n` +
      `the school immediately.\n\n` +
      `_Reply MENU to view attendance_`,

    late:
      `⏰ *Late Arrival Alert*\n\n` +
      `*${studentName}* arrived *late*\n` +
      `today.\n\n` +
      `🏫 Class: ${className}\n` +
      `📅 ${date}\n` +
      (arrivalTime ? `⏰ Arrived: ${arrivalTime}\n` : '') +
      (remarks ? `📝 Note: ${remarks}\n` : '') +
      `\n_Reply MENU to view attendance_`,

    excused:
      `📋 *Excused Absence*\n\n` +
      `*${studentName}* has an\n` +
      `excused absence today.\n\n` +
      `🏫 Class: ${className}\n` +
      `📅 ${date}\n` +
      (remarks ? `📝 Reason: ${remarks}\n` : ''),
  };

  return (
    messages[status] ??
    `📌 Attendance update for *${studentName}*:\n` +
    `${status} on ${date}`
  );
}
