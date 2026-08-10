// ============================================================
// SCHOOLBOT - RECEIPT SERVICE
// supabase/functions/_shared/receipt.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';
import { WhatsApp } from './whatsapp.ts';
import { PdfService } from './pdf.service.ts';

const db = getSupabase();
const pdfSvc = new PdfService();

const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

export class ReceiptService {

  // ─── Generate receipt for a payment ─────────────────────────
  async generateReceipt(paymentId: string): Promise<{
    receiptId: string;
    receiptNumber: string;
    receiptText: string;
    data: Record<string, unknown>;
  }> {
    const { data: existing } = await db
      .from('fee_receipts')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (existing) {
      const school = await this.getSchool(
        existing.school_id as string
      );
      return {
        receiptId: existing.id as string,
        receiptNumber: existing.receipt_number as string,
        receiptText: this.buildShortReceiptText(existing, school),
        data: existing,
      };
    }

    const { data: payment } = await db
      .from('payments')
      .select(`
        id, amount, payment_method, gateway,
        gateway_reference, paid_at, created_at,
        school_id, student_id, invoice_id,
        students (
          first_name, last_name, admission_number,
          classes ( name ), class_arms ( name )
        ),
        student_invoices (
          invoice_number, amount, amount_paid, balance, status,
          fee_structures (
            title, terms ( name ), academic_years ( name )
          )
        ),
        schools ( name, address, phone, email, logo_url )
      `)
      .eq('id', paymentId)
      .single();

    if (!payment) {
      throw new Error('Payment not found');
    }

    const student = payment.students as Record<string, unknown> | null;
    const invoice = payment.student_invoices as Record<string, unknown> | null;
    const school = payment.schools as Record<string, unknown> | null;
    const feeStructure = invoice?.fee_structures as Record<string, unknown> | null;
    const cls = (student?.classes as Record<string, string> | null)?.name ?? '';
    const arm = (student?.class_arms as Record<string, string> | null)?.name ?? '';

    const { data: studentParent } = await db
      .from('student_parents')
      .select('parents ( full_name, phone, whatsapp_number )')
      .eq('student_id', payment.student_id as string)
      .eq('is_primary', true)
      .single();

    const parent = studentParent?.parents as Record<string, string> | null;

    const schoolSlug = (school?.name as string ?? 'SCH')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);

    const { data: receiptNumData } = await db
      .rpc('generate_receipt_number', { school_slug: schoolSlug });

    const receiptNumber = receiptNumData as string;
    const paymentDate = payment.paid_at ?? payment.created_at;
    const amount = parseFloat(String(payment.amount ?? 0));

    const receiptData = {
      school_id: payment.school_id,
      payment_id: paymentId,
      student_id: payment.student_id,
      invoice_id: payment.invoice_id,
      receipt_number: receiptNumber,
      amount_paid: amount,
      payment_method: payment.payment_method,
      payment_date: paymentDate,
      issued_to: parent?.full_name ??
        `${student?.first_name} ${student?.last_name}`,
      issued_by: school?.name ?? 'School',
      notes: null,
      sent_to_parent: false,
      created_at: new Date().toISOString(),
    };

