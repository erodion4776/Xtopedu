// ============================================================
// SCHOOLBOT - REPORT SERVICE
// supabase/functions/_shared/report.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';

const db = getSupabase();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

export class ReportService {

  // ─── Generate full term report ───────────────────────────────
  async generateTermReport(params: {
    schoolId: string;
    termId: string;
    classId?: string;
    reportType: 'full' | 'attendance' | 'fees' | 'class';
  }): Promise<Record<string, unknown>> {
    const { data: school } = await db
      .from('schools')
      .select('name, address, phone, email, logo_url')
      .eq('id', params.schoolId)
      .single();

    const { data: term } = await db
      .from('terms')
      .select('name, start_date, end_date, academic_years ( name )')
      .eq('id', params.termId)
      .single();

    const academicYear = (
      term?.academic_years as Record<string, string> | null
    )?.name ?? '';

    const report: Record<string, unknown> = {
      school: school ?? {},
      term: term?.name ?? '',
      academic_year: academicYear,
      generated_at: new Date().toISOString(),
      report_type: params.reportType,
    };

    if (['full', 'attendance', 'class'].includes(params.reportType)) {
      report.attendance = await this.getAttendanceData(
        params.schoolId,
        params.termId,
        params.classId
      );
    }

    if (['full', 'fees'].includes(params.reportType)) {
      report.fees = await this.getFeesData(
        params.schoolId,
        params.termId
      );
    }

    if (params.reportType === 'full') {
      report.classes = await this.getClassBreakdown(
        params.schoolId,
        params.termId
      );
    }

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

  // ─── Attendance data ─────────────────────────────────────────
  private async getAttendanceData(
    schoolId: string,
    termId: string,
    classId?: string
  ): Promise<Record<string, unknown>> {
    let query = db
      .from('student_attendance')
      .select('student_id, status, attendance_date, class_id')
      .eq('school_id', schoolId)
      .eq('term_id', termId);

    if (classId) query = query.eq('class_id', classId);

    const { data: records } = await query;
    const rows = records ?? [];

    const uniqueDays = new Set(rows.map((r) => r.attendance_date)).size;
    const uniqueStudents = new Set(rows.map((r) => r.student_id)).size;

    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const excused = rows.filter((r) => r.status === 'excused').length;

    const attendanceRate =
      rows.length > 0
        ? Math.round(((present + late) / rows.length) * 100)
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

  // ─── Fees data ────────────────────────────────────────────────
  private async getFeesData(
    schoolId: string,
    termId: string
  ): Promise<Record<string, unknown>> {
    const { data: invoices } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status')
      .eq('school_id', schoolId);

    const rows = invoices ?? [];

    const totalBilled = rows.reduce(
      (s, r) => s + parseFloat(String(r.amount ?? 0)), 0
    );
    const totalPaid = rows.reduce(
      (s, r) => s + parseFloat(String(r.amount_paid ?? 0)), 0
    );
    const totalOutstanding = rows.reduce(
      (s, r) => s + parseFloat(String(r.balance ?? 0)), 0
    );

    const paidInvoices = rows.filter((r) =>
      ['Paid', 'paid'].includes(r.status)
    ).length;

    const collectionRate =
      totalBilled > 0
        ? `${Math.round((totalPaid / totalBilled) * 100)}%`
        : '0%';

    const { data: payments } = await db
      .from('payments')
      .select('amount, payment_method, paid_at')
      .eq('school_id', schoolId)
      .in('status', ['Success', 'success'])
      .order('paid_at', { ascending: false });

    const paymentMethods = (payments ?? []).reduce(
      (acc, p) => {
        const method = p.payment_method ?? 'Unknown';
        acc[method] = (acc[method] ?? 0) + parseFloat(String(p.amount ?? 0));
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
      payment_methods: paymentMethods,
      total_transactions: payments?.length ?? 0,
    };
  }

  // ─── Class breakdown ─────────────────────────────────────────
  private async getClassBreakdown(
    schoolId: string,
    termId: string
  ): Promise<Array<Record<string, unknown>>> {
    const { data: classes } = await db
      .from('classes')
      .select('id, name, level, class_arms ( id, name )')
      .eq('school_id', schoolId)
      .order('level', { ascending: true });

    const breakdown = [];

    for (const cls of classes ?? []) {
      const { count: studentCount } = await db
        .from('students')
        .select('id', { count: 'exact' })
        .eq('class_id', cls.id)
        .eq('status', 'active');

      const { data: attRecords } = await db
        .from('student_attendance')
        .select('status')
        .eq('class_id', cls.id)
        .eq('term_id', termId);

      const present = (attRecords ?? []).filter(
        (r) => r.status === 'present'
      ).length;
      const total = (attRecords ?? []).length;
      const rate = total > 0 ? Math.round((present / total) * 100) : 0;

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

  // ─── Generate individual student report ──────────────────────
  async generateStudentReport(
    studentId: string,
    termId: string
  ): Promise<string> {
    const { data: student } = await db
      .from('students')
      .select(`
        first_name, last_name, admission_number,
        classes ( name ), class_arms ( name )
      `)
      .eq('id', studentId)
      .single();

    if (!student) return '❌ Student not found.';

    const className =
      (student.classes as Record<string, string> | null)?.name ?? '';
    const armName =
      (student.class_arms as Record<string, string> | null)?.name ?? '';

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
    const total = rows.length;
    const rate =
      total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;
    const rateIcon = rate >= 90 ? '🟢' : rate >= 75 ? '🟡' : '🔴';

    const { data: invoices } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status, fee_structures ( title )')
      .eq('student_id', studentId);

    const feeRows = invoices ?? [];
    const totalOwed = feeRows.reduce(
      (s, r) => s + parseFloat(String(r.balance ?? 0)), 0
    );
    const totalFeePaid = feeRows.reduce(
      (s, r) => s + parseFloat(String(r.amount_paid ?? 0)), 0
    );

    const recentLines = rows
      .slice(0, 5)
      .map((r) => {
        const icons: Record<string, string> = {
          present: '✅', absent: '❌', late: '⏰', excused: '📋',
        };
        const date = new Date(r.attendance_date).toLocaleDateString(
          'en-NG',
          { weekday: 'short', day: 'numeric', month: 'short' }
        );
        return `${icons[r.status] ?? '•'} ${date}`;
      })
      .join('\n');

    return (
      `📋 *Student Term Report*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *${student.first_name} ${student.last_name}*\n` +
      `📋 Adm No: ${student.admission_number}\n` +
      `🏫 Class: ${className} ${armName}\n\n` +
      `✅ *Attendance:*\n` +
      `${rateIcon} Rate: *${rate}%*\n` +
      `Present: ${present} | Absent: ${absent}\n` +
      `Late: ${late} | Total: ${total}\n\n` +
      (recentLines ? `*Last 5 Records:*\n${recentLines}\n\n` : '') +
      `💰 *Fees:*\n` +
      (feeRows.length
        ? feeRows
            .map((inv) => {
              const fs = inv.fee_structures as Record<string, string> | null;
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

  // ─── Format WhatsApp report ───────────────────────────────────
  formatWhatsAppReport(
    report: Record<string, unknown>,
    typeLabel: string
  ): string {
    const school = report.school as Record<string, string>;
    const att = report.attendance as Record<string, unknown> | null;
    const fees = report.fees as Record<string, unknown> | null;

    const header =
      `📊 *${typeLabel.toUpperCase()} REPORT*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🏫 *${school?.name ?? 'School'}*\n` +
      `📚 Term: *${report.term}*\n` +
      `📅 Year: *${report.academic_year}*\n` +
      `━━━━━━━━━━━━━━━━\n\n`;

    let body = '';

    if (att) {
      body +=
        `✅ *ATTENDANCE*\n` +
        `School Days:  *${att.total_school_days}*\n` +
        `Students:     *${att.total_students}*\n` +
        `Present:      *${att.present}*\n` +
        `Absent:       *${att.absent}*\n` +
        `Late:         *${att.late}*\n` +
        `Rate:         *${att.attendance_rate}*\n\n`;
    }

    if (fees) {
      body +=
        `💰 *FEE COLLECTION*\n` +
        `Billed:       *${fees.total_billed_fmt}*\n` +
        `Collected:    *${fees.total_paid_fmt}*\n` +
        `Outstanding:  *${fees.total_outstanding_fmt}*\n` +
        `Rate:         *${fees.collection_rate}*\n` +
        `Paid:         *${fees.paid_invoices}* invoices\n` +
        `Pending:      *${fees.pending_invoices}* invoices\n\n`;
    }

    if (report.classes) {
      const classes = report.classes as Array<Record<string, unknown>>;
      body += `📚 *CLASS BREAKDOWN*\n`;
      for (const cls of classes) {
        body +=
          `• *${cls.class}*: ` +
          `${cls.students} students, ` +
          `${cls.attendance_rate} attendance\n`;
      }
      body += '\n';
    }

    const footer =
      `━━━━━━━━━━━━━━━━\n` +
      `📅 Generated: ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}`;

    return header + body + footer;
  }

  // ─── Get today stats ──────────────────────────────────────────
  async getTodayStats(schoolId: string): Promise<{
    date: string;
    present: number;
    absent: number;
    late: number;
    total: number;
    rate: number;
    rateIcon: string;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const { data: records } = await db
      .from('student_attendance')
      .select('status')
      .eq('school_id', schoolId)
      .eq('attendance_date', today);

    const rows = records ?? [];
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const total = rows.length;
    const rate =
      total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    return {
      date: today,
      present,
      absent,
      late,
      total,
      rate,
      rateIcon: rate >= 90 ? '🟢' : rate >= 75 ? '🟡' : '🔴',
    };
  }

  // ─── Get fee stats ────────────────────────────────────────────
  async getFeeStats(schoolId: string): Promise<{
    totalBilled: number;
    totalBilledFmt: string;
    totalCollected: number;
    totalCollectedFmt: string;
    totalOutstanding: number;
    totalOutstandingFmt: string;
    collectionRate: number;
    rateIcon: string;
    paidCount: number;
    pendingCount: number;
    total: number;
  }> {
    const { data: invoices } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status')
      .eq('school_id', schoolId);

    const rows = invoices ?? [];
    const n = (v: unknown) => parseFloat(String(v ?? 0));

    const totalBilled = rows.reduce((s, r) => s + n(r.amount), 0);
    const totalCollected = rows.reduce((s, r) => s + n(r.amount_paid), 0);
    const totalOutstanding = rows.reduce((s, r) => s + n(r.balance), 0);

    const paidCount = rows.filter((r) =>
      ['Paid', 'paid'].includes(r.status)
    ).length;

    const collectionRate =
      totalBilled > 0
        ? Math.round((totalCollected / totalBilled) * 100)
        : 0;

    return {
      totalBilled,
      totalBilledFmt: fmt(totalBilled),
      totalCollected,
      totalCollectedFmt: fmt(totalCollected),
      totalOutstanding,
      totalOutstandingFmt: fmt(totalOutstanding),
      collectionRate,
      rateIcon:
        collectionRate >= 80 ? '🟢' : collectionRate >= 60 ? '🟡' : '🔴',
      paidCount,
      pendingCount: rows.length - paidCount,
      total: rows.length,
    };
  }

  // ─── Get academic year ID ─────────────────────────────────────
  private async getAcademicYearId(
    termId: string
  ): Promise<string | null> {
    const { data } = await db
      .from('terms')
      .select('academic_year_id')
      .eq('id', termId)
      .single();
    return data?.academic_year_id ?? null;
  }
}
