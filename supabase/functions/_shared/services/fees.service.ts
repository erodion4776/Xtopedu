// ============================================================
// SCHOOLBOT - FEES SERVICE
// supabase/functions/_shared/services/fees.service.ts
// ============================================================

import { getSupabase } from '../supabase.ts';
import {
  PaystackService,
  calculateTotalCharge,
} from '../paystack.service.ts';
import type { Invoice } from '../types.ts';

const db       = getSupabase();
const paystack = new PaystackService();

export class FeesService {

  // ─── Get outstanding invoices for a student ────────────────────────────
  async getOutstanding(
    studentId: string,
    schoolId:  string
  ): Promise<{
    invoices: Invoice[];
    total:    number;
  }> {
    const { data, error } = await db
      .from('student_invoices')
      .select(`
        id,
        invoice_number,
        amount,
        amount_paid,
        balance,
        status,
        due_date,
        school_id,
        student_id,
        fee_structures (
          title,
          terms ( name ),
          academic_years ( name ),
          fee_categories ( name )
        )
      `)
      .eq('student_id', studentId)
      .eq('school_id', schoolId)
      .not('status', 'in', '("Paid","paid")')
      .gt('balance', 0)
      .order('due_date', { ascending: true });

    if (error) {
      console.error(
        '[FeesService] getOutstanding error:', error
      );
      return { invoices: [], total: 0 };
    }

    const invoices = (
      (data ?? []) as Record<string, unknown>[]
    ).map((row) => {
      const fs =
        row.fee_structures as
          Record<string, unknown> | null;

      return {
        id:               row.id as string,
        school_id:        row.school_id as string,
        student_id:       row.student_id as string,
        invoice_number:
          row.invoice_number as string | null,
        amount:
          parseFloat(String(row.amount ?? 0)),
        amount_paid:
          parseFloat(String(row.amount_paid ?? 0)),
        balance:
          parseFloat(String(row.balance ?? 0)),
        status:  row.status as string,
        due_date:
          row.due_date as string | null,
        title:
          (fs?.title as string) ??
          `Invoice #${row.invoice_number}`,
        is_overdue: row.due_date
          ? new Date(row.due_date as string) < new Date()
          : false,
      } as Invoice;
    });

    const total = invoices.reduce(
      (sum, inv) => sum + inv.balance, 0
    );

    return { invoices, total };
  }

  // ─── Get payment history for a student ────────────────────────────────
  async getHistory(
    studentId: string,
    limit      = 5
  ): Promise<Record<string, unknown>[]> {
    const { data, error } = await db
      .from('payments')
      .select(`
        id,
        amount,
        payment_method,
        gateway,
        gateway_reference,
        status,
        paid_at,
        created_at,
        student_invoices (
          invoice_number,
          fee_structures ( title )
        )
      `)
      .eq('student_id', studentId)
      .in('status', ['Success', 'success', 'Successful'])
      .order('paid_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(
        '[FeesService] getHistory error:', error
      );
      return [];
    }

