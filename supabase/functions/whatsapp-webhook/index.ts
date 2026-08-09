// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (PHASE 1 STABLE MENU VERSION)
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

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // ── POST: Incoming messages ─────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      await processWebhook(body);
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

async function processWebhook(body: any): Promise<void> {
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // Ignore status updates for now
  if (value.statuses?.length) {
    console.log('[STATUS UPDATE]', JSON.stringify(value.statuses));
    return;
  }

  if (!value.messages?.length) return;

  const message = value.messages[0];
  const phone = message.from;

  if (!['text', 'interactive'].includes(message.type)) {
    await sendText(
      phone,
      `I can only understand text messages and menu selections for now.\n\nType *hi* to continue.`
    );
    return;
  }

  const rawText = getRawText(message);
  const input = getInput(message);

  console.log('[INCOMING]', {
    phone,
    input,
    rawText,
    type: message.type,
  });

  const superAdminPhone = formatPhone(
    Deno.env.get('SUPER_ADMIN_PHONE') ?? ''
  );
  const senderPhone = formatPhone(phone);
  const isSuperAdmin = senderPhone === superAdminPhone;

  // ── Simple lead capture in one message ─────────────────────
  // Format:
  // Name | School Name | Student Count | Location
  if (!isSuperAdmin && rawText.includes('|')) {
    const parts = rawText.split('|').map((p) => p.trim());

    if (parts.length >= 4) {
      const [name, school, students, location] = parts;

      // Notify super admin
      if (superAdminPhone) {
        await sendText(
          superAdminPhone,
          `🧲 *New School Lead*\n\n` +
            `👤 *Name:* ${name}\n` +
            `🏫 *School:* ${school}\n` +
            `👥 *Students:* ${students}\n` +
            `📍 *Location:* ${location}\n` +
            `📱 *Phone:* ${senderPhone}\n\n` +
            `You can now follow up manually.`
        );
      }

      await sendText(
        phone,
        `✅ *Thank you!*\n\n` +
          `We have received your school details:\n\n` +
          `👤 ${name}\n` +
          `🏫 ${school}\n` +
          `👥 ${students}\n` +
          `📍 ${location}\n\n` +
          `Our team will contact you shortly.\n\n` +
          `Type *hi* to view the demo again.`
      );
      return;
    }
  }

  // ── SUPER ADMIN FLOW ───────────────────────────────────────
  if (isSuperAdmin) {
    await handleSuperAdminFlow(phone, input);
    return;
  }

  // ── DEMO / MARKETING FLOW ──────────────────────────────────
  await handleMarketingFlow(phone, input);
}

// ============================================================
// SUPER ADMIN FLOW
// ============================================================

async function handleSuperAdminFlow(
  phone: string,
  input: string
): Promise<void> {
  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    await sendList(
      phone,
      '🔐 XtopEdu Admin',
      `Welcome back! 👋\n\nWhat would you like to do?`,
      'Super Admin Panel',
      'Open Menu',
      [
        {
          title: 'Platform',
          rows: [
            {
              id: 'ADMIN_SCHOOLS',
              title: '🏫 Schools',
              description: 'View school summary',
            },
            {
              id: 'ADMIN_REVENUE',
              title: '💰 Revenue',
              description: 'View revenue summary',
            },
            {
              id: 'ADMIN_LEADS',
              title: '🧲 Leads',
              description: 'View school leads',
            },
            {
              id: 'ADMIN_TEST',
              title: '🤖 Bot Test',
              description: 'Confirm bot works',
            },
          ],
        },
      ]
    );
    return;
  }

  if (input === 'admin_schools') {
    await sendText(
      phone,
      `🏫 *Schools Summary*\n\n` +
        `Use your web dashboard to see all schools, their student count, onboarding status and activity.\n\n` +
        `Open your dashboard to manage schools.`
    );
    return;
  }

  if (input === 'admin_revenue') {
    await sendText(
      phone,
      `💰 *Revenue Summary*\n\n` +
        `Use your web dashboard to see:\n` +
        `• Setup fee income\n` +
        `• 1.5% commissions\n` +
        `• Monthly billing\n` +
        `• Per-school earnings\n\n` +
        `Open the dashboard for details.`
    );
    return;
  }

  if (input === 'admin_leads') {
    await sendText(
      phone,
      `🧲 *Leads*\n\n` +
        `Use the web dashboard to manage and follow up on demo leads.\n\n` +
        `New leads captured from this bot will appear there.`
    );
    return;
  }

  if (input === 'admin_test') {
    await sendText(
      phone,
      `✅ *Bot Test Successful!*\n\n` +
        `Everything is working:\n` +
        `• Webhook ✅\n` +
        `• Message sending ✅\n` +
        `• Super admin routing ✅`
    );
    return;
  }

  await sendText(phone, `Type *menu* to open the admin panel.`);
}

// ============================================================
// DEMO / MARKETING FLOW
// ============================================================

