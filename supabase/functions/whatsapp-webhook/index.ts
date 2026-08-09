// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (MINIMAL SAFE VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

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

  // ── POST: Incoming message ─────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('[WEBHOOK BODY]', JSON.stringify(body));

      if (body.object !== 'whatsapp_business_account') {
        return new Response('OK', { status: 200 });
      }

      const value = body.entry?.[0]?.changes?.[0]?.value;

      // Ignore status updates
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

      console.log('[INCOMING MESSAGE]', JSON.stringify(message));

      // Extract text only
      let text = '';
      if (message.type === 'text') {
        text = message.text?.body?.trim().toLowerCase() ?? '';
      } else if (message.type === 'interactive') {
        text =
          message.interactive?.button_reply?.id?.toLowerCase() ??
          message.interactive?.list_reply?.id?.toLowerCase() ??
          '';
      }

      console.log('[PARSED TEXT]', text);

      if (['hi', 'hello', 'start', 'menu'].includes(text)) {
        await sendText(
          phone,
          `✅ XtopEdu bot is working!\n\n` +
            `Welcome to SchoolBot 👋\n\n` +
            `This confirms:\n` +
            `• Webhook works ✅\n` +
            `• Access token works ✅\n` +
            `• Phone Number ID works ✅\n\n` +
            `Next step: restore full bot features.`
        );
      } else {
        await sendText(
          phone,
          `I received your message: "${text || 'unknown'}"\n\nType *hi* to test again.`
        );
      }

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('[POST ERROR]', err);
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
async function sendText(
  to: string,
  body: string
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';

  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';

  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

  const cleanedTo = to.replace(/\D/g, '');

  console.log('[SEND]', {
    apiUrl,
    phoneNumberId,
    to: cleanedTo,
  });

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
        text: { body },
      }),
    }
  );

  const data = await res.json();
  console.log('[SEND RESULT]', JSON.stringify(data));

  if (!res.ok) {
    throw new Error(
      `WhatsApp send failed: ${res.status} ${JSON.stringify(data)}`
    );
  }
}
