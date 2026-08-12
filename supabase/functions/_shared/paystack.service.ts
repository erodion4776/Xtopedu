// ============================================================
// SCHOOLBOT - PAYSTACK SERVICE
// supabase/functions/_shared/paystack.service.ts
// ============================================================

import { getSupabase } from './supabase.ts';
import type {
  PaymentCharges,
  PaymentVerifyResult,
  SetupFeeVerifyResult,
  SetupFeeInfo,
} from './types.ts';

const db = getSupabase();

// ============================================================
// STANDALONE HELPER FUNCTIONS
// (exported so other files can use without creating instance)
// ============================================================

// ─── Calculate Paystack processing charge ─────────────────────────────────
// Paystack Nigeria rates:
// Local cards: 1.5% + ₦100 flat fee (capped at ₦2,000)
// Below ₦2,500: no flat fee, just 1.5%
export function calculatePaystackCharge(amount: number): number {
  if (amount < 2500) {
    return parseFloat((amount * 0.015).toFixed(2));
  }
  const charge = amount * 0.015 + 100;
  return parseFloat(Math.min(charge, 2000).toFixed(2));
}

// ─── Calculate total parent pays ──────────────────────────────────────────
// School gets:    100% of their fee (via Paystack subaccount)
// Platform gets:  1.5% commission (via transaction_charge)
// Paystack gets:  processing fee
// Parent pays:    schoolFee + 1.5% + paystackCharge
export function calculateTotalCharge(schoolFee: number): PaymentCharges {
  const schoolAmount = parseFloat(schoolFee.toFixed(2));
  const platformCommission = parseFloat(
    (schoolFee * 0.015).toFixed(2)
  );

  // Paystack charges on the subtotal
  const subtotal = schoolAmount + platformCommission;
  const paystackCharge = calculatePaystackCharge(subtotal);

  const totalParentPays = parseFloat(
    (schoolAmount + platformCommission + paystackCharge).toFixed(2)
  );

  // Human readable breakdown
  const f = (n: number) =>
    new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(n);

  const breakdown =
    `School Fee:      ${f(schoolAmount)}\n` +
    `Platform (1.5%): ${f(platformCommission)}\n` +
    `Processing Fee:  ${f(paystackCharge)}\n` +
    `─────────────────────────\n` +
    `Total You Pay:   ${f(totalParentPays)}`;

  return {
    schoolAmount,
    platformCommission,
    paystackCharge,
    totalParentPays,
    breakdown,
  };
}

// ─── Get setup fee for student count ──────────────────────────────────────
export async function calculateSetupFee(
  studentCount: number
): Promise<SetupFeeInfo | null> {
  const { data: tiers } = await db
    .from('setup_fee_tiers')
    .select('*')
    .eq('is_active', true)
    .order('min_students', { ascending: true });

  if (!tiers?.length) return null;

  const tier = tiers.find((t) => {
    const aboveMin = studentCount >= t.min_students;
    const belowMax =
      t.max_students === null || studentCount <= t.max_students;
    return aboveMin && belowMax;
  });

  if (!tier) return null;

  return {
    tier: tier.name,
    amount: parseFloat(String(tier.setup_fee)),
    description: tier.description,
  };
}

// ============================================================
// PAYSTACK SERVICE CLASS
// ============================================================

export class PaystackService {
  private secretKey: string;
  private baseUrl = 'https://api.paystack.co';

  constructor() {
    this.secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
  }

  // ─── Initialize setup fee payment ────────────────────────────────────
  // This payment goes 100% to YOU (no school subaccount split)
  async initializeSetupFeePayment(params: {
    schoolId: string;
    schoolName: string;
    adminEmail: string;
    adminPhone: string;
    amount: number;
    studentCount: number;
    tierName: string;
    callbackUrl: string;
  }): Promise<{ paymentUrl: string; reference: string }> {
    const reference = this.generateRef('SETUP');

    const res = await this.request('/transaction/initialize', 'POST', {
      email: params.adminEmail || `${params.adminPhone}@schoolbot.ng`,
      amount: Math.round(params.amount * 100), // Paystack uses kobo
      reference,
      callback_url: params.callbackUrl,
      channels: ['card', 'bank', 'bank_transfer', 'ussd'],
      metadata: {
        payment_type: 'setup_fee',
        school_id: params.schoolId,
        school_name: params.schoolName,
        admin_phone: params.adminPhone,
        student_count: params.studentCount,
        tier_name: params.tierName,
        custom_fields: [
          {
            display_name: 'Payment For',
            variable_name: 'payment_for',
            value: `SchoolBot Setup - ${params.schoolName}`,
          },
          {
            display_name: 'Students',
            variable_name: 'students',
            value: String(params.studentCount),
          },
        ],
      },
    });

    if (!res.status) {
      throw new Error(`Paystack error: ${res.message}`);
    }

    // Save pending payment record
    await db.from('platform_payments').insert({
      school_id: params.schoolId,
      payment_type: 'setup_fee',
      amount: params.amount,
      currency: 'NGN',
      setup_fee_tier: params.tierName,
      student_count: params.studentCount,
      gateway: 'paystack',
      gateway_reference: reference,
      transaction_reference: reference,
      status: 'Pending',
      created_at: new Date().toISOString(),
    });

    return {
      paymentUrl: res.data.authorization_url,
      reference,
    };
  }

