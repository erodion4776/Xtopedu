// ============================================================
// SCHOOLBOT - WHATSAPP WEBHOOK (CLEAN DEMO + ADMIN VERSION)
// supabase/functions/whatsapp-webhook/index.ts
// ============================================================

Deno.serve(async (req: Request): Promise<Response> => {
  // ── Webhook verification ───────────────────────────────────
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

  // ── Incoming messages ──────────────────────────────────────
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
  if (!body || body.object !== 'whatsapp_business_account') return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return;

  // ignore status updates
  if (value.statuses?.length) return;
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

  const input = getInput(message);
  const formattedPhone = formatPhone(phone);
  const superAdminPhone = formatPhone(
    Deno.env.get('SUPER_ADMIN_PHONE') ?? ''
  );

  // ── YOU (SUPER ADMIN) ──────────────────────────────────────
  if (formattedPhone === superAdminPhone) {
    await handleSuperAdminFlow(phone, input);
    return;
  }

  // ── SCHOOL OWNER / NEW USER DEMO FLOW ─────────────────────
  await handleDemoFlow(phone, input);
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
          title: 'Admin Options',
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
              description: 'View incoming leads',
            },
            {
              id: 'ADMIN_TEST',
              title: '🤖 Bot Test',
              description: 'Confirm bot is working',
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
      `Use your web dashboard to see:\n` +
      `• All schools\n` +
      `• Student count\n` +
      `• Setup status\n` +
      `• Activity\n\n` +
      `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_revenue') {
    await sendText(
      phone,
      `💰 *Revenue Summary*\n\n` +
      `Use your dashboard to see:\n` +
      `• Setup fee income\n` +
      `• Termly platform fees\n` +
      `• 1.5% school fee commissions\n\n` +
      `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_leads') {
    await sendText(
      phone,
      `🧲 *Leads*\n\n` +
      `New schools that message the bot\n` +
      `will appear in your dashboard.\n\n` +
      `Type *menu* to go back.`
    );
    return;
  }

  if (input === 'admin_test') {
    await sendText(
      phone,
      `✅ *Bot Test Successful!*\n\n` +
      `• Webhook ✅\n` +
      `• Sending ✅\n` +
      `• Admin menu ✅\n` +
      `• Demo menu ✅`
    );
    return;
  }

  await sendText(phone, `Type *menu* to open your admin panel.`);
}

// ============================================================
// DEMO / SCHOOL OWNER FLOW
// ============================================================

