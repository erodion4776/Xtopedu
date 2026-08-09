// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (SAFE DEBUG VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import { WhatsApp } from '../_shared/whatsapp.ts';
import { getSupabase } from '../_shared/supabase.ts';
import type { WebhookBody } from '../_shared/types.ts';

const db = getSupabase();

Deno.serve(async (req: Request): Promise<Response> => {
  // ── GET: Webhook verification ──────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken =
      Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verified');
      return new Response(challenge ?? '', { status: 200 });
    }

    console.error('❌ Verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ───────────────────────────────
  if (req.method === 'POST') {
    const body: WebhookBody = await req.json().catch(() => null);

    // Always return 200 immediately
    const response = new Response('OK', { status: 200 });

    processWebhook(body).catch((err) => {
      console.error('[Webhook] process error:', err);
    });

    return response;
  }

  return new Response('Method Not Allowed', { status: 405 });
});

async function processWebhook(body: WebhookBody | null): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') {
    console.error('❌ Invalid webhook body');
    return;
  }

  // Save raw webhook
  await db.from('whatsapp_webhooks').insert({
    event_type: 'incoming',
    payload: body,
    processed: false,
    created_at: new Date().toISOString(),
  }).catch((err) => {
    console.error('❌ Failed to save webhook', err);
  });

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) {
    console.error('❌ No value in webhook');
    return;
  }

  // Ignore status updates for now
  if (value.statuses?.length) {
    console.log('ℹ️ Got status update');
    return;
  }

  if (!value.messages?.length) {
    console.error('❌ No messages in webhook');
    return;
  }

  const message = value.messages[0];
  const phone = message.from;

  console.log('📩 Incoming message:', JSON.stringify(message));

  // Only handle text and interactive
  if (!['text', 'interactive'].includes(message.type)) {
    const wa = new WhatsApp();
    await wa.text(
      phone,
      `I can only understand text messages and menu selections for now.\n\nType *hi* to continue.`
    );
    return;
  }

  const wa = new WhatsApp();

  // Extract text or button/list reply
  let input = '';
  if (message.type === 'text') {
    input = message.text?.body?.trim().toLowerCase() ?? '';
  } else if (message.type === 'interactive') {
    input =
      message.interactive?.button_reply?.id?.toLowerCase() ??
      message.interactive?.list_reply?.id?.toLowerCase() ??
      '';
  }

  console.log('📝 Parsed input:', input);

  // TEMP SAFE RESPONSE
  // This guarantees the bot replies while we verify webhook flow
  if (['hi', 'hello', 'start', 'menu'].includes(input)) {
    await wa.list(
      phone,
      '🏫 Welcome to SchoolBot',
      `Hi there! 👋\n\nYour WhatsApp bot is now connected successfully.\n\nWhat would you like to do?`,
      'SchoolBot Demo',
      'Choose Option',
      [
        {
          title: 'Get Started',
          rows: [
            {
              id: 'DEMO_ATTENDANCE',
              title: '✅ Attendance Demo',
              description: 'See how school alerts work',
            },
            {
              id: 'DEMO_FEES',
              title: '💰 Fee Demo',
              description: 'See how fee payment works',
            },
            {
              id: 'REGISTER_SCHOOL',
              title: '🏫 Register School',
              description: 'Start onboarding your school',
            },
          ],
        },
      ]
    );

    console.log('✅ Welcome menu sent');
    return;
  }

  if (input === 'demo_attendance') {
    await wa.text(
      phone,
      `✅ *Attendance Demo*\n\n` +
      `When a teacher marks a child absent, the parent gets:\n\n` +
      `❌ *Absence Alert*\n` +
      `Your child Chidi Okonkwo was marked absent today.\n` +
      `🏫 Class: JSS 3A\n\n` +
      `This happens instantly on WhatsApp.`
    );
    return;
  }

  if (input === 'demo_fees') {
    await wa.text(
      phone,
      `💰 *Fee Demo*\n\n` +
      `Parent sees:\n` +
      `School Fee: ₦50,000\n` +
      `Platform Fee: ₦750\n` +
      `Processing Fee: ₦125\n` +
      `━━━━━━━━━━━━\n` +
      `Total: ₦50,875\n\n` +
      `School still gets full ₦50,000 ✅`
    );
    return;
  }

  if (input === 'register_school') {
    await wa.text(
      phone,
      `🏫 *Register Your School*\n\n` +
      `Great! Let's begin.\n\n` +
      `What is your full name?`
    );
    return;
  }

  // Fallback
  await wa.text(
    phone,
    `I got your message: *${input || 'unknown'}*\n\nType *hi* to see the menu again.`
  );
}
