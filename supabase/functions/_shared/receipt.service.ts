// ============================================================
// SCHOOLBOT - RECEIPT SERVICE
// supabase/functions/_shared/receipt.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';
import { WhatsApp } from './whatsapp.ts';

const db = getSupabase();

// ─── Currency formatter ────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
  }).format(n);

export class ReceiptService {

  // ─── Generate receipt for a payment ───────────────────────────────────
  async generateReceipt(paymentId: string): Promise<{
    receiptId: string;
    receiptNumber: string;
    receiptText: string;
    data: Record<string, unknown>;
  }> {
    // Check if receipt already exists for this payment
    const { data: existing } = await db
      .from('fee_receipts')
      .select('*')
      .eq('payment_id', paymentId)
      .single();

    if (existing) {
      // Return existing receipt
      const school = await this.getSchool(
        existing.school_id as string
      );
      return {
        receiptId: existing.id as string,
        receiptNumber: existing.receipt_number as string,
        receiptText: this.buildReceiptText(existing, school),
        data: existing,
      };
    }

    // Get full payment details
    const { data: payment } = await db
      .from('payments')
      .select(`
        id,
        amount,
        payment_method,
        gateway,
        gateway_reference,
        transaction_reference,
        paid_at,
        created_at,
        school_id,
        student_id,
        invoice_id,
        students (
          first_name,
          last_name,
          admission_number,
          classes ( name ),
          class_arms ( name )
        ),
        student_invoices (
          invoice_number,
          amount,
          amount_paid,
          balance,
          status,
          fee_structures (
            title,
            terms ( name ),
            academic_years ( name )
          )
        ),
        schools (
          name,
          address,
          phone,
          email,
          logo_url
        )
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

    // Get parent info
    const { data: studentParent } = await db
      .from('student_parents')
      .select('parents ( full_name, phone, whatsapp_number )')
      .eq('student_id', payment.student_id as string)
      .eq('is_primary', true)
      .single();

    const parent = studentParent?.parents as Record<string, string> | null;

    // Generate unique receipt number using DB function
    const schoolSlug = (school?.name as string ?? 'SCH')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 5);

    const { data: receiptNumData } = await db
      .rpc('generate_receipt_number', { school_slug: schoolSlug });

    const receiptNumber = receiptNumData as string;
    const paymentDate = payment.paid_at ?? payment.created_at;
    const amount = parseFloat(String(payment.amount ?? 0));

    // Build receipt record
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

    // Save receipt to database
    const { data: receipt, error } = await db
      .from('fee_receipts')
      .insert(receiptData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save receipt: ${error.message}`);
    }

    // Build receipt text for WhatsApp
    const receiptText = this.buildFullReceiptText({
      receiptNumber,
      school: school as Record<string, string>,
      student: student as Record<string, unknown>,
      className: `${cls} ${arm}`.trim(),
      feeTitle: (feeStructure?.title as string) ?? 'School Fee',
      term: (feeStructure?.terms as Record<string, string> | null)?.name,
      academicYear: (
        feeStructure?.academic_years as Record<string, string> | null
      )?.name,
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

  // ─── Build full receipt text ───────────────────────────────────────────
  private buildFullReceiptText(params: {
    receiptNumber: string;
    school: Record<string, string>;
    student: Record<string, unknown>;
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
      {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }
    );

    const time = new Date(params.paymentDate).toLocaleTimeString(
      'en-NG',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    );

    // Payment method icon
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
      `🏫 *${params.school.name ?? 'School'}*\n` +
      (params.school.address
        ? `📍 ${params.school.address}\n`
        : '') +
      (params.school.phone
        ? `📞 ${params.school.phone}\n`
        : '') +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🔖 *Receipt No:* ${params.receiptNumber}\n` +
      `📅 *Date:* ${date}\n` +
      `⏰ *Time:* ${time}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `👤 *Issued To:* ${params.issuedTo}\n` +
      `👨‍🎓 *Student:* ${params.student.first_name} ${params.student.last_name}\n` +
      `📋 *Adm No:* ${params.student.admission_number}\n` +
      `🏫 *Class:* ${params.className}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `💰 *PAYMENT DETAILS*\n\n` +
      `📋 *Fee:* ${params.feeTitle}\n` +
      (params.term ? `📚 *Term:* ${params.term}\n` : '') +
      (params.academicYear
        ? `📅 *Year:* ${params.academicYear}\n`
        : '') +
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
      `🏫 *${params.school.name ?? 'School'}*\n` +
      `_Powered by SchoolBot_`
    );
  }

  // ─── Build short receipt text (for existing receipt records) ──────────
  private buildReceiptText(
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

  // ─── Send receipt to parent via WhatsApp ──────────────────────────────
  async sendReceiptToParent(
    receiptId: string,
    parentPhone: string,
    waAccount: Record<string, unknown> | null
  ): Promise<void> {
    // Get receipt with all related data
    const { data: receipt } = await db
      .from('fee_receipts')
      .select(`
        *,
        schools ( name, address, phone, logo_url ),
        students (
          first_name,
          last_name,
          admission_number,
          classes ( name ),
          class_arms ( name )
        ),
        payments (
          payment_method,
          gateway_reference,
          student_invoices (
            invoice_number,
            fee_structures (
              title,
              terms ( name ),
              academic_years ( name )
            )
          )
        )
      `)
      .eq('id', receiptId)
      .single();

    if (!receipt) {
      console.error('[Receipt] Receipt not found:', receiptId);
      return;
    }

    const school = receipt.schools as Record<string, unknown> | null;
    const student = receipt.students as Record<string, unknown> | null;
    const payment = receipt.payments as Record<string, unknown> | null;
    const invoice = payment?.student_invoices as Record<string, unknown> | null;
    const fs = invoice?.fee_structures as Record<string, unknown> | null;
    const cls = (student?.classes as Record<string, string> | null)?.name ?? '';
    const arm = (student?.class_arms as Record<string, string> | null)?.name ?? '';

    // Build the receipt text
    const receiptText = this.buildFullReceiptText({
      receiptNumber: receipt.receipt_number as string,
      school: school as Record<string, string>,
      student: student as Record<string, unknown>,
      className: `${cls} ${arm}`.trim(),
      feeTitle: (fs?.title as string) ?? 'School Fee',
      term: (fs?.terms as Record<string, string> | null)?.name,
      academicYear: (
        fs?.academic_years as Record<string, string> | null
      )?.name,
      amount: parseFloat(String(receipt.amount_paid ?? 0)),
      paymentMethod: receipt.payment_method as string,
      reference: payment?.gateway_reference as string,
      paymentDate: receipt.payment_date as string,
      issuedTo: receipt.issued_to as string,
    });

    // Send via WhatsApp
    const wa = new WhatsApp(
      waAccount as { phone_number_id: string; access_token: string; status: string } | null
    );

    await wa.text(parentPhone, receiptText);

    // Mark receipt as sent
    await db
      .from('fee_receipts')
      .update({
        sent_to_parent: true,
        sent_at: new Date().toISOString(),
      })
      .eq('id', receiptId);

    // Log notification
    await db.from('notifications').insert({
      school_id: receipt.school_id,
      channel: 'whatsapp',
      type: 'payment_receipt',
      recipient: parentPhone,
      title: `Receipt: 
