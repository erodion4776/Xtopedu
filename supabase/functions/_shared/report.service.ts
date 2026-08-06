// ============================================================
// SCHOOLBOT - REPORT SERVICE
// supabase/functions/_shared/report.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';
import type { TermReportData } from './types.ts';

const db = getSupabase();

// ─── Currency formatter ────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

export class ReportService {

  // ─── Generate full term report ─────────────────────────────────────────
  async generateTermReport(params: {
    schoolId: string;
    termId: string;
    classId?: string;
    reportType: 'full' | 'attendance' | 'fees' | 'class';
  }): Promise<TermReportData> {

    // Get school details
    const { data: school } = await db
      .from('schools')
      .select('name, address, phone, email, logo_url')
      .eq('id', params.schoolId)
      .single();

    // Get term details
    const { data: term } = await db
      .from('terms')
      .select(`
        name,
        start_date,
        end_date,
        academic_years ( name )
      `)
      .eq('id', params.termId)
      .single();

    const academicYear = (
      term?.academic_years as Record<string, string> | null
    )?.name ?? '';

    // Build base report
    const report: TermReportData = {
      school: school ?? {},
      term: term?.name ?? '',
      academic_year: academicYear,
      generated_at: new Date().toISOString(),
      report_type: params.reportType,
    };

    // Add attendance section
    if (
      params.reportType === 'full' ||
      params.reportType === 'attendance' ||
      params.reportType === 'class'
    ) {
      report.attendance = await this.getAttendanceData(
        params.schoolId,
        params.termId,
        params.classId
      );
    }

    // Add fees section
    if (
      params.reportType === 'full' ||
      params.reportType === 'fees'
    ) {
      report.fees = await this.getFeesData(
        params.schoolId,
        params.termId
      );
    }

    // Add class breakdown for full report
    if (params.reportType === 'full') {
      report.classes = await this.getClassBreakdown(
        params.schoolId,
        params.termId
      );
    }

    // Save report to database
    await db.from('term_reports').insert({
      school_id: params.schoolId,
      term_id: params.termId,
      academic_year_id: await this.getAcademicYearId(params.termId),
      report_type: params.reportType,
      class_id: params.classId ?? null,
      data: report,
      status: 'ready',
      generated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    return report;
  }

  // ─── Get attendance statistics ─────────────────────────────────────────
  private async getAttendanceData(
    schoolId: string,
    termId: string,
    classId?: string
  ): Promise<TermReportData['attendance']> {

    let query = db
      .from('student_attendance')
      .select('student_id, status, attendance_date, class_id')
      .eq('school_id', schoolId)
      .eq('term_id', termId);

    // Filter by class if provided
    if (classId) {
      query = query.eq('class_id', classId);
    }

    const { data: records } = await query;
    const rows = records ?? [];

    // Count unique school days
    const uniqueDays = new Set(
      rows.map((r) => r.attendance_date)
    ).size;

    // Count unique students
    const uniqueStudents = new Set(
      rows.map((r) => r.student_id)
    ).size;

    // Count by status
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const excused = rows.filter((r) => r.status === 'excused').length;

    // Calculate attendance rate
    const totalRecords = rows.length;
    const attendanceRate =
      totalRecords > 0
        ? Math.round(((present + late) / totalRecords) * 100)
        : 0;

    return {
      total_school_days: uniqueDays,
      total_students: uniqueStudents,
      present,
      absent,
      late,
      excused,
      attendance_rate: `${attendanceRate}%`,
    };
  }

  // ─── Get fee collection statistics ────────────────────────────────────
  private async getFeesData(
    schoolId: string,
    termId: string
  ): Promise<TermReportData['fees']> {

    // Get all invoices for this school
    const { data: invoices } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status')
      .eq('school_id', schoolId);

    const rows = invoices ?? [];

    const totalBilled = rows.reduce(
      (s, r) => s + parseFloat(String(r.amount ?? 0)),
      0
    );

    const totalPaid = rows.reduce(
      (s, r) => s + parseFloat(String(r.amount_paid ?? 0)),
      0
    );

    const totalOutstanding = rows.reduce(
      (s, r) => s + parseFloat(String(r.balance ?? 0)),
      0
    );

    const paidInvoices = rows.filter((r) =>
      ['Paid', 'paid'].includes(r.status)
    ).length;

    const collectionRate =
      totalBilled > 0
        ? `${Math.round((totalPaid / totalBilled) * 100)}%`
        : '0%';

    // Get payment method breakdown
    const { data: payments } = await db
      .from('payments')
      .select('amount, payment_method, paid_at')
      .eq('school_id', schoolId)
      .in('status', ['Success', 'success'])
      .order('paid_at', { ascending: false });

    const paymentMethods = (payments ?? []).reduce(
      (acc, p) => {
        const method = p.payment_method ?? 'Unknown';
        acc[method] =
          (acc[method] ?? 0) + parseFloat(String(p.amount ?? 0));
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      total_billed: totalBilled,
      total_billed_fmt: fmt(totalBilled),
      total_paid: totalPaid,
      total_paid_fmt: fmt(totalPaid),
      total_outstanding: totalOutstanding,
      total_outstanding_fmt: fmt(totalOutstanding),
      collection_rate: collectionRate,
      total_invoices: rows.length,
      paid_invoices: paidInvoices,
      pending_invoices: rows.length - paidInvoices,
      total_transactions: payments?.length ?? 0,
    };
  }

  // ─── Get per-class breakdown ───────────────────────────────────────────
  private async getClassBreakdown(
    schoolId: string,
    termId: string
  ): Promise<TermReportData['classes']> {

    const { data: classes } = await db
      .from('classes')
      .select('id, name, level, class_arms(id, name)')
      .eq('school_id', schoolId)
      .order('level', { ascending: true });

    const breakdown = [];

    for (const cls of classes ?? []) {
      // Count students
      const { count: studentCount } = await db
        .from('students')
        .select('id', { count: 'exact' })
        .eq('class_id', cls.id)
        .eq('status', 'active');

      // Get attendance for this class
      const { data: attRecords } = await db
        .from('student_attendance')
        .select('status')
        .eq('class_id', cls.id)
        .eq('term_id', termId);

      const present = (attRecords ?? []).filter(
        (r) => r.status === 'present'
      ).length;

      const total = (attRecords ?? []).length;

      const rate =
        total > 0
          ? Math.round((present / total) * 100)
          : 0;

      const arms = (
        cls.class_arms as Array<{ name: string }> | null
      )?.map((a) => a.name) ?? [];

      breakdown.push({
        class: cls.name,
        arms,
        students: studentCount ?? 0,
        attendance_rate: `${rate}%`,
      });
    }

    return breakdown;
  }

  // ─── Generate individual student report ────────────────────────────────
  async generateStudentReport(
    studentId: string,
    termId: string
  ): Promise<string> {

    // Get student details
    const { data: student } = await db
      .from('students')
      .select(`
        first_name,
        last_name,
        admission_number,
        classes ( name ),
        class_arms ( name )
      `)
      .eq('id', studentId)
      .single();

    if (!student) {
      return '❌ Student not found.';
    }

    const className =
      (student.classes as Record<string, string> | null)?.name ?? '';
    const armName =
      (student.class_arms as Record<string, string> | null)?.name ?? '';

    // Get attendance for this term
    const { data: attRecords } = await db
      .from('student_attendance')
      .select('status, attendance_date, arrival_time')
      .eq('student_id', studentId)
      .eq('term_id', termId)
      .order('attendance_date', { ascending: false });

    const rows = attRecords ?? [];
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const excused = rows.filter((r) => r.status === 'excused').length;
    const total = rows.length;

    const rate =
      total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;

    const rateIcon =
      rate >= 90 ? '🟢' : rate >= 75 ? '🟡' : '🔴';

    // Get fee invoices
    const { data: invoices } = await db
      .from('student_invoices')
      .select(`
        amount,
        amount_paid,
        balance,
        status,
        fee_structures ( title )
      `)
      .eq('student_id', studentId);

    const feeRows = invoices ?? [];
    const totalOwed = feeRows.reduce(
      (s, r) => s + parseFloat(String(r.balance ?? 0)),
      0
    );
    const totalFeePaid = feeRows.reduce(
      (s, r) => s + parseFloat(String(r.amount_paid ?? 0)),
      0
    );

    // Recent attendance (last 5)
    const recentLines = rows
      .slice(0, 5)
      .map((r) => {
        const icons: Record<string, string> = {
          present: '✅',
          absent: '❌',
          late: '⏰',
          excused: '📋',
        };
        const date = new Date(r.attendance_date).toLocaleDateString(
          'en-NG',
          { weekday: 'short', day: 'numeric', month: 'short' }
        );
        return `${icons[r.status] ?? '•'} ${date}`;
      })
      .join('\n');

    // Build report message
    return (
      `📋 *Student Term Report*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${student.first_name} ${student.last_name}*\n` +
      `📋 Adm No: ${student.admission_number}\n` +
      `🏫 Class: ${className} ${armName}\n\n` +
      `✅ *Attendance:*\n` +
      `${rateIcon} Rate: *${rate}%*\n` +
      `Present: ${present} | Absent: ${absent}\n` +
      `Late: ${late} | Excused: ${excused}\n` +
      `Total Days: ${total}\n\n` +
      (recentLines
        ? `*Last 5 Records:*\n${recentLines}\n\n`
        : '') +
      `💰 *Fees:*\n` +
      (feeRows.length
        ? feeRows
            .map((inv) => {
              const fs = inv.fee_structures as Record<
                string,
                string
              > | null;
              const balance = parseFloat(String(inv.balance ?? 0));
              const status =
                balance <= 0 ? '✅ Paid' : `⚠️ ${fmt(balance)} owed`;
              return `• ${fs?.title ?? 'Fee'}: ${status}`;
            })
            .join('\n') +
          `\n\nTotal Paid: *${fmt(totalFeePaid)}*\n` +
          (totalOwed > 0
            ? `Outstanding: *${fmt(totalOwed)}*`
            : `All fees paid! ✅`)
        : '_No fee records found_') +
      `\n━━━━━━━━━━━━━━━━`
    );
  }

  // ─── Format report as WhatsApp message ────────────────────────────────
  formatWhatsAppReport(
    report: TermReportData,
    typeLabel: string
  ): string {
    const school = report.school as Record<string, string>;
    const att = report.attendance;
    const fees = report.fees;

    const header =
      `📊 *${typeLabel.toUpperCase()} REPORT*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🏫 *${school?.name ?? 'School'}*\n` +
      `📚 Term: *${report.term}*\n` +
      `📅 Year: *${report.academic_year}*\n` +
      `━━━━━━━━━━━━━━━━\n\n`;

    
