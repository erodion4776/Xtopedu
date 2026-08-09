Deno.serve(async (req: Request): Promise<Response> => {
  // Verify webhook
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // Receive messages
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('WEBHOOK BODY:', JSON.stringify(body));

      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      if (!message) {
        console.log('No incoming message found');
        return new Response('OK', { status: 200 });
      }

      const phone = message.from;
      const apiUrl =
        Deno.env.get('WHATSAPP_API_URL') ??
        'https://graph.facebook.com/v25.0';
      const phoneNumberId =
        Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
      const accessToken =
        Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

      const response = await fetch(
        `${apiUrl}/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone,
            type: 'text',
            text: {
              body: '✅ Tiny webhook reply works.',
            },
          }),
        }
      );

      const result = await response.text();
      console.log('SEND RESULT:', result);

      return new Response('OK', { status: 200 });
    } catch (err) {
      console.error('WEBHOOK ERROR:', String(err));
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
