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

  // ── GET: Paystack redirect ───────────────────────────────
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

    const result = await paystack.verifySchoolFee(ref);
    if (result.ok) {
      await sendFeeConfirmation(result);
      return Response.redirect(
        `${appUrl}/payment/success?ref=${ref}`
      );
    }
    return Response.redirect(
      `${appUrl}/payment/failed?ref=${ref}`
    );
  }

  // ── POST: Paystack server webhook ────────────────────────
  if (req.method === 'POST') {
    const signature = req.headers.get('x-paystack-signature');
    const rawBody = await req.text();

    const isValid = await verifySignature(rawBody, signature);
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 });
    }

    const response = new Response('OK', { status: 200 });

    const event = JSON.parse(rawBody);
    processEvent(event).catch((err) => {
      console.error('[Payment] event error:', err);
    });

    return response;
  }

  return new Response('Not Found', { status: 404 });
});

async function processEvent(
  event: Record<string, unknown>
): Promise<void> {
  if (event.event !== 'charge.success') return;

  const data = event.data as Record<string, unknown>;
  const meta = (data.metadata as Record<string, unknown>) ?? {};
  const ref = data.reference as string;
  const paymentType = (meta.payment_type as string) ?? 'school_fee';

  if (paymentType === 'setup_fee') {
    const result = await paystack.verifySetupFee(ref);
    if (result.ok) await sendSetupConfirmation(result);
  } else {
    const result = await paystack.verifySchoolFee(ref);
    if (result.ok) await sendFeeConfirmation(result);
  }
}

async function sendSetupConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const { schoolId, adminPhone, amount, studentCount, tierName } = result;
    if (!adminPhone) return;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency', currency: 'NGN',
      }).format(n);

    const { data: waAccount } = schoolId
      ? await db.from('whatsapp_accounts')
          .select('phone_number_id, access_token, status')
          .eq('school_id', schoolId as string)
          .eq('status', 'active').single()
      : { data: null };

    const wa = new WhatsApp(waAccount);

    await wa.text(
      adminPhone as string,
      `🎉 *Setup Fee Confirmed!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Your SchoolBot account is active!\n\n` +
      `💵 *Amount:* ${fmt(amount as number)}\n` +
      `👥 *Students:* ${studentCount}\n` +
      `📦 *Tier:* ${tierName}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric', month: 'long', year: 'numeric',
      })}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Type *menu* to continue setup. 🚀`
    );

    const superPhone = Deno.env.get('SUPER_ADMIN_PHONE');
    if (superPhone && schoolId) {
      const { data: school } = await db.from('schools')
        .select('name').eq('id', schoolId as string).single();

      const notifyWa = new WhatsApp();
      await notifyWa.text(
        superPhone,
        `💰 *Setup Fee Received!*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `🏫 ${school?.name}\n` +
        `💵 ${fmt(amount as number)}\n` +
        `👥 ${studentCount} students\n` +
        `📱 Admin: ${adminPhone}\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `⏰ ${new Date().toLocaleString('en-NG')}`
      );
    }
  } catch (err) {
    console.error('[Payment] setup confirmation error:', err);
  }
}

async function sendFeeConfirmation(
  result: Record<string, unknown>
): Promise<void> {
  try {
    const {
      parentPhone, studentId, schoolId,
      schoolFeeAmount, platformCommission,
      paystackCharge, totalPaid, channel, reference,
    } = result;

    if (!parentPhone || !studentId) return;

    const fmt = (n: number) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency', currency: 'NGN',
      }).format(n);

    const { data: student } = await db.from('students')
      .select('first_name, last_name')
      .eq('id', studentId as string).single();

    const { data: waAccount } = schoolId
      ? await db.from('whatsapp_accounts')
          .select('phone_number_id, access_token, status')
          .eq('school_id', schoolId as string)
          .eq('status', 'active').single()
      : { data: null };

    const wa = new WhatsApp(waAccount);

    await wa.text(
      parentPhone as string,
      `🎉 *Payment Successful!*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `✅ Payment confirmed!\n\n` +
      `👤 *Student:* ${student?.first_name} ${student?.last_name}\n\n` +
      `💵 School Fee:     *${fmt(schoolFeeAmount as number)}*\n` +
      `🏷️ Platform Fee:   *${fmt(platformCommission as number)}*\n` +
      `🏦 Processing Fee: *${fmt(paystackCharge as number)}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `💳 *Total: ${fmt(totalPaid as number)}*\n\n` +
      `🏫 School received *${fmt(schoolFeeAmount as number)}* ✅\n` +
      `💳 *Method:* ${channel ?? 'Online'}\n` +
      `🔖 *Ref:* ${reference}\n` +
      `📅 ${new Date().toLocaleDateString('en-NG', {
        day: 'numeric', month: 'long', year: 'numeric',
      })}\n` +
      `━━━━━━━━━━━━━━━━\n\n` +
      `Thank you! 🙏\n_Type *menu* to return_`
    );

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
      const { data: payment } = await db.from('payments')
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

async function verifySignature(
  body: string,
  sig: string | null
): Promise<boolean> {
  if (!sig) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(Deno.env.get('PAYSTACK_SECRET_KEY') ?? ''),
      { name: 'HMAC', hash: 'SHA-512' },
      false, ['sign']
    );
    const bytes = await crypto.subtle.sign(
      'HMAC', key, new TextEncoder().encode(body)
    );
    const computed = Array.from(new Uint8Array(bytes))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
    return computed === sig;
  } catch { return false; }
}
