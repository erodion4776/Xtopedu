// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { handleMessage } from '../_shared/bot/handler.ts';
import { getSupabase } from '../_shared/supabase.ts';
import type { WebhookBody } from '../_shared/types.ts';

const db = getSupabase();

Deno.serve(async (req: Request): Promise<Response> => {

  // ── GET: Meta webhook verification ──────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN'
    );

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verified');
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ──────────────────────────────
  if (req.method === 'POST') {
    const body: WebhookBody = await req.json().catch(() => null);

    // Respond 200 immediately to Meta
    const response = new Response('OK', { status: 200 });

    // Process in background
    processWebhook(body).catch((err) => {
      console.error('[Webhook] error:', err);
    });

    return response;
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processWebhook(body: WebhookBody): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') return;

  // Log to DB
  db.from('whatsapp_webhooks').insert({
    event_type: 'incoming',
    payload: body,
    processed: false,
    created_at: new Date().toISOString(),
  }).then(() => {}).catch(() => {});

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // Handle delivery status updates
  if (value.statuses?.length) {
    for (const status of value.statuses) {
      await db
        .from('whatsapp_messages')
        .update({
          delivery_status: status.status,
          ...(status.status === 'delivered'
            ? { delivered_at: new Date().toISOString() }
            : {}),
          ...(status.status === 'read'
            ? { read_at: new Date().toISOString() }
            : {}),
        })
        .eq('whatsapp_message_id', status.id);
    }
    return;
  }

  // Handle incoming messages
  if (!value.messages?.length) return;

  const message = value.messages[0];

  console.log(`[Webhook] ${message.type} from ${message.from}`);

  // Handle supported types
  if (['text', 'interactive', 'document'].includes(message.type)) {
    await handleMessage(message);
    return;
  }

  // Unsupported type
  if (['image', 'audio', 'video', 'sticker'].includes(message.type)) {
    const { WhatsApp } = await import('../_shared/whatsapp.ts');
    const wa = new WhatsApp();
    await wa.text(
      message.from,
      `I can only handle:\n` +
      `• Text messages\n` +
      `• Menu selections\n` +
      `• CSV files\n\n` +
      `Type *menu* to get started! 😊`
    );
  }
}
