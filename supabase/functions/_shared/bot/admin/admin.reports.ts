// ============================================================
// SCHOOLBOT - ADMIN REPORTS FLOW
// supabase/functions/_shared/bot/admin/admin.reports.ts
// ============================================================

import { WhatsApp } from '../../whatsapp.ts';
import { SessionService } from '../../session.ts';
import { ReportService } from '../../report.service.ts';
import { PdfService } from '../../pdf.service.ts';
import { getSupabase } from '../../supabase.ts';
import { showAdminMenu } from './admin.menu.ts';
import type { BotSession } from '../../types.ts';

const sessions = new SessionService();
const reportSvc = new ReportService();
const pdfSvc = new PdfService();
const db = getSupabase();

// ─── Start reports flow ────────────────────────────────────────────────────
export async function startReports(
  phone: string,
  session: BotSession,
  wa: WhatsApp
): Promise<void> {
  // Get available terms
  const { data: terms } = await db
    .from('terms')
    .select(`
      id,
      name,
      is_current,
      start_date,
      end_date,
      academic_years ( name )
    `)
    .order('created_at', { ascending: false })
    .limit(6);

  if (!terms?.length) {
    await wa.buttons(
      phone,
      `📊 *Reports*\n\n` +
      `No terms found.\n\n` +
      `Please set up academic terms\n` +
      `before generating reports.`,
      [{ id: 'MAIN_MENU', title: '🏠 Menu' }]
    );
    return;
  }

  // Build term rows
  const rows = terms.map((t) => {
    const year = (
      t.academic_years as Record<string, string> | null
    )?.name ?? '';

    return {
      id: `REPORT_TERM_${t.id}`,
      title:
        `${t.name}${t.is_current ? ' ⭐' : ''}`.substring(0, 24),
      description: year,
    };
  });

  await wa.list(
    phone,
    `📊 Term Reports`,
    `Select a term to generate report:\n\n` +
    `⭐ = Current term`,
    `Comprehensive school analytics`,
    `📊 Select Term`,
    [{ title: 'Available Terms', rows }]
  );

  await sessions.setState(phone, 'ADMIN_REPORTS_MENU');
}

// ─── Handle term selection ─────────────────────────────────────────────────
export async function handleReportTermSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('report_term_')) {
    await startReports(phone, session, wa);
    return;
  }

  const termId = input.replace('report_term_', '');

  // Get term name
  const { data: term } = await db
    .from('terms')
    .select('name, academic_years( name )')
    .eq('id', termId)
    .single();

  const termName = term?.name ?? 'Term';
  const yearName = (
    term?.academic_years as Record<string, string> | null
  )?.name ?? '';

  // Show report type selector
  await wa.list(
    phone,
    `📊 Report Type`,
    `*${termName}* — ${yearName}\n\n` +
    `What type of report do you need?`,
    `Select to generate report`,
    `📊 Choose Report`,
    [
      {
        title: 'Report Types',
        rows: [
          {
            id: `RPT_FULL_${termId}`,
            title: '📊 Full School Report',
            description: 'Attendance + Fees + Classes',
          },
          {
            id: `RPT_ATTENDANCE_${termId}`,
            title: '✅ Attendance Report',
            description: 'Detailed attendance analysis',
          },
          {
            id: `RPT_FEES_${termId}`,
            title: '💰 Fee Collection Report',
            description: 'Payment & collection stats',
          },
          {
            id: `RPT_CLASS_${termId}`,
            title: '📚 By Class Report',
            description: 'Select specific class',
          },
          {
            id: `RPT_STUDENT_${termId}`,
            title: '👤 Individual Student',
            description: 'Single student report',
          },
          {
            id: `RPT_RESULT_${termId}`,
            title: '🎓 Academic Result',
            description: 'Subject scores, grade, position',
          },
        ],
      },
    ]
  );

  // Save selected term
  await sessions.setState(
    phone,
    'ADMIN_REPORTS_MENU',
    null,
    {
      data: {
        selectedTermId: termId,
        selectedTermName: termName,
      },
    }
  );
}

