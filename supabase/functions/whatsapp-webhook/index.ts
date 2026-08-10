// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (PRODUCTION)
// supabase/functions/whatsapp-webhook/index.ts
//
// Entry point for ALL school WhatsApp numbers.
// Each school registers their own WhatsApp number.
// This webhook receives messages from ALL schools and routes
// them to the correct school bot handler.
// ============================================================

import { handleMessage } from '../_shared/bot/handler.ts';
import { getSupabase } from '../_shared/supabase.ts';
import type {
  WebhookBody,
  IncomingMessage,
  WhatsAppAccount,
} from '../_shared/types.ts';

const db = getSupabase();

Deno.serve(async (req: Request): Promise<Response> => {

  // ── GET: WhatsApp webhook verification ──────────────────
  if (req.method === 'GET') {
    const url   = new URL(req.url);
    const mode  = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('[Webhook] ✅ Verified');
      return new Response(challenge ?? '', { status: 200 });
    }

    console.warn('[Webhook] ❌ Verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ──────────────────────────────
  if (req.method === 'POST') {
    // Always respond 200 immediately so WhatsApp
    // does not retry the webhook
    const rawBody = await req.text();

    // Fire and forget — process in background
    processWebhook(rawBody).catch((err) => {
      console.error('[Webhook] Background error:', err);
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
    console.error('[Webhook] Invalid JSON body');
    return;
  }

  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  const entry  = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value  = change?.value;

  if (!value) return;

  // ── Ignore status updates (delivered, read, etc.) ───────
  if (value.statuses?.length) return;

  // ── Must have messages ───────────────────────────────────
  if (!value.messages?.length) return;

  const message = value.messages[0] as IncomingMessage;

  // ── Identify which school this message is for ────────────
  // WhatsApp sends the phone_number_id in every webhook
  // This tells us WHICH school's number received the message
  const phoneNumberId = value.metadata?.phone_number_id;

  if (!phoneNumberId) {
    console.error('[Webhook] No phone_number_id in metadata');
    return;
  }

  // Look up the school WhatsApp account
  const waAccount = await getWaAccount(phoneNumberId);

  if (!waAccount) {
    console.warn(
      `[Webhook] No active school found for phone_number_id: ${phoneNumberId}`
    );
    // Could be platform test number — try default env credentials
    await handleMessage(message, null);
    return;
  }

  console.log(
    `[Webhook] Message from ${message.from} ` +
    `→ School: ${waAccount.school_id} ` +
    `| Type: ${message.type}`
  );

  // ── Route to main bot handler ────────────────────────────
  await handleMessage(message, waAccount);
}

// ─── Get WhatsApp account by phone_number_id ──────────────
async function getWaAccount(
  phoneNumberId: string
): Promise<WhatsAppAccount | null> {
  const { data, error } = await db
    .from('whatsapp_accounts')
    .select('id, school_id, phone_number_id, access_token, status')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .single();

  if (error || !data) return null;

  return data as WhatsAppAccount;
}