async function handleDemoFlow(
  phone: string,
  input: string
): Promise<void> {
  if (['hi', 'hello', 'menu', 'start', 'main_menu'].includes(input)) {
    await sendList(
      phone,
      '🏫 SchoolBot Demo',
      `Welcome to SchoolBot! 👋\n\n` +
      `SchoolBot helps schools manage:\n` +
      `✅ Attendance with WhatsApp alerts\n` +
      `💰 Fee collection & online payments\n` +
      `🚗 Pickup security\n` +
      `📊 Reports & analytics\n\n` +
      `What would you like to see?`,
      'Powered by XtopEdu',
      'See Demo',
      [
        {
          title: 'Parent Demo',
          rows: [
            {
              id: 'DEMO_PARENT_ATT',
              title: '✅ Parent Attendance View',
              description: 'See what parent sees',
            },
            {
              id: 'DEMO_PARENT_FEES',
              title: '💰 Parent Fee View',
              description: 'See payment flow',
            },
            {
              id: 'DEMO_PARENT_PICKUP',
              title: '🚗 Parent Pickup View',
              description: 'See pickup alerts',
            },
          ],
        },
        {
          title: 'School Demo',
          rows: [
            {
              id: 'DEMO_ADMIN_BOT',
              title: '👨‍💼 School Admin Bot View',
              description: 'See how admin uses it',
            },
            {
              id: 'DEMO_PRICING',
              title: '💵 Pricing',
              description: 'Setup fee + termly fee + 1.5%',
            },
            {
              id: 'REGISTER_SCHOOL',
              title: '🏫 Register My School',
              description: 'Start school registration',
            },
          ],
        },
      ]
    );
    return;
  }

  // ── Parent attendance demo ─────────────────────────────────
  if (input === 'demo_parent_att') {
    await sendText(
      phone,
      `✅ *Parent Attendance Demo*\n\n` +
      `This is what a parent sees on WhatsApp:\n\n` +
      `📅 *Today's Attendance*\n` +
      `👤 Chidi Okonkwo\n` +
      `🏫 JSS 3A\n` +
      `📌 Status: ✅ Present\n` +
      `⏰ Arrival: 07:45 AM\n\n` +
      `📊 *Term Summary*\n` +
      `Rate: 94%\n` +
      `✅ Present: 47 days\n` +
      `❌ Absent: 2 days\n` +
      `⏰ Late: 1 day\n\n` +
      `Parents can check this anytime by just sending a message.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Want to see another demo?`,
      [
        { id: 'DEMO_PARENT_FEES', title: '💰 Fee Demo' },
        { id: 'DEMO_ADMIN_BOT', title: '👨‍💼 Admin Demo' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  // ── Parent fee demo ────────────────────────────────────────
  if (input === 'demo_parent_fees') {
    await sendText(
      phone,
      `💰 *Parent Fee Demo*\n\n` +
      `This is what a parent sees:\n\n` +
      `💰 *Outstanding Fees*\n` +
      `👤 Chidi Okonkwo - JSS 3A\n\n` +
      `1. First Term Fee\n` +
      `   💵 ₦75,000 remaining\n` +
      `   📅 Due: 31 Dec 2026\n\n` +
      `2. PTA Levy\n` +
      `   💵 ₦15,000\n\n` +
      `━━━━━━━━━━━━\n` +
      `💵 *Total: ₦90,000*\n\n` +
      `Parent taps *Pay Now* and pays online from WhatsApp.`
    );

    await delay(1000);

    await sendText(
      phone,
      `💳 *Payment Breakdown Example*\n\n` +
      `School Fee: ₦50,000\n` +
      `1.5% Commission: ₦750\n` +
      `Processing Fee: ₦125\n` +
      `━━━━━━━━━━━━\n` +
      `Parent Pays: ₦50,875\n\n` +
      `🏫 School still receives full ₦50,000 ✅`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Would you like to see more?`,
      [
        { id: 'DEMO_PARENT_PICKUP', title: '🚗 Pickup Demo' },
        { id: 'DEMO_ADMIN_BOT', title: '👨‍💼 Admin Demo' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  // ── Parent pickup demo ─────────────────────────────────────
  if (input === 'demo_parent_pickup') {
    await sendText(
      phone,
      `🚗 *Parent Pickup Demo*\n\n` +
      `When a child is picked up, the parent receives:\n\n` +
      `🚗 *Pickup Notification*\n` +
      `✅ Amara Adeleke has been picked up!\n` +
      `👤 Picked up by: Mrs. Funmi Adeleke\n` +
      `👥 Relationship: Mother\n` +
      `⏰ Time: 2:30 PM\n\n` +
      `If this was not authorized,\n` +
      `the parent knows immediately.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Want to continue?`,
      [
        { id: 'DEMO_ADMIN_BOT', title: '👨‍💼 Admin Demo' },
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
      ]
    );
    return;
  }

  // ── School admin bot demo ──────────────────────────────────
  if (input === 'demo_admin_bot') {
    await sendText(
      phone,
      `👨‍💼 *School Admin Bot Demo*\n\n` +
      `This is what a school admin sees:\n\n` +
      `📋 *Admin Menu*\n` +
      `1. ✅ Attendance\n` +
      `2. 💰 Fees & Payments\n` +
      `3. 👨‍🏫 Staff Management\n` +
      `4. 📤 Upload Students (CSV)\n` +
      `5. 📊 Reports\n` +
      `6. 🧾 Receipts\n` +
      `7. 📢 Broadcast to Parents\n\n` +
      `Everything is managed directly from WhatsApp.`
    );

    await delay(1000);

    await sendText(
      phone,
      `✅ *Attendance Example*\n\n` +
      `Admin selects class\n` +
      `Bot shows each student one by one\n` +
      `Admin taps:\n` +
      `✅ Present\n` +
      `❌ Absent\n` +
      `⏰ Late\n\n` +
      `Parent receives alert instantly.`
    );

    await delay(1000);

    await sendText(
      phone,
      `💰 *Fees Example*\n\n` +
      `Admin can:\n` +
      `• Search student by name\n` +
      `• View outstanding invoices\n` +
      `• Record cash payment\n` +
      `• Send payment receipt\n` +
      `• View fee reports\n\n` +
      `No laptop needed.`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `This is how the school side works.`,
      [
        { id: 'DEMO_PRICING', title: '💵 Pricing' },
        { id: 'REGISTER_SCHOOL', title: '🚀 Register' },
        { id: 'MAIN_MENU', title: '↩️ Back' },
      ]
    );
    return;
  }

  // ── Pricing demo ───────────────────────────────────────────
  if (input === 'demo_pricing') {
    await sendText(
      phone,
      `💵 *SchoolBot Pricing*\n\n` +
      `*1. Setup Fee (one-time)*\n` +
      `This activates your school:\n\n` +
      `👥 1–100 students: ₦15,000\n` +
      `👥 101–300 students: ₦25,000\n` +
      `👥 301–500 students: ₦35,000\n` +
      `👥 501–1000 students: ₦50,000\n\n` +
      `*2. Termly Platform Fee*\n` +
      `Based on your school size.\n` +
      `Paid once per term.\n\n` +
      `*3. 1.5% Commission on fee payments*\n` +
      `This is added on the parent’s payment,\n` +
      `so the school still gets 100% of the school fee. ✅`
    );

    await delay(1000);

    await sendButtons(
      phone,
      `Would you like to register your school now?`,
      [
        { id: 'REGISTER_SCHOOL', title: '🚀 Register Now' },
        { id: 'DEMO_ADMIN_BOT', title: '👨‍💼 Admin Demo' },
        { id: 'MAIN_MENU', title: '↩️ Back' },
      ]
    );
    return;
  }

  // ── Register school prompt ─────────────────────────────────
  if (input === 'register_school') {
    await sendText(
      phone,
      `🏫 *Register Your School*\n\n` +
      `Please send your details in this format:\n\n` +
      `*Your Name | School Name | Student Count | Location*\n\n` +
      `Example:\n` +
      `John Peter | Grace Academy | 250 | Lagos\n\n` +
      `Once you send it, we will capture your lead and continue onboarding.`
    );
    return;
  }

  // ── One-line lead capture ──────────────────────────────────
  if (rawLooksLikeLead(input)) {
    await sendText(
      phone,
      `✅ *Lead Received*\n\n` +
      `Thank you! We have received your school details.\n\n` +
      `Our team will contact you shortly to continue onboarding.`
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
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

function rawLooksLikeLead(text: string): boolean {
  return text.includes('|');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}f
