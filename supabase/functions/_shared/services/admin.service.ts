// ============================================================
// SCHOOLBOT - ADMIN SERVICE
// supabase/functions/_shared/services/admin.service.ts
// ============================================================

import { getSupabase } from '../supabase.ts';
import type { SchoolUser, Student } from '../types.ts';

const db = getSupabase();

export class AdminService {

  // ─── Find staff member by phone number ────────────────────────────────
  // Checks staff table (has whatsapp_number field)
  // Returns their school_user record with role info
  async findStaffByPhone(phone: string): Promise<SchoolUser | null> {
    const variants = this.getPhoneVariants(phone);

    for (const variant of variants) {
      const { data } = await db
        .from('staff')
        .select(`
          id,
          school_id,
          phone,
          whatsapp_number,
          employment_status,
          school_user_id,
          school_users (
            id,
            school_id,
            user_id,
            role_id,
            status,
            roles (
              id,
              name
            ),
            profiles (
              id,
              full_name,
              phone,
              avatar_url
            )
          ),
          schools (
            id,
            name,
            is_active,
            subscription_status
          )
        `)
        .or(`phone.eq.${variant},whatsapp_number.eq.${variant}`)
        .eq('employment_status', 'active')
        .single();

      if (data?.school_users) {
        // Check school is active
        const school = (data as Record<string, unknown>).schools as
          | { is_active: boolean }
          | null;

        if (!school?.is_active) return null;

        return data.school_users as unknown as SchoolUser;
      }
    }

    return null;
  }

  // ─── Check if school user is admin level ──────────────────────────────
  isAdmin(schoolUser: SchoolUser): boolean {
    const roleName = schoolUser.roles?.name?.toLowerCase() ?? '';
    return [
      'admin',
      'super_admin',
      'principal',
      'proprietor',
      'owner',
      'manager',
      'bursar',
      'head_teacher',
    ].includes(roleName);
  }

  // ─── Check if school user is a teacher ────────────────────────────────
  isTeacher(schoolUser: SchoolUser): boolean {
    const roleName = schoolUser.roles?.name?.toLowerCase() ?? '';
    return [
      'teacher',
      'class_teacher',
      'subject_teacher',
      'tutor',
    ].includes(roleName);
  }

  // ─── Get all classes for a school ─────────────────────────────────────
  async getClasses(schoolId: string): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('classes')
      .select(`
        id,
        name,
        level,
        class_arms (
          id,
          name
        )
      `)
      .eq('school_id', schoolId)
      .order('level', { ascending: true });

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Get students in a specific class ─────────────────────────────────
  async getClassStudents(
    classId: string,
    armId?: string
  ): Promise<Student[]> {
    let query = db
      .from('students')
      .select(`
        id,
        school_id,
        first_name,
        last_name,
        admission_number,
        status,
        gender,
        class_id,
        class_arm_id,
        classes ( id, name ),
        class_arms ( id, name )
      `)
      .eq('class_id', classId)
      .eq('status', 'active')
      .order('first_name', { ascending: true });

    if (armId) {
      query = query.eq('class_arm_id', armId);
    }

    const { data } = await query;

    return ((data ?? []) as Record<string, unknown>[]).map((s) => {
      const cls = s.classes as { id: string; name: string } | null;
      const arm = s.class_arms as { id: string; name: string } | null;

      return {
        id: s.id as string,
        school_id: s.school_id as string,
        first_name: s.first_name as string,
        last_name: s.last_name as string,
        middle_name: null,
        admission_number: s.admission_number as string,
        status: s.status as string,
        gender: s.gender as string | null,
        date_of_birth: null,
        class_id: s.class_id as string | null,
        class_arm_id: s.class_arm_id as string | null,
        passport_url: null,
        classes: cls,
        class_arms: arm,
        // Default permissions for admin view
        relationship: null,
        is_primary: false,
        can_receive_attendance: true,
        can_receive_fee_notifications: true,
        can_receive_results: true,
        can_pickup: false,
        // Computed
        full_name: `${s.first_name} ${s.last_name}`,
        class_name: cls?.name ?? '',
        arm_name: arm?.name ?? '',
      } as Student;
    });
  }