    return (
      (data ?? []) as Record<string, unknown>[]
    ).map((p) => {
      const inv =
        p.student_invoices as
          Record<string, unknown> | null;
      const fs =
        inv?.fee_structures as
          Record<string, string> | null;

      return {
        ...p,
        amount: parseFloat(String(p.amount ?? 0)),
        invoice_title:
          fs?.title ??
          `Invoice #${inv?.invoice_number ?? ''}`,
        paid_date: p.paid_at ?? p.created_at,
      };
    });
  }

  // ─── Get fee summary for a student ────────────────────────────────────
  async getSummary(
    studentId: string,
    schoolId:  string
  ): Promise<{
    totalBilled:      number;
    totalPaid:        number;
    totalOutstanding: number;
    invoiceCount:     number;
    paidCount:        number;
    pendingCount:     number;
  }> {
    const { data } = await db
      .from('student_invoices')
      .select('amount, amount_paid, balance, status')
      .eq('student_id', studentId)
      .eq('school_id', schoolId);

    const rows = data ?? [];
    const n    = (v: unknown) =>
      parseFloat(String(v ?? 0));

    return {
      totalBilled:
        rows.reduce((s, r) => s + n(r.amount), 0),
      totalPaid:
        rows.reduce((s, r) => s + n(r.amount_paid), 0),
      totalOutstanding:
        rows.reduce((s, r) => s + n(r.balance), 0),
      invoiceCount: rows.length,
      paidCount: rows.filter((r) =>
        ['Paid', 'paid'].includes(r.status)
      ).length,
      pendingCount: rows.filter(
        (r) => !['Paid', 'paid'].includes(r.status)
      ).length,
    };
  }

  // ─── Start online payment via Paystack ────────────────────────────────
  async startPayment(params: {
    invoiceId:       string;
    studentId:       string;
    schoolId:        string;
    email:           string;
    phone:           string;
    schoolFeeAmount: number;
  }): Promise<{
    reference: string;
    payUrl:    string;
    charges:   ReturnType<typeof calculateTotalCharge>;
  } | null> {
    try {
      const reference = paystack.generateRef();
      const appUrl    = Deno.env.get('APP_URL')!;

      // Calculate what parent will pay
      const charges =
        calculateTotalCharge(params.schoolFeeAmount);

      // Save pending payment record BEFORE redirecting
      const { error: insertError } = await db
        .from('payments')
        .insert({
          school_id:             params.schoolId,
          student_id:            params.studentId,
          invoice_id:            params.invoiceId,
          amount:                params.schoolFeeAmount,
          payment_method:        'online',
          gateway:               'paystack',
          gateway_reference:     reference,
          transaction_reference: reference,
          status:                'Pending',
          created_at:            new Date().toISOString(),
        });

      if (insertError) {
        console.error(
          '[FeesService] Failed to save pending payment:',
          insertError.message
        );
        return null;
      }

      // Initialize Paystack payment with split
      const result =
        await paystack.initializeSchoolFeePayment({
          email:
            params.email ||
            `${params.phone}@schoolbot.ng`,
          schoolFeeAmount: params.schoolFeeAmount,
          reference,
          invoiceId:  params.invoiceId,
          studentId:  params.studentId,
          schoolId:   params.schoolId,
          parentPhone: params.phone,
          callbackUrl:
            `${appUrl}/functions/v1/payment-callback` +
            `?ref=${reference}`,
        });

      return {
        reference,
        payUrl: result.paymentUrl,
        charges,
      };
    } catch (err) {
      console.error(
        '[FeesService] startPayment error:', err
      );
      return null;
    }
  }

  // ─── Verify payment after Paystack callback ────────────────────────────
  async verifyPayment(reference: string) {
    return paystack.verifySchoolFee(reference);
  }

  // ─── Update invoice after payment ─────────────────────────────────────
  async updateInvoice(
    invoiceId:  string,
    amountPaid: number
  ): Promise<void> {
    return paystack.updateInvoice(invoiceId, amountPaid);
  }

  // ─── Get invoices due soon ─────────────────────────────────────────────
  async getInvoicesDueSoon(
    daysAhead = 3
  ): Promise<Record<string, unknown>[]> {
    const today = new Date().toISOString().split('T')[0];

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const dueBefore =
      futureDate.toISOString().split('T')[0];

    const { data } = await db
      .from('student_invoices')
      .select(`
        id, amount, balance, due_date,
        school_id, student_id,
        fee_structures ( title ),
        students (
          id, first_name, last_name,
          student_parents (
            can_receive_fee_notifications,
            parents (
              id, full_name, phone, whatsapp_number
            )
          )
        )
      `)
      .not('status', 'in', '("Paid","paid")')
      .gte('due_date', today)
      .lte('due_date', dueBefore)
      .gt('balance', 0);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Get overdue invoices ──────────────────────────────────────────────
  async getOverdueInvoices(): Promise<
    Record<string, unknown>[]
  > {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await db
      .from('student_invoices')
      .select(`
        id, amount, balance, due_date,
        school_id, student_id,
        fee_structures ( title ),
        students (
          id, first_name, last_name,
          student_parents (
            can_receive_fee_notifications,
            parents (
              id, full_name, phone, whatsapp_number
            )
          )
        )
      `)
      .not('status', 'in', '("Paid","paid")')
      .lt('due_date', today)
      .gt('balance', 0);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Check if reminder already sent today ─────────────────────────────
  async reminderSentToday(
    invoiceId:    string,
    parentId:     string,
    reminderType: string
  ): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];

    const { data } = await db
      .from('payment_reminders')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('parent_id', parentId)
      .eq('reminder_type', reminderType)
      .gte('created_at', today)
      .single();

    return !!data;
  }

  // ─── Save reminder record ──────────────────────────────────────────────
  async saveReminder(
    invoiceId:    string,
    parentId:     string,
    reminderType: string
  ): Promise<void> {
    await db.from('payment_reminders').insert({
      invoice_id:    invoiceId,
      parent_id:     parentId,
      channel:       'whatsapp',
      reminder_type: reminderType,
      sent:          true,
      sent_at:       new Date().toISOString(),
      created_at:    new Date().toISOString(),
    });
  }

  // ─── Format currency ───────────────────────────────────────────────────
  currency(amount: number): string {
    return paystack.currency(amount);
  }

  // ─── Due date label with color indicator ──────────────────────────────
  dueLabel(dueDate: string | null): string {
    if (!dueDate) return 'No due date';

    const diffDays = Math.ceil(
      (new Date(dueDate).getTime() - Date.now()) / 86400000
    );

    const formatted = new Date(dueDate)
      .toLocaleDateString('en-NG', {
        day:   'numeric',
        month: 'short',
        year:  'numeric',
      });

    if (diffDays < 0) {
      return `⚠️ Overdue (${formatted})`;
    }
    if (diffDays === 0) {
      return `🔴 Due TODAY`;
    }
    if (diffDays <= 3) {
      return `🟡 Due in ${diffDays} days (${formatted})`;
    }
    return `📅 Due: ${formatted}`;
  }

  // ─── Get charges breakdown for display ────────────────────────────────
  getCharges(schoolFeeAmount: number) {
    return calculateTotalCharge(schoolFeeAmount);
  }
}
