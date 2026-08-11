// ============================================================
// SCHOOLBOT - PAYMENT CALLBACK
// supabase/functions/payment-callback/index.ts
// ============================================================

import { PaystackService } from '../_shared/paystack.service.ts';
import { WhatsApp }        from '../_shared/whatsapp.ts';
import { getSupabase }     from '../_shared/supabase.ts';
import { ReceiptService }  from '../_shared/receipt.service.ts';

const paystack   = new PaystackService();
const db         = getSupabase();
const receiptSvc = new ReceiptService();

const APP_URL           = Deno.env.get('APP_URL')           ?? '';
const SUPER_ADMIN_PHONE = Deno.env.get('SUPER_ADMIN_PHONE') ?? '';

// ============================================================
// HELPERS
// ============================================================

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

/** Constant-time string comparison */
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

/** Verify Paystack HMAC-SHA512 signature */
async function verifySignature(
  body:      string,
  signature: string | null
): Promise<boolean> {
  if (!signature) return false;

  try {
    const secretKey = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';

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

/** Idempotency guard */
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

/** Mark reference as processed */
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

/** Get school WhatsApp account */
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

// ============================================================
// GET — Browser redirect after payment
// ============================================================

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
    console.error('[Payment] GET verification failed:', err);
    return redirect(`/payment/failed?ref=${ref}`);
  }

  if (!verification.ok) {
    return redirect(`/payment/failed?ref=${ref}`);
  }

  const meta =
    (verification.metadata as Record<string, unknown>)
    ?? {};
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
      const { data: subPayment, error } = await db
        .from('subscription_payments')
        .select('*')
        .eq('gateway_ref', ref)
        .maybeSingle();

      if (error || !subPayment) {
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
    console.error('[Payment] GET handler error:', err);
    return redirect(`/payment/failed?ref=${ref}`);
  }
}

// ============================================================
// POST — Paystack webhook
// ============================================================