  // ─── Search students by name or admission number ───────────────────────
  async searchStudents(
    schoolId: string,
    searchQuery: string
  ): Promise<Student[]> {
    const { data } = await db
      .from('students')
      .select(`
        id,
        school_id,
        first_name,
        last_name,
        admission_number,
        status,
        gender,
        class_id,
        class_arm_id,
        classes ( id, name ),
        class_arms ( id, name )
      `)
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .or(
        `first_name.ilike.%${searchQuery}%,` +
        `last_name.ilike.%${searchQuery}%,` +
        `admission_number.ilike.%${searchQuery}%`
      )
      .order('first_name', { ascending: true })
      .limit(10);

    return ((data ?? []) as Record<string, unknown>[]).map((s) => {
      const cls = s.classes as { id: string; name: string } | null;
      const arm = s.class_arms as { id: string; name: string } | null;

      return {
        id: s.id as string,
        school_id: s.school_id as string,
        first_name: s.first_name as string,
        last_name: s.last_name as string,
        middle_name: null,
        admission_number: s.admission_number as string,
        status: s.status as string,
        gender: s.gender as string | null,
        date_of_birth: null,
        class_id: s.class_id as string | null,
        class_arm_id: s.class_arm_id as string | null,
        passport_url: null,
        classes: cls,
        class_arms: arm,
        relationship: null,
        is_primary: false,
        can_receive_attendance: true,
        can_receive_fee_notifications: true,
        can_receive_results: true,
        can_pickup: false,
        full_name: `${s.first_name} ${s.last_name}`,
        class_name: cls?.name ?? '',
        arm_name: arm?.name ?? '',
      } as Student;
    });
  }

  // ─── Get student outstanding fees ─────────────────────────────────────
  async getStudentOutstandingFees(
    studentId: string,
    schoolId: string
  ): Promise<{
    invoices: Record<string, unknown>[];
    total: number;
  }> {
    const { data } = await db
      .from('student_invoices')
      .select(`
        id,
        invoice_number,
        amount,
        amount_paid,
        balance,
        status,
        due_date,
        fee_structures (
          title,
          terms ( name ),
          academic_years ( name )
        )
      `)
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .not('status', 'in', '("Paid","paid")')
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    const invoices = ((data ?? []) as Record<string, unknown>[]).map(
      (inv) => {
        const fs = inv.fee_structures as Record<string, unknown> | null;
        return {
          ...inv,
          title:
            (fs?.title as string) ??
            `Invoice #${inv.invoice_number}`,
          balance: parseFloat(String(inv.balance ?? 0)),
          amount: parseFloat(String(inv.amount ?? 0)),
          amount_paid: parseFloat(String(inv.amount_paid ?? 0)),
          is_overdue: inv.due_date
            ? new Date(inv.due_date as string) < new Date()
            : false,
        };
      }
    );

    const total = invoices.reduce((s, inv) => s + (inv.balance as number), 0);

    return { invoices, total };
  }

