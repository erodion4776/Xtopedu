// ============================================================
// SCHOOLBOT - PARENT ATTENDANCE FLOW
// supabase/functions/_shared/bot/attendance.ts
// ============================================================

import { WhatsApp } from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { AttendanceService } from '../services/attendance.service.ts';
import { showMainMenu } from './menu.ts';
import type { BotSession, Student } from '../types.ts';

const sessions = new SessionService();
const attSvc = new AttendanceService();

// ─── Start attendance flow ─────────────────────────────────────────────────
// Called when parent selects Attendance from main menu
export async function startAttendance(
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

  // Only one child - skip selector and go straight to options
  if (students.length === 1) {
    await showAttendanceOptions(phone, session, students[0], wa);
    return;
  }

  // Multiple children - show selector
  await wa.list(
    phone,
    `✅ Attendance`,
    `You have *${students.length}* children registered.\n\n` +
    `Select a child to check attendance:`,
    `Tap a name to continue`,
    `👦 Choose Child`,
    [
      {
        title: 'Your Children',
        rows: students.map((s) => ({
          id: `ATT_STUDENT_${s.id}`,
          title: s.first_name,
          description:
            `${s.class_name} ${s.arm_name}`.trim() ||
            s.admission_number,
        })),
      },
    ]
  );

  await sessions.setState(phone, 'ATTENDANCE_SELECT_STUDENT');
}

// ─── Handle student selection ──────────────────────────────────────────────
export async function handleStudentSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Input should be ATT_STUDENT_{studentId}
  if (!input.startsWith('att_student_')) {
    await startAttendance(phone, session, wa);
    return;
  }

  const studentId = input.replace('att_student_', '');
  const student = session.students?.find((s) => s.id === studentId);

  if (!student) {
    await showMainMenu(phone, session, wa);
    return;
  }

  await showAttendanceOptions(phone, session, student, wa);
}

// ─── Show attendance options for a student ────────────────────────────────
async function showAttendanceOptions(
  phone: string,
  session: BotSession,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `✅ *Attendance*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `📋 Adm: ${student.admission_number}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `What would you like to see?`,
    [
      { id: 'ATT_TODAY', title: '📅 Today' },
      { id: 'ATT_SUMMARY', title: '📊 Term Summary' },
      { id: 'ATT_RECENT', title: '🗓️ Last 7 Days' },
    ],
    'Attendance Options'
  );

  // Save selected student to session
  await sessions.setState(
    phone,
    'ATTENDANCE_OPTIONS',
    null,
    { selectedStudentId: student.id }
  );
}

// ─── Handle attendance option selection ───────────────────────────────────
export async function handleAttendanceOption(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Get selected student from session
  const student = session.students?.find(
    (s) => s.id === session.selected_student_id
  );

  if (!student) {
    // Student not found - restart flow
    await startAttendance(phone, session, wa);
    return;
  }

  switch (input) {
    case 'att_today':
      await showTodayAttendance(phone, student, wa);
      break;

    case 'att_summary':
      await showTermSummary(phone, student, session, wa);
      break;

    case 'att_recent':
      await showRecentAttendance(phone, student, wa);
      break;

    case 'main_menu':
      await showMainMenu(phone, session, wa);
      break;

    default:
      // Unknown input - show options again
      await showAttendanceOptions(phone, session, student, wa);
  }
}