  // ─── Verify setup fee payment ─────────────────────────────────────────
  async verifySetupFee(
    reference: string
  ): Promise<SetupFeeVerifyResult> {
    const res = await this.request(
      `/transaction/verify/${reference}`,
      'GET'
    );

    if (!res.status || res.data.status !== 'success') {
      return { ok: false };
    }

    const tx = res.data;
    const meta = tx.metadata ?? {};
    const amount = tx.amount / 100; // Convert kobo to naira

    // Update payment record to Success
    await db
      .from('platform_payments')
      .update({
        status: 'Success',
        paid_at: new Date().toISOString(),
      })
      .eq('gateway_reference', reference);

    // Activate school and mark setup fee paid
    if (meta.school_id) {
      await db
        .from('schools')
        .update({
          setup_fee_paid: true,
          setup_fee_amount: amount,
          setup_fee_paid_at: new Date().toISOString(),
          student_count: meta.student_count,
          onboarding_status: 'setup_fee_paid',
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', meta.school_id);

      // Update onboarding progress
      await db
        .from('school_onboarding')
        .update({
          step_setup_fee_paid: true,
          current_step: 'bank',
          updated_at: new Date().toISOString(),
        })
        .eq('school_id', meta.school_id);
    }

    return {
      ok: true,
      schoolId: meta.school_id as string,
      adminPhone: meta.admin_phone as string,
      amount,
      studentCount: meta.student_count as number,
      tierName: meta.tier_name as string,
    };
  }

  // ─── Initialize school fee payment with split ─────────────────────────
  // Parent pays: schoolFee + 1.5% platform + Paystack charges
  // School gets: their full fee via subaccount
  // Platform gets: 1.5% via transaction_charge
  async initializeSchoolFeePayment(params: {
    email: string;
    schoolFeeAmount: number;
    reference: string;
    invoiceId: string;
    studentId: string;
    schoolId: string;
    parentPhone: string;
    callbackUrl: string;
  }): Promise<{ paymentUrl: string; charges: PaymentCharges }> {
    // Calculate what parent will pay
    const charges = calculateTotalCharge(params.schoolFeeAmount);

    // Get school subaccount for split
    const { data: subaccount } = await db
      .from('paystack_subaccounts')
      .select('subaccount_code')
      .eq('school_id', params.schoolId)
      .eq('is_active', true)
      .single();

    // Total in kobo
    const totalKobo = Math.round(charges.totalParentPays * 100);

    // Platform commission in kobo
    const commissionKobo = Math.round(charges.platformCommission * 100);

    const payload: Record<string, unknown> = {
      email: params.email || `${params.parentPhone}@schoolbot.ng`,
      amount: totalKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      channels: ['card', 'bank', 'ussd', 'mobile_money', 'bank_transfer'],
      metadata: {
        payment_type: 'school_fee',
        invoice_id: params.invoiceId,
        student_id: params.studentId,
        school_id: params.schoolId,
        parent_phone: params.parentPhone,
        school_fee_amount: params.schoolFeeAmount,
        platform_commission: charges.platformCommission,
        paystack_charge: charges.paystackCharge,
        total_parent_pays: charges.totalParentPays,
      },
    };

    // Add split if school has subaccount
    if (subaccount?.subaccount_code) {
      // School gets everything EXCEPT platform commission
      // transaction_charge = what stays with main account (platform)
      payload.subaccount = subaccount.subaccount_code;
      payload.transaction_charge = commissionKobo;
      payload.bearer = 'account';
    }

    const res = await this.request(
      '/transaction/initialize',
      'POST',
      payload
    );

    if (!res.status) {
      throw new Error(`Paystack error: ${res.message}`);
    }

    return {
      paymentUrl: res.data.authorization_url,
      charges,
    };
  }

  // ─── Verify school fee payment ────────────────────────────────────────
  async verifySchoolFee(
    reference: string
  ): Promise<PaymentVerifyResult> {
    const res = await this.request(
      `/transaction/verify/${reference}`,
      'GET'
    );

    if (!res.status || res.data.status !== 'success') {
      return { ok: false };
    }

    const tx = res.data;
    const meta = tx.metadata ?? {};

    // Get amounts from metadata
    const schoolFeeAmount = parseFloat(
      String(meta.school_fee_amount ?? tx.amount / 100)
    );
    const platformCommission = parseFloat(
      String(meta.platform_commission ?? 0)
    );
    const paystackCharge = parseFloat(
      String(meta.paystack_charge ?? 0)
    );
    const totalPaid = parseFloat(
      String(meta.total_parent_pays ?? tx.amount / 100)
    );

    // Update payment to Success
    await db
      .from('payments')
      .update({
        status: 'Success',
        payment_method: tx.channel,
        paid_at: new Date().toISOString(),
      })
      .eq('gateway_reference', reference);

    // Get payment record ID
    const { data: payment } = await db
      .from('payments')
      .select('id')
      .eq('gateway_reference', reference)
      .single();

    // Get current term
    const { data: term } = await db
      .from('terms')
      .select('id, academic_year_id')
      .eq('is_current', true)
      .single();

    // Record platform commission
    if (payment?.id && meta.school_id) {
      await db.from('platform_commissions').insert({
        school_id: meta.school_id,
        payment_id: payment.id,
        total_amount: totalPaid,
        school_amount: schoolFeeAmount,
        platform_amount: platformCommission,
        platform_percentage: 1.5,
        paystack_charge: paystackCharge,
        paystack_reference: reference,
        subaccount_code: tx.subaccount?.subaccount_code ?? null,
        term_id: term?.id ?? null,
        academic_year_id: term?.academic_year_id ?? null,
        status: 'settled',
        settled_at: new Date().toISOString(),
      });

      // Record in platform payments for your revenue tracking
      await db.from('platform_payments').insert({
        school_id: meta.school_id,
        payment_type: 'commission',
        amount: platformCommission,
        currency: 'NGN',
        term_id: term?.id ?? null,
        academic_year_id: term?.academic_year_id ?? null,
        source_payment_id: payment.id,
        commission_rate: 1.5,
        school_fee_amount: schoolFeeAmount,
        gateway: 'paystack',
        gateway_reference: `COMM-${reference}`,
        transaction_reference: reference,
        status: 'Success',
        paid_at: new Date().toISOString(),
      });
    }

    // Update invoice balance
    if (meta.invoice_id) {
      await this.updateInvoice(
        meta.invoice_id as string,
        schoolFeeAmount
      );
    }

    return {
      ok: true,
      schoolFeeAmount,
      platformCommission,
      paystackCharge,
      totalPaid,
      invoiceId: meta.invoice_id as string,
      studentId: meta.student_id as string,
      schoolId: meta.school_id as string,
      parentPhone: meta.parent_phone as string,
      channel: tx.channel as string,
      reference,
    };
  }

  // ─── Update invoice after payment ─────────────────────────────────────
  async updateInvoice(
    invoiceId: string,
    amountPaid: number
  ): Promise<void> {
    const { data: invoice } = await db
      .from('student_invoices')
      .select('amount, amount_paid')
      .eq('id', invoiceId)
      .single();

    if (!invoice) return;

    const newPaid =
      parseFloat(String(invoice.amount_paid ?? 0)) + amountPaid;
    const newBalance = Math.max(
      0,
      parseFloat(String(invoice.amount)) - newPaid
    );
    const newStatus = newBalance <= 0 ? 'Paid' : 'Partial';

    await db
      .from('student_invoices')
      .update({
        amount_paid: newPaid,
        balance: newBalance,
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoiceId);
  }

  // ─── Create Paystack subaccount for school ────────────────────────────
  // School gets 100% of fee payments via this subaccount
  async createSubaccount(params: {
    schoolId: string;
    businessName: string;
    bankCode: string;
    accountNumber: string;
  }): Promise<{
    subaccountCode: string;
    accountName: string;
    bankName: string;
  }> {
    const res = await this.request('/subaccount', 'POST', {
      business_name: params.businessName,
      bank_code: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: 100, // School gets 100% of their fee
      description: `${params.businessName} - SchoolBot`,
    });

    if (!res.status) {
      throw new Error(`Subaccount creation failed: ${res.message}`);
    }

    const d = res.data;

    // Save to database
    await db
      .from('paystack_subaccounts')
      .upsert(
        {
          school_id: params.schoolId,
          subaccount_code: d.subaccount_code,
          account_number: params.accountNumber,
          bank_code: params.bankCode,
          bank_name: d.settlement_bank,
          account_name: d.account_name,
          business_name: params.businessName,
          percentage_charge: 100,
          paystack_response: d,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'school_id' }
      );

    return {
      subaccountCode: d.subaccount_code,
      accountName: d.account_name,
      bankName: d.settlement_bank,
    };
  }

  // ─── Resolve bank account name ────────────────────────────────────────
  async resolveAccount(
    accountNumber: string,
    bankCode: string
  ): Promise<
    | { ok: true; accountName: string; accountNumber: string }
    | { ok: false; message: string }
  > {
    const res = await this.request(
      `/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      'GET'
    );

    if (!res.status) {
      // Surface Paystack's actual reason instead of swallowing it —
      // e.g. "Invalid bank code", "Could not resolve account name",
      // or an auth error if the secret key can't be used for this call.
      return { ok: false, message: res.message ?? 'Unknown Paystack error' };
    }

    return {
      ok: true,
      accountName: res.data.account_name,
      accountNumber: res.data.account_number,
    };
  }

  // ─── Get list of Nigerian banks ───────────────────────────────────────
  async getBanks(): Promise<Array<{ name: string; code: string }>> {
    const res = await this.request(
      '/bank?currency=NGN&perPage=100',
      'GET'
    );
    return (res.data ?? []) as Array<{ name: string; code: string }>;
  }

  // ─── Get revenue stats ────────────────────────────────────────────────
  async getRevenueStats(schoolId?: string) {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();
    const startOfYear = new Date(
      now.getFullYear(), 0, 1
    ).toISOString();

    const makeQuery = (
      type: 'setup_fee' | 'commission',
      start?: string
    ) => {
      let q = db
        .from('platform_payments')
        .select('amount')
        .eq('status', 'Success')
        .eq('payment_type', type);
      if (schoolId) q = q.eq('school_id', schoolId);
      if (start) q = q.gte('created_at', start);
      return q;
    };

    const sum = (rows: Array<{ amount: unknown }>) =>
      (rows ?? []).reduce(
        (s, r) => s + parseFloat(String(r.amount ?? 0)),
        0
      );

    const [sa, sm, sy, ca, cm, cy] = await Promise.all([
      makeQuery('setup_fee'),
      makeQuery('setup_fee', startOfMonth),
      makeQuery('setup_fee', startOfYear),
      makeQuery('commission'),
      makeQuery('commission', startOfMonth),
      makeQuery('commission', startOfYear),
    ]);

    return {
      setup_fees: {
        all_time: sum(sa.data ?? []),
        this_month: sum(sm.data ?? []),
        this_year: sum(sy.data ?? []),
        count: sa.data?.length ?? 0,
      },
      commissions: {
        all_time: sum(ca.data ?? []),
        this_month: sum(cm.data ?? []),
        this_year: sum(cy.data ?? []),
        count: ca.data?.length ?? 0,
      },
      total: {
        all_time: sum(sa.data ?? []) + sum(ca.data ?? []),
        this_month: sum(sm.data ?? []) + sum(cm.data ?? []),
        this_year: sum(sy.data ?? []) + sum(cy.data ?? []),
      },
    };
  }

  // ─── Generate unique payment reference ───────────────────────────────
  generateRef(prefix = 'SCH'): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  // ─── Format currency ──────────────────────────────────────────────────
  currency(amount: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(amount);
  }

  // ─── Due date label ───────────────────────────────────────────────────
  dueLabel(dueDate: string | null): string {
    if (!dueDate) return 'No due date';

    const diff = Math.ceil(
      (new Date(dueDate).getTime() - Date.now()) / 86400000
    );

    const formatted = new Date(dueDate).toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    if (diff < 0) return `⚠️ Overdue (${formatted})`;
    if (diff === 0) return `🔴 Due TODAY`;
    if (diff <= 3) return `🟡 Due in ${diff} days (${formatted})`;
    return `📅 Due: ${formatted}`;
  }

  // ─── Core HTTP request to Paystack API ───────────────────────────────
  private async request(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(
        `[Paystack] ${method} ${path} failed:`,
        JSON.stringify(data)
      );
    }

    return data as Record<string, unknown>;
  }
}
