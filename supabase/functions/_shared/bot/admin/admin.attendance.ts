// ============================================================
// SCHOOLBOT - ADMIN ATTENDANCE FLOW
// supabase/functions/_shared/bot/admin/admin.attendance.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { AttendanceService } from '../../services/attendance.service.ts';
import { AdminService } from '../../services/admin.service.ts';
import { showAdminMenu } from './admin.menu.ts';
import type { BotSession, Student } from '../../types.ts';

const sessions = new SessionService();
const attSvc = new AttendanceService();
const adminSvc = new AdminService();

// ─── Start admin attendance flow ───────────────────────────────────────────
export async function startAdminAttendance(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `✅ *Attendance Management*\n\n` +
    `What would you like to do?`,
    [
      { id: 'ATT_MARK_TODAY', title: '📝 Mark Today' },
      { id: 'ATT_VIEW_TODAY', title: '📊 Today Report' },
      { id: 'ATT_CLOSE_SESSION', title: '🔒 Close Session' },
    ],
    'Attendance'
  );

  await sessions.setState(phone, 'ADMIN_ATTENDANCE_MENU');
}

// ─── Handle attendance menu ────────────────────────────────────────────────
export async function handleAdminAttMenu(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  switch (input) {
    case 'att_mark_today':
      await showClassSelector(phone, session, wa, 'MARK');
      break;

    case 'att_view_today':
      await showTodaySchoolReport(phone, session, wa);
      break;

    case 'att_close_session':
      await showClassSelector(phone, session, wa, 'CLOSE');
      break;

    default:
      await startAdminAttendance(phone, session, wa);
  }
}

// ─── Show class selector ───────────────────────────────────────────────────
async function showClassSelector(
  phone: string,
  session: BotSession,
  wa: WhatsApp,
  mode: 'MARK' | 'CLOSE'
): Promise<void> {
  const classes = await adminSvc.getClasses(session.school_id);

  if (!classes.length) {
    await wa.text(
      phone,
      `❌ *No classes found*\n\n` +
      `No classes have been set up yet.\n\n` +
      `Contact your system administrator\n` +
      `to add classes.`
    );
    return;
  }

  // Build rows - show class + arms
  const rows: Array<{
    id: string;
    title: string;
    description?: string;
  }> = [];

  for (const cls of classes as Record<string, unknown>[]) {
    const arms = cls.class_arms as Array<{
      id: string;
      name: string;
    }> | null;

    if (arms?.length) {
      // Show each arm separately
      for (const arm of arms) {
        rows.push({
          id: `CLASS_${cls.id}_ARM_${arm.id}`,
          title: `${cls.name} ${arm.name}`.substring(0, 24),
          description: `${
            mode === 'MARK' ? 'Mark' : 'Close'
          } attendance`,
        });
      }
    } else {
      // No arms - show class directly
      rows.push({
        id: `CLASS_${cls.id}_ARM_NONE`,
        title: String(cls.name).substring(0, 24),
        description: `${
          mode === 'MARK' ? 'Mark' : 'Close'
        } attendance`,
      });
    }
  }

  // WhatsApp list max 10 rows
  const displayRows = rows.slice(0, 10);

  await wa.list(
    phone,
    `✅ ${mode === 'MARK' ? 'Mark Attendance' : 'Close Session'}`,
    `Select a class to ${
      mode === 'MARK' ? 'mark attendance' : 'close session'
    }:`,
    `Tap a class to continue`,
    `📚 Choose Class`,
    [{ title: 'Classes', rows: displayRows }]
  );

  await sessions.setState(
    phone,
    'ADMIN_ATTENDANCE_SELECT_CLASS',
    null,
    { data: { attendanceMode: mode } }
  );
}

// ─── Handle class selection ────────────────────────────────────────────────
export async function handleClassSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('class_')) {
    await startAdminAttendance(phone, session, wa);
    return;
  }

  // Parse: CLASS_{classId}_ARM_{armId or NONE}
  const parts = input.split('_');
  const classId = parts[1];
  const armId = parts[3] !== 'none' ? parts[3] : null;

  const mode = (session.data?.attendanceMode as string) ?? 'MARK';

  if (mode === 'CLOSE') {
    await closeAttendanceSession(phone, session, classId, armId, wa);
    return;
  }

  // MARK mode
  await startMarkingAttendance(
    phone,
    session,
    classId,
    armId,
    wa
  );
}