async function handleWebhook(
  req: Request
): Promise<Response> {
  const signature =
    req.headers.get('x-paystack-signature');
  const rawBody = await req.text();

  const isValid = await verifySignature(
    rawBody, signature
  );

  if (!isValid) {
    console.warn('[Payment] Invalid Paystack signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  console.log(`[Payment] Paystack event: ${event.event}`);

  try {
    await processPaystackEvent(event);
  } catch (err) {
    console.error('[Payment] Event processing error:', err);
  }

  return new Response('OK', { status: 200 });
}

// ============================================================
// PROCESS PAYSTACK EVENT
// ============================================================

async function processPaystackEvent(
  event: Record<string, unknown>
): Promise<void> {
  if (event.event !== 'charge.success') return;

  const data = event.data as Record<string, unknown>;
  const meta =
    (data.metadata as Record<string, unknown>) ?? {};
  const ref  = safeString(data.reference);

  if (!ref) {
    console.error('[Payment] Event missing reference');
    return;
  }

  const paymentType =
    safeString(meta.payment_type) ?? 'school_fee';

  console.log(
    `[Payment] Processing: ${paymentType} - ${ref}`
  );

  if (paymentType === 'setup_fee') {
    if (await isAlreadyProcessed(ref, 'setup_fee')) {
      console.log(
        `[Payment] setup_fee ${ref} already processed`
      );
      return;
    }
    const result = await paystack.verifySetupFee(ref);
    if (result.ok) {
      await sendSetupConfirmation(result);
      await markProcessed(ref, 'setup_fee');
    }
    return;
  }

  if (paymentType === 'subscription') {
    if (
      await isAlreadyProcessed(ref, 'subscription')
    ) {
      console.log(
        `[Payment] subscription ${ref} already processed`
      );
      return;
    }
    const amount = (data.amount as number) / 100;
    await handleSubscriptionPayment(meta, ref, amount);
    await markProcessed(ref, 'subscription');
    return;
  }

  // Default: school fee
  if (await isAlreadyProcessed(ref, 'school_fee')) {
    console.log(
      `[Payment] school_fee ${ref} already processed`
    );
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
    const parentId   = safeString(meta.parent_id);
    const schoolId   = safeString(meta.school_id);
    const planSlug   = safeString(meta.plan_slug);
    const billingType = safeBillingType(meta.billing_type);
    let parentPhone  = safeString(meta.parent_phone);

    if (!parentId || !schoolId || !planSlug) {
      console.error(
        '[Subscription] Missing required meta fields',
        { parentId, schoolId, planSlug }
      );
      return;
    }

    // Resolve parent phone if not in meta
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

    // Mark payment as successful
    await db
      .from('subscription_payments')
      .update({
        status:  'Success',
        paid_at: new Date().toISOString(),
      })
      .eq('gateway_ref', reference);

    // Calculate expiry
    const now       = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(
      expiresAt.getMonth() +
      (billingType === 'termly' ? 3 : 1)
    );

    // Resolve plan
    const { data: plan } = await db
      .from('alert_plans')
      .select('id, name, features')
      .eq('slug', planSlug)
      .maybeSingle();

    // Activate subscription
    await db
      .from('parent_subscriptions')
      .upsert(
        {
          parent_id:   parentId,
          school_id:   schoolId,
          plan_id:     plan?.id ?? null,
          plan_slug:   planSlug,
          billing_type: billingType,
          amount_paid: amount,
          status:      'active',
          started_at:  now.toISOString(),
          expires_at:  expiresAt.toISOString(),
          next_billing: expiresAt
            .toISOString().split('T')[0],
          gateway_ref: reference,
          auto_renew:  true,
          updated_at:  now.toISOString(),
        },
        { onConflict: 'parent_id,school_id' }
      );

    console.log(
      `[Subscription] ✅ Activated ${planSlug} ` +
      `for parent ${parentId}`
    );

    if (!parentPhone) {
      console.warn(
        '[Subscription] No parent phone — ' +
        'skipping WhatsApp confirmation'
      );
      return;
    }

    const waAccount = await getWaAccount(schoolId);
    if (!waAccount) {
      console.warn(
        `[Subscription] No active WA account ` +
        `for school ${schoolId}`
      );
      return;
    }

    const wa = new WhatsApp(waAccount);

    const planBadges: Record<string, string> = {
      basic:    '📦 Basic',
      standard: '🔔 Standard',
      premium:  '🚀 Premium',
      family:   '👨‍👩‍👧 Family',
    };

    const planFeatures: Record<string, string> = {
      standard:
        `❌ Instant absent alerts\n` +
        `⏰ Late arrival alerts\n` +
        `💰 Fee reminders\n` +
        `🧾 Payment receipts`,
      premium:
        `✅ Present & absent alerts\n` +
        `🚗 Pickup security alerts\n` +
        `💰 Fee reminders\n` +
        `🧾 Payment receipts\n` +
        `📊 Weekly report`,
      family:
        `✅ Everything in Premium\n` +
        `👨‍👩‍👧 All your children covered`,
    };

    const billingLabel =
      billingType === 'termly'
        ? '3 months (1 term)'
        : '1 month';

    const expiryStr = expiresAt.toLocaleDateString(
      'en-NG',
      {
        day:   'numeric',
        month: 'long',
        year:  'numeric',
      }
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
      `*You will now receive:*\n` +
      `${planFeatures[planSlug] ?? ''}\n\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Thank you! Your children are\n` +
      `now fully monitored. 🙏\n\n` +
      `_Type *menu* to return_`
    );

    await db.from('notifications').insert({
      school_id:  schoolId,
      channel:    'whatsapp',
      type:       'subscription_activated',
      recipient:  parentPhone,
      title:      `${planSlug} plan activated`,
      message:    `Alert plan activated for ${billingLabel}`,
      status:     'sent',
      sent_at:    new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(
      '[Subscription] activation error:', err
    );
    throw err;
  }
}

// ============================================================
// SETUP FEE CONFIRMATION
// ✅ Now generates activation link for school
// ============================================================

async function sendSetupConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const adminPhone = safeString(result.adminPhone);
    const schoolId   = safeString(result.schoolId);
    const amount     = result.amount     as number;
    const studentCount = result.studentCount;
    const tierName   = result.tierName;

    if (!adminPhone) {
      console.warn(
        '[Payment] sendSetupConfirmation: no adminPhone'
      );
      return;
    }

    const waAccount = await getWaAccount(schoolId);

    if (!waAccount) {
      console.warn(
        `[Payment] No active WA account for school ` +
        `${schoolId} — cannot send setup confirmation`
      );
      return;
    }

    const wa = new WhatsApp(waAccount);

    // ✅ Generate activation link for embedded signup
    const activationLink =
      await generateActivationLink(schoolId);

    // Send confirmation to school admin
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
        {
          day:   'numeric',
          month: 'long',
          year:  'numeric',
        }
      )}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `*Final Step — Connect Your WhatsApp:*\n\n` +
      `Tap the link below to connect your\n` +
      `school's WhatsApp number:\n\n` +
      `👇 *${activationLink}*\n\n` +
      `⏰ Link valid for *7 days*\n` +
      `Takes less than 2 minutes! ✅\n\n` +
      `_Need help? Contact us on WhatsApp_`
    );

    // Notify super admin
    if (SUPER_ADMIN_PHONE && schoolId) {
      const { data: school } = await db
        .from('schools')
        .select('name')
        .eq('id', schoolId)
        .maybeSingle();

      const superWa = new WhatsApp(waAccount);

      await superWa.text(
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
    console.error(
      '[Payment] setup confirmation error:', err
    );
    throw err;
  }
}

// ============================================================
// GENERATE ACTIVATION LINK
// ✅ Creates a unique token for school embedded signup
// ============================================================

async function generateActivationLink(
  schoolId: string | null
): Promise<string> {
  if (!schoolId) return `${APP_URL}/activate`;

  try {
    // Generate unique token
    const token = crypto.randomUUID()
      .replace(/-/g, '');

    // Save token — expires in 7 days
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
    console.error(
      '[Payment] generateActivationLink error:', err
    );
    // Fallback to generic activation page
    return `${APP_URL}/activate`;
  }
}

// ============================================================
// FEE CONFIRMATION (Parent payment)
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

    if (!parentPhone || !studentId || !reference) {
      console.warn(
        '[Payment] sendFeeConfirmation: missing fields',
        { parentPhone, studentId, reference }
      );
      return;
    }

    const { data: student } = await db
      .from('students')
      .select('first_name, last_name')
      .eq('id', studentId)
      .maybeSingle();

    const waAccount = await getWaAccount(schoolId);
    if (!waAccount) {
      console.warn(
        `[Payment] No active WA account ` +
        `for school ${schoolId}`
      );
      return;
    }

    const wa = new WhatsApp(waAccount);

    await wa.text(
      parentPhone,
      `🎉 *Payment Successful!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Payment confirmed!\n\n` +
      `👤 *Student:*\n` +
      `${student?.first_name ?? ''} ` +
      `${student?.last_name ?? ''}\n\n` +
      `💵 School Fee:\n` +
      `   *${fmt(schoolFeeAmount)}*\n` +
      `🏷️ Platform Fee:\n` +
      `   *${fmt(platformCommission)}*\n` +
      `🏦 Processing Fee:\n` +
      `   *${fmt(paystackCharge)}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💳 *Total Paid:*\n` +
      `   *${fmt(totalPaid)}*\n\n` +
      `🏫 School received full\n` +
      `*${fmt(schoolFeeAmount)}* ✅\n\n` +
      `💳 *Method:* ${channel}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG', {
        day:   'numeric',
        month: 'long',
        year:  'numeric',
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

    // Auto-generate and send receipt
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
      // Non-fatal
      console.warn(
        '[Payment] receipt generation error:',
        receiptErr
      );
    }
  } catch (err) {
    console.error(
      '[Payment] fee confirmation error:', err
    );
    throw err;
  }
}
