// ============================================================
// SCHOOLBOT - PAYMENT CALLBACK
// supabase/functions/payment-callback/index.ts
// ✅ Added form_payment type handling
// ============================================================

import { PaystackService } from '../_shared/paystack.service.ts';
import { WhatsApp }        from '../_shared/whatsapp.ts';
import { getSupabase }     from '../_shared/supabase.ts';
import { ReceiptService }  from '../_shared/receipt.service.ts';
import {
  handleFormPaymentSuccess,
} from '../_shared/bot/payment-forms.handler.ts';

const paystack   = new PaystackService();
const db         = getSupabase();
const receiptSvc = new ReceiptService();

const APP_URL           = Deno.env.get('APP_URL')           ?? '';
const SUPER_ADMIN_PHONE = Deno.env.get('SUPER_ADMIN_PHONE') ?? '';

function redirect(path: string): Response {
  return new Response(null, {
    status:  302,
    headers: { Location: `${APP_URL}${path}` },
  });
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
  }).format(n);
}

function safeString(val: unknown): string | null {
  return (
    typeof val === 'string' && val.trim() !== ''
      ? val.trim()
      : null
  );
}

function safeBillingType(
  val: unknown
): 'monthly' | 'termly' {
  return val === 'termly' ? 'termly' : 'monthly';
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBuf    = encoder.encode(a);
  const bBuf    = encoder.encode(b);
  let result    = 0;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}

async function verifySignature(
  body:      string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;
  try {
    const secretKey =
      Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secretKey),
      { name: 'HMAC', hash: 'SHA-512' },
      false,
      ['sign']
    );
    const sigBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body)
    );
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return timingSafeEqual(computed, signature);
  } catch {
    return false;
  }
}

async function isAlreadyProcessed(
  reference: string,
  type:      string
): Promise<boolean> {
  const { data } = await db
    .from('processed_payment_events')
    .select('id')
    .eq('gateway_ref', reference)
    .eq('event_type', type)
    .maybeSingle();
  return data !== null;
}

async function markProcessed(
  reference: string,
  type:      string
): Promise<void> {
  await db.from('processed_payment_events').insert(
    {
      gateway_ref:  reference,
      event_type:   type,
      processed_at: new Date().toISOString(),
    },
    // @ts-ignore
    {
      onConflict:       'gateway_ref,event_type',
      ignoreDuplicates: true,
    }
  );
}

async function getWaAccount(
  schoolId: string | null
): Promise<Record<string, unknown> | null> {
  if (!schoolId) return null;
  const { data } = await db
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token, status')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .maybeSingle();
  return data ?? null;
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    return handleGetRedirect(url);
  }

  if (req.method === 'POST') {
    return handleWebhook(req);
  }

  return new Response('Not Found', { status: 404 });
});

// ─── GET redirect ─────────────────────────────────────────
async function handleGetRedirect(
  url: URL
): Promise<Response> {
  const ref =
    url.searchParams.get('ref')       ??
    url.searchParams.get('reference') ??
    url.searchParams.get('trxref');

  if (!ref) {
    return redirect('/payment/failed?reason=no_reference');
  }

  let verification: Record<string, unknown>;
  try {
    verification =
      await paystack.verifyTransaction(ref);
  } catch (err) {
    console.error('[Payment] GET verify failed:', err);
    return redirect(`/payment/failed?ref=${ref}`);
  }

  if (!verification.ok) {
    return redirect(`/payment/failed?ref=${ref}`);
  }

  const meta =
    (verification.metadata as
      Record<string, unknown>) ?? {};
  const paymentType =
    safeString(meta.payment_type) ?? 'school_fee';

  try {
    if (paymentType === 'setup_fee') {
      const result = await paystack.verifySetupFee(ref);
      if (!result.ok) {
        return redirect(`/onboarding/failed?ref=${ref}`);
      }
      await sendSetupConfirmation(result);
      return redirect(`/onboarding/success?ref=${ref}`);
    }

    if (paymentType === 'subscription') {
      const { data: subPayment } = await db
        .from('subscription_payments')
        .select('*')
        .eq('gateway_ref', ref)
        .maybeSingle();

      if (!subPayment) {
        return redirect(
          `/payment/failed?ref=${ref}&reason=not_found`
        );
      }

      await handleSubscriptionPayment(
        {
          parent_id:    subPayment.parent_id,
          school_id:    subPayment.school_id,
          plan_slug:    subPayment.plan_slug,
          billing_type: subPayment.billing_type,
          parent_phone: null,
        },
        ref,
        subPayment.amount
      );
      return redirect(`/payment/success?ref=${ref}`);
    }

    // ✅ Form payment redirect
    if (paymentType === 'form_payment') {
      await handleFormPaymentSuccess(ref, {
        ...meta,
        amount:
          (verification.amount as number) ??
          meta.total_amount ??
          0,
      });
      return redirect(
        `/payment/success?ref=${ref}`
      );
    }

    // Default: school fee
    const result = await paystack.verifySchoolFee(ref);
    if (!result.ok) {
      return redirect(`/payment/failed?ref=${ref}`);
    }
    await sendFeeConfirmation(result);
    return redirect(
      `/payment/success?ref=${ref}&amount=${result.totalPaid}`
    );
  } catch (err) {
    console.error('[Payment] GET error:', err);
    return redirect(`/payment/failed?ref=${ref}`);
  }
}

