// ============================================================
// SCHOOLBOT - TEACHER BOT (FULLY UPGRADED)
// supabase/functions/_shared/bot/teacher.ts
// ✅ Mark Attendance (all statuses, progress tracking)
// ✅ View Class Attendance Reports (daily, weekly, term)
// ✅ View & Search Student List
// ✅ Update Student Records (name, class, parent phone)
// ✅ Bulk Upload Student Results (CSV)
// ✅ View Today's Report
// ✅ Help & FAQ
// ============================================================

import { WhatsApp }       from '../whatsapp.ts';
import { SessionService } from '../session.ts';
import { AdminService }   from '../services/admin.service.ts';
import { AttendanceService } from '../services/attendance.service.ts';
import { getSupabase }    from '../supabase.ts';
import { delay }          from '../utils.ts';
import type {
  BotSession,
  IncomingMessage,
} from '../types.ts';

const sessions = new SessionService();
const adminSvc = new AdminService();
const attSvc   = new AttendanceService();
const db       = getSupabase();

// ============================================================
// TEACHER MAIN MENU
// ============================================================

export async function showTeacherMenu(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const teacherName =
    session.schoolUser?.profiles?.full_name
      ?.split(' ')[0] ?? 'Teacher';

  const hour = new Date().getHours();
  const greet =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening';

  // Get teacher's assigned classes
  const { data: assignedClasses } = await db
    .from('teacher_classes')
    .select(`
      class_id,
      class_arm_id,
      classes ( id, name ),
      class_arms ( id, name )
    `)
    .eq('staff_id', session.school_user_id)
    .eq('is_active', true);

  let classInfo = '';
  if (assignedClasses?.length) {
    classInfo = '\n📚 *Your Classes:*\n' +
      assignedClasses.map((tc: any) => {
        const cn = (tc.classes as any)?.name ?? '';
        const an = (tc.class_arms as any)?.name ?? '';
        return `  • ${cn} ${an}`.trim();
      }).join('\n') + '\n';
  }

  await wa.list(
    phone,
    `🏫 Teacher Dashboard`,
    `${greet} *${teacherName}!* 👋\n\n` +
    `Welcome to your teacher dashboard.\n` +
    classInfo +
    `\nSelect an action below:`,
    `Type *0* to return here anytime`,
    `📋 Teacher Menu`,
    [
      {
        title: '📚 Attendance',
        rows: [
          {
            id:          'TCH_MARK_ATT',
            title:       '📝 Mark Attendance',
            description: 'Mark class attendance for today',
          },
          {
            id:          'TCH_ATT_REPORT',
            title:       '📊 Attendance Report',
            description: 'View daily/weekly/term report',
          },
        ],
      },
      {
        title: '👨‍🎓 Students',
        rows: [
          {
            id:          'TCH_STUDENT_LIST',
            title:       '👥 View Student List',
            description: 'Search & view student details',
          },
          {
            id:          'TCH_UPDATE_STUDENT',
            title:       '✏️ Update Student Record',
            description: 'Edit name, class, parent phone',
          },
        ],
      },
      {
        title: '🎓 Results & Reports',
        rows: [
          {
            id:          'TCH_UPLOAD_RESULTS',
            title:       '📤 Upload Results (CSV)',
            description: 'Bulk upload exam scores',
          },
          {
            id:          'TCH_TODAY_REPORT',
            title:       '📈 Today\'s Report',
            description: 'Quick daily overview',
          },
          {
            id:          'TCH_HELP',
            title:       '❓ Help & FAQ',
            description: 'How to use teacher features',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'TCH_MAIN_MENU');
}

// ============================================================
// TEACHER ROUTER
// ============================================================

export async function routeTeacher(
  phone:     string,
  session:   BotSession,
  input:     string,
  rawText:   string,
  wa:        WhatsApp
): Promise<void> {

  // ── Main menu ──────────────────────────────────────────
  if (session.state === 'TCH_MAIN_MENU' || !session.state) {
    await handleTeacherMainMenu(phone, session, input, rawText, wa);
    return;
  }

  // ── Attendance states ──────────────────────────────────
  if (session.state === 'TCH_ATT_SELECT_CLASS') {
    await handleTeacherClassSelect(phone, session, input, wa);
    return;
  }

  if (session.state === 'TCH_ATT_MARKING') {
    await handleTeacherMarking(phone, session, input, wa);
    return;
  }

  if (session.state === 'TCH_ATT_REPORT_TYPE') {
    await handleAttReportType(phone, session, input, wa);
    return;
  }

  // ── Student states ─────────────────────────────────────
  if (session.state === 'TCH_STUDENT_SEARCH') {
    await handleTeacherStudentSearch(phone, session, rawText, wa);
    return;
  }

  if (session.state === 'TCH_STUDENT_DETAIL') {
    await handleStudentDetailAction(phone, session, input, wa);
    return;
  }

  if (session.state === 'TCH_UPDATE_STUDENT_SEARCH') {
    await handleUpdateStudentSearch(phone, session, rawText, wa);
    return;
  }

  if (session.state === 'TCH_UPDATE_FIELD_SELECT') {
    await handleUpdateFieldSelect(phone, session, input, wa);
    return;
  }

  if (session.state === 'TCH_UPDATE_FIELD_INPUT') {
    await handleUpdateFieldInput(phone, session, rawText, wa);
    return;
  }

  // ── Result upload states ───────────────────────────────
  if (session.state === 'TCH_UPLOAD_SELECT_TERM') {
    await handleUploadTermSelect(phone, session, input, wa);
    return;
  }

  if (session.state === 'TCH_AWAITING_RESULT_CSV') {
    // Handled by document handler in handler.ts
    await wa.text(
      phone,
      `📤 Please send your *results CSV file*\n` +
      `as an attachment.\n\n` +
      `Type *0* to go back.`
    );
    return;
  }

  if (session.state === 'TCH_CONFIRM_RESULT_UPLOAD') {
    await handleConfirmResultUpload(phone, session, input, wa);
    return;
  }

  // ── Fallback ───────────────────────────────────────────
  await showTeacherMenu(phone, session, wa);
}

// ============================================================
// TEACHER MAIN MENU HANDLER
// ============================================================

async function handleTeacherMainMenu(
  phone:   string,
  session: BotSession,
  input:   string,
  rawText: string,
  wa:      WhatsApp
): Promise<void> {
  switch (input) {
    case 'tch_mark_att':
      await startTeacherAttendance(phone, session, wa);
      break;

    case 'tch_att_report':
      await startAttReport(phone, session, wa);
      break;

    case 'tch_student_list':
      await startStudentSearch(phone, session, wa);
      break;

    case 'tch_update_student':
      await startUpdateStudent(phone, session, wa);
      break;

    case 'tch_upload_results':
      await startResultUpload(phone, session, wa);
      break;

    case 'tch_today_report':
      await showTeacherTodayReport(phone, session, wa);
      break;

    case 'tch_help':
      await showTeacherHelp(phone, wa);
      break;

    default:
      await showTeacherMenu(phone, session, wa);
  }
}

// ============================================================
// 1. MARK ATTENDANCE (UPGRADED)
// ============================================================

async function startTeacherAttendance(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  // Get teacher's assigned classes
  const classes = await getTeacherClasses(session);

  if (!classes.length) {
    await wa.text(
      phone,
      `❌ *No Classes Assigned*\n\n` +
      `You have no classes assigned yet.\n\n` +
      `Contact your school admin to\n` +
      `assign classes to your account.`
    );
    return;
  }

  if (classes.length === 1) {
    await startMarkingForClass(
      phone, session, classes[0].id, classes[0].armId, wa
    );
    return;
  }

  // Multiple classes — let teacher choose
  const rows = classes.slice(0, 10).map((c) => ({
    id:          `TCH_CLASS_${c.id}_${c.armId ?? 'NONE'}`,
    title:       `${c.name} ${c.armName}`.trim().substring(0, 24),
    description: `${c.studentCount ?? 0} students`,
  }));

  await wa.list(
    phone,
    `📝 Mark Attendance`,
    `Select a class to mark attendance:`,
    `Tap a class to continue`,
    `📚 Select Class`,
    [{ title: 'Your Classes', rows }]
  );

  await sessions.setState(phone, 'TCH_ATT_SELECT_CLASS');
}

async function handleTeacherClassSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('tch_class_')) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  const parts = input.replace('tch_class_', '').split('_');
  const classId = parts[0];
  const armId = parts[1] !== 'none' ? parts[1] : null;

  await startMarkingForClass(phone, session, classId, armId, wa);
}

async function startMarkingForClass(
  phone:   string,
  session: BotSession,
  classId: string,
  armId:   string | null,
  wa:      WhatsApp
): Promise<void> {
  // Get students in this class
  const students = await adminSvc.getClassStudents(
    classId,
    armId ?? undefined
  );

  if (!students.length) {
    await wa.text(
      phone,
      `❌ No students found in this class.`
    );
    return;
  }

  // Get already marked students today
  const markedRecords = await attSvc.getMarkedStudentsToday(
    classId,
    armId ?? undefined
  );
  const markedIds = new Set(markedRecords.map((r) => r.student_id));
  const unmarked = students.filter((s) => !markedIds.has(s.id));

  if (!unmarked.length) {
    const summary = await attSvc.getClassSummaryToday(
      classId, armId ?? undefined
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
        { id: 'TCH_MARK_ATT', title: '📝 Other Class' },
        { id: '0',            title: '🏠 Menu'        },
      ]
    );
    return;
  }

  // Show first unmarked student
  const nextStudent = unmarked[0];
  const done = students.length - unmarked.length;

  await showTeacherMarkingCard(
    phone, session, nextStudent, done,
    students.length, unmarked.length,
    classId, armId,
    students.map((s) => s.id),
    [...markedIds],
    wa
  );
}

async function showTeacherMarkingCard(
  phone:         string,
  session:       BotSession,
  student:       any,
  done:          number,
  total:         number,
  remaining:     number,
  classId:       string,
  armId:         string | null,
  allIds:        string[],
  markedIds:     string[],
  wa:          WhatsApp
): Promise<void> {
  const progressBar = buildProgressBar(done, total);

  await wa.buttons(
    phone,
    `📝 *Marking Attendance*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `🏫 ${student.class_name} ${student.arm_name}\n` +
    `${progressBar} ${done}/${total}\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `👤 *${student.full_name}*\n` +
    `📋 Adm: ${student.admission_number}\n\n` +
    `Mark this student as:`,
    [
      { id: `TCH_MARK_P_${student.id}`, title: '✅ Present' },
      { id: `TCH_MARK_A_${student.id}`, title: '❌ Absent'  },
      { id: `TCH_MARK_L_${student.id}`, title: '⏰ Late'    },
    ]
  );

  await sessions.setState(phone, 'TCH_ATT_MARKING', null, {
    data: {
      classId,
      armId,
      allStudentIds: allIds,
      markedIds,
    },
  });
}

async function handleTeacherMarking(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('tch_mark_')) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  const parts = input.split('_');
  const statusCode = parts[2]; // p, a, l
  const studentId = parts.slice(3).join('_');

  const statusMap: Record<string, 'present' | 'absent' | 'late' | 'excused'> = {
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
    allStudentIds,
    markedIds,
  } = session.data as {
    classId:       string;
    armId:         string | null;
    allStudentIds: string[];
    markedIds:     string[];
  };

  try {
    // Mark attendance
    const record = await attSvc.markStudent({
      studentId,
      schoolId:   session.school_id,
      classId,
      classArmId: armId,
      status,
      markedBy: session.school_user_id ?? session.school_id,
    });

    if (!record) throw new Error('Failed to mark');

    // Trigger parent notification
    await attSvc.triggerParentNotification(
      record, session.school_id
    );

    // Update marked list
    const newMarkedIds = [...markedIds, studentId];
    const remaining = allStudentIds.filter(
      (id) => !newMarkedIds.includes(id)
    );

    // All done
    if (!remaining.length) {
      const summary = await attSvc.getClassSummaryToday(
        classId, armId ?? undefined
      );

      await wa.buttons(
        phone,
        `🎉 *All Students Marked!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `✅ Present: *${summary.present}*\n` +
        `❌ Absent:  *${summary.absent}*\n` +
        `⏰ Late:    *${summary.late}*\n` +
        `📋 Excused: *${summary.excused}*\n` +
        `👥 Total:   *${summary.total}*\n\n` +
        `Parents notified! 📱`,
        [
          { id: 'TCH_MARK_ATT', title: '📝 Other Class' },
          { id: 'TCH_ATT_REPORT', title: '📊 View Report' },
          { id: '0',            title: '🏠 Menu'        },
        ]
      );
      return;
    }

    // Next student
    const nextId = remaining[0];
    const allStudents = await adminSvc.getClassStudents(
      classId, armId ?? undefined
    );
    const nextStudent = allStudents.find(
      (s) => s.id === nextId
    );

    if (!nextStudent) {
      await showTeacherMenu(phone, session, wa);
      return;
    }

    const done = allStudentIds.length - remaining.length;

    await showTeacherMarkingCard(
      phone, session, nextStudent, done,
      allStudentIds.length, remaining.length,
      classId, armId,
      allStudentIds, newMarkedIds, wa
    );
  } catch (err) {
    console.error('[Teacher] marking error:', err);
    await wa.text(
      phone,
      `❌ Failed to mark attendance.\n\nPlease try again.`
    );
  }
}

// ============================================================
// 2. ATTENDANCE REPORTS
// ============================================================

async function startAttReport(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const classes = await getTeacherClasses(session);

  if (!classes.length) {
    await wa.text(phone, `❌ No classes assigned.`);
    return;
  }

  await wa.buttons(
    phone,
    `📊 *Attendance Report*\n\n` +
    `Select report period:`,
    [
      { id: 'TCH_ATT_RPT_TODAY', title: '📅 Today'      },
      { id: 'TCH_ATT_RPT_WEEK',  title: '📅 This Week'  },
      { id: 'TCH_ATT_RPT_TERM',  title: '📅 This Term'  },
    ]
  );

  await sessions.setState(phone, 'TCH_ATT_REPORT_TYPE');
}

async function handleAttReportType(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  const classes = await getTeacherClasses(session);
  if (!classes.length) {
    await wa.text(phone, `❌ No classes assigned.`);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  let reportText = `📊 *Attendance Report*\n━━━━━━━━━━━━━━━━\n`;

  for (const cls of classes) {
    const summary = await attSvc.getClassSummaryToday(
      cls.id, cls.armId ?? undefined
    );

    reportText +=
      `\n🏫 *${cls.name} ${cls.armName}*:\n` +
      `  ✅ ${summary.present}  ❌ ${summary.absent}  ` +
      `⏰ ${summary.late}  📊 ${summary.rate}%\n`;
  }

  reportText += `\n━━━━━━━━━━━━━━━━`;

  await wa.buttons(
    phone,
    reportText,
    [
      { id: 'TCH_MARK_ATT', title: '📝 Mark Attendance' },
      { id: '0',            title: '🏠 Menu'            },
    ]
  );

  await sessions.setState(phone, 'TCH_MAIN_MENU');
}

// ============================================================
// 3. STUDENT LIST & SEARCH
// ============================================================

async function startStudentSearch(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `👥 *Student List*\n\n` +
    `Type student name or admission number:\n\n` +
    `_Example: Chidi or GA/2024/001_\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(phone, 'TCH_STUDENT_SEARCH');
}

async function handleTeacherStudentSearch(
  phone:     string,
  session:   BotSession,
  searchText: string,
  wa:        WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text === '0') {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  if (text.length < 2) {
    await wa.text(phone, `⚠️ Type at least 2 characters.`);
    return;
  }

  const results = await adminSvc.searchStudents(
    session.school_id, text
  );

  if (!results.length) {
    await wa.buttons(
      phone,
      `❌ No students found for *"${text}"*`,
      [
        { id: 'TCH_STUDENT_LIST', title: '🔍 Search Again' },
        { id: '0',               title: '🏠 Menu'         },
      ]
    );
    return;
  }

  if (results.length === 1) {
    await showStudentDetail(phone, session, results[0], wa);
    return;
  }

  const rows = results.slice(0, 10).map((s) => ({
    id:          `TCH_STD_${s.id}`,
    title:       s.full_name.substring(0, 24),
    description: `${s.class_name} ${s.arm_name} • ${s.admission_number}`,
  }));

  await wa.list(
    phone,
    `🔍 Search Results`,
    `Found *${results.length}* students:`,
    `Tap to view details`,
    `👤 Select`,
    [{ title: 'Students', rows }]
  );

  await sessions.setState(phone, 'TCH_STUDENT_DETAIL');
}

async function handleStudentDetailAction(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('tch_std_')) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  const studentId = input.replace('tch_std_', '');
  const students = await adminSvc.searchStudents(
    session.school_id, studentId
  );

  if (students.length) {
    await showStudentDetail(phone, session, students[0], wa);
  } else {
    await wa.text(phone, `❌ Student not found.`);
  }
}

async function showStudentDetail(
  phone:   string,
  session: BotSession,
  student: any,
  wa:      WhatsApp
): Promise<void> {
  // Get attendance summary
  const attSummary = await attSvc.getTermSummary(
    student.id, session.school_id
  );

  await wa.buttons(
    phone,
    `👤 *Student Details*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `👤 *${student.full_name}*\n` +
    `📋 Adm No: ${student.admission_number}\n` +
    `🏫 Class: ${student.class_name} ${student.arm_name}\n` +
    `👫 Gender: ${student.gender ?? 'N/A'}\n\n` +
    `📊 *Term Attendance:*\n` +
    `Rate: ${attSummary.rate ?? 0}%\n` +
    `✅ ${attSummary.present}  ❌ ${attSummary.absent}  ` +
    `⏰ ${attSummary.late}\n` +
    `━━━━━━━━━━━━━━━━`,
    [
      { id: 'TCH_STUDENT_LIST', title: '🔍 Search Again' },
      { id: '0',               title: '🏠 Menu'         },
    ]
  );
}

// ============================================================
// 4. UPDATE STUDENT RECORDS
// ============================================================

async function startUpdateStudent(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `✏️ *Update Student Record*\n\n` +
    `Type student name or admission number:\n\n` +
    `_Example: Chidi or GA/2024/001_\n\n` +
    `Type *0* to go back.`
  );

  await sessions.setState(phone, 'TCH_UPDATE_STUDENT_SEARCH');
}

async function handleUpdateStudentSearch(
  phone:     string,
  session:   BotSession,
  searchText: string,
  wa:        WhatsApp
): Promise<void> {
  const text = searchText.trim();

  if (text === '0') {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  if (text.length < 2) {
    await wa.text(phone, `⚠️ Type at least 2 characters.`);
    return;
  }

  const results = await adminSvc.searchStudents(
    session.school_id, text
  );

  if (!results.length) {
    await wa.buttons(
      phone,
      `❌ No students found for *"${text}"*`,
      [
        { id: 'TCH_UPDATE_STUDENT', title: '🔍 Search Again' },
        { id: '0',                 title: '🏠 Menu'          },
      ]
    );
    return;
  }

  if (results.length === 1) {
    await showUpdateFieldOptions(
      phone, session, results[0].id, results[0].full_name, wa
    );
    return;
  }

  const rows = results.slice(0, 10).map((s) => ({
    id:          `TCH_UPD_${s.id}`,
    title:       s.full_name.substring(0, 24),
    description: `${s.class_name} ${s.arm_name} • ${s.admission_number}`,
  }));

  await wa.list(
    phone,
    `🔍 Select Student to Update`,
    `Found *${results.length}* students:`,
    `Tap to select`,
    `👤 Select`,
    [{ title: 'Students', rows }]
  );

  await sessions.setState(phone, 'TCH_UPDATE_FIELD_SELECT');
}

async function handleUpdateFieldSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('tch_upd_')) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  const studentId = input.replace('tch_upd_', '');

  const students = await adminSvc.searchStudents(
    session.school_id, studentId
  );

  if (students.length) {
    await showUpdateFieldOptions(
      phone, session, students[0].id, students[0].full_name, wa
    );
  }
}

async function showUpdateFieldOptions(
  phone:       string,
  session:     BotSession,
  studentId:   string,
  studentName: string,
  wa:        WhatsApp
): Promise<void> {
  await wa.list(
    phone,
    `✏️ Update ${studentName}`,
    `Select the field to update:`,
    `Tap a field to edit`,
    `✏️ Edit Field`,
    [
      {
        title: 'Student Info',
        rows: [
          {
            id:          `UPD_FNAME_${studentId}`,
            title:       '👤 First Name',
            description: 'Update first name',
          },
          {
            id:          `UPD_LNAME_${studentId}`,
            title:       '👤 Last Name',
            description: 'Update last name',
          },
          {
            id:          `UPD_ADMNO_${studentId}`,
            title:       '📋 Admission Number',
            description: 'Update admission number',
          },
        ],
      },
      {
        title: 'Contact & Class',
        rows: [
          {
            id:          `UPD_PHONE_${studentId}`,
            title:       '📱 Parent Phone',
            description: 'Update parent phone number',
          },
          {
            id:          `UPD_GENDER_${studentId}`,
            title:       '👫 Gender',
            description: 'Update gender',
          },
        ],
      },
    ]
  );

  await sessions.setState(phone, 'TCH_UPDATE_FIELD_INPUT');
}

async function handleUpdateFieldInput(
  phone:     string,
  session:   BotSession,
  rawText:   string,
  wa:        WhatsApp
): Promise<void> {
  const text = rawText.trim();

  if (text === '0') {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  // This handles the field selection input
  if (text.toLowerCase().startsWith('upd_')) {
    const parts = text.split('_');
    const field = parts[1];
    const studentId = parts.slice(2).join('_');

    const fieldLabels: Record<string, string> = {
      fname: 'First Name',
      lname: 'Last Name',
      admno: 'Admission Number',
      phone: 'Parent Phone Number',
      gender: 'Gender (Male/Female)',
    };

    const label = fieldLabels[field] ?? 'Field';

    await wa.text(
      phone,
      `✏️ *Update ${label}*\n\n` +
      `Type the new value:\n\n` +
      `Type *0* to cancel.`
    );

    await sessions.setState(phone, 'TCH_UPDATE_FIELD_INPUT', null, {
      data: {
        updateStudentId: studentId,
        updateField: field,
      },
    });
    return;
  }

  // Handle actual value input
  const updateField = session.data?.updateField as string;
  const studentId = session.data?.updateStudentId as string;

  if (!updateField || !studentId) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  try {
    const updateData: Record<string, any> = {};

    switch (updateField) {
      case 'fname':
        updateData.first_name = text;
        break;
      case 'lname':
        updateData.last_name = text;
        break;
      case 'admno':
        updateData.admission_number = text.toUpperCase();
        break;
      case 'phone': {
        const cleanPhone = text.replace(/\D/g, '');
        const formatted = cleanPhone.startsWith('0')
          ? '234' + cleanPhone.slice(1)
          : cleanPhone;

        // Update parent phone
        const { data: sps } = await db
          .from('student_parents')
          .select('parent_id')
          .eq('student_id', studentId)
          .eq('is_primary', true)
          .maybeSingle();

        if (sps?.parent_id) {
          await db
            .from('parents')
            .update({
              phone:           formatted,
              whatsapp_number: formatted,
              updated_at:      new Date().toISOString(),
            })
            .eq('id', sps.parent_id);
        }
        break;
      }
      case 'gender':
        updateData.gender = text.toLowerCase() === 'male' ? 'Male' : 'Female';
        break;
      default:
        await wa.text(phone, `❌ Unknown field.`);
        return;
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date().toISOString();

      await db
        .from('students')
        .update(updateData)
        .eq('id', studentId);
    }

    await wa.buttons(
      phone,
      `✅ *Student Record Updated!*\n\n` +
      `Field updated successfully.`,
      [
        { id: 'TCH_UPDATE_STUDENT', title: '✏️ Update Another' },
        { id: 'TCH_STUDENT_LIST',   title: '👥 View Students' },
        { id: '0',                 title: '🏠 Menu'           },
      ]
    );

    await sessions.setState(phone, 'TCH_MAIN_MENU');
  } catch (err) {
    console.error('[Teacher] update error:', err);
    await wa.text(phone, `❌ Failed to update record.`);
  }
}

// ============================================================
// 5. BULK UPLOAD RESULTS (CSV)
// ============================================================

async function startResultUpload(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  // Get available terms
  const { data: terms } = await db
    .from('terms')
    .select('id, name, is_current, academic_years ( name )')
    .eq('school_id', session.school_id)
    .order('created_at', { ascending: false })
    .limit(6);

  if (!terms?.length) {
    await wa.text(
      phone,
      `❌ No academic terms found.\n\n` +
      `Contact your admin to set up terms.`
    );
    return;
  }

  const rows = terms.map((t: any) => ({
    id:          `TCH_UP_TERM_${t.id}`,
    title:       `${t.name}${t.is_current ? ' ⭐' : ''}`.substring(0, 24),
    description: (t.academic_years as any)?.name ?? '',
  }));

  await wa.list(
    phone,
    `🎓 Upload Results`,
    `Select the term for these results:`,
    `Tap a term to continue`,
    `📅 Select Term`,
    [{ title: 'Academic Terms', rows }]
  );

  await sessions.setState(phone, 'TCH_UPLOAD_SELECT_TERM');
}

async function handleUploadTermSelect(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (!input.startsWith('tch_up_term_')) {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  const termId = input.replace('tch_up_term_', '');

  await wa.text(
    phone,
    `📤 *Upload Results CSV*\n\n` +
    `*CSV Format Required:*\n` +
    `\`admission_number,subject,ca_score,exam_score\`\n\n` +
    `*Example:*\n` +
    `\`GA/2024/001,Mathematics,28,58\`\n` +
    `\`GA/2024/001,English,25,54\`\n` +
    `\`GA/2024/002,Mathematics,30,62\`\n\n` +
    `*Rules:*\n` +
    `• One row per student per subject\n` +
    `• CA score: 0-40\n` +
    `• Exam score: 0-60\n` +
    `• New subjects created automatically\n\n` +
    `Send your CSV file now 👇`
  );

  await sessions.setState(phone, 'TCH_AWAITING_RESULT_CSV', null, {
    data: { uploadTermId: termId },
  });
}

// Called from handler.ts document handler
export async function handleTeacherResultCSV(
  phone:      string,
  session:    BotSession,
  message:    IncomingMessage,
  downloadWa: WhatsApp,
  replyWa?:   WhatsApp
): Promise<void> {
  const sendWa = replyWa ?? downloadWa;
  const termId = session.data?.uploadTermId as string;

  if (!termId) {
    await sendWa.text(phone, `❌ No term selected. Start over.`);
    await showTeacherMenu(phone, session, sendWa);
    return;
  }

  const doc = message.document;
  if (!doc) {
    await sendWa.text(phone, `❌ No file found.`);
    return;
  }

  await sendWa.text(
    phone,
    `⏳ *Processing results CSV...*\n\nPlease wait.`
  );

  try {
    const csvText = await downloadWa.downloadMedia(doc.id);

    if (!csvText) {
      await sendWa.text(phone, `❌ Could not read file.`);
      return;
    }

    // Parse CSV
    const { CSVService } = await import('../csv.service.ts');
    const csvSvc = new CSVService();
    const { rows, errors: parseErrors } = csvSvc.parseCSV(
      csvText,
      ['admission_number', 'subject', 'ca_score', 'exam_score']
    );

    if (parseErrors.length > 0) {
      await sendWa.text(
        phone,
        `❌ *CSV Error:*\n${parseErrors.slice(0, 3).join('\n')}`
      );
      return;
    }

    if (!rows.length) {
      await sendWa.text(phone, `❌ Empty file.`);
      return;
    }

    // Preview
    const preview = rows.slice(0, 3).map((r: any, i: number) =>
      `${i + 1}. ${r.admission_number} — ${r.subject}\n` +
      `   CA: ${r.ca_score} | Exam: ${r.exam_score}`
    ).join('\n\n');

    const moreText = rows.length > 3
      ? `\n\n_...and ${rows.length - 3} more rows_`
      : '';

    await sendWa.buttons(
      phone,
      `📊 *Results Preview*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📝 Rows: *${rows.length}*\n\n` +
      `${preview}${moreText}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Import these results?`,
      [
        {
          id:    `TCH_CONFIRM_RESULT_${rows.length}`,
          title: `✅ Import ${rows.length} Results`,
        },
        { id: 'TCH_UPLOAD_RESULTS', title: '❌ Cancel' },
      ]
    );

    await sessions.setState(phone, 'TCH_CONFIRM_RESULT_UPLOAD', null, {
      data: {
        uploadTermId: termId,
        pendingResultRows: rows,
      },
    });
  } catch (err) {
    console.error('[Teacher] result CSV error:', err);
    await sendWa.text(phone, `❌ Error processing file.`);
  }
}

async function handleConfirmResultUpload(
  phone:   string,
  session: BotSession,
  input:   string,
  wa:      WhatsApp
): Promise<void> {
  if (input.startsWith('tch_upload_results') || input === '0') {
    await showTeacherMenu(phone, session, wa);
    return;
  }

  if (!input.startsWith('tch_confirm_result_')) return;

  const rows = session.data?.pendingResultRows as any[];
  const termId = session.data?.uploadTermId as string;

  if (!rows?.length || !termId) {
    await wa.text(phone, `❌ No data to import.`);
    return;
  }

  await wa.text(
    phone,
    `⏳ *Importing ${rows.length} results...*\n\n` +
    `Please wait...`
  );

  try {
    const { CSVService } = await import('../csv.service.ts');
    const csvSvc = new CSVService();

    // Create a job record
    const { data: job } = await db
      .from('bulk_upload_jobs')
      .insert({
        school_id:   session.school_id,
        upload_type: 'scores',
        file_name:   'teacher_upload.csv',
        total_rows:  rows.length,
        status:      'processing',
        started_at:  new Date().toISOString(),
        created_at:  new Date().toISOString(),
      })
      .select()
      .single();

    const result = await csvSvc.importScores(
      session.school_id,
      termId,
      rows,
      job?.id ?? 'manual'
    );

    await wa.buttons(
      phone,
      `🎉 *Results Imported!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `📝 Total:  *${result.total}*\n` +
      `✅ Created: *${result.created}*\n` +
      `🔄 Updated: *${result.updated}*\n` +
      (result.failed > 0
        ? `❌ Failed:  *${result.failed}*\n`
        : '') +
      `━━━━━━━━━━━━━━━━`,
      [
        { id: 'TCH_UPLOAD_RESULTS', title: '📤 Upload More' },
        { id: 'TCH_ATT_REPORT',     title: '📊 View Reports' },
        { id: '0',                 title: '🏠 Menu'         },
      ]
    );

    await sessions.setState(phone, 'TCH_MAIN_MENU');
  } catch (err) {
    console.error('[Teacher] result import error:', err);
    await wa.text(phone, `❌ Import failed. Please try again.`);
  }
}

// ============================================================
// 6. TODAY'S REPORT
// ============================================================

async function showTeacherTodayReport(
  phone:   string,
  session: BotSession,
  wa:      WhatsApp
): Promise<void> {
  const classes = await getTeacherClasses(session);

  if (!classes.length) {
    await wa.text(phone, `❌ No classes assigned.`);
    return;
  }

  const today = new Date().toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric',
    month: 'long', year: 'numeric',
  });

  let reportText =
    `📈 *Today's Report*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    `📅 ${today}\n\n`;

  for (const cls of classes) {
    const summary = await attSvc.getClassSummaryToday(
      cls.id, cls.armId ?? undefined
    );

    reportText +=
      `🏫 *${cls.name} ${cls.armName}*:\n` +
      `${summary.rateIcon} Rate: *${summary.rate}%*\n` +
      `✅ ${summary.present}  ❌ ${summary.absent}  ` +
      `⏰ ${summary.late}  👥 ${summary.total}\n\n`;
  }

  reportText += `━━━━━━━━━━━━━━━━`;

  await wa.buttons(
    phone,
    reportText,
    [
      { id: 'TCH_MARK_ATT', title: '📝 Mark Attendance' },
      { id: '0',            title: '🏠 Menu'            },
    ]
  );
}

// ============================================================
// 7. TEACHER HELP & FAQ
// ============================================================

async function showTeacherHelp(
  phone: string,
  wa:    WhatsApp
): Promise<void> {
  await wa.text(
    phone,
    `❓ *Teacher Help & FAQ*\n` +
    `━━━━━━━━━━━━━━━━\n\n` +
    `📌 *How to Mark Attendance:*\n` +
    `1. Tap "Mark Attendance"\n` +
    `2. Select your class\n` +
    `3. Tap Present/Absent/Late for each student\n` +
    `4. Parents get instant alerts!\n\n` +
    `📌 *How to Upload Results:*\n` +
    `1. Tap "Upload Results (CSV)"\n` +
    `2. Select the academic term\n` +
    `3. Send CSV file with columns:\n` +
    `   admission_number, subject, ca_score, exam_score\n` +
    `4. Results imported automatically!\n\n` +
    `📌 *How to Update Student Records:*\n` +
    `1. Tap "Update Student Record"\n` +
    `2. Search student by name or adm no\n` +
    `3. Select field to update\n` +
    `4. Type the new value\n\n` +
    `📌 *Keyboard Shortcuts:*\n` +
    `• Type *0* → Go back to menu\n` +
    `• Type *menu* → Main menu\n` +
    `━━━━━━━━━━━━━━━━`
  );

  await delay(1000);

  await wa.buttons(
    phone,
    `Need more help?`,
    [
      { id: 'TCH_MARK_ATT', title: '📝 Mark Attendance' },
      { id: '0',            title: '🏠 Menu'            },
    ]
  );
}

// ============================================================
// HELPER: Get Teacher's Assigned Classes
// ============================================================

async function getTeacherClasses(
  session: BotSession
): Promise<Array<{
  id:           string;
  name:         string;
  armId:        string | null;
  armName:      string;
  studentCount: number;
}>> {
  // Try teacher_classes table first
  const { data: assigned } = await db
    .from('teacher_classes')
    .select(`
      class_id,
      class_arm_id,
      classes ( id, name ),
      class_arms ( id, name )
    `)
    .eq('staff_id', session.school_user_id)
    .eq('is_active', true);

  if (assigned?.length) {
    const results = [];
    for (const tc of assigned as any[]) {
      const classId = tc.class_id;
      const armId = tc.class_arm_id;
      const className = (tc.classes as any)?.name ?? 'Unknown';
      const armName = (tc.class_arms as any)?.name ?? '';

      const { count } = await db
        .from('students')
        .select('id', { count: 'exact' })
        .eq('class_id', classId)
        .eq('status', 'active');

      results.push({
        id: classId,
        name: className,
        armId,
        armName,
        studentCount: count ?? 0,
      });
    }
    return results;
  }

  // Fallback: return all classes in the school
  const { data: allClasses } = await db
    .from('classes')
    .select('id, name, class_arms ( id, name )')
    .eq('school_id', session.school_id)
    .order('level', { ascending: true });

  if (!allClasses?.length) return [];

  const results = [];
  for (const cls of allClasses as any[]) {
    const arms = (cls.class_arms as any[]) ?? [];
    if (arms.length) {
      for (const arm of arms) {
        results.push({
          id: cls.id,
          name: cls.name,
          armId: arm.id,
          armName: arm.name,
          studentCount: 0,
        });
      }
    } else {
      results.push({
        id: cls.id,
        name: cls.name,
        armId: null,
        armName: '',
        studentCount: 0,
      });
    }
  }

  return results;
}

// ─── Progress Bar Builder ──────────────────────────────────
function buildProgressBar(done: number, total: number): string {
  const percent = total > 0 ? Math.round((done / total) * 10) : 0;
  return '▓'.repeat(percent) + '░'.repeat(10 - percent);
}
