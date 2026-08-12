// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { handleMessage } from '../_shared/bot/handler.ts';
import { getSupabase }   from '../_shared/supabase.ts';
import type {
  WebhookBody,
  IncomingMessage,
  WhatsAppAccount,
} from '../_shared/types.ts';

const db = getSupabase();

const PLATFORM_PHONE_NUMBER_ID =
  Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

Deno.serve(async (req: Request): Promise<Response> => {

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

    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    const rawBody = await req.text();

    processWebhook(rawBody).catch((err) => {
      console.error('[Webhook] Processing error:', err);
    });

    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processWebhook(
  rawBody: string
): Promise<void> {
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
  if (value.statuses?.length)  return;
  if (!value.messages?.length) return;

  const message =
    value.messages[0] as IncomingMessage;

  const incomingPhoneNumberId =
    value.metadata?.phone_number_id ?? '';

  const isPlatformNumber =
    incomingPhoneNumberId === PLATFORM_PHONE_NUMBER_ID;

  let waAccount: WhatsAppAccount | null = null;

  if (isPlatformNumber) {
    waAccount = {
      id:              'platform',
      school_id:       'platform',
      phone_number_id: PLATFORM_PHONE_NUMBER_ID,
      access_token:
        Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '',
      status: 'active',
    };
  } else {
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

  await handleMessage(
    message, waAccount, isPlatformNumber
  );
}

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