  // ─── Record manual cash or bank payment ───────────────────────────────
  async recordManualPayment(params: {
    schoolId: string;
    studentId: string;
    invoiceId: string;
    amount: number;
    method: string;
    reference: string;
    recordedBy: string;
  }): Promise<void> {
    // Save payment record
    await db.from('payments').insert({
      school_id: params.schoolId,
      student_id: params.studentId,
      invoice_id: params.invoiceId,
      amount: params.amount,
      payment_method: params.method,
      gateway: 'manual',
      gateway_reference: params.reference,
      transaction_reference: params.reference,
      status: 'Success',
      paid_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Update invoice balance
    const { data: invoice } = await db
      .from('student_invoices')
      .select('amount, amount_paid')
      .eq('id', params.invoiceId)
      .single();

    if (invoice) {
      const newPaid =
        parseFloat(String(invoice.amount_paid ?? 0)) + params.amount;
      const newBalance = Math.max(
        0,
        parseFloat(String(invoice.amount)) - newPaid
      );

      await db
        .from('student_invoices')
        .update({
          amount_paid: newPaid,
          balance: newBalance,
          status: newBalance <= 0 ? 'Paid' : 'Partial',
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.invoiceId);
    }
  }

  // ─── Get fee collection stats for school ──────────────────────────────
  async getFeeStats(schoolId: string): Promise<{
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    collectionRate: number;
    paidCount: number;
    pendingCount: number;
    total: number;
  }> {
    const { data } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status')
      .eq('school_id', schoolId);

    const rows = data ?? [];
    const n = (v: unknown) => parseFloat(String(v ?? 0));

    const totalBilled = rows.reduce((s, r) => s + n(r.amount), 0);
    const totalCollected = rows.reduce(
      (s, r) => s + n(r.amount_paid),
      0
    );
    const totalOutstanding = rows.reduce(
      (s, r) => s + n(r.balance),
      0
    );

    const paidCount = rows.filter((r) =>
      ['Paid', 'paid'].includes(r.status)
    ).length;

    const collectionRate =
      totalBilled > 0
        ? Math.round((totalCollected / totalBilled) * 100)
        : 0;

    return {
      totalBilled,
      totalCollected,
      totalOutstanding,
      collectionRate,
      paidCount,
      pendingCount: rows.length - paidCount,
      total: rows.length,
    };
  }

  // ─── Get students with outstanding fees ───────────────────────────────
  async getStudentsWithOutstandingFees(
    schoolId: string,
    limit = 10
  ): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('student_invoices')
      .select(`
        balance,
        due_date,
        status,
        students (
          id,
          first_name,
          last_name,
          admission_number,
          classes ( name ),
          class_arms ( name )
        ),
        fee_structures ( title )
      `)
      .eq('school_id', schoolId)
      .not('status', 'in', '("Paid","paid")')
      .gt('balance', 0)
      .order('balance', { ascending: false })
      .limit(limit);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Get all active staff for a school ────────────────────────────────
  async getStaff(schoolId: string): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('staff')
      .select(`
        id,
        first_name,
        last_name,
        phone,
        whatsapp_number,
        department,
        employment_status,
        staff_invitations (
          status,
          token,
          expires_at
        )
      `)
      .eq('school_id', schoolId)
      .eq('employment_status', 'active')
      .order('first_name', { ascending: true });

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Add new staff member ──────────────────────────────────────────────
  async addStaff(params: {
    schoolId: string;
    firstName: string;
    lastName: string;
    phone: string;
    department?: string;
    role: string;
    invitedBy: string;
  }): Promise<{ staffId: string; token: string }> {
    // Create staff record
    const { data: staff, error } = await db
      .from('staff')
      .insert({
        school_id: params.schoolId,
        first_name: params.firstName,
        last_name: params.lastName,
        phone: params.phone,
        whatsapp_number: params.phone,
        department: params.department ?? null,
        employment_status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !staff) {
      throw new Error(`Failed to create staff: ${error?.message}`);
    }

    // Generate invite token
    const token = this.generateToken();

    // Save invitation
    await db.from('staff_invitations').insert({
      school_id: params.schoolId,
      invited_by: params.invitedBy,
      staff_id: staff.id,
      phone: params.phone,
      token,
      role: params.role,
      status: 'pending',
      expires_at: new Date(
        Date.now() + 48 * 60 * 60 * 1000
      ).toISOString(),
      created_at: new Date().toISOString(),
    });

    return { staffId: staff.id, token };
  }

  // ─── Deactivate staff member ───────────────────────────────────────────
  async deactivateStaff(staffId: string): Promise<void> {
    // Get staff phone before deactivating
    const { data: staff } = await db
      .from('staff')
      .select('phone, whatsapp_number')
      .eq('id', staffId)
      .single();

    // Deactivate
    await db
      .from('staff')
      .update({
        employment_status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', staffId);

    // Expire their invitations
    await db
      .from('staff_invitations')
      .update({ status: 'expired' })
      .eq('staff_id', staffId);

    // Delete their bot session so they lose access
    if (staff) {
      const phone =
        staff.whatsapp_number ?? staff.phone;
      if (phone) {
        await db
          .from('bot_sessions')
          .delete()
          .eq('phone', phone);
      }
    }
  }

  // ─── Log admin action ──────────────────────────────────────────────────
  async logAction(
    schoolId: string,
    adminId: string,
    action: string,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      await db.from('whatsapp_admin_logs').insert({
        school_id: schoolId,
        admin_id: adminId,
        action,
        details,
        performed_via: 'whatsapp',
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      // Non-critical - don't throw
      console.warn('[AdminService] logAction error:', err);
    }
  }

  // ─── Get school WhatsApp account ───────────────────────────────────────
  async getWaAccount(
    schoolId: string
  ): Promise<Record<string, unknown> | null> {
    const { data } = await db
      .from('whatsapp_accounts')
      .select('id, school_id, phone_number_id, access_token, status')
      .eq('school_id', schoolId)
      .eq('status', 'active')
      .single();

    return data as Record<string, unknown> | null;
  }

  // ─── Get attendance settings for school ───────────────────────────────
  async getAttendanceSettings(schoolId: string): Promise<{
    notify_absent: boolean;
    notify_late: boolean;
    notify_present: boolean;
    auto_close_hour: number;
  }> {
    const { data } = await db
      .from('attendance_settings')
      .select(
        'notify_absent, notify_late, notify_present, auto_close_hour'
      )
      .eq('school_id', schoolId)
      .single();

    // Return defaults if no settings found
    return {
      notify_absent: data?.notify_absent ?? true,
      notify_late: data?.notify_late ?? true,
      notify_present: data?.notify_present ?? false,
      auto_close_hour: data?.auto_close_hour ?? 15,
    };
  }

  // ─── Send broadcast message to parents ────────────────────────────────
  async getBroadcastTargets(
    schoolId: string,
    target: 'all_parents' | 'class_parents' | 'debtors',
    classId?: string
  ): Promise<Array<{ phone: string; name: string }>> {
    if (target === 'all_parents') {
      const { data } = await db
        .from('parents')
        .select('full_name, phone, whatsapp_number')
        .eq('school_id', schoolId);

      return (data ?? []).map((p) => ({
        phone: p.whatsapp_number ?? p.phone,
        name: p.full_name,
      }));
    }

    if (target === 'class_parents' && classId) {
      const { data } = await db
        .from('student_parents')
        .select(`
          parents (
            full_name,
            phone,
            whatsapp_number
          ),
          students!inner ( class_id )
        `)
        .eq('students.class_id', classId);

      const seen = new Set<string>();
      const results: Array<{ phone: string; name: string }> = [];

      for (const sp of data ?? []) {
        const p = sp.parents as Record<string, string> | null;
        if (!p) continue;
        const phone = p.whatsapp_number ?? p.phone;
        if (!phone || seen.has(phone)) continue;
        seen.add(phone);
        results.push({ phone, name: p.full_name });
      }

      return results;
    }

    if (target === 'debtors') {
      const { data } = await db
        .from('student_invoices')
        .select(`
          students (
            student_parents (
              parents (
                full_name,
                phone,
                whatsapp_number
              )
            )
          )
        `)
        .eq('school_id', schoolId)
        .not('status', 'in', '("Paid","paid")')
        .gt('balance', 0);

      const seen = new Set<string>();
      const results: Array<{ phone: string; name: string }> = [];

      for (const inv of data ?? []) {
        const student = inv.students as Record<string, unknown> | null;
        const sps = student?.student_parents as
          | Record<string, unknown>[]
          | null;

        for (const sp of sps ?? []) {
          const p = sp.parents as Record<string, string> | null;
          if (!p) continue;
          const phone = p.whatsapp_number ?? p.phone;
          if (!phone || seen.has(phone)) continue;
          seen.add(phone);
          results.push({ phone, name: p.full_name });
        }
      }

      return results;
    }

    return [];
  }

  // ─── Notify parent of manual payment ──────────────────────────────────
  async notifyParentOfPayment(
    studentId: string,
    schoolId: string,
    amount: number,
    method: string,
    reference: string,
    feeTitle: string
  ): Promise<void> {
    try {
      // Get parent phone
      const { data: sps } = await db
        .from('student_parents')
        .select(`
          parents (
            full_name,
            phone,
            whatsapp_number
          ),
          students (
            first_name,
            last_name
          )
        `)
        .eq('student_id', studentId)
        .limit(1);

      if (!sps?.length) return;

      const sp = sps[0] as Record<string, unknown>;
      const parent = sp.parents as Record<string, string> | null;
      const student = sp.students as Record<string, string> | null;

      if (!parent) return;

      const parentPhone = parent.whatsapp_number ?? parent.phone;
      if (!parentPhone) return;

      // Get school WA account
      const { data: waAccount } = await db
        .from('whatsapp_accounts')
        .select('phone_number_id, access_token, status')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .single();

      const { WhatsApp } = await import('../whatsapp.ts');
      const wa = new WhatsApp(
        waAccount as
          | { phone_number_id: string; access_token: string; status: string }
          | null
      );

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(n);

      await wa.text(
        parentPhone,
        `🎉 *Payment Confirmed!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `✅ Payment has been recorded.\n\n` +
        `👤 *Student:* ${student?.first_name} ${student?.last_name}\n` +
        `📋 *Fee:* ${feeTitle}\n` +
        `💵 *Amount:* ${fmt(amount)}\n` +
        `💳 *Method:* ${method}\n` +
        `🔖 *Ref:* ${reference}\n` +
        `📅 *Date:* ${new Date().toLocaleDateString('en-NG', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}\n` +
        `━━━━━━━━━━━━━━━━\n\n` +
        `Thank you! 🙏`
      );

      // Log notification
      await db.from('notifications').insert({
        school_id: schoolId,
        channel: 'whatsapp',
        type: 'payment_confirmation',
        recipient: parentPhone,
        title: `Payment Confirmed`,
        message: `Payment of ${fmt(amount)} recorded`,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[AdminService] notifyParent error:', err);
    }
  }

  // ─── Format currency ───────────────────────────────────────────────────
  currency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  }

  // ─── Generate invite token ─────────────────────────────────────────────
  generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from(
      { length: 8 },
      () => chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  }

  // ─── Phone number utilities ────────────────────────────────────────────
  getPhoneVariants(phone: string): string[] {
    const cleaned = phone.replace(/\D/g, '');
    const variants = new Set<string>([phone, cleaned]);

    if (cleaned.startsWith('234') && cleaned.length === 13) {
      variants.add('0' + cleaned.slice(3));
    }

    if (cleaned.startsWith('0') && cleaned.length === 11) {
      variants.add('234' + cleaned.slice(1));
    }

    return [...variants];
  }

  formatPhone(phone: string): string {
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0') && p.length === 11) {
      p = '234' + p.slice(1);
    }
    return p;
  }
}
