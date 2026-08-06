// ============================================================
// SCHOOLBOT - PAYMENT CALLBACK
// supabase/functions/payment-callback/index.ts
// ============================================================

import { PaystackService } from '../_shared/paystack.service.ts';
import { WhatsApp } from '../_shared/whatsapp.ts';
import { getSupabase } from '../_shared/supabase.ts';
import { ReceiptService } from '../_shared/receipt.service.ts';

const paystack = new PaystackService();
const db = getSupabase();
const receiptSvc = new ReceiptService();

Deno.serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  // ── GET: Paystack redirect after payment ─────────────────────
  if (req.method === 'GET') {
    const ref =
      url.searchParams.get('ref') ??
      url.searchParams.get('reference') ??
      url.searchParams.get('trxref');

    const paymentType =
      url.searchParams.get('type') ?? 'school_fee';

    const appUrl = Deno.env.get('APP_URL') ?? '';

    if (!ref) {
      return Response.redirect(
        `${appUrl}/payment/failed?reason=no_reference`
      );
    }

    // ── Setup fee payment ──────────────────────────────────────
    if (paymentType === 'setup_fee') {
      const result = await paystack.verifySetupFee(ref);
      if (result.ok) {
        await sendSetupConfirmation(result);
        return Response.redirect(
          `${appUrl}/onboarding/success?ref=${ref}`
        );
      }
      return Response.redirect(
        `${appUrl}/onboarding/failed?ref=${ref}`
      );
    }

    // ── Parent subscription payment ────────────────────────────
    if (paymentType === 'subscription') {
      const { data: subPayment } = await db
        .from('subscription_payments')
        .select('*')
        .eq('gateway_ref', ref)
        .single();

      if (subPayment) {
        await handleSubscriptionPayment(
          {
            parent_id: subPayment.parent_id,
            school_id: subPayment.school_id,
            plan_slug: subPayment.plan_slug,
            billing_type: subPayment.billing_type,
            parent_phone: null,
          },
          ref,
          subPayment.amount
        );
      }
      return Response.redirect(
        `${appUrl}/payment/success?ref=${ref}`
      );
    }

    // ── School fee payment ─────────────────────────────────────
    const result = await paystack.verifySchoolFee(ref);
    if (result.ok) {
      await sendFeeConfirmation(result);
      return Response.redirect(
        `${appUrl}/payment/success?ref=${ref}&amount=${result.totalPaid}`
      );
    }
    return Response.redirect(
      `${appUrl}/payment/failed?ref=${ref}`
    );
  }

  // ── POST: Paystack server-to-server webhook ──────────────────
  if (req.method === 'POST') {
    const signature = req.headers.get('x-paystack-signature');
    const rawBody = await req.text();

    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      console.warn('[Payment] Invalid Paystack signature');
      return new Response('Unauthorized', { status: 401 });
    }

    // Respond 200 immediately
    const response = new Response('OK', { status: 200 });

    // Process in background
    const event = JSON.parse(rawBody);
    console.log(`[Payment] Paystack event: ${event.event}`);

    processPaystackEvent(event).catch((err) => {
      console.error('[Payment] Event processing error:', err);
    });

    return response;
  }

  return new Response('Not Found', { status: 404 });
});

// ─── Process Paystack event ────────────────────────────────────
async function processPaystackEvent(
  event: Record<string, unknown>
): Promise<void> {
  if (event.event !== 'charge.success') return;

  const data = event.data as Record<string, unknown>;
  const meta = (data.metadata as Record<string, unknown>) ?? {};
  const ref = data.reference as string;
  const paymentType =
    (meta.payment_type as string) ?? 'school_fee';

  console.log(`[Payment] Processing: ${paymentType} - ${ref}`);

  if (paymentType === 'setup_fee') {
    // ── Setup fee ────────────────────────────────────────────
    const result = await paystack.verifySetupFee(ref);
    if (result.ok) await sendSetupConfirmation(result);

  } else if (paymentType === 'subscription') {
    // ── Parent alert subscription ────────────────────────────
    const amount = (data.amount as number) / 100;
    await handleSubscriptionPayment(meta, ref, amount);

  } else {
    // ── School fee payment ───────────────────────────────────
    const result = await paystack.verifySchoolFee(ref);
    if (result.ok) await sendFeeConfirmation(result);
  }
}

