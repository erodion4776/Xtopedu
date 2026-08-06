// ============================================================
// SCHOOLBOT - MARKETING WEBHOOK
// supabase/functions/marketing-webhook/index.ts
// ============================================================

import { handleMarketingMessage } from './_shared/bot.handler.ts';
import type { WebhookBody } from '../_shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {

  // ── GET: Webhook verification ──────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken = Deno.env.get(
      'MARKETING_WA_WEBHOOK_VERIFY_TOKEN'
    );

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Marketing webhook verified');
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ────────────────────────────────
  if (req.method === 'POST') {
    const body: WebhookBody = await req.json().catch(() => null);

    // Respond immediately
    const response = new Response('OK', { status: 200 });

    // Process in background
    processMarketing(body).catch((err) => {
      console.error('[Marketing] error:', err);
    });

    return response;
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processMarketing(
  body: WebhookBody
): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // Ignore status updates
  if (value.statuses?.length) return;

  if (!value.messages?.length) return;

  const message = value.messages[0];
  console.log(
    `[Marketing] ${message.type} from ${message.from}`
  );

  // Handle text and interactive only
  if (['text', 'interactive'].includes(message.type)) {
    await handleMarketingMessage(message);
    return;
  }

  // Unsupported message type
  const { WhatsApp } = await import('../_shared/whatsapp.ts');
  const wa = new WhatsApp({
    id: 'marketing',
    school_id: 'platform',
    phone_number_id:
      Deno.env.get('MARKETING_WA_PHONE_NUMBER_ID') ?? '',
    access_token:
      Deno.env.get('MARKETING_WA_ACCESS_TOKEN') ?? '',
    status: 'active',
  });

  await wa.text(
    message.from,
    `Hi! 👋 I can only understand text\n` +
    `messages and menu selections.\n\n` +
    `Type *hi* to see what SchoolBot\n` +
    `can do for your school! 😊`
  );
}