    const { data: receipt, error } = await db
      .from('fee_receipts')
      .insert(receiptData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save receipt: ${error.message}`);
    }

    const receiptText = this.buildFullReceiptText({
      receiptNumber,
      schoolName: school?.name as string ?? 'School',
      schoolAddress: school?.address as string | null,
      schoolPhone: school?.phone as string | null,
      studentFirstName: student?.first_name as string ?? '',
      studentLastName: student?.last_name as string ?? '',
      admissionNumber: student?.admission_number as string ?? '',
      className: `${cls} ${arm}`.trim(),
      feeTitle: (feeStructure?.title as string) ?? 'School Fee',
      term: (feeStructure?.terms as Record<string, string> | null)?.name,
      academicYear: (feeStructure?.academic_years as Record<string, string> | null)?.name,
      amount,
      paymentMethod: payment.payment_method as string,
      reference: payment.gateway_reference as string,
      paymentDate,
      issuedTo: parent?.full_name ??
        `${student?.first_name} ${student?.last_name}`,
    });

    return {
      receiptId: receipt?.id ?? '',
      receiptNumber,
      receiptText,
      data: receipt ?? receiptData,
    };
  }

  // ─── Build full receipt text ─────────────────────────────────
  private buildFullReceiptText(params: {
    receiptNumber: string;
    schoolName: string;
    schoolAddress: string | null;
    schoolPhone: string | null;
    studentFirstName: string;
    studentLastName: string;
    admissionNumber: string;
    className: string;
    feeTitle: string;
    term?: string;
    academicYear?: string;
    amount: number;
    paymentMethod: string;
    reference: string;
    paymentDate: string;
    issuedTo: string;
  }): string {
    const date = new Date(params.paymentDate).toLocaleDateString(
      'en-NG',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );

    const time = new Date(params.paymentDate).toLocaleTimeString(
      'en-NG',
      { hour: '2-digit', minute: '2-digit' }
    );

    const methodIcons: Record<string, string> = {
      card: '💳',
      bank: '🏦',
      transfer: '🏦',
      bank_transfer: '🏦',
      cash: '💵',
      ussd: '📱',
      mobile_money: '📱',
      online: '💻',
      manual: '🖊️',
    };

    const method = (params.paymentMethod ?? 'online').toLowerCase();
    const methodIcon = methodIcons[method] ?? '💳';

    return (
      `🧾 *PAYMENT RECEIPT*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🏫 *${params.schoolName}*\n` +
      (params.schoolAddress ? `📍 ${params.schoolAddress}\n` : '') +
      (params.schoolPhone ? `📞 ${params.schoolPhone}\n` : '') +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🔖 *Receipt No:* ${params.receiptNumber}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${time}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *Issued To:* ${params.issuedTo}\n` +
      `👨‍🎓 *Student:* ${params.studentFirstName} ${params.studentLastName}\n` +
      `📋 *Adm No:* ${params.admissionNumber}\n` +
      `🏫 *Class:* ${params.className}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `💰 *PAYMENT DETAILS*\n\n` +
      `📋 *Fee:* ${params.feeTitle}\n` +
      (params.term ? `📚 *Term:* ${params.term}\n` : '') +
      (params.academicYear ? `📅 *Year:* ${params.academicYear}\n` : '') +
      `\n` +
      `${methodIcon} *Method:* ${params.paymentMethod ?? 'Online'}\n` +
      `🔖 *Reference:* ${params.reference}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💵 *AMOUNT PAID*\n` +
      `*${fmt(params.amount)}*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `✅ *Payment Confirmed*\n\n` +
      `_This is an official payment receipt.\n` +
      `Please keep this for your records._\n\n` +
      `🏫 *${params.schoolName}*\n` +
      `_Powered by SchoolBot_`
    );
  }

  // ─── Build short receipt text ────────────────────────────────
  private buildShortReceiptText(
    receipt: Record<string, unknown>,
    school: Record<string, unknown> | null
  ): string {
    const date = receipt.payment_date
      ? new Date(receipt.payment_date as string).toLocaleDateString(
          'en-NG',
          { day: 'numeric', month: 'long', year: 'numeric' }
        )
      : 'N/A';

    return (
      `🧾 *PAYMENT RECEIPT*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `🏫 *${(school?.name as string) ?? 'School'}*\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🔖 *Receipt:* ${receipt.receipt_number}\n` +
      `📅 *Date:* ${date}\n` +
      `👤 *Issued To:* ${receipt.issued_to}\n` +
      `💵 *Amount:* ${fmt(parseFloat(String(receipt.amount_paid ?? 0)))}\n` +
      `💳 *Method:* ${receipt.payment_method ?? 'Online'}\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ *Payment Confirmed*\n\n` +
      `_Powered by SchoolBot_`
    );
  }

  // ─── Send receipt to parent via WhatsApp ─────────────────────
  async sendReceiptToParent(
    receiptId: string,
    parentPhone: string,
    waAccount: Record<string, unknown> | null
  ): Promise<void> {
    const { data: receipt } = await db
      .from('fee_receipts')
      .select(`
        *,
        schools ( name, address, phone ),
        students (
          first_name, last_name, admission_number,
          classes ( name ), class_arms ( name )
        ),
        payments (
          payment_method, gateway_reference,
          student_invoices (
            fee_structures (
              title, terms ( name ), academic_years ( name )
            )
          )
        )
      `)
      .eq('id', receiptId)
      .single();

    if (!receipt) return;

    const school = receipt.schools as Record<string, unknown> | null;
    const student = receipt.students as Record<string, unknown> | null;
    const payment = receipt.payments as Record<string, unknown> | null;
    const invoice = payment?.student_invoices as Record<string, unknown> | null;
    const fs = invoice?.fee_structures as Record<string, unknown> | null;
    const cls = (student?.classes as Record<string, string> | null)?.name ?? '';
    const arm = (student?.class_arms as Record<string, string> | null)?.name ?? '';

    const receiptText = this.buildFullReceiptText({
      receiptNumber: receipt.receipt_number as string,
      schoolName: school?.name as string ?? 'School',
      schoolAddress: school?.address as string | null,
      schoolPhone: school?.phone as string | null,
      studentFirstName: student?.first_name as string ?? '',
      studentLastName: student?.last_name as string ?? '',
      admissionNumber: student?.admission_number as string ?? '',
      className: `${cls} ${arm}`.trim(),
      feeTitle: (fs?.title as string) ?? 'School Fee',
      term: (fs?.terms as Record<string, string> | null)?.name,
      academicYear: (fs?.academic_years as Record<string, string> | null)?.name,
      amount: parseFloat(String(receipt.amount_paid ?? 0)),
      paymentMethod: receipt.payment_method as string,
      reference: payment?.gateway_reference as string,
      paymentDate: receipt.payment_date as string,
      issuedTo: receipt.issued_to as string,
    });

    const wa = new WhatsApp(
      waAccount as { phone_number_id: string; access_token: string; status: string } | null
    );

    await wa.text(parentPhone, receiptText);

    // Also generate and send a downloadable PDF version. This is
    // best-effort — if PDF generation/upload fails for any reason,
    // the parent still has the text receipt above, so we don't
    // let a PDF failure block the rest of the flow.
    try {
      const pdfUrl = await pdfSvc.buildReceiptPdf({
        receiptNumber: receipt.receipt_number as string,
        schoolName: school?.name as string ?? 'School',
        schoolAddress: school?.address as string | null,
        schoolPhone: school?.phone as string | null,
        studentName: `${student?.first_name ?? ''} ${student?.last_name ?? ''}`.trim(),
        admissionNumber: student?.admission_number as string ?? '',
        className: `${cls} ${arm}`.trim(),
        feeTitle: (fs?.title as string) ?? 'School Fee',
        term: (fs?.terms as Record<string, string> | null)?.name,
        academicYear: (fs?.academic_years as Record<string, string> | null)?.name,
        amount: parseFloat(String(receipt.amount_paid ?? 0)),
        paymentMethod: receipt.payment_method as string,
        reference: payment?.gateway_reference as string,
        paymentDate: receipt.payment_date as string,
        issuedTo: receipt.issued_to as string,
      });

      await wa.document(
        parentPhone,
        pdfUrl,
        `Receipt-${receipt.receipt_number}.pdf`,
        'Your official payment receipt'
      );
    } catch (pdfErr) {
      console.error('[ReceiptService] PDF generation/send failed:', pdfErr);
    }

    await db
      .from('fee_receipts')
      .update({
        sent_to_parent: true,
        sent_at: new Date().toISOString(),
      })
      .eq('id', receiptId);

    await db.from('notifications').insert({
      school_id: receipt.school_id,
      channel: 'whatsapp',
      type: 'payment_receipt',
      recipient: parentPhone,
      title: `Receipt: ${receipt.receipt_number}`,
      message: `Receipt for ${fmt(parseFloat(String(receipt.amount_paid ?? 0)))} sent`,
      status: 'sent',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }

  // ─── Get school details ──────────────────────────────────────
  private async getSchool(
    schoolId: string
  ): Promise<Record<string, unknown> | null> {
    const { data } = await db
      .from('schools')
      .select('id, name, address, phone, email, logo_url')
      .eq('id', schoolId)
      .single();
    return data as Record<string, unknown> | null;
  }

  // ─── Get recent receipts ─────────────────────────────────────
  async getRecentReceipts(
    schoolId: string,
    limit = 10
  ): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('fee_receipts')
      .select(`
        id, receipt_number, amount_paid, payment_method,
        payment_date, issued_to, sent_to_parent,
        students ( first_name, last_name, admission_number )
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(limit);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Get unsent receipts ─────────────────────────────────────
  async getUnsentReceipts(
    schoolId: string
  ): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('fee_receipts')
      .select(`
        id, receipt_number, amount_paid, payment_method,
        payment_date, issued_to, payment_id,
        students ( first_name, last_name )
      `)
      .eq('school_id', schoolId)
      .eq('sent_to_parent', false)
      .order('created_at', { ascending: false })
      .limit(20);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Search receipts by reference ───────────────────────────
  async searchReceipts(
    schoolId: string,
    searchText: string
  ): Promise<Record<string, unknown>[]> {
    const { data } = await db
      .from('payments')
      .select(`
        id, amount, payment_method, gateway_reference,
        paid_at, status,
        students ( first_name, last_name, admission_number )
      `)
      .eq('school_id', schoolId)
      .in('status', ['Success', 'success'])
      .ilike('gateway_reference', `%${searchText}%`)
      .order('paid_at', { ascending: false })
      .limit(5);

    return (data ?? []) as Record<string, unknown>[];
  }

  // ─── Search payments by student name ────────────────────────
  async searchPaymentsByStudent(
    schoolId: string,
    searchText: string
  ): Promise<Record<string, unknown>[]> {
    const { data: students } = await db
      .from('students')
      .select('id')
      .eq('school_id', schoolId)
      .or(
        `first_name.ilike.%${searchText}%,` +
        `last_name.ilike.%${searchText}%,` +
        `admission_number.ilike.%${searchText}%`
      )
      .limit(5);

    if (!students?.length) return [];

    const studentIds = students.map((s) => s.id);

    const { data } = await db
      .from('payments')
      .select(`
        id, amount, payment_method, gateway_reference,
        paid_at, status,
        students ( first_name, last_name, admission_number )
      `)
      .eq('school_id', schoolId)
      .in('status', ['Success', 'success'])
      .in('student_id', studentIds)
      .order('paid_at', { ascending: false })
      .limit(8);

    return (data ?? []) as Record<string, unknown>[];
  }
}