// ─── Start marking attendance ──────────────────────────────────────────────
async function startMarkingAttendance(
  phone: string,
  session: BotSession,
  classId: string,
  armId: string | null,
  wa: WhatsApp
): Promise<void> {
  // Check if session already exists
  let attSession = await attSvc.getOpenSession(
    session.school_id,
    classId,
    armId ?? undefined
  );

  if (!attSession) {
    // Open new session
    attSession = await attSvc.openSession(
      session.school_id,
      classId,
      armId,
      session.school_user_id ?? session.school_id
    );
  }

  // Check if session is closed
  if (attSession?.status === 'closed') {
    await wa.buttons(
      phone,
      `⚠️ *Session Already Closed*\n\n` +
      `The attendance session for this\n` +
      `class is already closed today.\n\n` +
      `You cannot mark attendance for\n` +
      `a closed session.`,
      [
        { id: 'ATT_MARK_TODAY', title: '📚 Other Class' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Get all students in this class
  const students = await adminSvc.getClassStudents(
    classId,
    armId ?? undefined
  );

  if (!students.length) {
    await wa.text(
      phone,
      `❌ *No students found*\n\n` +
      `No active students in this class.\n\n` +
      `Contact admin to add students.`
    );
    return;
  }

  // Get already marked students
  const markedRecords = await attSvc.getMarkedStudentsToday(
    classId,
    armId ?? undefined
  );

  const markedIds = new Set(
    markedRecords.map((r) => r.student_id)
  );

  // Get unmarked students
  const unmarked = students.filter((s) => !markedIds.has(s.id));

  // All students already marked
  if (!unmarked.length) {
    const summary = await attSvc.getClassSummaryToday(
      classId,
      armId ?? undefined
    );

    await wa.buttons(
      phone,
      `🎉 *All Students Marked!*\n\n` +
      `🏫 ${students[0]?.class_name} ${students[0]?.arm_name}\n\n` +
      `✅ Present: *${summary.present}*\n` +
      `❌ Absent:  *${summary.absent}*\n` +
      `⏰ Late:    *${summary.late}*\n` +
      `📋 Excused: *${summary.excused}*\n` +
      `👥 Total:   *${summary.total}*`,
      [
        { id: 'CLOSE_SESSION_NOW', title: '🔒 Close Session' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );

    await sessions.setState(
      phone,
      'ADMIN_ATTENDANCE_MENU',
      null,
      {
        data: {
          classId,
          armId,
          sessionId: attSession?.id,
        },
      }
    );
    return;
  }

  // Show first unmarked student
  const nextStudent = unmarked[0];
  const done = students.length - unmarked.length;

  await showStudentToMark(
    phone,
    session,
    nextStudent,
    done,
    students.length,
    unmarked.length,
    classId,
    armId,
    attSession?.id as string,
    students.map((s) => s.id),
    [...markedIds],
    wa
  );
}

// ─── Show student to mark ──────────────────────────────────────────────────
async function showStudentToMark(
  phone: string,
  session: BotSession,
  student: Student,
  done: number,
  total: number,
  remaining: number,
  classId: string,
  armId: string | null,
  sessionId: string,
  allStudentIds: string[],
  markedIds: string[],
  wa: WhatsApp
): Promise<void> {
  await wa.buttons(
    phone,
    `✅ *Marking Attendance*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `📊 Progress: *${done}/${total}*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `👤 *${student.full_name}*\n` +
    `📋 Adm: ${student.admission_number}\n\n` +
    `Mark this student as:`,
    [
      { id: `MARK_P_${student.id}`, title: '✅ Present' },
      { id: `MARK_A_${student.id}`, title: '❌ Absent' },
      { id: `MARK_L_${student.id}`, title: '⏰ Late' },
    ],
    'Mark Attendance',
    `${remaining} student${remaining > 1 ? 's' : ''} remaining`
  );

  // Save state
  await sessions.setState(
    phone,
    'ADMIN_ATTENDANCE_MARKING',
    null,
    {
      data: {
        classId,
        armId,
        sessionId,
        allStudentIds,
        markedIds,
      },
    }
  );
}

// ─── Handle attendance marking ─────────────────────────────────────────────
export async function handleMarking(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Handle close session button
  if (input === 'close_session_now') {
    const { classId, armId, sessionId } = session.data as Record<
      string,
      string
    >;

    if (sessionId) {
      await attSvc.closeSession(
        sessionId,
        session.school_user_id ?? session.school_id
      );

      await adminSvc.logAction(
        session.school_id,
        session.school_user_id ?? '',
        'close_attendance_session',
        { class_id: classId, session_id: sessionId }
      );
    }

    await wa.text(
      phone,
      `🔒 *Session Closed!*\n\nAttendance session has been closed.`
    );

    await showAdminMenu(phone, session, wa);
    return;
  }

  // Must be a mark input: MARK_{STATUS}_{STUDENT_ID}
  if (!input.startsWith('mark_')) {
    await showAdminMenu(phone, session, wa);
    return;
  }

  const parts = input.split('_');
  const statusCode = parts[1]; // p, a, l, e
  const studentId = parts.slice(2).join('_');

  const statusMap: Record<
    string,
    'present' | 'absent' | 'late' | 'excused'
  > = {
    p: 'present',
    a: 'absent',
    l: 'late',
    e: 'excused',
  };

  const status = statusMap[statusCode];
  if (!status) return;

  const {
    classId,
    armId,
    sessionId,
    allStudentIds,
    markedIds,
  } = session.data as {
    classId: string;
    armId: string | null;
    sessionId: string;
    allStudentIds: string[];
    markedIds: string[];
  };

  try {
    // Mark attendance in DB
    const record = await attSvc.markStudent({
      studentId,
      schoolId: session.school_id,
      classId,
      classArmId: armId,
      status,
      markedBy: session.school_user_id ?? session.school_id,
    });

    if (!record) throw new Error('Failed to mark attendance');

    // Log action
    await adminSvc.logAction(
      session.school_id,
      session.school_user_id ?? '',
      'mark_attendance',
      {
        student_id: studentId,
        status,
        date: new Date().toISOString().split('T')[0],
      }
    );

    // Trigger parent notification
    await attSvc.triggerParentNotification(record, session.school_id);

    // Update marked list
    const newMarkedIds = [...markedIds, studentId];
    const remaining = allStudentIds.filter(
      (id) => !newMarkedIds.includes(id)
    );

    // All students done
    if (!remaining.length) {
      const summary = await attSvc.getClassSummaryToday(
        classId,
        armId ?? undefined
      );

      await wa.buttons(
        phone,
        `🎉 *Attendance Complete!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `✅ Present: *${summary.present}*\n` +
        `❌ Absent:  *${summary.absent}*\n` +
        `⏰ Late:    *${summary.late}*\n` +
        `📋 Excused: *${summary.excused}*\n` +
        `👥 Total:   *${summary.total}*\n\n` +
        `All parents have been notified! 📱`,
        [
          { id: 'CLOSE_SESSION_NOW', title: '🔒 Close Session' },
          { id: 'MAIN_MENU', title: '🏠 Menu' },
        ]
      );

      await sessions.setState(
        phone,
        'ADMIN_ATTENDANCE_MARKING',
        null,
        {
          data: {
            classId,
            armId,
            sessionId,
            allStudentIds,
            markedIds: newMarkedIds,
          },
        }
      );
      return;
    }

    // Continue with next student
    const nextStudentId = remaining[0];

    // Get all students to find next
    const allStudents = await adminSvc.getClassStudents(
      classId,
      armId ?? undefined
    );

    const nextStudent = allStudents.find(
      (s) => s.id === nextStudentId
    );

    if (!nextStudent) {
      await showAdminMenu(phone, session, wa);
      return;
    }

    const done = allStudentIds.length - remaining.length;

    // Show next student
    await showStudentToMark(
      phone,
      session,
      nextStudent,
      done,
      allStudentIds.length,
      remaining.length,
      classId,
      armId,
      sessionId,
      allStudentIds,
      newMarkedIds,
      wa
    );
  } catch (err) {
    console.error('[AdminAttendance] mark error:', err);
    await wa.text(
      phone,
      `❌ Failed to mark attendance.\n\nPlease try again.\n\nType *0* to go back.`
    );
  }
}

// ─── Close attendance session ──────────────────────────────────────────────
async function closeAttendanceSession(
  phone: string,
  session: BotSession,
  classId: string,
  armId: string | null,
  wa: WhatsApp
): Promise<void> {
  // Find open session
  const openSession = await attSvc.getOpenSession(
    session.school_id,
    classId,
    armId ?? undefined
  );

  if (!openSession) {
    await wa.buttons(
      phone,
      `❌ *No Open Session Found*\n\n` +
      `There is no open attendance session\n` +
      `for this class today.`,
      [
        { id: 'ATT_MARK_TODAY', title: '📝 Mark Attendance' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  if (openSession.status === 'closed') {
    await wa.text(
      phone,
      `⚠️ This session is already closed.`
    );
    return;
  }

  // Close the session
  await attSvc.closeSession(
    openSession.id as string,
    session.school_user_id ?? session.school_id
  );

  // Log action
  await adminSvc.logAction(
    session.school_id,
    session.school_user_id ?? '',
    'close_attendance_session',
    {
      class_id: classId,
      session_id: openSession.id,
    }
  );

  // Get final summary
  const summary = await attSvc.getClassSummaryToday(
    classId,
    armId ?? undefined
  );

  await wa.buttons(
    phone,
    `🔒 *Session Closed!*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📊 *Final Summary:*\n\n` +
    `✅ Present: *${summary.present}*\n` +
    `❌ Absent:  *${summary.absent}*\n` +
    `⏰ Late:    *${summary.late}*\n` +
    `📋 Excused: *${summary.excused}*\n` +
    `👥 Total:   *${summary.total}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'ADMIN_ATTENDANCE', title: '✅ Attendance' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}

// ─── Show today's school-wide report ──────────────────────────────────────
async function showTodaySchoolReport(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  const stats = await attSvc.getSchoolSummaryToday(
    session.school_id
  );

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  await wa.buttons(
    phone,
    `📊 *Today\'s Attendance Report*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📅 ${today}\n\n` +
    `${stats.rateIcon} *Rate: ${stats.rate}%*\n\n` +
    `✅ Present: *${stats.present}*\n` +
    `❌ Absent:  *${stats.absent}*\n` +
    `⏰ Late:    *${stats.late}*\n` +
    `👥 Total:   *${stats.total}*\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'ATT_MARK_TODAY', title: '📝 Mark Class' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );
}