// ─── Handle report type selection ─────────────────────────────────────────
export async function handleReportTypeSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Format: RPT_{TYPE}_{TERM_ID}
  const parts = input.split('_');
  const reportType = parts[1].toLowerCase() as
    | 'full'
    | 'attendance'
    | 'fees'
    | 'class'
    | 'student'
    | 'result';
  const termId = parts.slice(2).join('_');

  // Class report - need to select class first
  if (reportType === 'class') {
    await showClassReportSelector(phone, session, termId, wa);
    return;
  }

  // Student report - need to search student first
  if (reportType === 'student') {
    await wa.text(
      phone,
      `👤 *Individual Student Report*\n\n` +
      `Enter the student's name or\n` +
      `admission number:\n\n` +
      `_Example: John or ADM/2024/001_\n\n` +
      `Type *0* to go back.`
    );

    await sessions.setState(
      phone,
      'ADMIN_REPORT_SEARCH_STUDENT',
      null,
      { data: { reportTermId: termId, reportKind: 'attendance_fee' } }
    );
    return;
  }

  // Academic result — also needs a student search first
  if (reportType === 'result') {
    await wa.text(
      phone,
      `🎓 *Academic Result*\n\n` +
      `Enter the student's name or\n` +
      `admission number:\n\n` +
      `_Example: John or ADM/2024/001_\n\n` +
      `Type *0* to go back.`
    );

    await sessions.setState(
      phone,
      'ADMIN_REPORT_SEARCH_STUDENT',
      null,
      { data: { reportTermId: termId, reportKind: 'result' } }
    );
    return;
  }

  // Generate report directly
  await generateAndSendReport(
    phone,
    session,
    {
      termId,
      reportType,
      classId: undefined,
    },
    wa
  );
}

// ─── Show class selector for class report ─────────────────────────────────
async function showClassReportSelector(
  phone: string,
  session: BotSession,
  termId: string,
  wa: WhatsApp
): Promise<void> {
  const { data: classes } = await db
    .from('classes')
    .select('id, name, level, class_arms( id, name )')
    .eq('school_id', session.school_id)
    .order('level', { ascending: true });

  if (!classes?.length) {
    await wa.text(phone, `❌ No classes found.`);
    return;
  }

  // Build rows - class + arms
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
      for (const arm of arms) {
        rows.push({
          id: `RPT_CLASS_SEL_${termId}_${cls.id}_${arm.id}`,
          title: `${cls.name} ${arm.name}`.substring(0, 24),
          description: 'Class attendance report',
        });
      }
    } else {
      rows.push({
        id: `RPT_CLASS_SEL_${termId}_${cls.id}_NONE`,
        title: String(cls.name).substring(0, 24),
        description: 'Class attendance report',
      });
    }
  }

  await wa.list(
    phone,
    `📚 Select Class`,
    `Which class report do you need?`,
    `Tap a class to generate report`,
    `📚 Choose Class`,
    [{ title: 'Classes', rows: rows.slice(0, 10) }]
  );
}

// ─── Handle class report selection ────────────────────────────────────────
export async function handleClassReportSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  // Format: RPT_CLASS_SEL_{termId}_{classId}_{armId or NONE}
  if (!input.startsWith('rpt_class_sel_')) return;

  const withoutPrefix = input.replace('rpt_class_sel_', '');
  const parts = withoutPrefix.split('_');

  const termId = parts[0];
  const classId = parts[1];

  await generateAndSendReport(
    phone,
    session,
    {
      termId,
      reportType: 'class',
      classId,
    },
    wa
  );
}

