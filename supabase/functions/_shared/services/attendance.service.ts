// ============================================================
// SCHOOLBOT - ATTENDANCE SERVICE
// supabase/functions/_shared/services/attendance.service.ts
// ============================================================

import { getSupabase } from '../supabase.ts';

const db = getSupabase();

export class AttendanceService {

  // ─── Get today's attendance for a student ─────────────────────────────
  async getToday(studentId: string): Promise<{
    status: string;
    arrival_time: string | null;
    departure_time: string | null;
    remarks: string | null;
    attendance_date: string;
  } | null> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await db
      .from('student_attendance')
      .select(
        'status, arrival_time, departure_time, remarks, attendance_date'
      )
      .eq('student_id', studentId)
      .eq('attendance_date', today)
      .single();

    if (error || !data) return null;

    return data as {
      status: string;
      arrival_time: string | null;
      departure_time: string | null;
      remarks: string | null;
      attendance_date: string;
    };
  }

  // ─── Get term attendance summary ───────────────────────────────────────
  async getTermSummary(
    studentId: string,
    schoolId: string
  ): Promise<{
    termName: string;
    total: number;
    present: number;
    absent: number;
    late: number;
    excused: number;
    recent: Array<{
      status: string;
      attendance_date: string;
    }>;
  }> {
    // Get current term
    const { data: term } = await db
      .from('terms')
      .select('id, name')
      .eq('is_current', true)
      .single();

    // Build attendance query
    let query = db
      .from('student_attendance')
      .select('status, attendance_date')
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .order('attendance_date', { ascending: false });

    // Filter by current term if available
    if (term) {
      query = query.eq('term_id', term.id);
    }

    const { data: records } = await query;
    const rows = records ?? [];

    return {
      termName: term?.name ?? 'Current Term',
      total: rows.length,
      present: rows.filter((r) => r.status === 'present').length,
      absent: rows.filter((r) => r.status === 'absent').length,
      late: rows.filter((r) => r.status === 'late').length,
      excused: rows.filter((r) => r.status === 'excused').length,
      // Last 7 records for preview
      recent: rows.slice(0, 7),
    };
  }

  // ─── Get attendance for last N days ───────────────────────────────────
  async getRecentDays(
    studentId: string,
    days = 7
  ): Promise<
    Array<{
      status: string;
      attendance_date: string;
      arrival_time: string | null;
      remarks: string | null;
    }>
  > {
    const start = new Date(Date.now() - days * 86400000)
      .toISOString()
      .split('T')[0];

    const end = new Date().toISOString().split('T')[0];

    const { data } = await db
      .from('student_attendance')
      .select('status, attendance_date, arrival_time, remarks')
      .eq('student_id', studentId)
      .gte('attendance_date', start)
      .lte('attendance_date', end)
      .order('attendance_date', { ascending: false });

    return (data ?? []) as Array<{
      status: string;
      attendance_date: string;
      arrival_time: string | null;
      remarks: string | null;
    }>;
  }

  // ─── Get attendance for a date range ──────────────────────────────────
  async getByDateRange(
    studentId: string,
    startDate: string,
    endDate: string
  ): Promise<
    Array<{
      status: string;
      attendance_date: string;
      arrival_time: string | null;
      departure_time: string | null;
      remarks: string | null;
    }>
  > {
    const { data } = await db
      .from('student_attendance')
      .select(
        'status, attendance_date, arrival_time, departure_time, remarks'
      )
      .eq('student_id', studentId)
      .gte('attendance_date', startDate)
      .lte('attendance_date', endDate)
      .order('attendance_date', { ascending: false });

    return (data ?? []) as Array<{
      status: string;
      attendance_date: string;
      arrival_time: string | null;
      departure_time: string | null;
      remarks: string | null;
    }>;
  }

  // ─── Get today's class attendance summary ──────────────────────────────
  // Used by admin to see class overview
  async getClassSummaryToday(
    classId: string,
    armId?: string
  ): Promise<{
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
    rate: number;
  }> {
    const today = new Date().toISOString().split('T')[0];

    let query = db
      .from('student_attendance')
      .select('status')
      .eq('class_id', classId)
      .eq('attendance_date', today);

    if (armId) {
      query = query.eq('class_arm_id', armId);
    }

    const { data } = await query;
    const rows = data ?? [];

    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const excused = rows.filter((r) => r.status === 'excused').length;
    const total = rows.length;

    const rate =
      total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;

    return { present, absent, late, excused, total, rate };
  }

  // ─── Get school-wide attendance today ─────────────────────────────────
  async getSchoolSummaryToday(schoolId: string): Promise<{
    present: number;
    absent: number;
    late: number;
    total: number;
    rate: number;
    rateIcon: string;
  }> {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await db
      .from('student_attendance')
      .select('status')
      .eq('school_id', schoolId)
      .eq('attendance_date', today);

    const rows = data ?? [];
    const present = rows.filter((r) => r.status === 'present').length;
    const absent = rows.filter((r) => r.status === 'absent').length;
    const late = rows.filter((r) => r.status === 'late').length;
    const total = rows.length;

    const rate =
      total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;

    return {
      present,
      absent,
      late,
      total,
      rate,
      rateIcon:
        rate >= 90 ? '🟢' : rate >= 75 ? '🟡' : '🔴',
    };
  }

  // ─── Mark a single student attendance ─────────────────────────────────
  async markStudent(params: {
    studentId: string;
    schoolId: string;
    classId: string;
    classArmId: string | null;
    status: 'present' | 'absent' | 'late' | 'excused';
    markedBy: string;
    arrivalTime?: string;
    remarks?: string;
  }): Promise<Record<string, unknown> | null> {
    const today = new Date().toISOString().split('T')[0];

    // Get current term
    const { data: term } = await db
      .from('terms')
      .select('id, academic_year_id')
      .eq('is_current', true)
      .single();

    // Upsert attendance record
    // Uses UNIQUE constraint on student_id + attendance_date + school_id
    const { data, error } = await db
      .from('student_attendance')
      .upsert(
        {
          school_id: params.schoolId,
          student_id: params.studentId,
          class_id: params.classId,
          class_arm_id: params.classArmId,
          term_id: term?.id ?? null,
          academic_year_id: term?.academic_year_id ?? null,
          attendance_date: today,
          status: params.status,
          arrival_time: params.arrivalTime ?? null,
          remarks: params.remarks ?? null,
          marked_by: params.markedBy,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'student_id,attendance_date,school_id',
        }
      )
      .select()
      .single();

    if (error) {
      console.error('[AttendanceService] markStudent error:', error);
      return null;
    }

    return data as Record<string, unknown>;
  }

  // ─── Get already marked students for today ────────────────────────────
  async getMarkedStudentsToday(
    classId: string,
    armId?: string
  ): Promise<Array<{ student_id: string; status: string }>> {
    const today = new Date().toISOString().split('T')[0];

    let query = db
      .from('student_attendance')
      .select('student_id, status')
      .eq('class_id', classId)
      .eq('attendance_date', today);

    if (armId) {
      query = query.eq('class_arm_id', armId);
    }

    const { data } = await query;

    return (data ?? []) as Array<{
      student_id: string;
      status: string;
    }>;
  }

  // ─── Check if attendance session is open ──────────────────────────────
  async getOpenSession(
    schoolId: string,
    classId: string,
    armId?: string
  ): Promise<Record<string, unknown> | null> {
    const today = new Date().toISOString().split('T')[0];

    let query = db
      .from('attendance_sessions')
      .select('id, status, opened_at, closed_at, attendance_date')
      .eq('school_id', schoolId)
      .eq('class_id', classId)
      .eq('attendance_date', today)
      .eq('status', 'open');

    if (armId) {
      query = query.eq('class_arm_id', armId);
    }

    const { data } = await query.single();
    return data as Record<string, unknown> | null;
  }

  // ─── Open a new attendance session ────────────────────────────────────
  async openSession(
    schoolId: string,
    classId: string,
    armId: string | null,
    openedBy: string
  ): Promise<Record<string, unknown> | null> {
    const today = new Date().toISOString().split('T')[0];

    // Get current term
    const { data: term } = await db
      .from('terms')
      .select('id, academic_year_id')
      .eq('is_current', true)
      .single();

    const { data, error } = await db
      .from('attendance_sessions')
      .insert({
        school_id: schoolId,
        class_id: classId,
        class_arm_id: armId,
        term_id: term?.id ?? null,
        academic_year_id: term?.academic_year_id ?? null,
        attendance_date: today,
        opened_by: openedBy,
        opened_at: new Date().toISOString(),
        status: 'open',
      })
      .select()
      .single();

    if (error) {
      console.error('[AttendanceService] openSession error:', error);
      return null;
    }

    return data as Record<string, unknown>;
  }

  // ─── Close an attendance session ──────────────────────────────────────
  async closeSession(
    sessionId: string,
    closedBy: string
  ): Promise<void> {
    await db
      .from('attendance_sessions')
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);
  }

  // ─── Send attendance notification to parents ───────────────────────────
  // Calls the attendance-notify edge function
  async triggerParentNotification(
    attendanceRecord: Record<string, unknown>,
    schoolId: string
  ): Promise<void> {
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

      await fetch(
        `${supabaseUrl}/functions/v1/attendance-notify`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: attendanceRecord.id,
            student_id: attendanceRecord.student_id,
            school_id: schoolId,
            status: attendanceRecord.status,
            attendance_date: attendanceRecord.attendance_date,
            arrival_time: attendanceRecord.arrival_time,
            remarks: attendanceRecord.remarks,
          }),
        }
      );
    } catch (err) {
      // Don't crash if notification fails
      console.warn('[AttendanceService] triggerNotification error:', err);
    }
  }

  // ─── Format status with emoji ──────────────────────────────────────────
  emoji(status: string): string {
    const map: Record<string, string> = {
      present: '✅ Present',
      absent:  '❌ Absent',
      late:    '⏰ Late',
      excused: '📋 Excused',
      holiday: '🏖️ Holiday',
    };
    return map[status] ?? status;
  }

  // ─── Status icon only ─────────────────────────────────────────────────
  icon(status: string): string {
    const map: Record<string, string> = {
      present: '✅',
      absent:  '❌',
      late:    '⏰',
      excused: '📋',
      holiday: '🏖️',
    };
    return map[status] ?? '•';
  }

  // ─── Format date for display ───────────────────────────────────────────
  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  // ─── Format time for display ───────────────────────────────────────────
  formatTime(timeStr: string | null): string {
    if (!timeStr) return '';
    // timeStr is in HH:MM:SS format from DB
    const parts = timeStr.split(':');
    const hours = parseInt(parts[0]);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }
}