// ─── Handle parent subscription payment ───────────────────────
async function handleSubscriptionPayment(
  meta: Record<string, unknown>,
  reference: string,
  amount: number
): Promise<void> {
  try {
    const parentId   = meta.parent_id   as string;
    const schoolId   = meta.school_id   as string;
    const planSlug   = meta.plan_slug   as string;
    const billingType = meta.billing_type as 'monthly' | 'termly';
    let parentPhone  = meta.parent_phone as string | null;

    if (!parentId || !schoolId || !planSlug) {
      console.error('[Subscription] Missing meta fields');
      return;
    }

    // Get parent phone if not in meta
    if (!parentPhone) {
      const { data: parent } = await db
        .from('parents')
        .select('phone, whatsapp_number')
        .eq('id', parentId)
        .single();

      parentPhone =
        parent?.whatsapp_number ?? parent?.phone ?? null;
    }

    // Update subscription payment to Success
    await db
      .from('subscription_payments')
      .update({
        status: 'Success',
        paid_at: new Date().toISOString(),
      })
      .eq('gateway_ref', reference);

    // Calculate expiry date
    const now = new Date();
    let expiresAt: Date;

    if (billingType === 'termly') {
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 3);
    } else {
      expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    }

    // Get plan ID
    const { data: plan } = await db
      .from('alert_plans')
      .select('id, name, features')
      .eq('slug', planSlug)
      .single();

    // Activate/update subscription
    await db
      .from('parent_subscriptions')
      .upsert(
        {
          parent_id: parentId,
          school_id: schoolId,
          plan_id: plan?.id ?? null,
          plan_slug: planSlug,
          billing_type: billingType,
          amount_paid: amount,
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          next_billing: expiresAt.toISOString().split('T')[0],
          gateway_ref: reference,
          auto_renew: true,
          updated_at: now.toISOString(),
        },
        { onConflict: 'parent_id,school_id' }
      );

    console.log(
      `[Subscription] ✅ Activated ${planSlug} for parent ${parentId}`
    );

    // Send WhatsApp confirmation to parent
    if (parentPhone) {
      const { data: waAccount } = await db
        .from('whatsapp_accounts')
        .select('phone_number_id, access_token, status')
        .eq('school_id', schoolId)
        .eq('status', 'active')
        .single();

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
        billingType === 'termly' ? '3 months (1 term)' : '1 month';

      const expiryStr = expiresAt.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      const fmt = (n: number) =>
        new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(n);

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

      // Log notification
      await db.from('notifications').insert({
        school_id: schoolId,
        channel: 'whatsapp',
        type: 'subscription_activated',
        recipient: parentPhone,
        title: `${planSlug} plan activated`,
        message: `Alert plan activated for ${billingLabel}`,
        status: 'sent',
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[Subscription] activation error:', err);
  }
}

// ─── Send setup fee confirmation ───────────────────────────────
async function sendSetupConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const {
      schoolId,
      adminPhone,
      amount,
      studentCount,
      tierName,
    } = result;

    if (!adminPhone) return;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(n);

    const { data: waAccount } = schoolId
      ? await db
          .from('whatsapp_accounts')
          .select('phone_number_id, access_token, status')
          .eq('school_id', schoolId as string)
          .eq('status', 'active')
          .single()
      : { data: null };

    const wa = new WhatsApp(waAccount);

    await wa.text(
      adminPhone as string,
      `🎉 *Setup Fee Confirmed!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Your SchoolBot account\n` +
      `is now active!\n\n` +
      `💵 *Amount Paid:* ${fmt(amount as number)}\n` +
      `👥 *Students:* ${studentCount}\n` +
      `📦 *Tier:* ${tierName}\n` +
      `📅 *Date:* ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `*What happens next:*\n` +
      `1️⃣ Add your bank account\n` +
      `2️⃣ Set up your classes\n` +
      `3️⃣ Invite your staff\n` +
      `4️⃣ Go LIVE! 🚀\n\n` +
      `Type *menu* to continue setup.`
    );

    // Notify super admin (you)
    const superPhone = Deno.env.get('SUPER_ADMIN_PHONE');
    if (superPhone && schoolId) {
      const { data: school } = await db
        .from('schools')
        .select('name')
        .eq('id', schoolId as string)
        .single();

      const notifyWa = new WhatsApp();
      await notifyWa.text(
        superPhone,
        `💰 *Setup Fee Received!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `🏫 *School:* ${school?.name ?? 'Unknown'}\n` +
        `💵 *Amount:* ${fmt(amount as number)}\n` +
        `👥 *Students:* ${studentCount}\n` +
        `📦 *Tier:* ${tierName}\n` +
        `📱 *Admin:* ${adminPhone}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    }
  } catch (err) {
    console.error('[Payment] setup confirmation error:', err);
  }
}

// ─── Send school fee confirmation ──────────────────────────────
async function sendFeeConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const {
      parentPhone,
      studentId,
      schoolId,
      schoolFeeAmount,
      platformCommission,
      paystackCharge,
      totalPaid,
      channel,
      reference,
    } = result;

    if (!parentPhone || !studentId) return;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
      }).format(n);

    // Get student details
    const { data: student } = await db
      .from('students')
      .select('first_name, last_name')
      .eq('id', studentId as string)
      .single();

    // Get school WA account
    const { data: waAccount } = schoolId
      ? await db
          .from('whatsapp_accounts')
          .select('phone_number_id, access_token, status')
          .eq('school_id', schoolId as string)
          .eq('status', 'active')
          .single()
      : { data: null };

    const wa = new WhatsApp(waAccount);

    // Send payment confirmation to parent
    await wa.text(
      parentPhone as string,
      `🎉 *Payment Successful!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Payment confirmed!\n\n` +
      `👤 *Student:*\n` +
      `${student?.first_name} ${student?.last_name}\n\n` +
      `💵 School Fee:\n` +
      `   *${fmt(schoolFeeAmount as number)}*\n` +
      `🏷️ Platform Fee:\n` +
      `   *${fmt(platformCommission as number)}*\n` +
      `🏦 Processing Fee:\n` +
      `   *${fmt(paystackCharge as number)}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💳 *Total Paid:*\n` +
      `   *${fmt(totalPaid as number)}*\n\n` +
      `🏫 School received full\n` +
      `*${fmt(schoolFeeAmount as number)}* ✅\n\n` +
      `💳 *Method:* ${channel ?? 'Online'}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Thank you! 🙏\n` +
      `_Type *menu* to return_`
    );

    // Log notification
    await db.from('notifications').insert({
      school_id: schoolId,
      channel: 'whatsapp',
      type: 'payment_confirmation',
      recipient: parentPhone,
      title: 'Payment Confirmed',
      message: `Payment of ${fmt(totalPaid as number)} confirmed`,
      status: 'sent',
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Auto generate and send receipt
    try {
      const { data: payment } = await db
        .from('payments')
        .select('id')
        .eq('gateway_reference', reference as string)
        .single();

      if (payment?.id) {
        const receipt = await receiptSvc.generateReceipt(payment.id);
        await receiptSvc.sendReceiptToParent(
          receipt.receiptId,
          parentPhone as string,
          waAccount
        );
      }
    } catch (receiptErr) {
      console.warn('[Payment] receipt error:', receiptErr);
    }

  } catch (err) {
    console.error('[Payment] fee confirmation error:', err);
  }
}

// ─── Verify Paystack HMAC-SHA512 signature ─────────────────────
async function verifySignature(
  body: string,
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

    return computed === signature;
  } catch {
    return false;
  }
}