// ─── Generate + send either the attendance/fee report or academic result ──
async function sendStudentOrResultReport(
  phone: string,
  studentId: string,
  termId: string,
  reportKind: 'attendance_fee' | 'result',
  wa: WhatsApp
): Promise<void> {
  if (reportKind === 'result') {
    const data = await reportSvc.generateStudentResultData(studentId, termId);

    if (!data) {
      await wa.text(phone, `❌ Student not found.`);
      return;
    }

    const text = reportSvc.formatWhatsAppResult(data);

    await wa.buttons(
      phone,
      text,
      [
        { id: 'ADMIN_REPORTS', title: '📊 More Reports' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );

    try {
      const pdfUrl = await pdfSvc.buildResultPdf(data);
      const student = data.student as Record<string, string>;
      await wa.document(
        phone,
        pdfUrl,
        `Result-${student.admission_number}.pdf`,
        'Academic result'
      );
    } catch (pdfErr) {
      console.error('[Reports] Result PDF generation/send failed:', pdfErr);
    }
    return;
  }

  // Default: attendance/fee student report
  const text = await reportSvc.generateStudentReport(studentId, termId);

  await wa.buttons(
    phone,
    text,
    [
      { id: 'ADMIN_REPORTS', title: '📊 More Reports' },
      { id: 'MAIN_MENU', title: '🏠 Menu' },
    ]
  );

  try {
    const data = await reportSvc.generateStudentReportData(studentId, termId);
    if (data) {
      const pdfUrl = await pdfSvc.buildStudentReportPdf(data);
      const student = data.student as Record<string, string>;
      await wa.document(
        phone,
        pdfUrl,
        `Report-${student.admission_number}.pdf`,
        'Student term report'
      );
    }
  } catch (pdfErr) {
    console.error('[Reports] Student report PDF generation/send failed:', pdfErr);
  }
}

// ─── Handle student search for individual report ───────────────────────────
export async function handleStudentReportSearch(
  phone: string,
  session: BotSession,
  searchText: string,
  wa: WhatsApp
): Promise<void> {
  const termId = session.data?.reportTermId as string;
  const reportKind =
    (session.data?.reportKind as 'attendance_fee' | 'result') ?? 'attendance_fee';
  const kindCode = reportKind === 'result' ? 'res' : 'af';
  const text = searchText.trim();

  if (text.length < 2) {
    await wa.text(
      phone,
      `Please type at least 2 characters to search.`
    );
    return;
  }

  // Search students
  const { data: students } = await db
    .from('students')
    .select(`
      id,
      first_name,
      last_name,
      admission_number,
      classes ( name ),
      class_arms ( name )
    `)
    .eq('school_id', session.school_id)
    .or(
      `first_name.ilike.%${text}%,` +
      `last_name.ilike.%${text}%,` +
      `admission_number.ilike.%${text}%`
    )
    .limit(5);

  if (!students?.length) {
    await wa.buttons(
      phone,
      `❌ No students found for\n*"${text}"*\n\nTry again:`,
      [
        { id: 'ADMIN_REPORTS', title: '📊 Reports' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );
    return;
  }

  // Single result - generate directly
  if (students.length === 1) {
    await sendStudentOrResultReport(phone, students[0].id, termId, reportKind, wa);
    return;
  }

  // Multiple results - show list
  const rows = (students as Record<string, unknown>[]).map((s) => {
    const cls =
      (s.classes as Record<string, string> | null)?.name ?? '';
    const arm =
      (s.class_arms as Record<string, string> | null)?.name ?? '';

    return {
      id: `STUDENT_REPORT_${s.id}_${termId}_${kindCode}`,
      title: `${s.first_name} ${s.last_name}`.substring(0, 24),
      description: `${cls} ${arm} • ${s.admission_number}`,
    };
  });

  await wa.list(
    phone,
    `👤 Select Student`,
    `Found *${students.length}* students\n` +
    `for *"${text}"*:`,
    `Tap to view report`,
    `👤 Select`,
    [{ title: 'Students Found', rows }]
  );
}

// ─── Handle student report selection ──────────────────────────────────────
export async function handleStudentReportSelect(
  phone: string,
  session: BotSession,
  input: string,
  wa: WhatsApp
): Promise<void> {
  if (!input.startsWith('student_report_')) return;

  // Format: student_report_{studentId}_{termId}_{kindCode}
  const withoutPrefix = input.replace('student_report_', '');
  const [studentId, termId, kindCode] = withoutPrefix.split('_');
  const reportKind: 'attendance_fee' | 'result' =
    kindCode === 'res' ? 'result' : 'attendance_fee';

  await wa.text(phone, `⏳ Generating report...`);

  await sendStudentOrResultReport(phone, studentId, termId, reportKind, wa);
}

// ─── Generate and send report ──────────────────────────────────────────────
async function generateAndSendReport(
  phone: string,
  session: BotSession,
  params: {
    termId: string;
    reportType: 'full' | 'attendance' | 'fees' | 'class';
    classId?: string;
  },
  wa: WhatsApp
): Promise<void> {
  await wa.text(phone, `⏳ Generating report...\n\nPlease wait.`);

  try {
    // Generate the report data
    const report = await reportSvc.generateTermReport({
      schoolId: session.school_id,
      termId: params.termId,
      classId: params.classId,
      reportType: params.reportType,
    });

    // Map type to label
    const typeLabels: Record<string, string> = {
      full:       'Full School',
      attendance: 'Attendance',
      fees:       'Fee Collection',
      class:      'Class',
    };

    const label = typeLabels[params.reportType] ?? params.reportType;

    // Format for WhatsApp
    const reportText = reportSvc.formatWhatsAppReport(report, label);

    await wa.buttons(
      phone,
      reportText,
      [
        { id: 'ADMIN_REPORTS', title: '📊 New Report' },
        { id: 'MAIN_MENU', title: '🏠 Menu' },
      ]
    );

    // Also generate and send a downloadable PDF version.
    // Best-effort — a PDF failure shouldn't block the text report
    // the admin already received above.
    try {
      const pdfUrl = await pdfSvc.buildReportPdf(report, label);
      await wa.document(
        phone,
        pdfUrl,
        `${label.replace(/\s+/g, '-')}-Report.pdf`,
        `${label} report`
      );
    } catch (pdfErr) {
      console.error('[Reports] PDF generation/send failed:', pdfErr);
    }
  } catch (err) {
    console.error('[Reports] generateAndSendReport error:', err);
    await wa.text(
      phone,
      `❌ *Report generation failed*\n\n` +
      `Please try again.\n\n` +
      `Error: ${err}`
    );
  }
}
