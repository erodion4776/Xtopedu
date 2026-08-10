// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK
// supabase/functions/whatsapp-webhook/index.ts
//
// ONE webhook handles ALL numbers:
// - Your platform number → Marketing + Super Admin
// - Each school's own number → School bot
// ============================================================

import { handleMessage } from '../_shared/bot/handler.ts';
import { getSupabase }   from '../_shared/supabase.ts';
import type {
  WebhookBody,
  IncomingMessage,
  WhatsAppAccount,
} from '../_shared/types.ts';

const db = getSupabase();

// Your platform WhatsApp phone_number_id (08073128887)
const PLATFORM_PHONE_NUMBER_ID =
  Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

Deno.serve(async (req: Request): Promise<Response> => {

  // ── GET: Webhook verification ──────────────────────────
  if (req.method === 'GET') {
    const url       = new URL(req.url);
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken =
      Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Webhook] ✅ Verified');
      return new Response(challenge ?? '', { status: 200 });
    }

    console.warn('[Webhook] ❌ Verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ────────────────────────────
  if (req.method === 'POST') {
    const rawBody = await req.text();

    // Respond 200 immediately so WhatsApp doesn't retry
    processWebhook(rawBody).catch((err) => {
      console.error('[Webhook] Processing error:', err);
    });

    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

// ─── Process webhook payload ───────────────────────────────
async function processWebhook(rawBody: string): Promise<void> {
  let body: WebhookBody;

  try {
    body = JSON.parse(rawBody);
  } catch {
    console.error('[Webhook] Invalid JSON');
    return;
  }

  if (
    !body ||
    body.object !== 'whatsapp_business_account'
  ) return;

  const value =
    body.entry?.[0]?.changes?.[0]?.value;

  if (!value)                  return;
  if (value.statuses?.length)  return; // ignore read receipts
  if (!value.messages?.length) return;

  const message =
    value.messages[0] as IncomingMessage;

  // ── Which number received this message? ────────────────
  const incomingPhoneNumberId =
    value.metadata?.phone_number_id ?? '';

  const isPlatformNumber =
    incomingPhoneNumberId === PLATFORM_PHONE_NUMBER_ID;

  let waAccount: WhatsAppAccount | null = null;

  if (isPlatformNumber) {
    // This is YOUR number (08073128887)
    waAccount = {
      id:              'platform',
      school_id:       'platform',
      phone_number_id: PLATFORM_PHONE_NUMBER_ID,
      access_token:
        Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
      status: 'active',
    };
  } else {
    // This is a SCHOOL number — look up in DB
    waAccount = await getSchoolWaAccount(
      incomingPhoneNumberId
    );

    if (!waAccount) {
      console.warn(
        `[Webhook] Unknown phone_number_id: ${incomingPhoneNumberId}`
      );
      return;
    }
  }

  console.log(
    `[Webhook] From: ${message.from} | ` +
    `Platform: ${isPlatformNumber} | ` +
    `Type: ${message.type}`
  );

  // ── Route to main bot handler ──────────────────────────
  await handleMessage(message, waAccount, isPlatformNumber);
}

// ─── Get school WhatsApp account by phone_number_id ────────
async function getSchoolWaAccount(
  phoneNumberId: string
): Promise<WhatsAppAccount | null> {
  const { data } = await db
    .from('whatsapp_accounts')
    .select(
      'id, school_id, phone_number_id, access_token, status'
    )
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .single();

  return (data as WhatsAppAccount | null) ?? null;
}