async function handleMarketingFlow(
  phone: string,
  input: string
): Promise<void> {
  if (['hi', 'hello', 'start', 'menu', 'main_menu'].includes(input)) {
    await sendList(
      phone,
      '🏫 SchoolBot Demo',
      `Welcome to SchoolBot! 👋\n\n` +
        `SchoolBot helps schools manage:\n` +
        `✅ Attendance with parent alerts\n` +
        `💰 Fee collection & online payments\n` +
        `🚗 Pickup security\n` +
        `📊 Reports & analytics\n\n` +
        `What would you like to explore?`,
      'Powered by XtopEdu',
      'See Demo',
      [
        {
          title: 'Demo Features',
          rows: [
            {
              id: 'DEMO_ATTENDANCE',
              title: '✅ Attendance Demo',
              description: 'See parent alerts in action',
            },
            {
              id: 'DEMO_FEES',
              title: '💰 Fee Collection Demo',
              description: 'See online payment flow',
            },
            {
              id: 'DEMO_PICKUP',
              title: '🚗 Pickup Security Demo',
              description: 'See pickup alerts',
            },
            {
              id: 'DEMO_PRICING',
              title: '💵 Pricing',
              description: 'See setup fee and charges',
            },
            {
              id: 'REGISTER_SCHOOL',
              title: '🏫 Register My School',
              description: 'Start onboarding now',
            },
          ],
        },
      ]
    );
    return;
  }

  if (input === 'demo_attendance') {
    await sendText(
      phone,
      `✅ *Attendance Demo*\n\n` +
        `When a teacher marks a student absent, the parent gets this instantly:\n\n` +
        `❌ *Absence Alert*\n` +
        `Your child Chidi Okonkwo was marked absent today.\n` +
        `🏫 Class: JSS 3A\n\n` +
        `Benefits:\n` +
        `• Parents know instantly\n` +
        `• Trust improves\n` +
        `• Absences reduce quickly`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Want to see more?`,
      [
        { id: 'DEMO_FEES', title: '💰 Fee Demo' },
        { id: 'DEMO_PICKUP', title: '🚗 Pickup' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_fees') {
    await sendText(
      phone,
      `💰 *Fee Collection Demo*\n\n` +
        `Parent sees:\n\n` +
        `School Fee: ₦50,000\n` +
        `Platform Fee: ₦750\n` +
        `Processing Fee: ₦125\n` +
        `━━━━━━━━━━━━\n` +
        `Total: ₦50,875\n\n` +
        `🏫 School still receives the full ₦50,000 ✅\n\n` +
        `This improves fee collection and reduces cash handling.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Would you like to continue?`,
      [
        { id: 'DEMO_PICKUP', title: '🚗 Pickup Demo' },
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_pickup') {
    await sendText(
      phone,
      `🚗 *Pickup Security Demo*\n\n` +
        `When a child is picked up, the parent gets:\n\n` +
        `🚗 Pickup Notification\n` +
        `✅ Amara Adeleke has been picked up!\n` +
        `👤 By: Mrs. Funmi Adeleke\n` +
        `⏰ Time: 2:30 PM\n\n` +
        `If unauthorized, the parent knows immediately.\n\n` +
        `This adds extra safety for every child.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `This keeps children safer. What next?`,
      [
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'DEMO_ATTENDANCE', title: '↩️ Back' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  if (input === 'demo_pricing') {
    await sendText(
      phone,
      `💵 *SchoolBot Pricing*\n\n` +
        `*One-Time Setup Fee*\n\n` +
        `👥 1–100 students: ₦25,000\n` +
        `👥 101–300 students: ₦50,000\n` +
        `👥 301–500 students: ₦80,000\n` +
        `👥 501–1000 students: ₦120,000\n` +
        `👥 1000+ students: ₦180,000+\n\n` +
        `*Plus 1.5% commission per fee payment*\n` +
        `(added on parent bill)\n` +
        `Your school still receives 100% of school fees. ✅\n\n` +
        `No monthly subscription.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Ready to register your school?`,
      [
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
        { id: 'DEMO_ATTENDANCE', title: '↩️ See Demo' },
      ]
    );
    return;
  }

  if (input === 'register_school') {
    await sendText(
      phone,
      `🏫 *Register Your School*\n\n` +
        `Please reply in this exact format:\n\n` +
        `*Your Name | School Name | Student Count | Location*\n\n` +
        `Example:\n` +
        `John Peter | Grace Academy | 250 | Lagos`
    );
    return;
  }

  // Fallback
  await sendText(
    phone,
    `Type *hi* to open the SchoolBot demo menu.`
  );
}

// ============================================================
// HELPERS
// ============================================================

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
        to: to.replace(/\D/g, ''),
        type: 'text',
        text: { body },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND TEXT]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${data}`);
  }
}

async function sendButtons(
  to: string,
  body: string,
  buttons: Array<{ id: string; title: string }>
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';
  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

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
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: {
                id: b.id,
                title: b.title.substring(0, 20),
              },
            })),
          },
        },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND BUTTONS]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp buttons failed: ${data}`);
  }
}

async function sendList(
  to: string,
  header: string,
  body: string,
  footer: string,
  buttonLabel: string,
  sections: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>
): Promise<void> {
  const apiUrl =
    Deno.env.get('WHATSAPP_API_URL') ??
    'https://graph.facebook.com/v25.0';
  const phoneNumberId =
    Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  const accessToken =
    Deno.env.get('WHATSAPP_ACCESS_TOKEN') ?? '';

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
        to: to.replace(/\D/g, ''),
        type: 'interactive',
        interactive: {
          type: 'list',
          header: {
            type: 'text',
            text: header,
          },
          body: {
            text: body,
          },
          footer: {
            text: footer,
          },
          action: {
            button: buttonLabel,
            sections,
          },
        },
      }),
    }
  );

  const data = await res.text();
  console.log('[SEND LIST]', data);

  if (!res.ok) {
    throw new Error(`WhatsApp list failed: ${data}`);
  }
}

function formatPhone(phone: string): string {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = '234' + p.slice(1);
  return p;
}

function getInput(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim().toLowerCase() ?? '';
  }
  if (message.type === 'interactive') {
    return (
      message.interactive?.button_reply?.id?.toLowerCase() ??
      message.interactive?.list_reply?.id?.toLowerCase() ??
      ''
    );
  }
  return '';
}

function getRawText(message: IncomingMessage): string {
  if (message.type === 'text') {
    return message.text?.body?.trim() ?? '';
  }
  return '';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