// ─── POST webhook ─────────────────────────────────────────
async function handleWebhook(
  req: Request
): Promise<Response> {
  const signature =
    req.headers.get('x-paystack-signature');
  const rawBody = await req.text();

  const isValid =
    await verifySignature(rawBody, signature);
  if (!isValid) {
    console.warn('[Payment] Invalid signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  console.log(`[Payment] Event: ${event.event}`);

  try {
    await processPaystackEvent(event);
  } catch (err) {
    console.error('[Payment] Process error:', err);
  }

  return new Response('OK', { status: 200 });
}

// ─── Process event ────────────────────────────────────────
async function processPaystackEvent(
  event: Record<string, unknown>
): Promise<void> {
  if (event.event !== 'charge.success') return;

  const data = event.data as Record<string, unknown>;
  const meta =
    (data.metadata as Record<string, unknown>) ?? {};
  const ref = safeString(data.reference);

  if (!ref) {
    console.error('[Payment] Missing reference');
    return;
  }

  const paymentType =
    safeString(meta.payment_type) ?? 'school_fee';

  console.log(
    `[Payment] Processing: ${paymentType} - ${ref}`
  );

  // ── Setup fee ─────────────────────────────────────────
  if (paymentType === 'setup_fee') {
    if (await isAlreadyProcessed(ref, 'setup_fee')) {
      console.log(`[Payment] Already processed: ${ref}`);
      return;
    }
    const result = await paystack.verifySetupFee(ref);
    if (result.ok) {
      await sendSetupConfirmation(result);
      await markProcessed(ref, 'setup_fee');
    }
    return;
  }

  // ── Subscription ──────────────────────────────────────
  if (paymentType === 'subscription') {
    if (await isAlreadyProcessed(ref, 'subscription')) {
      return;
    }
    const amount = (data.amount as number) / 100;
    await handleSubscriptionPayment(meta, ref, amount);
    await markProcessed(ref, 'subscription');
    return;
  }

  // ── ✅ Form payment ───────────────────────────────────
  if (paymentType === 'form_payment') {
    if (await isAlreadyProcessed(ref, 'form_payment')) {
      console.log(
        `[Payment] form_payment already processed: ${ref}`
      );
      return;
    }

    await handleFormPaymentSuccess(ref, {
      ...meta,
      amount: (data.amount as number) / 100,
    });

    await markProcessed(ref, 'form_payment');
    return;
  }

  // ── Default: school fee ───────────────────────────────
  if (await isAlreadyProcessed(ref, 'school_fee')) {
    return;
  }
  const result = await paystack.verifySchoolFee(ref);
  if (result.ok) {
    await sendFeeConfirmation(result);
    await markProcessed(ref, 'school_fee');
  }
}

// ============================================================
// SUBSCRIPTION PAYMENT
// ============================================================

async function handleSubscriptionPayment(
  meta:      Record<string, unknown>,
  reference: string,
  amount:    number
): Promise<void> {
  try {
    const parentId    = safeString(meta.parent_id);
    const schoolId    = safeString(meta.school_id);
    const planSlug    = safeString(meta.plan_slug);
    const billingType = safeBillingType(meta.billing_type);
    let parentPhone   = safeString(meta.parent_phone);

    if (!parentId || !schoolId || !planSlug) return;

    if (!parentPhone) {
      const { data: parent } = await db
        .from('parents')
        .select('phone, whatsapp_number')
        .eq('id', parentId)
        .maybeSingle();
      parentPhone =
        safeString(parent?.whatsapp_number) ??
        safeString(parent?.phone);
    }

    await db
      .from('subscription_payments')
      .update({
        status:  'Success',
        paid_at: new Date().toISOString(),
      })
      .eq('gateway_ref', reference);

    const now       = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(
      expiresAt.getMonth() +
      (billingType === 'termly' ? 3 : 1)
    );

    const { data: plan } = await db
      .from('alert_plans')
      .select('id, name, features')
      .eq('slug', planSlug)
      .maybeSingle();

    await db
      .from('parent_subscriptions')
      .upsert(
        {
          parent_id:    parentId,
          school_id:    schoolId,
          plan_id:      plan?.id ?? null,
          plan_slug:    planSlug,
          billing_type: billingType,
          amount_paid:  amount,
          status:       'active',
          started_at:   now.toISOString(),
          expires_at:   expiresAt.toISOString(),
          next_billing:
            expiresAt.toISOString().split('T')[0],
          gateway_ref:  reference,
          auto_renew:   true,
          updated_at:   now.toISOString(),
        },
        { onConflict: 'parent_id,school_id' }
      );

    if (!parentPhone) return;

    const waAccount = await getWaAccount(schoolId);
    if (!waAccount) return;

    const wa = new WhatsApp(waAccount);

    const planBadges: Record<string, string> = {
      basic:    '📦 Basic',
      standard: '🔔 Standard',
      premium:  '🚀 Premium',
      family:   '👨‍👩‍👧 Family',
    };

    const billingLabel =
      billingType === 'termly'
        ? '3 months (1 term)'
        : '1 month';

    const expiryStr = expiresAt.toLocaleDateString(
      'en-NG',
      { day: 'numeric', month: 'long', year: 'numeric' }
    );

    await wa.text(
      parentPhone,
      `🎉 *Alert Plan Activated!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ *${planBadges[planSlug] ?? planSlug} Plan*\n` +
      `   is now ACTIVE!\n\n` +
      `📅 *Valid for:* ${billingLabel}\n` +
      `🗓️ *Expires:* ${expiryStr}\n` +
      `💰 *Amount paid:* ${fmt(amount)}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Thank you! 🙏\n\n` +
      `_Type *menu* to return_`
    );
  } catch (err) {
    console.error('[Subscription] Error:', err);
    throw err;
  }
}

// ============================================================
// SETUP FEE CONFIRMATION
// ============================================================

async function sendSetupConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const adminPhone = safeString(result.adminPhone);
    const schoolId   = safeString(result.schoolId);
    const amount     = result.amount as number;
    const studentCount = result.studentCount;
    const tierName   = result.tierName;

    if (!adminPhone) return;

    const waAccount = await getWaAccount(schoolId);
    if (!waAccount) return;

    const wa = new WhatsApp(waAccount);

    // Generate activation link
    const activationLink =
      await generateActivationLink(schoolId);

    await wa.text(
      adminPhone,
      `🎉 *Setup Fee Confirmed!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Your SchoolBot account\n` +
      `is now ready!\n\n` +
      `💵 *Amount Paid:* ${fmt(amount)}\n` +
      `👥 *Students:* ${studentCount}\n` +
      `📦 *Tier:* ${tierName}\n` +
      `📅 *Date:* ${new Date().toLocaleDateString(
        'en-NG',
        { day: 'numeric', month: 'long', year: 'numeric' }
      )}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `🔌 *Next — Connect WhatsApp:*\n\n` +
      `👇 *Tap this link:*\n` +
      `${activationLink}\n\n` +
      `⏰ Valid for *7 days*\n` +
      `Takes less than 2 minutes! ✅`
    );

    if (SUPER_ADMIN_PHONE && schoolId) {
      const { data: school } = await db
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .maybeSingle();

      await wa.text(
        SUPER_ADMIN_PHONE,
        `💰 *Setup Fee Received!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `🏫 *School:* ${school?.name ?? 'Unknown'}\n` +
        `💵 *Amount:* ${fmt(amount)}\n` +
        `👥 *Students:* ${studentCount}\n` +
        `📦 *Tier:* ${tierName}\n` +
        `📱 *Admin:* ${adminPhone}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    }
  } catch (err) {
    console.error('[Payment] Setup confirm error:', err);
    throw err;
  }
}

// ─── Generate activation link ─────────────────────────────
async function generateActivationLink(
  schoolId: string | null
): Promise<string> {
  if (!schoolId) return `${APP_URL}/activate`;

  try {
    const token = Array.from(
      { length: 32 },
      () =>
        'abcdefghijklmnopqrstuvwxyz0123456789'[
          Math.floor(Math.random() * 36)
        ]
    ).join('');

    await db
      .from('school_activation_tokens')
      .insert({
        school_id:  schoolId,
        token,
        expires_at: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        used:       false,
        created_at: new Date().toISOString(),
      });

    return `${APP_URL}/activate/${token}`;
  } catch (err) {
    console.error('[Payment] Activation link error:', err);
    return `${APP_URL}/activate`;
  }
}

// ============================================================
// FEE CONFIRMATION
// ============================================================

async function sendFeeConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const parentPhone       = safeString(result.parentPhone);
    const studentId         = safeString(result.studentId);
    const schoolId          = safeString(result.schoolId);
    const schoolFeeAmount   = result.schoolFeeAmount   as number;
    const platformCommission = result.platformCommission as number;
    const paystackCharge    = result.paystackCharge    as number;
    const totalPaid         = result.totalPaid         as number;
    const channel           = safeString(result.channel) ?? 'Online';
    const reference         = safeString(result.reference);

    if (!parentPhone || !studentId || !reference) return;

    const { data: student } = await db
      .from('students')
      .select('first_name, last_name')
      .eq('id', studentId)
      .maybeSingle();

    const waAccount = await getWaAccount(schoolId);
    if (!waAccount) return;

    const wa = new WhatsApp(waAccount);

    await wa.text(
      parentPhone,
      `🎉 *Payment Successful!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Payment confirmed!\n\n` +
      `👤 *Student:*\n` +
      `${student?.first_name ?? ''} ` +
      `${student?.last_name ?? ''}\n\n` +
      `💵 School Fee:     *${fmt(schoolFeeAmount)}*\n` +
      `🏷️ Platform Fee:   *${fmt(platformCommission)}*\n` +
      `🏦 Processing Fee: *${fmt(paystackCharge)}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💳 *Total Paid:* *${fmt(totalPaid)}*\n\n` +
      `🏫 School received *${fmt(schoolFeeAmount)}* ✅\n\n` +
      `💳 *Method:* ${channel}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric', month: 'long', year: 'numeric',
      })}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Thank you! 🙏\n` +
      `_Type *menu* to return_`
    );

    await db.from('notifications').insert({
      school_id:  schoolId,
      channel:    'whatsapp',
      type:       'payment_confirmation',
      recipient:  parentPhone,
      title:      'Payment Confirmed',
      message:    `Payment of ${fmt(totalPaid)} confirmed`,
      status:     'sent',
      sent_at:    new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Auto receipt
    try {
      const { data: payment } = await db
        .from('payments')
        .select('id')
        .eq('gateway_reference', reference)
        .maybeSingle();

      if (payment?.id) {
        const receipt =
          await receiptSvc.generateReceipt(payment.id);
        await receiptSvc.sendReceiptToParent(
          receipt.receiptId,
          parentPhone,
          waAccount
        );
      }
    } catch (receiptErr) {
      console.warn('[Payment] Receipt error:', receiptErr);
    }
  } catch (err) {
    console.error('[Payment] Fee confirm error:', err);
    throw err;
  }
}
