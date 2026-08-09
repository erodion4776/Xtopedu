// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (ULTRA SIMPLE DEBUG)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

import type { WebhookBody } from '../_shared/types.ts';

Deno.serve(async (req: Request): Promise<Response> => {
  // ── GET: Webhook verification ──────────────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const verifyToken =
      Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    console.log('[VERIFY]', { mode, token, verifyToken });

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming webhook ─────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body: WebhookBody = await req.json();

      console.log('[WEBHOOK BODY]', JSON.stringify(body));

      if (body.object !== 'whatsapp_business_account') {
        return new Response('OK', { status: 200 });
      }

      const value = body.entry?.[0]?.changes?.[0]?.value;

      // Ignore statuses
      if (value?.statuses?.length) {
        console.log('[STATUS UPDATE]', JSON.stringify(value.statuses));
        return new Response('OK', { status: 200 });
      }

      if (!value?.messages?.length) {
        console.log('[NO MESSAGES]');
        return new Response('OK', { status: 200 });
      }

      const message = value.messages[0];
      const phone = message.from;

      console.log('[INCOMING]', {
        from: phone,
        type: message.type,
        text: message.text?.body ?? null,
      });

      // Only handle text for now
      if (message.type === 'text') {
        const input = message.text?.body?.trim().toLowerCase() ?? '';

        if (['hi', 'hello', 'start', 'menu'].includes(input)) {
          const sendResult = await sendWhatsAppText(
            phone,
            `✅ SchoolBot is responding!\n\n` +
            `Welcome to XtopEdu WhatsApp bot.\n\n` +
            `This confirms:\n` +
            `• Webhook is working ✅\n` +
            `• Access token is working ✅\n` +
            `• Phone number ID is working ✅\n\n` +
            `Next step is to restore the full bot menu.`
          );

          console.log('[SEND RESULT]', JSON.stringify(sendResult));
        } else {
          const sendResult = await sendWhatsAppText(
            phone,
            `You said: ${message.text?.body}\n\n` +
            `Type *hi* to test again.`
          );

          console.log('[ECHO RESULT]', JSON.stringify(sendResult));
        }
      } else {
        const sendResult = await sendWhatsAppText(
          phone,
          `I only understand text messages for now.\n\nType *hi* to test the bot.`
        );
        console.log('[NON-TEXT RESULT]', JSON.stringify(sendResult));
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[WEBHOOK ERROR]', err);
      return new Response(
        JSON.stringify({ error: String(err) }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});

// ─── Direct WhatsApp send helper ──────────────────────────────
async function sendWhatsAppText(
  to: string,
  body: string
): Promise<unknown> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';

  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const cleanedTo = to.replace(/\D/g, '');

  const res = await fetch(
    `${apiUrl}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanedTo,
        type: 'text',
        text: {
          body,
        },
      }),
    }
  );

  const data = await res.json();

  return {
    ok: res.ok,
    status: res.status,
    response: data,
  };
}