// ─── Show today's attendance ───────────────────────────────────────────────
async function showTodayAttendance(
  phone: string,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  // Get today's record
  const record = await attSvc.getToday(student.id);

  // Format today's date nicely
  const todayFormatted = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let message: string;

  if (!record) {
    // No record found for today
    message =
      `📅 *Today's Attendance*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${student.full_name}*\n` +
      `🏫 ${student.class_name} ${student.arm_name}\n` +
      `📆 ${todayFormatted}\n\n` +
      `⚠️ *No attendance record found*\n\n` +
      `Possible reasons:\n` +
      `• Attendance not taken yet today\n` +
      `• Today is a holiday or weekend\n` +
      `• Student was not in school\n\n` +
      `Check back later or contact\n` +
      `the school for more info.`;
  } else {
    // Record found - show details
    message =
      `📅 *Today's Attendance*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${student.full_name}*\n` +
      `🏫 ${student.class_name} ${student.arm_name}\n` +
      `📆 ${todayFormatted}\n\n` +
      `📌 *Status:* ${attSvc.emoji(record.status)}\n` +
      // Show arrival time if available
      (record.arrival_time
        ? `⏰ *Arrival:* ${attSvc.formatTime(record.arrival_time)}\n`
        : '') +
      // Show departure time if available
      (record.departure_time
        ? `🚪 *Departure:* ${attSvc.formatTime(record.departure_time)}\n`
        : '') +
      // Show remarks if available
      (record.remarks
        ? `📝 *Note:* ${record.remarks}\n`
        : '') +
      `━━━━━━━━━━━━━━━━`;
  }

  await wa.buttons(
    phone,
    message,
    [
      { id: 'ATT_SUMMARY', title: '📊 Term Summary' },
      { id: 'ATT_RECENT', title: '🗓️ Last 7 Days' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}

// ─── Show term attendance summary ──────────────────────────────────────────
async function showTermSummary(
  phone: string,
  student: Student,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const summary = await attSvc.getTermSummary(
    student.id,
    student.school_id
  );

  // Calculate attendance rate
  const rate =
    summary.total > 0
      ? Math.round(
          ((summary.present + summary.late) / summary.total) * 100
        )
      : 0;

  // Color indicator based on rate
  const rateIcon =
    rate >= 90 ? '🟢' : rate >= 75 ? '🟡' : '🔴';

  // Build recent attendance preview
  const recentLines = summary.recent
    .map((r) => {
      return (
        `${attSvc.icon(r.status)} *${attSvc.formatDate(r.attendance_date)}*`
      );
    })
    .join('\n');

  const message =
    `📊 *Term Attendance Summary*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `📚 *Term:* ${summary.termName}\n\n` +
    `${rateIcon} *Attendance Rate: ${rate}%*\n\n` +
    `✅ Present:  *${summary.present}* days\n` +
    `❌ Absent:   *${summary.absent}* days\n` +
    `⏰ Late:     *${summary.late}* days\n` +
    `📋 Excused:  *${summary.excused}* days\n` +
    `📅 Total:    *${summary.total}* days\n` +
    `━━━━━━━━━━━━━━━━\n` +
    (recentLines
      ? `\n*Recent Records:*\n${recentLines}`
      : '');

  await wa.buttons(
    phone,
    message,
    [
      { id: 'ATT_TODAY', title: '📅 Today' },
      { id: 'ATT_RECENT', title: '🗓️ Last 7 Days' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}

// ─── Show last 7 days attendance ───────────────────────────────────────────
async function showRecentAttendance(
  phone: string,
  student: Student,
  wa: WhatsApp
): Promise<void> {
  const records = await attSvc.getRecentDays(student.id, 7);

  let lines: string;

  if (!records.length) {
    lines = '_No attendance records found\nfor the last 7 days_';
  } else {
    lines = records
      .map((r) => {
        const dateStr = attSvc.formatDate(r.attendance_date);
        const timeStr = r.arrival_time
          ? ` — ${attSvc.formatTime(r.arrival_time)}`
          : '';
        return (
          `${attSvc.icon(r.status)} *${dateStr}*` +
          `${timeStr}`
        );
      })
      .join('\n');
  }

  await wa.buttons(
    phone,
    `🗓️ *Last 7 Days Attendance*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n\n` +
    `${lines}`,
    [
      { id: 'ATT_TODAY', title: '📅 Today' },
      { id: 'ATT_SUMMARY', title: '📊 Term Summary' },
      { id: 'MAIN_MENU', title: '🏠 Main Menu' },
    ]
  );
}
