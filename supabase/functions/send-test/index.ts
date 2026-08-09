// ============================================================
// SCHOOLBOT - DIRECT SEND TEST
// supabase/functions/send-test/index.ts
// ============================================================

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    const url = new URL(req.url);

    // Security check
    const secret = url.searchParams.get('secret');
    if (secret !== Deno.env.get('TEST_SEND_SECRET')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const to = url.searchParams.get('to');
    if (!to) {
      return new Response(
        JSON.stringify({ error: 'Missing ?to=234xxxxxxxxxx' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    const accessToken = Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';
    const apiUrl =
      Deno.env.get('WHATSAPP_API_URL') ??
      'https://graph.facebook.com/v25.0';

    const cleanedTo = to.replace(/\D/g, '');

    const payload = {
      messaging_product: 'whatsapp',
      to: cleanedTo,
      type: 'text',
      text: {
        body:
          '✅ XtopEdu test message successful!\n\n' +
          'Your WhatsApp API, token and phone number ID are working correctly. 🚀',
      },
    };

    const res = await fetch(
      `${apiUrl}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();

    return new Response(
      JSON.stringify({
        ok: res.ok,
        status: res.status,
        phoneNumberId,
        sentTo: cleanedTo,
        response: data,
      }),
      {
        status: res.ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
